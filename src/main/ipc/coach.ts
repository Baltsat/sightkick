import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IpcMainEvent } from 'electron';
import {
  CoachProvider,
  DEFAULT_COACH_PROVIDER,
  DEFAULT_HUGGING_FACE_MODEL,
  IpcCoachSettings,
  IpcCoachSettingsSaved,
  IpcCoachingNotesResponse,
  IpcSaveCoachSettingsRequest,
} from '../../types';
import {
  buildCoachDigest,
  CoachDigestInput,
} from '../../renderer/services/coach';

const PROVIDER_STORE_KEY = 'coach.provider';
const API_KEY_STORE_KEY = 'coach.anthropicApiKey';
const HF_TOKEN_STORE_KEY = 'coach.huggingFaceToken';
const HF_MODEL_STORE_KEY = 'coach.huggingFaceModel';
const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const COACH_SYSTEM_PROMPT =
  'You are a concise drum practice coach. Use only the supplied evidence. Give two short actionable sentences and no preamble.';
const CODEX_TIMEOUT_MS = 60_000;
const HF_TIMEOUT_MS = 30_000;
const CODEX_KILL_GRACE_MS = 2_000;

interface CoachSettingsStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  delete: (key: string) => void;
}

interface ClaudeMessageResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

interface HuggingFaceChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string } | string;
}

let settingsStore: CoachSettingsStore | undefined;

export function configureCoachStore(store: CoachSettingsStore): void {
  settingsStore = store;
}

function requireStore(): CoachSettingsStore {
  if (!settingsStore) {
    throw new Error('Coach settings are unavailable');
  }

  return settingsStore;
}

function stringSetting(key: string): string | undefined {
  const value = requireStore().get(key);

  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }

  return value.trim();
}

function configuredApiKey(): string | undefined {
  return stringSetting(API_KEY_STORE_KEY);
}

function configuredHuggingFaceToken(): string | undefined {
  return stringSetting(HF_TOKEN_STORE_KEY);
}

function configuredHuggingFaceModel(): string {
  return stringSetting(HF_MODEL_STORE_KEY) ?? DEFAULT_HUGGING_FACE_MODEL;
}

function configuredProvider(): CoachProvider {
  const value = requireStore().get(PROVIDER_STORE_KEY);

  if (value === 'codex' || value === 'huggingface' || value === 'anthropic') {
    return value;
  }

  return DEFAULT_COACH_PROVIDER;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'Claude timed out. Try again.';
  }

  return error instanceof Error ? error.message : String(error);
}

export function getCoachSettings(event: IpcMainEvent): void {
  event.reply('coach-settings', {
    provider: configuredProvider(),
    apiKeyConfigured: configuredApiKey() !== undefined,
    huggingFaceTokenConfigured: configuredHuggingFaceToken() !== undefined,
    huggingFaceModel: configuredHuggingFaceModel(),
  } satisfies IpcCoachSettings);
}

export function saveCoachSettings(
  event: IpcMainEvent,
  request: IpcSaveCoachSettingsRequest,
): void {
  const store = requireStore();

  if (request?.provider) {
    store.set(PROVIDER_STORE_KEY, request.provider);
  }

  if (request?.apiKey !== undefined) {
    const apiKey = request.apiKey.trim();

    if (apiKey) {
      store.set(API_KEY_STORE_KEY, apiKey);
    } else {
      store.delete(API_KEY_STORE_KEY);
    }
  }

  if (request?.huggingFaceToken !== undefined) {
    const token = request.huggingFaceToken.trim();

    if (token) {
      store.set(HF_TOKEN_STORE_KEY, token);
    } else {
      store.delete(HF_TOKEN_STORE_KEY);
    }
  }

  if (request?.huggingFaceModel !== undefined) {
    const model = request.huggingFaceModel.trim();

    if (model) {
      store.set(HF_MODEL_STORE_KEY, model);
    } else {
      store.delete(HF_MODEL_STORE_KEY);
    }
  }

  event.reply('coach-settings-saved', {
    ok: true,
    provider: configuredProvider(),
    apiKeyConfigured: configuredApiKey() !== undefined,
    huggingFaceTokenConfigured: configuredHuggingFaceToken() !== undefined,
    huggingFaceModel: configuredHuggingFaceModel(),
  } satisfies IpcCoachSettingsSaved);
}

export async function fetchCoachingNotes(
  apiKey: string,
  digest: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(MESSAGES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 220,
      system: COACH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: digest }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as ClaudeMessageResponse;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Anthropic rejected the saved API key.');
    }

    throw new Error(
      data.error?.message ?? `Claude request failed (${response.status}).`,
    );
  }

  const notes = data.content
    ?.filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!notes) {
    throw new Error('Claude returned no coaching notes.');
  }

  return notes;
}

async function safeErrorDetail(
  response: Response,
): Promise<string | undefined> {
  try {
    const data = (await response.json()) as HuggingFaceChatResponse;

    if (typeof data.error === 'string') {
      return data.error;
    }

    return data.error?.message;
  } catch {
    return undefined;
  }
}

export async function fetchHuggingFaceCoachingNotes(
  token: string,
  model: string,
  digest: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let response: Response;

  try {
    response = await fetchImpl(HF_CHAT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
        messages: [
          { role: 'system', content: COACH_SYSTEM_PROMPT },
          { role: 'user', content: digest },
        ],
      }),
      signal: AbortSignal.timeout(HF_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Hugging Face timed out. Try again.', { cause: error });
    }

    throw error;
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Hugging Face rejected the saved token.');
    }

    if (response.status === 402) {
      throw new Error(
        `"${model}" requires payment on Hugging Face. Pick a free model.`,
      );
    }

    const detail = await safeErrorDetail(response);

    throw new Error(
      detail ?? `Hugging Face request failed (${response.status}).`,
    );
  }

  const data = (await response.json()) as HuggingFaceChatResponse;
  const notes = data.choices?.[0]?.message?.content?.trim();

  if (!notes) {
    throw new Error('Hugging Face returned no coaching notes.');
  }

  return notes;
}

const CODEX_BINARY_NAMES =
  process.platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex'];

// GUI-launched Electron apps on macOS often see a minimal PATH that skips
// the user's shell rc customizations, so we fall back to the directories
// npm/bun/homebrew typically install CLIs into.
function codexFallbackDirs(): string[] {
  const home = os.homedir();

  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
}

function executableFile(filePath: string): string | undefined {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);

    return fs.statSync(filePath).isFile() ? filePath : undefined;
  } catch {
    return undefined;
  }
}

function findInDirs(dirs: string[]): string | undefined {
  for (const dir of dirs) {
    for (const name of CODEX_BINARY_NAMES) {
      const candidate = executableFile(path.join(dir, name));

      if (candidate) {
        return candidate;
      }
    }
  }

  return undefined;
}

export function findCodexBinary(): string | undefined {
  const pathDirs = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);

  return findInDirs(pathDirs) ?? findInDirs(codexFallbackDirs());
}

// Codex's own repo-mutation guard is `-C`/cwd-relative; keep the working
// directory outside any git repo (cwd=os.tmpdir()) and force the CLI's own
// sandbox to read-only so a spawned shell tool call cannot write anywhere,
// regardless of what this machine's ~/.codex/config.toml defaults to.
function sandboxedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;

  return env;
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

function cleanCodexOutput(raw: string): string {
  return raw
    .replace(ANSI_PATTERN, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

interface ChildResult {
  code: number | null;
  stderr: string;
}

function runChildWithTimeout(
  spawnFn: typeof spawn,
  command: string,
  args: string[],
  options: SpawnOptions,
  timeoutMs: number,
): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let child: ChildProcess;

    try {
      child = spawnFn(command, args, options);
    } catch (error) {
      reject(error);

      return;
    }

    let stderr = '';

    child.stdout?.on('data', () => {});
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    const killTimer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), CODEX_KILL_GRACE_MS).unref?.();
      reject(new Error('Codex timed out. Try again.'));
    }, timeoutMs);

    killTimer.unref?.();

    child.once('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(killTimer);
      reject(error);
    });

    child.once('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(killTimer);
      resolve({ code, stderr });
    });
  });
}

export interface CodexRunnerDeps {
  spawnImpl?: typeof spawn;
  findBinary?: () => string | undefined;
  tmpDir?: () => string;
  timeoutMs?: number;
}

export async function runCodexCoachingNotes(
  digest: string,
  deps: CodexRunnerDeps = {},
): Promise<string> {
  const spawnFn = deps.spawnImpl ?? spawn;
  const findBinary = deps.findBinary ?? findCodexBinary;
  const tmpDirFn = deps.tmpDir ?? os.tmpdir;
  const timeoutMs = deps.timeoutMs ?? CODEX_TIMEOUT_MS;
  const codexPath = findBinary();

  if (!codexPath) {
    throw new Error('Codex CLI not found. Install it and run `codex login`.');
  }

  const workDir = tmpDirFn();
  const outFile = path.join(workDir, `sightkick-coach-${randomUUID()}.txt`);
  const prompt = `${COACH_SYSTEM_PROMPT}\n\n${digest}`;

  try {
    const { code, stderr } = await runChildWithTimeout(
      spawnFn,
      codexPath,
      [
        'exec',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '--ephemeral',
        '-o',
        outFile,
        prompt,
      ],
      { cwd: workDir, env: sandboxedEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
      timeoutMs,
    );

    if (code !== 0) {
      const detail = stderr.trim().slice(0, 300);

      throw new Error(
        detail
          ? `Codex exited with an error: ${detail}`
          : `Codex exited with code ${code ?? 'unknown'}.`,
      );
    }

    const raw = await readFileIfExists(outFile);
    const note = cleanCodexOutput(raw ?? '');

    if (!note) {
      throw new Error('Codex returned no coaching notes.');
    }

    return note;
  } finally {
    try {
      await fs.promises.rm(outFile, { force: true });
    } catch {
      // best-effort cleanup of the scratch file
    }
  }
}

export interface CoachProviderDeps {
  codex?: CodexRunnerDeps;
  fetchImpl?: typeof fetch;
}

export async function getCoachingNotes(
  event: IpcMainEvent,
  input: CoachDigestInput,
  deps: CoachProviderDeps = {},
): Promise<void> {
  const provider = configuredProvider();
  const digest = buildCoachDigest(input);

  try {
    if (provider === 'codex') {
      const notes = await runCodexCoachingNotes(digest, deps.codex);

      event.reply('coaching-notes', {
        notes,
      } satisfies IpcCoachingNotesResponse);

      return;
    }

    if (provider === 'huggingface') {
      const token = configuredHuggingFaceToken();

      if (!token) {
        event.reply('coaching-notes', {
          apiKeyMissing: true,
          error:
            'Add a Hugging Face token in settings to enable coaching notes.',
        } satisfies IpcCoachingNotesResponse);

        return;
      }

      const notes = await fetchHuggingFaceCoachingNotes(
        token,
        configuredHuggingFaceModel(),
        digest,
        deps.fetchImpl,
      );

      event.reply('coaching-notes', {
        notes,
      } satisfies IpcCoachingNotesResponse);

      return;
    }

    const apiKey = configuredApiKey();

    if (!apiKey) {
      event.reply('coaching-notes', {
        apiKeyMissing: true,
        error: 'Add an Anthropic API key in settings to enable coaching notes.',
      } satisfies IpcCoachingNotesResponse);

      return;
    }

    const notes = await fetchCoachingNotes(apiKey, digest, deps.fetchImpl);

    event.reply('coaching-notes', {
      notes,
    } satisfies IpcCoachingNotesResponse);
  } catch (error) {
    event.reply('coaching-notes', {
      error: errorMessage(error),
    } satisfies IpcCoachingNotesResponse);
  }
}
