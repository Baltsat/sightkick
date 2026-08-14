import {
  isPlayableEvidence,
  playabilityBlockers,
} from '../../../library-sources/playability';
import {
  Song,
  YandexLibraryCandidateSources,
  YandexPlaylistCandidate,
} from '../../../types';
import {
  build_my_wave_item_profile,
  MyWaveDifficulty,
  MyWaveItem,
  score_my_wave_difficulty,
} from '../pedagogy/my-wave';
import { AtomicSkillState, ItemSkillManifest } from '../pedagogy/types';

export type UnifiedLibrarySort = 'difficulty' | 'recent' | 'length' | 'ready';

export type UnifiedLibraryFilter = 'all' | 'ready' | 'needs-attention';

export type UnifiedLibraryState =
  | 'ready'
  | 'needs-proof'
  | 'reference-only'
  | 'metadata-only';

export interface UnifiedLibraryEntry {
  key: string;
  kind: 'song' | 'source-row';
  title: string;
  artists: readonly string[];
  durationSeconds?: number;
  updatedAt?: string;
  ready: boolean;
  state: UnifiedLibraryState;
  stateLabel: string;
  sourceLabels: readonly string[];
  difficulty?: MyWaveDifficulty;
  song?: Song;
  sourceRow?: YandexPlaylistCandidate;
}

export interface BuildUnifiedLibraryInput {
  songs: readonly Song[];
  sources: YandexLibraryCandidateSources;
  charts?: ReadonlyMap<string, NonNullable<MyWaveItem['chart']>>;
  manifests?: ReadonlyMap<string, ItemSkillManifest>;
  atomicStates?: readonly AtomicSkillState[];
  now: string;
}

function normal(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function source_state(track: YandexPlaylistCandidate): {
  state: UnifiedLibraryState;
  label: string;
} {
  if (
    track.sourceAvailability === 'unavailable' ||
    track.practiceStatus === 'unavailable'
  ) {
    return { state: 'reference-only', label: 'Unavailable · reference only' };
  }

  if (track.sourceAvailability === 'private') {
    return { state: 'metadata-only', label: 'Private · metadata only' };
  }

  if (track.sourceReferenceStatus === 'not-visible') {
    return {
      state: 'metadata-only',
      label: 'Metadata only · source link not visible',
    };
  }

  return {
    state: 'needs-proof',
    label: 'Needs proof · local audio + reviewed chart',
  };
}

function song_ready(song: Song): boolean {
  if (song.sourceLinked || song.sourceProvenance) {
    return isPlayableEvidence(song.playability);
  }

  return song.audio.length > 0 && (song.drumDifficulties?.length ?? 0) > 0;
}

function song_state(song: Song): { state: UnifiedLibraryState; label: string } {
  if (song_ready(song)) {
    return { state: 'ready', label: 'Ready to play' };
  }

  if (song.sourceLinked || song.sourceProvenance) {
    const blockers = playabilityBlockers(song.playability).join(', ');

    return {
      state: 'needs-proof',
      label: blockers ? `Needs proof · ${blockers}` : 'Needs proof',
    };
  }

  return { state: 'needs-proof', label: 'Needs a playable drum chart' };
}

function song_difficulty(
  song: Song,
  input: BuildUnifiedLibraryInput,
): MyWaveDifficulty | undefined {
  const chart = input.charts?.get(song.id);
  const manifest = input.manifests?.get(song.id);

  if (!chart && !manifest) {
    return undefined;
  }

  return score_my_wave_difficulty({
    profile: build_my_wave_item_profile({
      id: song.id,
      title: song.name,
      kind: 'song',
      ...(chart ? { chart } : {}),
      ...(manifest ? { manifest } : {}),
    }),
    atomic_states: input.atomicStates ?? [],
    now: input.now,
  });
}

function song_entry(
  song: Song,
  input: BuildUnifiedLibraryInput,
): UnifiedLibraryEntry {
  const status = song_state(song);

  return {
    key: `song:${song.id}`,
    kind: 'song',
    title: song.name,
    artists: song.artist ? [song.artist] : [],
    updatedAt: song.updatedAt,
    ready: status.state === 'ready',
    state: status.state,
    stateLabel: status.label,
    sourceLabels: song.sourceProvenance
      ? [song.sourceProvenance.collectionName]
      : [],
    difficulty: song_difficulty(song, input),
    song,
  };
}

function source_entry(
  track: YandexPlaylistCandidate,
  sourceLabel: string,
): UnifiedLibraryEntry {
  const status = source_state(track);

  return {
    key: `source:${track.id}`,
    kind: 'source-row',
    title: track.title,
    artists: track.artists,
    ...(track.durationSeconds !== null
      ? { durationSeconds: track.durationSeconds }
      : {}),
    ready: false,
    state: status.state,
    stateLabel: status.label,
    sourceLabels: [sourceLabel],
    sourceRow: track,
  };
}

function source_rows(sources: YandexLibraryCandidateSources): readonly {
  track: YandexPlaylistCandidate;
  sourceLabel: string;
}[] {
  return [
    ...sources.drums.tracks.map((track) => ({
      track,
      sourceLabel: sources.drums.playlist.name,
    })),
    ...sources.favorites.tracks.map((track) => ({
      track,
      sourceLabel: sources.favorites.playlist.name,
    })),
  ];
}

export function build_unified_library(
  input: BuildUnifiedLibraryInput,
): UnifiedLibraryEntry[] {
  const linked = new Set(
    input.songs
      .map((song) => song.sourceProvenance?.trackId)
      .filter((trackId): trackId is string => Boolean(trackId)),
  );

  return [
    ...input.songs.map((song) => song_entry(song, input)),
    ...source_rows(input.sources)
      .filter(({ track }) => !linked.has(track.id))
      .map(({ track, sourceLabel }) => source_entry(track, sourceLabel)),
  ];
}

export function search_unified_library(
  entries: readonly UnifiedLibraryEntry[],
  query: string,
): UnifiedLibraryEntry[] {
  const terms = normal(query).split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return [...entries];
  }

  return entries.filter((entry) => {
    const haystack = normal(
      [entry.title, ...entry.artists, ...entry.sourceLabels].join(' '),
    );

    return terms.every((term) => haystack.includes(term));
  });
}

function difficulty_value(entry: UnifiedLibraryEntry): number {
  return (
    entry.difficulty?.learner_relative_difficulty ?? Number.POSITIVE_INFINITY
  );
}

function title_compare(
  left: UnifiedLibraryEntry,
  right: UnifiedLibraryEntry,
): number {
  return (
    left.title.localeCompare(right.title) || left.key.localeCompare(right.key)
  );
}

function difficulty_compare(
  left: UnifiedLibraryEntry,
  right: UnifiedLibraryEntry,
): number {
  return (
    difficulty_value(left) - difficulty_value(right) ||
    title_compare(left, right)
  );
}

export function order_unified_library(
  entries: readonly UnifiedLibraryEntry[],
  sort: UnifiedLibrarySort,
): UnifiedLibraryEntry[] {
  return [...entries].sort((left, right) => {
    if (sort === 'recent') {
      const leftDate = left.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightDate = right.updatedAt ? Date.parse(right.updatedAt) : 0;

      return rightDate - leftDate || title_compare(left, right);
    }

    if (sort === 'length') {
      return (
        (left.durationSeconds ?? Number.POSITIVE_INFINITY) -
          (right.durationSeconds ?? Number.POSITIVE_INFINITY) ||
        title_compare(left, right)
      );
    }

    if (sort === 'ready') {
      return (
        Number(right.ready) - Number(left.ready) ||
        difficulty_compare(left, right)
      );
    }

    return difficulty_compare(left, right);
  });
}

export function filter_unified_library(
  entries: readonly UnifiedLibraryEntry[],
  filter: UnifiedLibraryFilter,
): UnifiedLibraryEntry[] {
  if (filter === 'ready') {
    return entries.filter(({ ready }) => ready);
  }

  if (filter === 'needs-attention') {
    return entries.filter(({ ready }) => !ready);
  }

  return [...entries];
}

export function should_offer_youtube(
  entries: readonly UnifiedLibraryEntry[],
  query: string,
): boolean {
  return (
    normal(query).length > 0 &&
    search_unified_library(entries, query).length === 0
  );
}
