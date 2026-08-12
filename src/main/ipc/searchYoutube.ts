import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, IpcMainEvent } from 'electron';
import {
  IpcResult,
  IpcSearchYoutubeRequest,
  IpcSearchYoutubeResponse,
  IpcYoutubeSearchResult,
} from '../../types';
import { caCertEnv } from '../stemTools';

export type IpcSearchYoutubeReply = IpcResult<IpcSearchYoutubeResponse>;

const SEARCH_TIMEOUT_MS = 20_000;
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

// Mirrors how src/main/ipc/autoChart.ts's preflightSightkickRuntime resolves
// the transcriber's persistent data directory (<userData>/transcriber), then
// looks inside the venv that resources/transcriber/run.sh provisions there
// (either directly or via `uv run --project`, which also pins
// UV_PROJECT_ENVIRONMENT to that same .venv). yt-dlp is a dependency of that
// venv, so its console-script entry point lives at .venv/bin/yt-dlp (or
// .venv/Scripts/yt-dlp.exe on Windows) whenever the transcriber has run at
// least once. Falls back to a yt-dlp on PATH for installs where it hasn't.
export function resolveYtDlpPath(): string | undefined {
  const dataDir = path.join(app.getPath('userData'), 'transcriber');
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const venvPath =
    process.platform === 'win32'
      ? path.join(dataDir, '.venv', 'Scripts', binName)
      : path.join(dataDir, '.venv', 'bin', binName);

  return executableFile(venvPath) ?? executableOnPath(binName);
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

  const ytDlpPath = resolveYtDlpPath();

  if (!ytDlpPath) {
    event.reply('search-youtube', {
      error:
        'YouTube search needs yt-dlp. Reinstall Drumroll, or install yt-dlp and add it to PATH.',
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
