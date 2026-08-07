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

const {
  resolveYtDlpPath,
  parseMyMusicLine,
  classifyMyMusicStderr,
  fetchMyMusic,
} = await import('./myMusic');

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
    path.join(os.tmpdir(), 'my-music-test-'),
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

describe('parseMyMusicLine', () => {
  it('parses a well-formed flat-playlist entry and rebuilds the watch URL itself', () => {
    const result = parseMyMusicLine(
      JSON.stringify({
        id: 'abcdefghijk',
        title: '  Some Song  ',
        artist: 'Some Artist',
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
      artist: 'Some Artist',
      durationSec: 213,
      thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
      watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
  });

  it('falls back from artist to artists array to channel to uploader', () => {
    expect(
      parseMyMusicLine(
        JSON.stringify({
          id: 'abcdefghijk',
          title: 'Song',
          artists: ['Band A', 'Band B'],
        }),
      )?.artist,
    ).toBe('Band A, Band B');

    expect(
      parseMyMusicLine(
        JSON.stringify({ id: 'abcdefghijk', title: 'Song', channel: 'Chan' }),
      )?.artist,
    ).toBe('Chan');

    expect(
      parseMyMusicLine(
        JSON.stringify({
          id: 'abcdefghijk',
          title: 'Song',
          uploader: 'Uploader',
        }),
      )?.artist,
    ).toBe('Uploader');

    expect(
      parseMyMusicLine(JSON.stringify({ id: 'abcdefghijk', title: 'Song' }))
        ?.artist,
    ).toBeUndefined();
  });

  it('drops thumbnails that are not on an allow-listed host', () => {
    const result = parseMyMusicLine(
      JSON.stringify({
        id: 'abcdefghijk',
        title: 'Some Song',
        thumbnails: [{ url: 'https://evil.example.com/thumb.jpg' }],
      }),
    );

    expect(result?.thumbnailUrl).toBeUndefined();
  });

  it('rejects malformed JSON', () => {
    expect(parseMyMusicLine('not json')).toBeUndefined();
  });

  it('rejects an entry with an invalid video id', () => {
    expect(
      parseMyMusicLine(
        JSON.stringify({ id: 'not-11-chars', title: 'Some Song' }),
      ),
    ).toBeUndefined();
  });

  it('rejects an entry with no title', () => {
    expect(
      parseMyMusicLine(JSON.stringify({ id: 'abcdefghijk' })),
    ).toBeUndefined();
  });
});

describe('classifyMyMusicStderr', () => {
  it('classifies a locked cookie database', () => {
    expect(
      classifyMyMusicStderr(
        'ERROR: Could not copy Chrome cookie database: database is locked',
      ),
    ).toEqual({
      code: 'chrome-cookie-locked',
      message: expect.stringContaining('locked'),
    });
  });

  it('classifies "close chrome" wording as locked', () => {
    expect(
      classifyMyMusicStderr(
        'ERROR: please close Chrome and try again to read cookies',
      )?.code,
    ).toBe('chrome-cookie-locked');
  });

  it('classifies an unreadable/missing Chrome profile as unavailable', () => {
    expect(
      classifyMyMusicStderr('ERROR: could not find chrome cookies database')
        ?.code,
    ).toBe('chrome-cookies-unavailable');
  });

  it('classifies a 403/forbidden response as not-signed-in', () => {
    expect(
      classifyMyMusicStderr(
        'ERROR: unable to download: HTTP Error 403: Forbidden',
      )?.code,
    ).toBe('not-signed-in');
  });

  it('returns undefined for unrecognized stderr text', () => {
    expect(
      classifyMyMusicStderr('ERROR: something totally unexpected'),
    ).toBeUndefined();
  });
});

describe('fetchMyMusic', () => {
  beforeEach(() => {
    makeExecutable(path.join(venvBinDir(userDataHolder.current), 'yt-dlp'));
  });

  it('spawns yt-dlp against the Liked Music playlist with cookies-from-browser chrome', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    expect(proc.spawnArgs.args).toContain(
      'https://music.youtube.com/playlist?list=LM',
    );
    expect(proc.spawnArgs.args).toContain('--cookies-from-browser');
    expect(proc.spawnArgs.args).toContain('chrome');
    expect(proc.spawnArgs.args).toContain('--dump-json');
    expect(proc.spawnArgs.args).toContain('--flat-playlist');
    expect(proc.spawnArgs.args).toContain('--no-download');
    // Default limit of 50 is passed through as --playlist-end.
    expect(proc.spawnArgs.args).toContain('50');

    proc.stdout.emit(
      'data',
      Buffer.from(
        ndjson([
          { id: 'abcdefghijk', title: 'Song One', artist: 'Artist One' },
          { id: '11111111111', title: 'Song Two', artist: 'Artist Two' },
        ]),
      ),
    );
    proc.emit('close', 0);

    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      songs: { videoId: string; artist?: string }[];
    };

    expect(reply.songs).toHaveLength(2);
    expect(reply.songs[0]).toMatchObject({
      videoId: 'abcdefghijk',
      artist: 'Artist One',
    });
  });

  it('honors a custom limit as --playlist-end and caps the returned songs', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, { limit: 1 });
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    expect(proc.spawnArgs.args).toContain('1');

    proc.stdout.emit(
      'data',
      Buffer.from(
        ndjson([
          { id: 'abcdefghijk', title: 'Song One' },
          { id: '11111111111', title: 'Song Two' },
        ]),
      ),
    );
    proc.emit('close', 0);

    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      songs: unknown[];
    };

    expect(reply.songs).toHaveLength(1);
  });

  it('deduplicates entries by video id', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

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
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      songs: unknown[];
    };

    expect(reply.songs).toHaveLength(1);
  });

  it('replies not-signed-in when the playlist is empty on a clean exit', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    currentProc().emit('close', 0);

    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      error: string;
      code: string;
    };

    expect(reply.code).toBe('not-signed-in');
  });

  it('replies chrome-cookie-locked when the cookie database is locked', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    proc.stderr.emit(
      'data',
      Buffer.from(
        'ERROR: could not copy cookie database: database is locked\n',
      ),
    );
    proc.emit('close', 1);

    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      error: string;
      code: string;
    };

    expect(reply.code).toBe('chrome-cookie-locked');
  });

  it('replies chrome-cookies-unavailable when Chrome has no readable profile', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    proc.stderr.emit(
      'data',
      Buffer.from('ERROR: could not find chrome cookies database\n'),
    );
    proc.emit('close', 1);

    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      code: string;
    };

    expect(reply.code).toBe('chrome-cookies-unavailable');
  });

  it('replies not-signed-in on a 403 response', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    proc.stderr.emit('data', Buffer.from('ERROR: HTTP Error 403: Forbidden\n'));
    proc.emit('close', 1);

    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      code: string;
    };

    expect(reply.code).toBe('not-signed-in');
  });

  it('replies unknown with the raw stderr detail for an unrecognized failure', async () => {
    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1));

    const proc = currentProc();

    proc.stderr.emit('data', Buffer.from('ERROR: no internet\nmore detail\n'));
    proc.emit('close', 1);

    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      error: string;
      code: string;
    };

    expect(reply.code).toBe('unknown');
    expect(reply.error).toContain('ERROR: no internet');
  });

  it('replies with an honest error and kills the process on timeout', async () => {
    vi.useFakeTimers();

    try {
      const event = makeEvent();

      fetchMyMusic(event as never, {});
      await vi.waitFor(() => expect(spawnHolder.procs.length).toBe(1), {
        timeout: 1000,
        interval: 10,
      });

      const proc = currentProc();

      await vi.advanceTimersByTimeAsync(30_000);

      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

      const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
        error: string;
        code: string;
      };

      expect(reply.code).toBe('timeout');

      // A late close arriving after the timeout must not overwrite the
      // reply that was already sent.
      proc.emit('close', 0);
      expect(event.reply).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('replies yt-dlp-missing and never spawns when yt-dlp is unavailable', async () => {
    fs.rmSync(venvBinDir(userDataHolder.current), {
      recursive: true,
      force: true,
    });
    process.env.PATH = fs.mkdtempSync(
      path.join(os.tmpdir(), 'yt-dlp-empty-path-'),
    );

    const event = makeEvent();

    fetchMyMusic(event as never, {});
    await vi.waitFor(() =>
      expect(lastReply(event, 'my-music-fetch')).toBeTruthy(),
    );

    expect(spawnHolder.procs).toHaveLength(0);

    const reply = lastReply(event, 'my-music-fetch')!.args[0] as {
      code: string;
    };

    expect(reply.code).toBe('yt-dlp-missing');
  });
});
