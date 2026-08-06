import { LibrarySongRef, MyMusicSong } from './types';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// A liked song is considered "already in the library" when both its artist
// and title match a library song's (artist, name) case-insensitively after
// trimming. A liked song with no resolvable artist never matches — an empty
// artist is not a confident signal of identity, so it always shows "Add"
// rather than risk hiding a song the user doesn't actually have yet.
export function isInLibrary(
  song: MyMusicSong,
  librarySongs: LibrarySongRef[],
): boolean {
  const artist = song.artist?.trim();

  if (!artist) {
    return false;
  }

  const title = normalize(song.title);
  const normalizedArtist = normalize(artist);

  return librarySongs.some(
    (libSong) =>
      normalize(libSong.artist) === normalizedArtist &&
      normalize(libSong.name) === title,
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
