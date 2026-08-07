import { LibrarySongRef, MyMusicSong } from './types';

// A trailing "(feat. X)" / "[ft. X]" / "featuring X" credit tacked onto a
// title — YouTube Music titles commonly carry the featured artist inline
// ("Song (feat. Travis Scott)"), while a user's local library commonly
// stores just the primary title ("Song"). Stripped before comparing titles
// so the two are still recognized as the same track.
const FEATURING_TAG =
  /\s*[([]?\s*(?:feat\.?|ft\.?|featuring)\s+[^()[\]]*[)\]]?\s*$/i;
// Splits a combined artist credit into its individual names — "Drake,
// Travis Scott", "Drake & Travis Scott" and "Drake x Travis Scott" all list
// two artists.
const ARTIST_SEPARATOR =
  /\s*(?:,|&|\bx\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i;

// NFKC folds compatibility variants (e.g. full-width characters) and, in
// particular, composes combining-mark sequences (e.g. "e" + combining
// acute) into their precomposed form (e.g. "é") — so a title or artist
// pulled from two different sources that spell the same accented name with
// different Unicode encodings still compares equal.
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

  // The standalone "x" collab separator can consume an artist credit that
  // IS just "X" (a real, if unusual, artist name — not a collab joiner):
  // splitting "X" on \bx\b matches the whole string, leaving only empty
  // strings that filter(Boolean) then drops entirely. Rather than let that
  // degenerate case match nothing, fall back to the original credit as a
  // single name.
  return new Set(names.length > 0 ? names : [normalize(artist)]);
}

// Two artist credits count as "the same artist" when they share at least
// one individual name, regardless of how many other collaborators either
// side also lists — "Drake, Travis Scott" and "Drake" share "drake", so a
// liked song crediting both matches a library entry crediting just one of
// them (and vice versa).
function artistsMatch(a: string, b: string): boolean {
  const namesB = artistNames(b);

  for (const name of artistNames(a)) {
    if (namesB.has(name)) {
      return true;
    }
  }

  return false;
}

// A liked song is considered "already in the library" when its artist
// credit shares a name with a library song's artist credit (see
// artistsMatch) and their titles match once featuring tags are stripped and
// both are Unicode-normalized. A liked song with no resolvable artist never
// matches — an empty artist is not a confident signal of identity, so it
// always shows "Add" rather than risk hiding a song the user doesn't
// actually have yet.
export function isInLibrary(
  song: MyMusicSong,
  librarySongs: LibrarySongRef[],
): boolean {
  const artist = song.artist?.trim();

  if (!artist) {
    return false;
  }

  const title = normalizeTitle(song.title);

  return librarySongs.some(
    (libSong) =>
      artistsMatch(artist, libSong.artist) &&
      normalizeTitle(libSong.name) === title,
  );
}

// Selects up to `count` liked songs to bulk-add, in their original order,
// skipping any already flagged "In library" — bulk-add should never queue a
// duplicate chart, and "top 10" means "the first 10 you don't already have".
export function selectBulkAddable(
  songs: MyMusicSong[],
  librarySongs: LibrarySongRef[],
  count = 10,
): MyMusicSong[] {
  const addable: MyMusicSong[] = [];

  for (const song of songs) {
    if (addable.length >= count) {
      break;
    }

    if (!isInLibrary(song, librarySongs)) {
      addable.push(song);
    }
  }

  return addable;
}
