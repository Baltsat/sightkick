import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const metadataHolder = vi.hoisted(() => ({
  picture: undefined as number[] | undefined,
}));

vi.mock('music-metadata', () => ({
  parseFile: vi.fn(async () => ({
    common: {
      picture: metadataHolder.picture
        ? [{ data: Uint8Array.from(metadataHolder.picture) }]
        : [],
    },
  })),
}));

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      isEmpty: () => false,
      toJPEG: () => Buffer.from('jpeg'),
      toDataURL: () => 'data:image/jpeg;base64,cHJldmlldw==',
    })),
  },
}));

const { ingestSongCover, previewSongCover } = await import('./songCover');

describe('song cover ingestion', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
    metadataHolder.picture = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('preserves an existing manual cover', async () => {
    fs.writeFileSync(path.join(dir, 'album.png'), 'manual');
    fs.writeFileSync(path.join(dir, 'song.mp3'), '');

    const result = await ingestSongCover(dir, 'https://example.com/remote.jpg');

    expect(result).toBe('existing');
    expect(fs.readFileSync(path.join(dir, 'album.png'), 'utf-8')).toBe(
      'manual',
    );
    expect(fs.existsSync(path.join(dir, 'album.jpg'))).toBe(false);
  });

  it('normalizes embedded artwork to album.jpg', async () => {
    metadataHolder.picture = [1, 2, 3];
    fs.writeFileSync(path.join(dir, 'song.mp3'), '');

    expect(await ingestSongCover(dir)).toBe('embedded');
    expect(fs.readFileSync(path.join(dir, 'album.jpg'), 'utf-8')).toBe('jpeg');
  });

  it('uses an explicit remote image only when local artwork is absent', async () => {
    fs.writeFileSync(path.join(dir, 'song.ogg'), '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer,
      })),
    );

    expect(
      await ingestSongCover(dir, 'https://example.com/permitted-cover.jpg'),
    ).toBe('remote');
    expect(fs.readFileSync(path.join(dir, 'album.jpg'), 'utf-8')).toBe('jpeg');
  });

  it('previews embedded artwork without writing into the source folder', async () => {
    metadataHolder.picture = [1, 2, 3];
    fs.writeFileSync(path.join(dir, 'song.mp3'), '');

    expect(await previewSongCover(dir)).toEqual({
      dataUrl: 'data:image/jpeg;base64,cHJldmlldw==',
      source: 'embedded',
    });
    expect(fs.existsSync(path.join(dir, 'album.jpg'))).toBe(false);
  });
});
