// Resolves real album artwork for a song from its artist + title via the
// iTunes Search API (no auth, free). Used to replace the placeholder/video
// thumbnail covers that YouTube-sourced auto-chart imports otherwise end up
// with — see songCover.ts's ingestSongCover, which tries this before
// falling back to embedded audio art or the YouTube thumbnail.
//
// scripts/repair-covers.js duplicates the matching logic below (in plain
// CommonJS, since it runs standalone via `node`, outside the electron-vite
// build) to re-resolve covers for songs already in a user's library. Keep
// the two in sync when tuning the matching heuristics.

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const ITUNES_SEARCH_TIMEOUT_MS = 8_000;
// Below this the candidate is treated as "not confident enough" and the
// caller should fall back to embedded/thumbnail art instead of risking a
// wrong cover.
const MIN_TITLE_SIMILARITY = 0.6;
// A trailing "(feat. X)" / "[ft. X]" / "featuring X" credit tacked onto a
// title. Mirrors src/renderer/components/MyMusic/helpers.ts's FEATURING_TAG
// (duplicated here — the main process can't import renderer code).
const FEATURING_TAG =
  /\s*[([]?\s*(?:feat\.?|ft\.?|featuring)\s+[^()[\]]*[)\]]?\s*$/i;
// Splits a combined artist credit into its individual names. Mirrors
// MyMusic/helpers.ts's ARTIST_SEPARATOR.
const ARTIST_SEPARATOR =
  /\s*(?:,|&|\bx\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i;

// NFKC folds compatibility variants and composes combining-mark sequences,
// so the same accented name spelled two different ways still compares
// equal. Mirrors MyMusic/helpers.ts's normalize.
function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function normalizeTitle(title: string): string {
  return normalize(title.replace(FEATURING_TAG, ''));
}

function artistNames(artist: string): Set<string> {
  const names = artist
    .split(ARTIST_SEPARATOR)
    .map((name) => normalize(name))
    .filter(Boolean);

  return new Set(names.length > 0 ? names : [normalize(artist)]);
}

// Two artist credits count as "the same artist" when they share at least
// one individual name. Mirrors MyMusic/helpers.ts's artistsMatch.
function artistsMatch(a: string, b: string): boolean {
  const namesB = artistNames(b);

  for (const name of artistNames(a)) {
    if (namesB.has(name)) {
      return true;
    }
  }

  return false;
}

function tokenize(value: string): string[] {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// Fuzzy title score: the fraction of the *smaller* token set that's also in
// the larger one (overlap coefficient, not Jaccard) — iTunes results
// routinely append "(Remastered 2011)"/"- Single Version" suffixes our
// FEATURING_TAG doesn't strip, which a union-based ratio would unfairly
// punish. Artist identity is still enforced separately and exactly via
// artistsMatch, so a loose title metric doesn't risk a wrong-artist match.
function titleSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }

  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of tokensA) {
    if (tokensB.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.min(tokensA.size, tokensB.size);
}

// iTunes artwork URLs end in a "<n>x<n>bb.jpg" size token (artworkUrl100 ->
// "100x100bb.jpg"); swapping it for 600x600 is iTunes's documented way to
// request the larger rendition of the same artwork.
export function upgradeArtworkUrl(url: string): string {
  return url.replace('100x100', '600x600');
}

interface ItunesSearchResult {
  trackName?: unknown;
  artistName?: unknown;
  artworkUrl100?: unknown;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface FindItunesArtworkOptions {
  timeoutMs?: number;
}

// Searches iTunes for `artist`+`title`, returning a 600x600 artwork URL for
// the best confident match, or undefined when nothing clears the bar (the
// caller should then fall back to embedded/thumbnail art). Never throws —
// network failures, timeouts, and malformed responses all resolve to
// undefined so a flaky/slow iTunes lookup never blocks an import.
export async function findItunesArtwork(
  artist: string,
  title: string,
  options: FindItunesArtworkOptions = {},
): Promise<string | undefined> {
  const trimmedArtist = artist.trim();
  const trimmedTitle = title.trim();

  if (!trimmedArtist || !trimmedTitle) {
    return undefined;
  }

  const url = new URL(ITUNES_SEARCH_URL);

  url.searchParams.set('term', `${trimmedArtist} ${trimmedTitle}`);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '5');

  let response: Response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(
        options.timeoutMs ?? ITUNES_SEARCH_TIMEOUT_MS,
      ),
    });
  } catch {
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return undefined;
  }

  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const results = (payload as { results?: unknown }).results;

  if (!Array.isArray(results)) {
    return undefined;
  }

  const normalizedQueryTitle = normalizeTitle(trimmedTitle);
  let best: { url: string; score: number } | undefined;

  for (const raw of results) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const result = raw as ItunesSearchResult;
    const trackName =
      typeof result.trackName === 'string' ? result.trackName : undefined;
    const resultArtist =
      typeof result.artistName === 'string' ? result.artistName : undefined;
    const artwork =
      typeof result.artworkUrl100 === 'string'
        ? result.artworkUrl100
        : undefined;

    if (!trackName || !resultArtist || !artwork || !isHttpsUrl(artwork)) {
      continue;
    }

    if (!artistsMatch(trimmedArtist, resultArtist)) {
      continue;
    }

    const score = titleSimilarity(
      normalizeTitle(trackName),
      normalizedQueryTitle,
    );

    if (score < MIN_TITLE_SIMILARITY) {
      continue;
    }

    if (!best || score > best.score) {
      best = { url: upgradeArtworkUrl(artwork), score };
    }
  }

  return best?.url;
}
