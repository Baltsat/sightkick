import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastReply, makeEvent } from './test-support';

const userDataHolder = vi.hoisted(() => ({ current: '' }));
const spawnHolder = vi.hoisted(() => ({ procs: [] as FakeProc[] }));

interface FakeEmitter {
  on: (event: string, cb: (...args: unknown[]) => void) => FakeEmitter;
  emit: (event: string, ...args: unknown[]) => void;
}

interface FakeProc extends FakeEmitter {
  stdout: FakeEmitter;
  stderr: FakeEmitter;
  kill: ReturnType<typeof vi.fn>;
  spawnArgs: { command: string; args: string[] };
}

vi.mock('electron', () => ({
  app: { getPath: () => userDataHolder.current },
}));

vi.mock('child_process', () => {
  const makeEmitter = (): FakeEmitter => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    return {
      on(event, cb) {
        (listeners[event] ??= []).push(cb);

        return this;
      },
      emit(event, ...args) {
        (listeners[event] ?? []).forEach((cb) => cb(...args));
      },
    };
  };
  const spawn = vi.fn((command: string, args: string[]) => {
    const proc = makeEmitter() as FakeProc;

    proc.stdout = makeEmitter();
    proc.stderr = makeEmitter();
    proc.kill = vi.fn();
    proc.spawnArgs = { command, args };
    spawnHolder.procs.push(proc);

    return proc;
  });

  return { spawn, default: { spawn } };
});

const { resolveYtDlpPath, parseYoutubeSearchLine, searchYoutube } =
  await import('./searchYoutube');

function venvBinDir(dataDir: string): string {
  return path.join(dataDir, 'transcriber', '.venv', 'bin');
}

function makeExecutable(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '#!/bin/sh\n', { mode: 0o755 });
}

function ndjson(entries: Record<string, unknown>[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

function currentProc(): FakeProc {
  return spawnHolder.procs[spawnHolder.procs.length - 1];
}

const originalPath = process.env.PATH;

beforeEach(() => {
  userDataHolder.current = fs.mkdtempSync(
    path.join(os.tmpdir(), 'search-youtube-test-'),
  );
  spawnHolder.procs.length = 0;
  process.env.PATH = originalPath;
});

afterEach(() => {
  fs.rmSync(userDataHolder.current, { recursive: true, force: true });
  process.env.PATH = originalPath;
});

describe('resolveYtDlpPath', () => {
  it('prefers the transcriber venv yt-dlp when it exists', () => {
    const venvYtDlp = path.join(venvBinDir(userDataHolder.current), 'yt-dlp');

    makeExecutable(venvYtDlp);

    expect(resolveYtDlpPath()).toBe(venvYtDlp);
  });

  it('falls back to yt-dlp on PATH when the venv copy is missing', () => {
    const pathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-dlp-path-'));
    const onPath = path.join(pathDir, 'yt-dlp');

    makeExecutable(onPath);
    process.env.PATH = pathDir;

    expect(resolveYtDlpPath()).toBe(onPath);

    fs.rmSync(pathDir, { recursive: true, force: true });
  });

  it('returns undefined when yt-dlp is unavailable anywhere', () => {
    process.env.PATH = fs.mkdtempSync(
      path.join(os.tmpdir(), 'yt-dlp-empty-path-'),
    );

    expect(resolveYtDlpPath()).toBeUndefined();
  });
});

describe('parseYoutubeSearchLine', () => {
  it('parses a well-formed flat-playlist entry and rebuilds the watch URL itself', () => {
    const result = parseYoutubeSearchLine(
      JSON.stringify({
        id: 'abcdefghijk',
        title: '  Some Song  ',
        uploader: 'Some Channel',
        duration: 213,
        thumbnails: [
          { url: 'https://i.ytimg.com/vi/abcdefghijk/default.jpg' },
          { url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' },
        ],
        // A malicious/irrelevant URL the parser must never trust.
        url: 'https://evil.example.com/not-youtube',
        webpage_url: 'https://evil.example.com/not-youtube',
      }),
    );

    expect(result).toEqual({
      videoId: 'abcdefghijk',
      title: 'Some Song',
      uploader: 'Some Channel',
      durationSeconds: 213,
      thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
  });

  it('drops thumbnails that are not on an allow-listed host', () => {
    const result = parseYoutubeSearchLine(
      JSON.stringify({
        id: 'abcdefghijk',
        title: 'Some Song',
        thumbnails: [{ url: 'https://evil.example.com/thumb.jpg' }],
      }),
    );

    expect(result?.thumbnailUrl).toBeUndefined();
  });

  it('rejects malformed JSON', () => {
    expect(parseYoutubeSearchLine('not json')).toBeUndefined();
  });

  it('rejects an entry with an invalid video id', () => {
    expect(
      parseYoutubeSearchLine(
        JSON.stringify({ id: 'not-11-chars', title: 'Some Song' }),
      ),
    ).toBeUndefined();
  });

  it('rejects an entry with no title', () => {
    expect(
      parseYoutubeSearchLine(JSON.stringify({ id: 'abcdefghijk' })),
    ).toBeUndefined();
  });
});

describe('searchYoutube', () => {
  beforeEach(() => {
    makeExecutable(path.join(venvBinDir(userDataHolder.current), 'yt-dlp'));
  });

  it('spawns yt-dlp with a ytsearch query and returns parsed results', async () => {
    const event = makeEvent();

    searchYoutube(event as never, { query: 'never gonna give you up' });
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    expect(proc.spawnArgs.args).toContain('ytsearch8:never gonna give you up');
    expect(proc.spawnArgs.args).toContain('--dump-json');
    expect(proc.spawnArgs.args).toContain('--flat-playlist');

    proc.stdout.emit(
      'data',
      Buffer.from(
        ndjson([
          { id: 'abcdefghijk', title: 'Song One', duration: 100 },
          { id: '11111111111', title: 'Song Two', duration: 200 },
        ]),
      ),
    );
    proc.emit('close', 0);

    await vi.waitFor(() =>
      expect(lastReply(event, 'search-youtube')).toBeTruthy(),
    );

    const reply = lastReply(event, 'search-youtube')!.args[0] as {
      results: { videoId: string; title: string }[];
    };

    expect(reply.results).toHaveLength(2);
    expect(reply.results[0].videoId).toBe('abcdefghijk');
    expect(reply.results[1].videoId).toBe('11111111111');
  });

  it('tolerates malformed lines and lines split across stdout chunks', async () => {
    const event = makeEvent();

    searchYoutube(event as never, { query: 'partial chunks' });
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();
    const goodLine = JSON.stringify({ id: 'abcdefghijk', title: 'Good' });

    // Split a single valid JSON line across two stdout 'data' events, and
    // interleave garbage lines that must be silently skipped.
    proc.stdout.emit('data', Buffer.from('not json at all\n'));
    proc.stdout.emit('data', Buffer.from(goodLine.slice(0, 10)));
    proc.stdout.emit('data', Buffer.from(`${goodLine.slice(10)}\n{}\n`));
    proc.emit('close', 0);

    await vi.waitFor(() =>
      expect(lastReply(event, 'search-youtube')).toBeTruthy(),
    );

    const reply = lastReply(event, 'search-youtube')!.args[0] as {
      results: { videoId: string }[];
    };

    expect(reply.results).toEqual([
      expect.objectContaining({ videoId: 'abcdefghijk' }),
    ]);
  });

  it('deduplicates by video id and caps results at the requested limit', async () => {
    const event = makeEvent();

    searchYoutube(event as never, { query: 'dupes', limit: 1 });
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    expect(proc.spawnArgs.args).toContain('ytsearch1:dupes');
    proc.stdout.emit(
      'data',
      Buffer.from(
        ndjson([
          { id: 'abcdefghijk', title: 'Song One' },
          { id: 'abcdefghijk', title: 'Song One again' },
        ]),
      ),
    );
    proc.emit('close', 0);

    await vi.waitFor(() =>
      expect(lastReply(event, 'search-youtube')).toBeTruthy(),
    );

    const reply = lastReply(event, 'search-youtube')!.args[0] as {
      results: unknown[];
    };

    expect(reply.results).toHaveLength(1);
  });

  it('replies with an honest error and kills the process on timeout', async () => {
    vi.useFakeTimers();

    try {
      const event = makeEvent();

      searchYoutube(event as never, { query: 'slow query' });
      await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1), {
        timeout: 1000,
        interval: 10,
      });

      const proc = currentProc();

      await vi.advanceTimersByTimeAsync(20_000);

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

      const reply = lastReply(event, 'search-youtube')!.args[0] as {
        error: string;
      };

      expect(reply.error).toMatch(/timed out/i);

      // A late close arriving after the timeout must not overwrite the
      // reply that was already sent.
      proc.emit('close', 0);
      expect(event.reply).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('replies with an honest error when the process exits non-zero with no results', async () => {
    const event = makeEvent();

    searchYoutube(event as never, { query: 'broken' });
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    proc.stderr.emit('data', Buffer.from('ERROR: no internet\nmore detail\n'));
    proc.emit('close', 1);

    await vi.waitFor(() =>
      expect(lastReply(event, 'search-youtube')).toBeTruthy(),
    );

    const reply = lastReply(event, 'search-youtube')!.args[0] as {
      error: string;
    };

    expect(reply.error).toContain('ERROR: no internet');
  });

  it('replies with an honest error and never spawns when yt-dlp is unavailable', async () => {
    fs.rmSync(venvBinDir(userDataHolder.current), {
      recursive: true,
      force: true,
    });
    process.env.PATH = fs.mkdtempSync(
      path.join(os.tmpdir(), 'yt-dlp-empty-path-'),
    );

    const event = makeEvent();

    searchYoutube(event as never, { query: 'anything' });
    await vi.waitFor(() =>
      expect(lastReply(event, 'search-youtube')).toBeTruthy(),
    );

    expect(spawnHolder.procs).toHaveLength(0);

    const reply = lastReply(event, 'search-youtube')!.args[0] as {
      error: string;
    };

    expect(reply.error).toMatch(/yt-dlp/i);
  });

  it('replies with an honest error and never spawns for a blank query', async () => {
    const event = makeEvent();

    searchYoutube(event as never, { query: '   ' });
    await vi.waitFor(() =>
      expect(lastReply(event, 'search-youtube')).toBeTruthy(),
    );

    expect(spawnHolder.procs).toHaveLength(0);

    const reply = lastReply(event, 'search-youtube')!.args[0] as {
      error: string;
    };

    expect(reply.error).toMatch(/song name/i);
  });
});
