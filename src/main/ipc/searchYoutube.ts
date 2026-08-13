import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, IpcMainEvent } from 'electron';
import {
  IpcResult,
  IpcSearchYoutubeRequest,
  IpcSearchYoutubeResponse,
  IpcYoutubeCandidate,
  IpcYoutubeSearchResult,
} from '../../types';
import { caCertEnv } from '../stemTools';

export type IpcSearchYoutubeReply = IpcResult<IpcSearchYoutubeResponse>;

const SEARCH_TIMEOUT_MS = 20_000;
const INSPECT_TIMEOUT_MS = 20_000;
const BOOTSTRAP_TIMEOUT_MS = 10 * 60_000;
const MAX_INSPECTION_BYTES = 1024 * 1024;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 8;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function clampLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function executableFile(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }

  try {
    fs.accessSync(filePath, fs.constants.X_OK);

    return fs.statSync(filePath).isFile() ? filePath : undefined;
  } catch {
    return undefined;
  }
}

function executableOnPath(name: string): string | undefined {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = executableFile(path.join(directory, name));

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

export function resolveYtDlpPath(): string | undefined {
  const dataDir = path.join(app.getPath('userData'), 'transcriber');
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const venvPath =
    process.platform === 'win32'
      ? path.join(dataDir, '.venv', 'Scripts', binName)
      : path.join(dataDir, '.venv', 'bin', binName);

  return executableFile(venvPath);
}

function transcriberProjectPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'transcriber')
    : path.join(app.getAppPath(), 'resources', 'transcriber');
}

async function bootstrapYtDlp(): Promise<void> {
  const uvPath = executableOnPath('uv');

  if (!uvPath) {
    throw new Error(
      'Drumroll needs its pinned yt-dlp search runtime. Reinstall Drumroll or install uv before searching YouTube.',
    );
  }

  const dataDir = path.join(app.getPath('userData'), 'transcriber');
  const projectPath = transcriberProjectPath();

  await fs.promises.mkdir(dataDir, { recursive: true, mode: 0o700 });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      uvPath,
      [
        'run',
        '--locked',
        '--project',
        projectPath,
        '--directory',
        dataDir,
        'yt-dlp',
        '--version',
      ],
      {
        env: {
          ...process.env,
          ...caCertEnv(),
          UV_PROJECT_ENVIRONMENT: path.join(dataDir, '.venv'),
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let stderr = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(
        new Error(
          'Preparing Drumroll’s YouTube search runtime timed out. Check your connection and try again.',
        ),
      );
    }, BOOTSTRAP_TIMEOUT_MS);

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      finish(
        new Error(
          `Could not prepare Drumroll’s YouTube search runtime: ${error.message}`,
        ),
      );
    });
    child.once('close', (code) => {
      if (code === 0) {
        finish();

        return;
      }

      finish(
        new Error(
          stderr.trim()
            ? `Could not prepare Drumroll’s YouTube search runtime: ${firstLine(
                stderr,
              )}`
            : 'Could not prepare Drumroll’s YouTube search runtime.',
        ),
      );
    });
  });
}

export async function ensureYtDlpPath(): Promise<string> {
  const installed = resolveYtDlpPath();

  if (installed) {
    return installed;
  }

  await bootstrapYtDlp();

  const prepared = resolveYtDlpPath();

  if (!prepared) {
    throw new Error(
      'Drumroll’s transcriber finished setup without its pinned yt-dlp runtime.',
    );
  }

  return prepared;
}

function sanitizeThumbnailUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'https:') {
    return undefined;
  }

  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === 'i.ytimg.com' ||
    host === 'googleusercontent.com' ||
    host.endsWith('.googleusercontent.com');

  return allowed ? parsed.toString() : undefined;
}

function pickThumbnail(entry: Record<string, unknown>): string | undefined {
  const thumbnails = entry.thumbnails;

  if (Array.isArray(thumbnails)) {
    for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
      const candidate = thumbnails[index];

      if (candidate && typeof candidate === 'object') {
        const sanitized = sanitizeThumbnailUrl(
          (candidate as Record<string, unknown>).url,
        );

        if (sanitized) {
          return sanitized;
        }
      }
    }
  }

  return sanitizeThumbnailUrl(entry.thumbnail);
}

// Parses one line of `yt-dlp --dump-json --flat-playlist` output for a
// search result. Never trusts the id-adjacent URL fields yt-dlp reports
// (webpage_url/url) — the canonical watch URL is always rebuilt from the
// validated 11-character video id, and thumbnails are only kept when they
// resolve to an allow-listed YouTube/Google image host.
export function parseYoutubeSearchLine(
  line: string,
): IpcYoutubeSearchResult | undefined {
  let value: unknown;

  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const entry = value as Record<string, unknown>;
  const videoId = typeof entry.id === 'string' ? entry.id : undefined;

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    return undefined;
  }

  const title =
    typeof entry.title === 'string' ? entry.title.trim() : undefined;

  if (!title) {
    return undefined;
  }

  const uploader =
    typeof entry.uploader === 'string' && entry.uploader.trim()
      ? entry.uploader.trim()
      : typeof entry.channel === 'string' && entry.channel.trim()
      ? entry.channel.trim()
      : undefined;
  const durationSeconds =
    typeof entry.duration === 'number' && Number.isFinite(entry.duration)
      ? entry.duration
      : undefined;

  return {
    videoId,
    title,
    uploader,
    durationSeconds,
    thumbnailUrl: pickThumbnail(entry),
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

export function parseYoutubeInspection(
  value: string,
): IpcYoutubeCandidate | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  const entry = parsed as Record<string, unknown>;
  const videoId = typeof entry.id === 'string' ? entry.id : undefined;
  const title = typeof entry.title === 'string' ? entry.title.trim() : '';
  const uploader =
    typeof entry.uploader === 'string' && entry.uploader.trim()
      ? entry.uploader.trim()
      : typeof entry.channel === 'string' && entry.channel.trim()
      ? entry.channel.trim()
      : undefined;
  const durationSeconds = entry.duration;

  if (
    !videoId ||
    !VIDEO_ID_PATTERN.test(videoId) ||
    !title ||
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return undefined;
  }

  return {
    videoId,
    title,
    uploader,
    durationSeconds,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

interface LineReader {
  push: (chunk: string) => void;
  flush: () => void;
}

function createLineReader(onLine: (line: string) => void): LineReader {
  let buffer = '';

  return {
    push(chunk: string) {
      buffer += chunk;

      const lines = buffer.split(/\r?\n/);

      buffer = lines.pop() ?? '';
      lines.forEach(onLine);
    },
    flush() {
      if (buffer.trim()) {
        onLine(buffer);
      }

      buffer = '';
    },
  };
}

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/)[0] ?? '';
}

export async function inspectYoutubeCandidate(
  canonicalUrl: string,
): Promise<IpcYoutubeCandidate> {
  const ytDlpPath = await ensureYtDlpPath();

  return new Promise<IpcYoutubeCandidate>((resolve, reject) => {
    const child = spawn(
      ytDlpPath,
      [
        '--dump-single-json',
        '--no-download',
        '--no-warnings',
        '--quiet',
        canonicalUrl,
      ],
      {
        env: { ...process.env, ...caCertEnv() },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error?: Error, result?: IpcYoutubeCandidate) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      }
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(
        new Error(
          'YouTube identity check timed out. Check your connection and try again.',
        ),
      );
    }, INSPECT_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');

      if (Buffer.byteLength(stdout, 'utf8') > MAX_INSPECTION_BYTES) {
        child.kill('SIGTERM');
        finish(new Error('YouTube identity check returned too much metadata.'));
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      finish(new Error(`Could not start yt-dlp: ${error.message}`));
    });
    child.once('close', (code) => {
      if (settled) {
        return;
      }

      if (code !== 0) {
        finish(
          new Error(
            stderr.trim()
              ? `YouTube identity check failed: ${firstLine(stderr)}`
              : 'YouTube identity check failed. Try again in a moment.',
          ),
        );

        return;
      }

      const result = parseYoutubeInspection(stdout.trim());

      if (!result) {
        finish(new Error('YouTube identity check returned invalid metadata.'));

        return;
      }

      finish(undefined, result);
    });
  });
}

async function runSearch(
  event: IpcMainEvent,
  request: IpcSearchYoutubeRequest,
): Promise<void> {
  const query =
    request && typeof request.query === 'string' ? request.query.trim() : '';

  if (!query) {
    event.reply('search-youtube', {
      error: 'Enter a song name to search',
    } satisfies IpcSearchYoutubeReply);

    return;
  }

  let ytDlpPath: string;

  try {
    ytDlpPath = await ensureYtDlpPath();
  } catch (error) {
    event.reply('search-youtube', {
      error: error instanceof Error ? error.message : String(error),
    } satisfies IpcSearchYoutubeReply);

    return;
  }

  const limit = clampLimit(request?.limit);
  const results: IpcYoutubeSearchResult[] = [];
  const seen = new Set<string>();
  let stderr = '';
  let settled = false;
  const child = spawn(
    ytDlpPath,
    [
      `ytsearch${limit}:${query}`,
      '--dump-json',
      '--no-download',
      '--flat-playlist',
      '--no-warnings',
      '--quiet',
    ],
    {
      env: { ...process.env, ...caCertEnv() },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const finish = (payload: IpcSearchYoutubeReply) => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timer);
    event.reply('search-youtube', payload);
  };
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    finish({
      error: 'YouTube search timed out. Check your connection and try again.',
    });
  }, SEARCH_TIMEOUT_MS);
  const reader = createLineReader((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    const parsed = parseYoutubeSearchLine(trimmed);

    if (parsed && !seen.has(parsed.videoId)) {
      seen.add(parsed.videoId);
      results.push(parsed);
    }
  });

  child.stdout?.on('data', (chunk: Buffer) =>
    reader.push(chunk.toString('utf8')),
  );
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  child.on('error', (error) => {
    finish({
      error: `Could not start yt-dlp: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  });
  child.on('close', (code) => {
    reader.flush();

    if (settled) {
      return;
    }

    if (code !== 0 && results.length === 0) {
      finish({
        error: stderr.trim()
          ? `YouTube search failed: ${firstLine(stderr)}`
          : 'YouTube search failed. Try again in a moment.',
      });

      return;
    }

    finish({ results: results.slice(0, limit) });
  });
}

export function searchYoutube(
  event: IpcMainEvent,
  request: IpcSearchYoutubeRequest,
): void {
  void runSearch(event, request);
}
