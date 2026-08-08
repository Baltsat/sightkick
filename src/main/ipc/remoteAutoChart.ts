import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { IpcMainEvent } from 'electron';
import {
  IpcAutoChartRemoteSettings,
  IpcAutoChartRemoteTestResponse,
  IpcSaveAutoChartRemoteSettingsRequest,
} from '../../types';
import type { SkWorkerEvent, WorkerHandle } from './autoChart';

const ENDPOINT_KEY = 'autoChart.remote.endpoint';
const TOKEN_KEY = 'autoChart.remote.token';
const REMOTE_STAGES = new Set([
  'download',
  'separate',
  'beats',
  'transcribe',
  'write',
]);

interface SettingsStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

export interface RemoteAutoChartRuntime {
  endpoint: string;
  token: string;
}

export interface RemoteAutoChartRunInput {
  tempDir: string;
  youtubeUrl?: string;
  audioPath?: string;
  runtime: RemoteAutoChartRuntime;
}

export interface RemoteAutoChartRunner {
  run: (
    input: RemoteAutoChartRunInput,
    onEvent: (event: SkWorkerEvent) => void,
  ) => WorkerHandle;
}

interface RemoteJobStatus {
  status: 'queued' | 'running' | 'done' | 'error' | 'canceled';
  stage?: string | null;
  percent?: number;
  message?: string;
  error?: string | null;
}

interface RemoteRunnerDependencies {
  fetch: typeof fetch;
  wait: (milliseconds: number) => Promise<void>;
  openFile: (filePath: string) => Promise<Blob>;
  saveResult: (response: Response, filePath: string) => Promise<void>;
  extractResult: (archivePath: string, tempDir: string) => Promise<string>;
}

type RunCommand = (command: string, args: string[]) => Promise<string>;

let settingsStore: SettingsStore | undefined;

export function configureRemoteAutoChartStore(store: SettingsStore): void {
  settingsStore = store;
}

function requireStore(): SettingsStore {
  if (!settingsStore) {
    throw new Error('Remote transcriber settings are unavailable');
  }

  return settingsStore;
}

export function canonicalizeRemoteEndpoint(value: string): string {
  let endpoint: URL;

  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid remote transcriber endpoint');
  }

  const loopback = ['localhost', '127.0.0.1', '::1'].includes(
    endpoint.hostname,
  );

  if (
    endpoint.protocol !== 'https:' &&
    !(endpoint.protocol === 'http:' && loopback)
  ) {
    throw new Error('Use HTTPS, or HTTP only for a localhost SSH tunnel');
  }

  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      'Enter the remote service base URL without credentials or query parameters',
    );
  }

  return endpoint.toString().replace(/\/$/, '');
}

function remoteUrl(endpoint: string, relativePath: string): string {
  return new URL(relativePath, `${endpoint}/`).toString();
}

export function getRemoteAutoChartRuntime(): RemoteAutoChartRuntime {
  const store = requireStore();
  const endpointValue = store.get(ENDPOINT_KEY);
  const tokenValue = store.get(TOKEN_KEY);

  if (typeof endpointValue !== 'string' || typeof tokenValue !== 'string') {
    throw new Error(
      'Configure the remote transcriber endpoint and token first',
    );
  }

  const endpoint = canonicalizeRemoteEndpoint(endpointValue);
  const token = tokenValue.trim();

  if (!token) {
    throw new Error('Configure the remote transcriber token first');
  }

  return { endpoint, token };
}

export function getRemoteAutoChartSettings(event: IpcMainEvent): void {
  const store = requireStore();
  const endpoint = store.get(ENDPOINT_KEY);
  const token = store.get(TOKEN_KEY);

  event.reply('auto-chart-remote-settings', {
    endpoint: typeof endpoint === 'string' ? endpoint : '',
    tokenConfigured: typeof token === 'string' && token.trim().length > 0,
  } satisfies IpcAutoChartRemoteSettings);
}

export async function checkRemoteAutoChartHealth(
  runtime: RemoteAutoChartRuntime,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;

  try {
    response = await fetchImpl(remoteUrl(runtime.endpoint, 'healthz'), {
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error('Remote transcriber health check failed');
  }

  if (!response.ok) {
    throw new Error(
      `Remote transcriber health check returned ${response.status}`,
    );
  }
}

export async function isRemoteAutoChartAvailable(): Promise<boolean> {
  try {
    const runtime = getRemoteAutoChartRuntime();

    await checkRemoteAutoChartHealth(runtime);

    return true;
  } catch {
    return false;
  }
}

export async function saveAndTestRemoteAutoChart(
  event: IpcMainEvent,
  request: IpcSaveAutoChartRemoteSettingsRequest,
): Promise<void> {
  try {
    const store = requireStore();
    const endpoint = canonicalizeRemoteEndpoint(request?.endpoint ?? '');
    const requestedToken = request?.token?.trim();
    const storedToken = store.get(TOKEN_KEY);
    const token =
      requestedToken ||
      (typeof storedToken === 'string' ? storedToken.trim() : '');

    if (!token) {
      throw new Error('Enter the remote transcriber token');
    }

    store.set(ENDPOINT_KEY, endpoint);
    store.set(TOKEN_KEY, token);
    await checkRemoteAutoChartHealth({ endpoint, token });
    event.reply('auto-chart-remote-test', {
      ok: true,
      message: 'Remote transcriber is reachable',
    } satisfies IpcAutoChartRemoteTestResponse);
  } catch (error) {
    event.reply('auto-chart-remote-test', {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    } satisfies IpcAutoChartRemoteTestResponse);
  }
}

function remoteError(status: number): Error {
  if (status === 401) {
    return new Error(
      'Remote transcriber rejected the saved token (401). Update it and try again',
    );
  }

  return new Error(`Remote transcriber request failed (${status})`);
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw remoteError(response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error('Remote transcriber returned an invalid response');
  }
}

async function saveRemoteResult(
  response: Response,
  filePath: string,
): Promise<void> {
  if (!response.ok) {
    throw remoteError(response.status);
  }

  if (!response.body) {
    throw new Error('Remote transcriber returned an empty result');
  }

  await pipeline(
    Readable.fromWeb(response.body as never),
    fs.createWriteStream(filePath, { mode: 0o600 }),
  );
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(stderr.trim() || `${command} exited with code ${code}`),
        );
      }
    });
  });
}

export async function extractRemoteAutoChartResult(
  archivePath: string,
  tempDir: string,
  run: RunCommand = runCommand,
): Promise<string> {
  const listing = await run('tar', ['-tzf', archivePath]);
  const entries = listing.split(/\r?\n/).filter(Boolean);

  if (entries.length === 0) {
    throw new Error('Remote transcriber returned an empty archive');
  }

  for (const entry of entries) {
    const normalized = path.posix.normalize(entry.replace(/^\.\//, ''));

    if (
      path.posix.isAbsolute(normalized) ||
      normalized === '..' ||
      normalized.startsWith('../')
    ) {
      throw new Error('Remote transcriber returned an unsafe archive path');
    }
  }

  const verbose = await run('tar', ['-tvzf', archivePath]);

  if (
    verbose
      .split(/\r?\n/)
      .filter(Boolean)
      .some((line) => !['-', 'd'].includes(line.trimStart()[0]))
  ) {
    throw new Error(
      'Remote transcriber archive contains links or special files',
    );
  }

  await run('tar', ['-xzf', archivePath, '-C', tempDir]);

  const directories = (
    await fs.promises.readdir(tempDir, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(tempDir, entry.name));

  if (directories.length !== 1) {
    throw new Error('Remote transcriber returned an unexpected song archive');
  }

  return directories[0];
}

async function openAudioFile(filePath: string): Promise<Blob> {
  const openAsBlob = (
    fs as typeof fs & {
      openAsBlob?: (target: string) => Promise<Blob>;
    }
  ).openAsBlob;

  if (!openAsBlob) {
    throw new Error('This Drumroll build cannot stream local audio uploads');
  }

  return openAsBlob(filePath);
}

function defaultRemoteRunnerDependencies(): RemoteRunnerDependencies {
  return {
    fetch,
    wait: (milliseconds) =>
      new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      }),
    openFile: openAudioFile,
    saveResult: saveRemoteResult,
    extractResult: extractRemoteAutoChartResult,
  };
}

export function createRemoteAutoChartRunner(
  dependencies: RemoteRunnerDependencies = defaultRemoteRunnerDependencies(),
): RemoteAutoChartRunner {
  return {
    run(input, onEvent) {
      let cancelled = false;
      let jobId: string | undefined;
      const activeRequest = new AbortController();
      const headers = { Authorization: `Bearer ${input.runtime.token}` };
      const done = (async () => {
        try {
          let body: BodyInit;
          let requestHeaders: HeadersInit = headers;

          if (input.youtubeUrl) {
            body = JSON.stringify({ url: input.youtubeUrl });
            requestHeaders = { ...headers, 'Content-Type': 'application/json' };
          } else if (input.audioPath) {
            const form = new FormData();
            const audio = await dependencies.openFile(input.audioPath);

            form.append('file', audio, path.basename(input.audioPath));
            body = form;
          } else {
            throw new Error(
              'Remote auto-chart requires a YouTube URL or local audio file',
            );
          }

          const created = await readJson<{ jobId?: string }>(
            await dependencies.fetch(
              remoteUrl(input.runtime.endpoint, 'jobs'),
              {
                method: 'POST',
                headers: requestHeaders,
                body,
                signal: activeRequest.signal,
              },
            ),
          );

          if (!created.jobId) {
            throw new Error('Remote transcriber did not return a job ID');
          }

          jobId = created.jobId;

          while (!cancelled) {
            const status = await readJson<RemoteJobStatus>(
              await dependencies.fetch(
                remoteUrl(input.runtime.endpoint, `jobs/${jobId}`),
                { headers, signal: activeRequest.signal },
              ),
            );

            if (status.status === 'done') {
              const result = await dependencies.fetch(
                remoteUrl(input.runtime.endpoint, `jobs/${jobId}/result`),
                { headers, signal: activeRequest.signal },
              );
              const archivePath = path.join(
                input.tempDir,
                'remote-result.tar.gz',
              );

              await dependencies.saveResult(result, archivePath);

              const songDir = await dependencies.extractResult(
                archivePath,
                input.tempDir,
              );

              onEvent({ kind: 'complete', success: true, songDir });

              return;
            }

            if (status.status === 'error') {
              throw new Error(
                status.error ||
                  status.message ||
                  'Remote chart creation failed',
              );
            }

            if (status.status === 'canceled') {
              throw new Error('Remote chart creation was cancelled');
            }

            if (status.status === 'running') {
              onEvent({
                kind: 'progress',
                stage:
                  status.stage && REMOTE_STAGES.has(status.stage)
                    ? (status.stage as SkWorkerEvent['stage'])
                    : undefined,
                percent: status.percent,
                message: status.message,
              });
            }

            await dependencies.wait(2_500);
          }
        } catch (error) {
          if (!cancelled) {
            onEvent({
              kind: 'error',
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })();

      return {
        kill: () => {
          cancelled = true;
          activeRequest.abort();

          if (jobId) {
            void dependencies.fetch(
              remoteUrl(input.runtime.endpoint, `jobs/${jobId}`),
              { method: 'DELETE', headers },
            );
          }
        },
        done,
      };
    },
  };
}
