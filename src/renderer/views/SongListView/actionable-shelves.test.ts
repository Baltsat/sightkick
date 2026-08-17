import { describe, expect, it } from 'vitest';
import type {
  Song,
  YandexLibraryCandidateSources,
  YandexPlaylistCandidate,
} from '../../../types';
import type { UnifiedLibraryEntry } from '../../services/library/unified-library';
import {
  build_actionable_library_shelves,
  favourite_song_ids,
  rank_library_songs,
  yandex_taste_seeded_song_ids,
} from './actionable-shelves';

function song(id: string, extra: Partial<Song> = {}): Song {
  return {
    id,
    dir: `/library/${id}`,
    name: `Song ${id}`,
    artist: 'Artist',
    album: '',
    charter: '',
    genre: '',
    year: '',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 4,
    format: 'mid',
    audio: [{ src: 'song.ogg', name: 'song.ogg' }],
    drumDifficulties: ['expert'],
    ...extra,
  };
}

function local_entry(
  id: string,
  extra: Partial<UnifiedLibraryEntry> = {},
): UnifiedLibraryEntry {
  const localSong = song(id, extra.song);

  return {
    key: `song:${id}`,
    kind: 'song',
    title: localSong.name,
    artists: [localSong.artist],
    ready: true,
    state: 'ready',
    stateLabel: 'Ready to play',
    sourceLabels: [],
    song: localSong,
    ...extra,
  };
}

function source_track(id: string): YandexPlaylistCandidate {
  return {
    id,
    ordinal: 1,
    title: 'Saved source song',
    artists: ['Artist'],
    durationSeconds: 180,
    sourceTrackUrl: 'https://music.yandex.ru/track/1',
    sourceAvailability: 'available',
    sourceReferenceStatus: 'stable-link',
    localStatus: 'candidate',
    practiceStatus: 'needs-local-chart',
  };
}

function sources(
  drums: readonly YandexPlaylistCandidate[],
  favorites: readonly YandexPlaylistCandidate[],
): YandexLibraryCandidateSources {
  const collection = (
    id: string,
    tracks: readonly YandexPlaylistCandidate[],
  ) => ({
    schemaVersion: 2 as const,
    source: 'yandex-music' as const,
    playlist: {
      id,
      name: id,
      url: `https://music.yandex.ru/playlists/${id}`,
      capturedOn: '2026-08-10',
      capturedAt: '2026-08-09T16:51:54Z',
      captureMethod: 'authenticated-visible-dom' as const,
      captureSurface: 'Yandex Music playlist track rows' as const,
      metadataScope:
        'visible title, artist, duration, and stable track link only',
      rightsScope: 'metadata-only' as const,
    },
    completeness: {
      declaredTrackCount: tracks.length,
      renderedTrackCount: tracks.length,
      stableSourceTrackUrlCount: tracks.length,
      noVisibleStableSourceTrackUrlOrdinals: [],
      privateOnlyOrdinals: [],
    },
    integrity: { canonicalization: 'test', canonicalSha256: 'a'.repeat(64) },
    tracks: [...tracks],
  });

  return {
    drums: collection('Drums', drums),
    favorites: collection('Favorites', favorites),
  };
}

describe('actionable song shelves', () => {
  it('seeds taste only from an exact Yandex source identity', () => {
    const drumsTrack = source_track('yandex:drums:1');
    const sourcesValue = sources([drumsTrack], []);
    const seeded = song('seeded', {
      sourceProvenance: {
        provider: 'yandex-music',
        collectionId: 'Drums',
        collectionName: 'Drums',
        trackId: drumsTrack.id,
        title: drumsTrack.title,
        artists: [...drumsTrack.artists],
      },
    });
    const lookalike = song('lookalike', {
      name: drumsTrack.title,
      sourceProvenance: {
        provider: 'yandex-music',
        collectionId: 'Other',
        collectionName: 'Other',
        trackId: 'yandex:other:1',
        title: drumsTrack.title,
        artists: [...drumsTrack.artists],
      },
    });
    const seededIds = yandex_taste_seeded_song_ids(
      [seeded, lookalike],
      sourcesValue,
    );

    expect([...seededIds]).toEqual(['seeded']);
    expect([...favourite_song_ids([seeded, lookalike], seededIds)]).toEqual([
      'seeded',
    ]);
  });

  it('leads with in-zone, favourite, and recent choices while leaving the rest reachable', () => {
    const zone = local_entry('zone');
    const favourite = local_entry('favourite', {
      song: song('favourite', { liked: true }),
    });
    const recent = local_entry('recent', {
      updatedAt: '2026-08-14T10:00:00.000Z',
    });
    const old = local_entry('old', {
      updatedAt: '2026-08-13T10:00:00.000Z',
    });
    const source: UnifiedLibraryEntry = {
      key: 'source:yandex:1',
      kind: 'source-row',
      title: 'Add me later',
      artists: ['Artist'],
      ready: false,
      state: 'needs-proof',
      stateLabel: 'Needs proof · local audio + reviewed chart',
      sourceLabels: ['Favorites'],
    };
    const result = build_actionable_library_shelves({
      entries: [zone, favourite, recent, old, source],
      inZoneSongIds: ['zone'],
      favouriteSongIds: new Set(['favourite']),
    });

    expect(
      result.shelves.map((shelf) =>
        shelf.entries.map((entry) => entry.song.id),
      ),
    ).toEqual([['zone'], ['favourite'], ['recent', 'old']]);
    expect(result.rest.map(({ key }) => key)).toEqual(['source:yandex:1']);
  });

  it('ranks the scrolling library by readiness, fit, taste, play recency, and difficulty', () => {
    const ready = local_entry('ready', {
      difficulty: { learner_relative_difficulty: 0.8 } as never,
    });
    const zone = local_entry('zone', {
      difficulty: { learner_relative_difficulty: 0.5 } as never,
    });
    const favourite = local_entry('favourite', {
      song: song('favourite', { liked: true }),
      difficulty: { learner_relative_difficulty: 0.2 } as never,
    });
    const taste = local_entry('taste', {
      difficulty: { learner_relative_difficulty: 0.1 } as never,
    });
    const recent = local_entry('recent', {
      difficulty: { learner_relative_difficulty: 0.3 } as never,
    });
    const easy = local_entry('easy', {
      difficulty: { learner_relative_difficulty: 0.1 } as never,
    });
    const unready = local_entry('unready', {
      ready: false,
      difficulty: { learner_relative_difficulty: 0 } as never,
    });

    expect(
      rank_library_songs({
        entries: [easy, recent, unready, taste, favourite, zone, ready],
        inZoneSongIds: ['zone'],
        favouriteSongIds: new Set(['favourite']),
        sourceSeededSongIds: new Set(['taste']),
        recentPlayedAt: new Map([['recent', Date.parse('2026-08-17')]]),
      }).map((entry) => entry.song.id),
    ).toEqual([
      'zone',
      'favourite',
      'taste',
      'recent',
      'easy',
      'ready',
      'unready',
    ]);
  });

  it('keeps empty shelves explicit instead of manufacturing a recommendation', () => {
    const result = build_actionable_library_shelves({
      entries: [local_entry('plain')],
      inZoneSongIds: [],
      favouriteSongIds: new Set(),
    });

    expect(result.shelves.map((shelf) => shelf.entries)).toEqual([[], [], []]);
    expect(result.shelves.map((shelf) => shelf.empty)).toEqual([
      'No playable song is in range yet. Your next clean run will give Drumroll a better starting point.',
      'Tap a heart on any playable song to keep it close.',
      'New playable imports will appear here.',
    ]);
    expect(result.rest.map(({ key }) => key)).toEqual(['song:plain']);
  });
});
