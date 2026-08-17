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

const { backfillSongCovers, ingestSongCover, previewSongCover } = await import(
  './songCover'
);
const { parseFile } = await import('music-metadata');

function itunesSearchResponse(
  results: Array<{
    artistName: string;
    trackName: string;
    artworkUrl100: string;
  }>,
) {
  return {
    ok: true,
    status: 200,
    url: 'https://itunes.apple.com/search?term=x',
    json: async () => ({ results }),
  };
}

function imageResponse(bytes: number[]) {
  return {
    ok: true,
    status: 200,
    url: 'https://is1-ssl.mzstatic.com/image/thumb/xx/600x600bb.jpg',
    headers: new Headers({ 'content-type': 'image/jpeg' }),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

// Routes a mocked fetch by URL so a single test can exercise both the
// iTunes search request (findItunesArtwork) and the follow-on artwork
// download (remoteArtwork) with different canned responses.
function stubFetchRouter(
  handlers: Record<string, () => unknown>,
  fallback: () => unknown = () => itunesSearchResponse([]),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = input.toString();

      for (const [prefix, handler] of Object.entries(handlers)) {
        if (url.startsWith(prefix)) {
          return handler();
        }
      }

      return fallback();
    }),
  );
}

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

  it('prefers a confident iTunes match over embedded artwork and the thumbnail', async () => {
    metadataHolder.picture = [1, 2, 3];
    fs.writeFileSync(path.join(dir, 'song.mp3'), '');
    stubFetchRouter({
      'https://itunes.apple.com/search': () =>
        itunesSearchResponse([
          {
            artistName: 'Kygo feat. Kodaline',
            trackName: 'Raging',
            artworkUrl100: 'https://is1-ssl.mzstatic.com/xx/100x100bb.jpg',
          },
        ]),
      'https://is1-ssl.mzstatic.com': () => imageResponse([9, 9, 9]),
    });

    const parseFileCallsBefore = vi.mocked(parseFile).mock.calls.length;
    const result = await ingestSongCover(
      dir,
      'https://i.ytimg.com/vi/x/hqdefault.jpg',
      { artist: 'Kygo feat. Kodaline', title: 'Raging' },
    );

    expect(result).toBe('itunes');
    expect(fs.readFileSync(path.join(dir, 'album.jpg'), 'utf-8')).toBe('jpeg');
    // Embedded artwork was never even inspected once iTunes won.
    expect(vi.mocked(parseFile).mock.calls.length).toBe(parseFileCallsBefore);
  });

  it('falls back to embedded artwork when iTunes has no confident match', async () => {
    metadataHolder.picture = [1, 2, 3];
    fs.writeFileSync(path.join(dir, 'song.mp3'), '');
    stubFetchRouter({
      'https://itunes.apple.com/search': () => itunesSearchResponse([]),
    });

    const result = await ingestSongCover(
      dir,
      'https://i.ytimg.com/vi/x/hqdefault.jpg',
      { artist: 'Unknown Artist', title: 'octave-strum-proof' },
    );

    expect(result).toBe('embedded');
    expect(fs.readFileSync(path.join(dir, 'album.jpg'), 'utf-8')).toBe('jpeg');
  });

  it('falls back to the YouTube thumbnail when iTunes and embedded both miss', async () => {
    fs.writeFileSync(path.join(dir, 'song.ogg'), '');
    stubFetchRouter({
      'https://itunes.apple.com/search': () => itunesSearchResponse([]),
      'https://i.ytimg.com': () => imageResponse([4, 5, 6]),
    });

    const result = await ingestSongCover(
      dir,
      'https://i.ytimg.com/vi/x/hqdefault.jpg',
      { artist: 'Unknown Artist', title: 'octave-strum-proof' },
    );

    expect(result).toBe('remote');
    expect(fs.readFileSync(path.join(dir, 'album.jpg'), 'utf-8')).toBe('jpeg');
  });

  it('never queries iTunes when no artist/title identity is given', async () => {
    fs.writeFileSync(path.join(dir, 'song.ogg'), '');

    const fetchMock = vi.fn(async (_input: string | URL) =>
      imageResponse([4, 5, 6]),
    );

    vi.stubGlobal('fetch', fetchMock);

    await ingestSongCover(dir, 'https://example.com/permitted-cover.jpg');

    for (const call of fetchMock.mock.calls) {
      expect(call[0].toString()).not.toContain('itunes.apple.com');
    }
  });

  it('reuses a cover from the same known release before querying iTunes', async () => {
    const coveredDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cover-existing-'),
    );

    fs.writeFileSync(path.join(dir, 'song.mp3'), '');
    fs.writeFileSync(path.join(coveredDir, 'album.jpg'), 'existing');

    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      backfillSongCovers([
        {
          dir,
          artist: 'Green Day',
          title: 'Boulevard of Broken Dreams',
          album: 'American Idiot',
        },
        {
          dir: coveredDir,
          artist: 'Green Day',
          title: 'Boulevard of Broken Dreams',
          album: 'American Idiot',
        },
      ]),
    ).resolves.toEqual(new Set([dir]));
    expect(fs.existsSync(path.join(dir, 'album.jpg'))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    fs.rmSync(coveredDir, { recursive: true, force: true });
  });
});
