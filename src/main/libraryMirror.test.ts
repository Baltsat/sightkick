import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Song } from '../types';
import { createLibraryMirrorEntry, LibraryMirrorQueue } from './libraryMirror';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }

  vi.unstubAllGlobals();
});

function create_song(root: string): Song {
  const songDirectory = path.join(root, 'song');

  fs.mkdirSync(songDirectory, { recursive: true });
  fs.writeFileSync(path.join(songDirectory, 'notes.mid'), 'chart-bytes');

  return {
    id: 'song-1',
    dir: songDirectory,
    name: 'Mirrored Song',
    artist: 'Artist',
    album: 'Album',
    charter: 'Drumroll',
    genre: 'Rock',
    year: '2026',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 4,
    format: 'mid',
    audio: [{ src: 'audio/song.ogg', name: 'song.ogg' }],
  };
}

describe('library mirror', () => {
  it('serializes a chart and metadata without uploading audio or its local path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-mirror-'));

    roots.push(root);

    const entry = await createLibraryMirrorEntry(
      create_song(root),
      '2026-08-12T00:00:00.000Z',
    );

    expect(entry).toMatchObject({
      version: 1,
      id: 'song-1',
      chart: {
        file: 'notes.mid',
        base64: Buffer.from('chart-bytes').toString('base64'),
      },
      audio: { state: 'local-only', names: ['song.ogg'] },
    });
    expect(JSON.stringify(entry)).not.toContain('audio/song.ogg');
  });

  it('keeps a failed upload in a local outbox and clears it when the network returns', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-mirror-'));

    roots.push(root);

    let online = false;
    const uploaded: string[] = [];
    const queue = new LibraryMirrorQueue({
      outboxDirectory: path.join(root, 'outbox'),
      getRuntime: () => ({
        endpoint: 'https://drumroll.example/api/library',
        token: 'token',
      }),
      upload: async (_runtime, entry) => {
        if (!online) {
          throw new Error('offline');
        }

        uploaded.push(entry.id);
      },
      now: () => '2026-08-12T00:00:00.000Z',
    });

    await expect(queue.enqueue(create_song(root))).resolves.toEqual({
      state: 'queued',
      pendingCount: 1,
      error: 'offline',
    });
    expect(await queue.pendingCount()).toBe(1);

    online = true;

    await expect(queue.flush()).resolves.toEqual({
      state: 'synced',
      pendingCount: 0,
    });
    expect(uploaded).toEqual(['song-1']);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('queues every existing local chart before syncing the configured mirror', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-mirror-'));

    roots.push(root);

    const secondRoot = path.join(root, 'second');
    const first = create_song(root);
    const second = {
      ...create_song(secondRoot),
      id: 'song-2',
      name: 'Second Song',
    };
    const uploaded: string[] = [];
    const queue = new LibraryMirrorQueue({
      outboxDirectory: path.join(root, 'outbox'),
      getRuntime: () => ({
        endpoint: 'https://drumroll.example/api/library',
        token: 'token',
      }),
      upload: async (_runtime, entry) => {
        uploaded.push(entry.id);
      },
      now: () => '2026-08-12T00:00:00.000Z',
    });

    await expect(queue.enqueueAll([first, second])).resolves.toEqual({
      state: 'synced',
      pendingCount: 0,
    });
    expect(uploaded).toHaveLength(2);
    expect(uploaded).toEqual(expect.arrayContaining(['song-1', 'song-2']));
  });

  it('keeps a token-rejected upload in the local outbox', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-mirror-'));

    roots.push(root);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Response(null, { status: 401 })),
    );

    const queue = new LibraryMirrorQueue({
      outboxDirectory: path.join(root, 'outbox'),
      getRuntime: () => ({
        endpoint: 'https://drumroll.example/api/library',
        token: 'rejected-token',
      }),
    });

    await expect(queue.enqueue(create_song(root))).resolves.toEqual({
      state: 'queued',
      pendingCount: 1,
      error: 'Library mirror rejected its token',
    });
    expect(await queue.pendingCount()).toBe(1);
  });

  it('retains only the unfinished entry after a partial upload', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-mirror-'));

    roots.push(root);

    const first = create_song(root);
    const second = { ...create_song(path.join(root, 'second')), id: 'song-2' };
    const uploaded: string[] = [];
    let attempts = 0;
    let failSecondAttempt = true;
    const queue = new LibraryMirrorQueue({
      outboxDirectory: path.join(root, 'outbox'),
      getRuntime: () => ({
        endpoint: 'https://drumroll.example/api/library',
        token: 'token',
      }),
      upload: async (_runtime, entry) => {
        attempts += 1;

        if (attempts === 2 && failSecondAttempt) {
          throw new Error('mid-batch failure');
        }

        uploaded.push(entry.id);
      },
    });

    await expect(queue.enqueueAll([first, second])).resolves.toEqual({
      state: 'queued',
      pendingCount: 1,
      error: 'mid-batch failure',
    });
    expect(uploaded).toHaveLength(1);
    expect(await queue.pendingCount()).toBe(1);

    failSecondAttempt = false;

    await expect(queue.flush()).resolves.toEqual({
      state: 'synced',
      pendingCount: 0,
    });
    expect(uploaded).toHaveLength(2);
    expect(new Set(uploaded)).toEqual(new Set(['song-1', 'song-2']));
  });

  it('replaces an already mirrored chart after its local bytes change', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-mirror-'));

    roots.push(root);

    const song = create_song(root);
    const uploaded: string[] = [];
    const queue = new LibraryMirrorQueue({
      outboxDirectory: path.join(root, 'outbox'),
      getRuntime: () => ({
        endpoint: 'https://drumroll.example/api/library',
        token: 'token',
      }),
      upload: async (_runtime, entry) => {
        uploaded.push(entry.chart.base64);
      },
    });

    await expect(queue.enqueue(song)).resolves.toEqual({
      state: 'synced',
      pendingCount: 0,
    });

    fs.writeFileSync(path.join(song.dir, 'notes.mid'), 'changed-chart-bytes');

    await expect(queue.enqueue(song)).resolves.toEqual({
      state: 'synced',
      pendingCount: 0,
    });
    expect(uploaded).toEqual([
      Buffer.from('chart-bytes').toString('base64'),
      Buffer.from('changed-chart-bytes').toString('base64'),
    ]);
  });

  it('does not create an outbox entry before a mirror is configured', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-mirror-'));

    roots.push(root);

    const queue = new LibraryMirrorQueue({
      outboxDirectory: path.join(root, 'outbox'),
      getRuntime: () => undefined,
    });

    await expect(queue.enqueue(create_song(root))).resolves.toEqual({
      state: 'disabled',
      pendingCount: 0,
    });
    expect(fs.existsSync(path.join(root, 'outbox'))).toBe(false);
  });
});
