import type { Song, YandexLibraryCandidateSources } from '../../../types';
import type { UnifiedLibraryEntry } from '../../services/library/unified-library';

export type ActionableShelfId =
  | 'ready-now'
  | 'favourites'
  | 'recently-imported';

export type LocalLibraryEntry = UnifiedLibraryEntry & {
  kind: 'song';
  song: Song;
};

export interface ActionableLibraryShelf {
  id: ActionableShelfId;
  title: string;
  detail: string;
  empty: string;
  entries: readonly LocalLibraryEntry[];
}

export interface ActionableLibraryShelves {
  shelves: readonly ActionableLibraryShelf[];
  rest: readonly UnifiedLibraryEntry[];
  scrollingEntries: readonly LocalLibraryEntry[];
}

function is_local_song(entry: UnifiedLibraryEntry): entry is LocalLibraryEntry {
  return entry.kind === 'song' && entry.song !== undefined;
}

function select_unseen(
  entries: readonly LocalLibraryEntry[],
  selected: Set<string>,
  limit: number,
): LocalLibraryEntry[] {
  const next = entries
    .filter((entry) => !selected.has(entry.key))
    .slice(0, limit);

  next.forEach((entry) => selected.add(entry.key));

  return next;
}

function timestamp(entry: LocalLibraryEntry): number {
  const parsed = entry.updatedAt ? Date.parse(entry.updatedAt) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

export function rank_library_songs({
  entries,
  inZoneSongIds,
  favouriteSongIds,
  sourceSeededSongIds = new Set(),
  recentPlayedAt = new Map(),
}: {
  entries: readonly UnifiedLibraryEntry[];
  inZoneSongIds: readonly string[];
  favouriteSongIds: ReadonlySet<string>;
  sourceSeededSongIds?: ReadonlySet<string>;
  recentPlayedAt?: ReadonlyMap<string, number>;
}): LocalLibraryEntry[] {
  const inZone = new Set(inZoneSongIds);

  return entries.filter(is_local_song).sort((left, right) => {
    const leftSong = left.song;
    const rightSong = right.song;
    const ready = Number(right.ready) - Number(left.ready);

    if (ready !== 0) {
      return ready;
    }

    const zone =
      Number(inZone.has(rightSong.id)) - Number(inZone.has(leftSong.id));

    if (zone !== 0) {
      return zone;
    }

    const favourite =
      Number(favouriteSongIds.has(rightSong.id)) -
      Number(favouriteSongIds.has(leftSong.id));

    if (favourite !== 0) {
      return favourite;
    }

    const taste =
      Number(sourceSeededSongIds.has(rightSong.id)) -
      Number(sourceSeededSongIds.has(leftSong.id));

    if (taste !== 0) {
      return taste;
    }

    const recent =
      (recentPlayedAt.get(rightSong.id) ?? 0) -
      (recentPlayedAt.get(leftSong.id) ?? 0);

    if (recent !== 0) {
      return recent;
    }

    const difficulty =
      (left.difficulty?.learner_relative_difficulty ??
        Number.POSITIVE_INFINITY) -
      (right.difficulty?.learner_relative_difficulty ??
        Number.POSITIVE_INFINITY);

    return (
      difficulty ||
      left.title.localeCompare(right.title) ||
      left.key.localeCompare(right.key)
    );
  });
}

export function yandex_taste_seeded_song_ids(
  songs: readonly Song[],
  sources: YandexLibraryCandidateSources,
): ReadonlySet<string> {
  const sourceTrackIds = new Set([
    ...sources.drums.tracks.map((track) => track.id),
    ...sources.favorites.tracks.map((track) => track.id),
  ]);

  return new Set(
    songs
      .filter(
        (song) =>
          song.sourceProvenance?.provider === 'yandex-music' &&
          sourceTrackIds.has(song.sourceProvenance.trackId),
      )
      .map((song) => song.id),
  );
}

export function favourite_song_ids(
  songs: readonly Song[],
  sourceSeededSongIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    songs
      .filter((song) => song.liked || sourceSeededSongIds.has(song.id))
      .map((song) => song.id),
  );
}

export function build_actionable_library_shelves({
  entries,
  inZoneSongIds,
  favouriteSongIds,
  sourceSeededSongIds,
  recentPlayedAt,
  limit = 3,
}: {
  entries: readonly UnifiedLibraryEntry[];
  inZoneSongIds: readonly string[];
  favouriteSongIds: ReadonlySet<string>;
  sourceSeededSongIds?: ReadonlySet<string>;
  recentPlayedAt?: ReadonlyMap<string, number>;
  limit?: number;
}): ActionableLibraryShelves {
  const localEntries = rank_library_songs({
    entries,
    inZoneSongIds,
    favouriteSongIds,
    sourceSeededSongIds,
    recentPlayedAt,
  });
  const readyEntries = localEntries.filter((entry) => entry.ready);
  const bySongId = new Map(
    readyEntries.map((entry) => [entry.song.id, entry] as const),
  );
  const selected = new Set<string>();
  const inZone = select_unseen(
    inZoneSongIds
      .map((songId) => bySongId.get(songId))
      .filter((entry): entry is LocalLibraryEntry => entry !== undefined),
    selected,
    limit,
  );
  const favourites = select_unseen(
    readyEntries.filter((entry) => favouriteSongIds.has(entry.song.id)),
    selected,
    limit,
  );
  const recent = select_unseen(
    readyEntries
      .filter((entry) => timestamp(entry) > 0)
      .sort(
        (left, right) =>
          timestamp(right) - timestamp(left) ||
          left.title.localeCompare(right.title),
      ),
    selected,
    limit,
  );

  return {
    shelves: [
      {
        id: 'ready-now',
        title: 'Ready now',
        detail: 'Playable choices inside your current practice range.',
        empty:
          'No playable song is in range yet. Your next clean run will give Drumroll a better starting point.',
        entries: inZone,
      },
      {
        id: 'favourites',
        title: 'Favourites',
        detail: 'Music you marked here or already saved on Yandex Music.',
        empty:
          favouriteSongIds.size > 0
            ? 'Those favourites are already in your ready-now choices.'
            : 'Tap a heart on any playable song to keep it close.',
        entries: favourites,
      },
      {
        id: 'recently-imported',
        title: 'Recently imported',
        detail: 'The newest playable charts in your library.',
        empty: 'New playable imports will appear here.',
        entries: recent,
      },
    ],
    rest: entries.filter((entry) => !selected.has(entry.key)),
    scrollingEntries: localEntries.filter((entry) => !selected.has(entry.key)),
  };
}
