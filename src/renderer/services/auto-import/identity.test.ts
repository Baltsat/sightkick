import { describe, expect, it } from 'vitest';
import type {
  IpcYoutubeSearchResult,
  LibrarySourceTrackProvenance,
} from '../../../types';
import {
  AUTO_IMPORT_DURATION_TOLERANCE_SECONDS,
  rankAutoImportCandidates,
} from './identity';

const source: LibrarySourceTrackProvenance = {
  provider: 'yandex-music',
  collectionId: 'favorite-drums',
  collectionName: 'Favorite drums',
  trackId: 'yandex:favorite-drums:1',
  title: 'Bloodbuzz Ohio',
  artists: ['The National'],
  durationSeconds: 276,
};

function candidate(
  videoId: string,
  title: string,
  overrides: Partial<IpcYoutubeSearchResult> = {},
): IpcYoutubeSearchResult {
  return {
    videoId,
    title,
    uploader: 'The National',
    durationSeconds: 276,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    ...overrides,
  };
}

describe('rankAutoImportCandidates', () => {
  it('keeps only the exact studio recording for a source-linked row', () => {
    const ranking = rankAutoImportCandidates(
      'Bloodbuzz Ohio The National',
      [
        candidate(
          'studio12345',
          'The National - Bloodbuzz Ohio (Official Audio)',
        ),
        candidate('live0000001', 'The National - Bloodbuzz Ohio (Live)', {
          durationSeconds: 278,
        }),
        candidate('cover000001', 'Bloodbuzz Ohio cover', {
          uploader: 'A different channel',
        }),
        candidate('wrong000001', 'The National - Bloodbuzz Ohio', {
          durationSeconds: 276 + AUTO_IMPORT_DURATION_TOLERANCE_SECONDS + 1,
        }),
      ],
      source,
    );

    expect(ranking.candidates.map((value) => value.videoId)).toEqual([
      'studio12345',
    ]);
    expect(ranking.rejected).toEqual([
      expect.objectContaining({
        candidate: expect.objectContaining({ videoId: 'live0000001' }),
        reason: 'variant',
      }),
      expect.objectContaining({
        candidate: expect.objectContaining({ videoId: 'cover000001' }),
        reason: 'variant',
      }),
      expect.objectContaining({
        candidate: expect.objectContaining({ videoId: 'wrong000001' }),
        reason: 'duration',
      }),
    ]);
  });

  it('rejects live and cover results unless the typed query asks for that version', () => {
    const results = [
      candidate('studio12345', 'Steve Lacy - Bad Habit'),
      candidate('live0000001', 'Steve Lacy - Bad Habit live at Lollapalooza'),
      candidate('cover000001', 'Bad Habit - Steve Lacy cover'),
    ];

    expect(
      rankAutoImportCandidates('Steve Lacy Bad Habit', results).candidates.map(
        (value) => value.videoId,
      ),
    ).toEqual(['studio12345']);
    expect(
      rankAutoImportCandidates(
        'Steve Lacy Bad Habit live',
        results,
      ).candidates.map((value) => value.videoId),
    ).toContain('live0000001');
  });

  it('drops results with insufficient title identity before presenting them', () => {
    const ranking = rankAutoImportCandidates('Electric Feel MGMT', [
      candidate('match000001', 'MGMT - Electric Feel'),
      candidate('wrong000001', 'MGMT - Kids'),
    ]);

    expect(ranking.candidates.map((value) => value.videoId)).toEqual([
      'match000001',
    ]);
    expect(ranking.rejected).toEqual([
      expect.objectContaining({
        candidate: expect.objectContaining({ videoId: 'wrong000001' }),
        reason: 'title',
      }),
    ]);
  });
});
