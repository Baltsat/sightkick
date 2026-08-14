import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeStore, lastReply, makeEvent, makeStore } from './test-support';

const storeHolder = vi.hoisted(() => ({
  current: undefined as FakeStore | undefined,
}));
const sngHolder = vi.hoisted(() => ({
  files: [] as { name: string; data: string }[],
  shouldError: false,
}));

vi.mock('../AppState', () => ({
  appState: {
    store: {
      get: (key: string) => storeHolder.current!.get(key),
      set: (key: string, value: unknown) =>
        storeHolder.current!.set(key, value),
    },
  },
}));

vi.mock('@eliwhite/parse-sng', () => ({
  SngStream: class {
    private handlers = new Map<string, (...args: unknown[]) => void>();

    on(event: string, cb: (...args: unknown[]) => void) {
      this.handlers.set(event, cb);
    }

    start() {
      if (sngHolder.shouldError) {
        this.handlers.get('error')?.(new Error('bad sng'));

        return;
      }

      const fileCb = this.handlers.get('file')!;
      let index = 0;
      const emitNext = () => {
        const file = sngHolder.files[index];

        index += 1;

        const data = new TextEncoder().encode(file.data);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        });
        const nextFile = index < sngHolder.files.length ? emitNext : null;

        fileCb(file.name, stream, nextFile);
      };

      if (sngHolder.files.length) {
        emitNext();
      }
    }
  },
}));

const { downloadSong } = await import('./downloadSong');
const VALID_SONG = [
  { name: 'song.ini', data: '[Song]\nname = Test\n' },
  {
    name: 'notes.chart',
    data: '[Song]\n{\n  Resolution = 192\n}\n[ExpertDrums]\n{\n  0 = N 0 0\n}\n',
  },
  { name: 'song.ogg', data: 'fake-audio' },
];
const NO_AUDIO_SONG = VALID_SONG.filter((file) => file.name !== 'song.ogg');

function okFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
      }),
    ),
  );
}

const baseProps = {
  url: 'https://files.enchor.us/hash123.sng',
  md5: 'hash123',
  name: 'Song',
  artist: 'Artist',
  charter: 'Charter',
  chartSource: 'chorus-encore' as const,
  reviewed: true as const,
};

describe('downloadSong', () => {
  let library: string;

  beforeEach(() => {
    library = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-library-'));
    sngHolder.files = VALID_SONG;
    sngHolder.shouldError = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(library, { recursive: true, force: true });
  });

  it('fails when no library folder has been selected', async () => {
    storeHolder.current = makeStore({});
    okFetch();

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    expect(lastReply(event, 'download-song')!.args[0]).toMatchObject({
      success: false,
      md5: 'hash123',
      error: 'No folder selected',
    });
  });

  it('reports failure when the download response is not ok', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404 })),
    );

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    const reply = lastReply(event, 'download-song')!.args[0] as {
      success: boolean;
      error: string;
    };

    expect(reply.success).toBe(false);
    expect(reply.error).toContain('404');
  });

  it('rejects an unreviewed chart before downloading it', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });

    const fetchSpy = vi.fn();

    vi.stubGlobal('fetch', fetchSpy);

    const event = makeEvent();

    await downloadSong(event as never, { ...baseProps, reviewed: false });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lastReply(event, 'download-song')!.args[0]).toMatchObject({
      success: false,
      error: expect.stringContaining('quality-reviewed'),
    });
  });

  it('writes the unpacked song, persists it and replies success', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    okFetch();

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    const outputDir = path.join(library, 'Artist - Song (Charter)');

    expect(fs.existsSync(path.join(outputDir, 'song.ini'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'notes.chart'))).toBe(true);

    expect(
      JSON.parse(fs.readFileSync(path.join(outputDir, '.sightkick'), 'utf-8')),
    ).toEqual({ id: 'hash123' });

    const stored = storeHolder.current.get('songs.hash123') as { id: string };

    expect(stored.id).toBe('hash123');

    const reply = lastReply(event, 'download-song')!.args[0] as {
      success: boolean;
      song: { id: string; updatedAt: string };
    };

    expect(reply.success).toBe(true);
    expect(reply.song.id).toBe('hash123');
    expect(reply.song.updatedAt).toMatch(/^\d{4}-/);
  });

  it('strips filesystem-illegal characters from the folder name', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    okFetch();

    const event = makeEvent();

    await downloadSong(event as never, {
      ...baseProps,
      artist: 'AC/DC',
      name: 'Hells: Bells?',
      charter: 'X*Y',
    });

    expect(fs.existsSync(path.join(library, 'ACDC - Hells Bells (XY)'))).toBe(
      true,
    );
  });

  it('rejects an archive entry that escapes the output directory', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    sngHolder.files = [
      ...VALID_SONG,
      { name: '../escaped.txt', data: 'pwned' },
    ];
    okFetch();

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    expect(fs.existsSync(path.join(library, 'escaped.txt'))).toBe(false);
    expect(lastReply(event, 'download-song')!.args[0]).toMatchObject({
      success: false,
      md5: 'hash123',
    });

    // The partially-unpacked folder must not survive the failure, or the
    // next attempt for this exact song would be silently blocked forever by
    // the `fs.existsSync(outputDir)` alreadyExists gate.
    expect(fs.existsSync(path.join(library, 'Artist - Song (Charter)'))).toBe(
      false,
    );
  });

  it('rejects a package whose archive yields no playable audio and does not add it to the library', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    sngHolder.files = NO_AUDIO_SONG;
    okFetch();

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    expect(lastReply(event, 'download-song')!.args[0]).toMatchObject({
      success: false,
      md5: 'hash123',
      error: expect.stringContaining('audio'),
    });
    expect(storeHolder.current.get('songs.hash123')).toBeUndefined();
  });

  it('cleans up the orphaned folder from a no-audio failure so a retry re-fetches instead of replying alreadyExists', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    sngHolder.files = NO_AUDIO_SONG;
    okFetch();

    const firstEvent = makeEvent();

    await downloadSong(firstEvent as never, baseProps);

    const outputDir = path.join(library, 'Artist - Song (Charter)');

    expect(fs.existsSync(outputDir)).toBe(false);

    // A second attempt (e.g. once a fixed package is available) must retry
    // the download instead of being permanently blocked by a stray folder.
    sngHolder.files = VALID_SONG;
    okFetch();

    const fetchSpy = vi.mocked(fetch);

    fetchSpy.mockClear();

    const secondEvent = makeEvent();

    await downloadSong(secondEvent as never, baseProps);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(lastReply(secondEvent, 'download-song')!.args[0]).toMatchObject({
      success: true,
      md5: 'hash123',
    });
  });

  it('cleans up the orphaned folder from a failed download so a retry re-fetches instead of replying alreadyExists', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    sngHolder.files = [
      ...VALID_SONG,
      { name: '../escaped.txt', data: 'pwned' },
    ];
    okFetch();

    const firstEvent = makeEvent();

    await downloadSong(firstEvent as never, baseProps);

    const outputDir = path.join(library, 'Artist - Song (Charter)');

    expect(fs.existsSync(outputDir)).toBe(false);

    sngHolder.files = VALID_SONG;
    okFetch();

    const fetchSpy = vi.mocked(fetch);

    fetchSpy.mockClear();

    const secondEvent = makeEvent();

    await downloadSong(secondEvent as never, baseProps);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(lastReply(secondEvent, 'download-song')!.args[0]).toMatchObject({
      success: true,
      md5: 'hash123',
    });
  });

  it('skips and reports alreadyExists when the md5 is already in the library', async () => {
    storeHolder.current = makeStore({
      lastOpenedPath: library,
      songs: { hash123: { id: 'hash123' } },
    });

    const fetchSpy = vi.fn();

    vi.stubGlobal('fetch', fetchSpy);

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lastReply(event, 'download-song')!.args[0]).toMatchObject({
      success: false,
      md5: 'hash123',
      alreadyExists: true,
    });
  });

  it('skips when the destination folder already exists', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    fs.mkdirSync(path.join(library, 'Artist - Song (Charter)'));

    const fetchSpy = vi.fn();

    vi.stubGlobal('fetch', fetchSpy);

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lastReply(event, 'download-song')!.args[0]).toMatchObject({
      success: false,
      md5: 'hash123',
      alreadyExists: true,
    });
  });

  it('reports failure when the SNG stream errors', async () => {
    storeHolder.current = makeStore({ lastOpenedPath: library });
    sngHolder.shouldError = true;
    okFetch();

    const event = makeEvent();

    await downloadSong(event as never, baseProps);

    expect(lastReply(event, 'download-song')!.args[0]).toMatchObject({
      success: false,
      md5: 'hash123',
    });
  });
});
