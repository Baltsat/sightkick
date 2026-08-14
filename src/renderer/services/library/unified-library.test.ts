import { Difficulty } from 'scan-chart';
import { describe, expect, it } from 'vitest';
import {
  Song,
  YandexLibraryCandidateSources,
  YandexPlaylistCandidate,
} from '../../../types';
import {
  build_unified_library,
  filter_unified_library,
  order_unified_library,
  search_unified_library,
  should_offer_youtube,
} from './unified-library';

const sha256 = 'a'.repeat(64);

function source_track(
  id: string,
  title: string,
  sourceAvailability: YandexPlaylistCandidate['sourceAvailability'] = 'available',
): YandexPlaylistCandidate {
  return {
    id,
    ordinal: 1,
    title,
    artists: ['Artist'],
    durationSeconds: 180,
    sourceTrackUrl: 'https://music.yandex.ru/track/1',
    sourceAvailability,
    sourceReferenceStatus:
      sourceAvailability === 'private' ? 'private-only' : 'stable-link',
    localStatus: 'candidate',
    practiceStatus: 'needs-local-chart',
  };
}

function sources(
  drums: readonly YandexPlaylistCandidate[],
  favorites: readonly YandexPlaylistCandidate[] = [],
): YandexLibraryCandidateSources {
  const collection = (
    name: string,
    tracks: readonly YandexPlaylistCandidate[],
  ) => ({
    schemaVersion: 2 as const,
    source: 'yandex-music' as const,
    playlist: {
      id: name,
      name,
      url: `https://music.yandex.ru/users/test/playlists/${name}`,
      capturedOn: '2026-08-12',
      capturedAt: '2026-08-12T00:00:00.000Z',
      captureMethod: 'authenticated-visible-dom' as const,
      captureSurface: 'Yandex Music playlist track rows' as const,
      metadataScope: 'metadata only',
      rightsScope: 'metadata-only' as const,
    },
    completeness: {
      declaredTrackCount: tracks.length,
      renderedTrackCount: tracks.length,
      stableSourceTrackUrlCount: tracks.length,
      noVisibleStableSourceTrackUrlOrdinals: [],
      privateOnlyOrdinals: [],
    },
    integrity: { canonicalization: 'test', canonicalSha256: sha256 },
    tracks: [...tracks],
  });

  return {
    drums: collection('Drums', drums),
    favorites: collection('Favorites', favorites),
  };
}

function song(id: string, name: string, extra: Partial<Song> = {}): Song {
  return {
    id,
    dir: `/library/${id}`,
    name,
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
    drumDifficulties: ['expert'] as Difficulty[],
    ...extra,
  };
}

function playable_source_song(trackId: string): Song {
  return song('linked', 'Linked song', {
    sourceLinked: true,
    sourceProvenance: {
      provider: 'yandex-music',
      collectionId: 'Drums',
      collectionName: 'Drums',
      trackId,
      title: 'Linked song',
      artists: ['Artist'],
      durationSeconds: 180,
    },
    playability: {
      identity: {
        title: 'Linked song',
        artists: ['Artist'],
        durationSeconds: 180,
      },
      audio: { source: 'local-user-attested', sha256 },
      chart: {
        source: 'local-auto-chart',
        id: 'chart-1',
        sha256,
        reviewed: true,
      },
      scan: {
        passed: true,
        format: 'mid',
        drumDifficulties: ['expert'] as Difficulty[],
      },
      launch: {
        passed: true,
        mode: 'headless-load',
        verifiedAt: '2026-08-12T00:00:00.000Z',
      },
    },
  });
}

describe('unified library', () => {
  it('keeps source rows in the library with honest states and no duplicate linked row', () => {
    const linkedTrack = source_track('source-linked', 'Linked song');
    const privateTrack = source_track(
      'source-private',
      'Private song',
      'private',
    );
    const entries = build_unified_library({
      songs: [playable_source_song(linkedTrack.id)],
      sources: sources([linkedTrack], [privateTrack]),
      now: '2026-08-12T00:00:00.000Z',
    });

    expect(entries.map(({ key }) => key)).toEqual([
      'song:linked',
      'source:source-private',
    ]);
    expect(entries[0]).toMatchObject({
      ready: true,
      state: 'ready',
      stateLabel: 'Ready to play',
      sourceLabels: ['Drums'],
    });
    expect(entries[1]).toMatchObject({
      ready: false,
      state: 'metadata-only',
      stateLabel: 'Private · metadata only',
      sourceLabels: ['Favorites'],
    });
  });

  it('orders analysed songs with the existing My Wave learner-relative score', () => {
    const easy = song('easy', 'Easy song');
    const hard = song('hard', 'Hard song');
    const unknown = song('unknown', 'Unknown song');
    const manifests = new Map([
      [
        easy.id,
        {
          item_id: easy.id,
          source: 'chart_analysis' as const,
          source_revision: 'easy-v1',
          demands: [
            {
              skill_id: 'hand.singles',
              weight: 1,
              target_bpm: 80,
              context: '4/4',
            },
          ],
          context_signature: '4/4',
          assessment_confidence: 0.9,
        },
      ],
      [
        hard.id,
        {
          item_id: hard.id,
          source: 'chart_analysis' as const,
          source_revision: 'hard-v1',
          demands: [
            {
              skill_id: 'hand.singles',
              weight: 1,
              target_bpm: 190,
              context: '4/4',
            },
          ],
          context_signature: '4/4',
          assessment_confidence: 0.9,
        },
      ],
    ]);
    const entries = build_unified_library({
      songs: [hard, unknown, easy],
      sources: sources([]),
      manifests,
      now: '2026-08-12T00:00:00.000Z',
    });
    const ordered = order_unified_library(entries, 'difficulty');

    expect(ordered.map(({ song: entrySong }) => entrySong?.id)).toEqual([
      easy.id,
      hard.id,
      unknown.id,
    ]);
    expect(ordered[0].difficulty?.learner_relative_difficulty).toBeLessThan(
      ordered[1].difficulty?.learner_relative_difficulty ??
        Number.POSITIVE_INFINITY,
    );
    expect(ordered[2].difficulty).toBeUndefined();
  });

  it('filters local matches before offering YouTube results', () => {
    const entries = build_unified_library({
      songs: [song('existing', 'Boulevard of Broken Dreams')],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    expect(search_unified_library(entries, 'broken dreams')).toHaveLength(1);
    expect(should_offer_youtube(entries, 'broken dreams')).toBe(false);
    expect(should_offer_youtube(entries, 'song that is not here')).toBe(true);
    expect(filter_unified_library(entries, 'ready')).toHaveLength(1);
  });
});
