import { afterEach, describe, expect, it, vi } from 'vitest';
import { findItunesArtwork, upgradeArtworkUrl } from './albumArtResolver';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

describe('upgradeArtworkUrl', () => {
  it('replaces the 100x100 size token with 600x600', () => {
    expect(
      upgradeArtworkUrl(
        'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/xx/100x100bb.jpg',
      ),
    ).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/xx/600x600bb.jpg',
    );
  });

  it('leaves a URL without the 100x100 token untouched', () => {
    expect(upgradeArtworkUrl('https://example.com/cover.jpg')).toBe(
      'https://example.com/cover.jpg',
    );
  });
});

describe('findItunesArtwork', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an upgraded artwork URL for an exact artist+title match', async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
      jsonResponse({
        results: [
          {
            artistName: 'Kygo feat. Kodaline',
            trackName: 'Raging',
            artworkUrl100:
              'https://is1-ssl.mzstatic.com/image/thumb/xx/100x100bb.jpg',
          },
        ],
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      findItunesArtwork('Kygo feat. Kodaline', 'Raging'),
    ).resolves.toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/xx/600x600bb.jpg',
    );

    const [requestUrl] = fetchMock.mock.calls[0];

    expect(requestUrl.toString()).toContain('https://itunes.apple.com/search');
    expect(requestUrl.toString()).toContain('media=music');
    expect(requestUrl.toString()).toContain('entity=song');
  });

  it('matches a slash-separated featured artist credit to the primary release artist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              artistName: 'Jonas Blue',
              trackName: 'What I Like About You (feat. Theresa Rex)',
              artworkUrl100: 'https://example.com/100x100bb.jpg',
            },
          ],
        }),
      ),
    );

    await expect(
      findItunesArtwork('Jonas Blue/Theresa Rex', 'What I Like About You'),
    ).resolves.toBe('https://example.com/600x600bb.jpg');
  });

  it('matches a candidate whose title carries an extra suffix iTunes appended', async () => {
    // "Golden Hour (Bonus Track Version)" vs a query of "Golden Hour" — the
    // feat-stripping idiom doesn't touch this suffix, so only the fuzzy
    // (token-overlap) half of the scoring can accept it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              artistName: 'Kygo',
              trackName: 'Golden Hour (Bonus Track Version)',
              artworkUrl100: 'https://example.com/100x100bb.jpg',
            },
          ],
        }),
      ),
    );

    await expect(findItunesArtwork('Kygo', 'Golden Hour')).resolves.toBe(
      'https://example.com/600x600bb.jpg',
    );
  });

  it('prefers the exact release title over a remix from the same artist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              artistName: 'Kygo & Selena Gomez',
              trackName: "It Ain't Me (Tiësto's AFTR:HRS Remix)",
              artworkUrl100: 'https://example.com/remix/100x100bb.jpg',
            },
            {
              artistName: 'Kygo & Selena Gomez',
              trackName: "It Ain't Me",
              artworkUrl100: 'https://example.com/original/100x100bb.jpg',
            },
          ],
        }),
      ),
    );

    await expect(
      findItunesArtwork('Kygo & Selena Gomez', "It Ain't Me"),
    ).resolves.toBe('https://example.com/original/600x600bb.jpg');
  });

  it('falls back to undefined when no result shares the queried artist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              artistName: 'A Completely Different Artist',
              trackName: 'Raging',
              artworkUrl100: 'https://example.com/100x100bb.jpg',
            },
          ],
        }),
      ),
    );

    await expect(
      findItunesArtwork('Kygo feat. Kodaline', 'Raging'),
    ).resolves.toBeUndefined();
  });

  it('falls back to undefined when the title is too dissimilar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              artistName: 'Kygo',
              trackName: 'Firestone',
              artworkUrl100: 'https://example.com/100x100bb.jpg',
            },
          ],
        }),
      ),
    );

    await expect(findItunesArtwork('Kygo', 'Raging')).resolves.toBeUndefined();
  });

  it('falls back to undefined when iTunes returns no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [] })),
    );

    await expect(findItunesArtwork('Kygo', 'Raging')).resolves.toBeUndefined();
  });

  it('falls back to undefined when the search request is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [] }, false)),
    );

    await expect(findItunesArtwork('Kygo', 'Raging')).resolves.toBeUndefined();
  });

  it('falls back to undefined when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Promise<Response>((_resolve, reject) => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          }),
      ),
    );

    await expect(findItunesArtwork('Kygo', 'Raging')).resolves.toBeUndefined();
  });

  it('ignores a result whose artwork URL is not https', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          results: [
            {
              artistName: 'Kygo',
              trackName: 'Raging',
              artworkUrl100: 'http://example.com/100x100bb.jpg',
            },
          ],
        }),
      ),
    );

    await expect(findItunesArtwork('Kygo', 'Raging')).resolves.toBeUndefined();
  });

  it('returns undefined without calling fetch when artist or title is blank', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    await expect(findItunesArtwork('', 'Raging')).resolves.toBeUndefined();
    await expect(findItunesArtwork('Kygo', '  ')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
