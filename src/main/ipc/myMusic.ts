import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, IpcMainEvent } from 'electron';
import { caCertEnv } from '../stemTools';

// Contract for the 'my-music-fetch' channel: "My Music" reads the user's
// YouTube Music Liked Songs playlist through their already-signed-in Chrome
// session (via yt-dlp --cookies-from-browser chrome), so the app never asks
// for a separate login. This mirrors src/main/ipc/searchYoutube.ts's
// IpcSearchYoutube*/IpcResult<T> convention; once the shared Codex lane's
// bundle lands, these interfaces move into src/types.ts verbatim and this
// file switches to importing them from there instead of declaring its own
// copy. The renderer-side copy lives at
// src/renderer/components/MyMusic/types.ts for the same "renderer can't
// import main-process modules" reason searchYoutube.ts's copy exists in
// SongSearch/types.ts.
export interface IpcMyMusicRequest {
  limit?: number;
}

export interface MyMusicSong {
  videoId: string;
  title: string;
  artist?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  watchUrl: string;
}

export interface IpcMyMusicResponse {
  songs: MyMusicSong[];
}

// Distinct, honest error codes the renderer can branch on instead of
// pattern-matching human-readable text:
// - 'chrome-cookie-locked': Chrome is running and holds its cookie DB open
//   (common on macOS); the fix is "quit Chrome and try again".
// - 'chrome-cookies-unavailable': Chrome isn't installed, has no profile, or
//   its cookie store otherwise couldn't be read for a non-lock reason.
// - 'not-signed-in': the request succeeded but returned zero liked songs, or
//   YouTube responded 403/private — either way the Chrome session isn't
//   signed into a YouTube Music account with a Liked playlist.
// - 'yt-dlp-missing': no yt-dlp binary could be resolved at all.
// - 'timeout': the fetch did not finish inside MY_MUSIC_TIMEOUT_MS.
// - 'unknown': any other failure; the message carries yt-dlp's own detail.
export type MyMusicErrorCode =
  | 'chrome-cookie-locked'
  | 'chrome-cookies-unavailable'
  | 'not-signed-in'
  | 'yt-dlp-missing'
  | 'timeout'
  | 'unknown';

export interface IpcMyMusicError {
  error: string;
  code: MyMusicErrorCode;
}

export type IpcMyMusicReply = IpcMyMusicResponse | IpcMyMusicError;

const MY_MUSIC_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const LIKED_PLAYLIST_URL = 'https://music.youtube.com/playlist?list=LM';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const NOT_SIGNED_IN_MESSAGE =
  'Not signed in to YouTube Music in Chrome, or your Liked Music playlist is empty. Sign in at music.youtube.com in Chrome, like some songs, and try again.';
const CHROME_LOCKED_MESSAGE =
  "Chrome's cookie database is locked (Chrome is probably running). Quit Chrome completely, then try again.";
const CHROME_UNAVAILABLE_MESSAGE =
  "Could not read Chrome's cookies. Make sure Chrome is installed and you're signed in to a profile.";
const YT_DLP_MISSING_MESSAGE =
  'My Music needs yt-dlp. Reinstall SightKick, or install yt-dlp and add it to PATH.';
const TIMEOUT_MESSAGE =
  'Fetching your liked songs timed out. Check your connection and try again.';

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

// Mirrors src/main/ipc/searchYoutube.ts's resolveYtDlpPath: prefers the
// transcriber venv's yt-dlp (resources/transcriber/run.sh provisions it at
// <userData>/transcriber/.venv/bin/yt-dlp, or .venv/Scripts/yt-dlp.exe on
// Windows), falling back to a yt-dlp on PATH. Kept as an independent copy
// rather than an import so this file has no compile-time dependency on
// searchYoutube.ts, which another lane owns concurrently.
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

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// YT Music flat-playlist entries carry the track's artist under a few
// different keys depending on yt-dlp version and whether the entry is a
// proper YT Music track or a plain YouTube upload. Prefer the most specific
// music metadata first, falling back to the uploading channel name.
function pickArtist(entry: Record<string, unknown>): string | undefined {
  const direct = cleanText(entry.artist);

  if (direct) {
    return direct;
  }

  const artists = entry.artists;

  if (Array.isArray(artists)) {
    const names = artists
      .map((value) => cleanText(value))
      .filter((value): value is string => Boolean(value));

    if (names.length > 0) {
      return names.join(', ');
    }
  }

  return cleanText(entry.channel) ?? cleanText(entry.uploader);
}

// Parses one line of
// `yt-dlp --cookies-from-browser chrome --dump-json --flat-playlist` output.
// Never trusts the id-adjacent URL fields yt-dlp reports (webpage_url/url) —
// the canonical watch URL is always rebuilt from the validated 11-character
// video id, and thumbnails are only kept when they resolve to an
// allow-listed YouTube/Google image host.
export function parseMyMusicLine(line: string): MyMusicSong | undefined {
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

  const title = cleanText(entry.title);

  if (!title) {
    return undefined;
  }

  const durationSec =
    typeof entry.duration === 'number' && Number.isFinite(entry.duration)
      ? entry.duration
      : undefined;

  return {
    videoId,
    title,
    artist: pickArtist(entry),
    durationSec,
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

// Classifies a non-zero-exit yt-dlp failure from its stderr text. This is
// necessarily heuristic (yt-dlp's cookie-database error wording has shifted
// across versions), so it is layered from most to least specific and always
// falls through to an honest generic error rather than mis-classifying.
export function classifyMyMusicStderr(stderr: string):
  | {
      code:
        | 'chrome-cookie-locked'
        | 'chrome-cookies-unavailable'
        | 'not-signed-in';
      message: string;
    }
  | undefined {
  const text = stderr.toLowerCase();

  if (
    text.includes('locked') ||
    text.includes('in use by another process') ||
    text.includes('close chrome') ||
    text.includes('quit chrome')
  ) {
    return { code: 'chrome-cookie-locked', message: CHROME_LOCKED_MESSAGE };
  }

  if (
    text.includes('could not copy') ||
    text.includes('could not find chrome') ||
    (text.includes('could not find') && text.includes('cookie')) ||
    text.includes('no such file or directory') ||
    text.includes('not installed') ||
    text.includes('does not exist')
  ) {
    return {
      code: 'chrome-cookies-unavailable',
      message: CHROME_UNAVAILABLE_MESSAGE,
    };
  }

  if (
    text.includes('http error 403') ||
    text.includes('forbidden') ||
    text.includes('private video') ||
    text.includes('sign in to confirm') ||
    text.includes('members-only')
  ) {
    return { code: 'not-signed-in', message: NOT_SIGNED_IN_MESSAGE };
  }

  return undefined;
}

async function runMyMusicFetch(
  event: IpcMainEvent,
  request: IpcMyMusicRequest,
): Promise<void> {
  const ytDlpPath = resolveYtDlpPath();

  if (!ytDlpPath) {
    event.reply('my-music-fetch', {
      error: YT_DLP_MISSING_MESSAGE,
      code: 'yt-dlp-missing',
    } satisfies IpcMyMusicReply);

    return;
  }

  const limit = clampLimit(request?.limit);
  const songs: MyMusicSong[] = [];
  const seen = new Set<string>();
  let stderr = '';
  let settled = false;
  const child = spawn(
    ytDlpPath,
    [
      LIKED_PLAYLIST_URL,
      '--cookies-from-browser',
      'chrome',
      '--dump-json',
      '--flat-playlist',
      '--no-download',
      '--playlist-end',
      String(limit),
      '--no-warnings',
      '--quiet',
    ],
    {
      env: { ...process.env, ...caCertEnv() },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const finish = (payload: IpcMyMusicReply) => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timer);
    event.reply('my-music-fetch', payload);
  };
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    finish({ error: TIMEOUT_MESSAGE, code: 'timeout' });
  }, MY_MUSIC_TIMEOUT_MS);
  const reader = createLineReader((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    const parsed = parseMyMusicLine(trimmed);

    if (parsed && !seen.has(parsed.videoId)) {
      seen.add(parsed.videoId);
      songs.push(parsed);
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
      code: 'unknown',
    });
  });
  child.on('close', (code) => {
    reader.flush();

    if (settled) {
      return;
    }

    if (code !== 0 && songs.length === 0) {
      const classified = classifyMyMusicStderr(stderr);

      if (classified) {
        finish({ error: classified.message, code: classified.code });

        return;
      }

      finish({
        error: stderr.trim()
          ? `Could not fetch your liked songs: ${firstLine(stderr)}`
          : 'Could not fetch your liked songs. Try again in a moment.',
        code: 'unknown',
      });

      return;
    }

    if (songs.length === 0) {
      finish({ error: NOT_SIGNED_IN_MESSAGE, code: 'not-signed-in' });

      return;
    }

    finish({ songs: songs.slice(0, limit) });
  });
}

export function fetchMyMusic(
  event: IpcMainEvent,
  request: IpcMyMusicRequest,
): void {
  void runMyMusicFetch(event, request ?? {});
}
