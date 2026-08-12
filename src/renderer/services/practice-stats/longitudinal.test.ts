import { describe, expect, it } from 'vitest';
import { emptyPracticeRunArchive, PracticeRunArchiveBySong } from './archive';
import { RunSummary } from './types';
import {
  computeLongitudinalProgress,
  MAX_LONGITUDINAL_ACTIVE_MONTHS,
} from './longitudinal';

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: '2026-08-08T14:00:00.000Z',
    totalHits: 8,
    totalMisses: 2,
    totalWrong: 1,
    overallAccuracy: 0.8,
    laneAccuracy: [],
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs: 10,
      medianMs: 10,
      spreadMs: 2,
      earlyCount: 0,
      lateCount: 8,
      onTimeCount: 0,
      sampleCount: 8,
    },
    ...overrides,
  };
}

function archive(): PracticeRunArchiveBySong {
  return {
    'song-old': {
      ...emptyPracticeRunArchive(),
      days: {
        '2026-07-03': {
          date: '2026-07-03',
          runCount: 2,
          totalHits: 12,
          totalMisses: 8,
          totalWrong: 3,
          overallAccuracySum: 1.2,
          minOverallAccuracy: 0.5,
          maxOverallAccuracy: 0.7,
          bestStreak: 9,
          timing: {
            sampleCount: 12,
            totalDeltaMs: -60,
            earlyCount: 8,
            lateCount: 2,
            onTimeCount: 2,
            medianMsSum: -8,
            spreadMsSum: 30,
            summaryCount: 2,
          },
          lanes: {},
          wrongHits: {},
          modes: {},
          difficulties: {},
          historicalDetailState: 'historical-detail-unavailable',
        },
      },
    },
  };
}

describe('computeLongitudinalProgress', () => {
  it('adds archived and recent evidence once, using hit- and sample-weighted definitions', () => {
    const result = computeLongitudinalProgress(archive(), {
      'song-new': [run()],
    });

    expect(result.archivedRunCount).toBe(2);
    expect(result.recentRunCount).toBe(1);
    expect(result.allTime).toMatchObject({
      runCount: 3,
      scoredNoteCount: 30,
      wrongHitCount: 4,
      accuracy: 20 / 30,
      timingSampleCount: 20,
      meanTimingMs: 1,
    });
    expect(result.months.map((month) => month.month)).toEqual([
      '2026-07',
      '2026-08',
    ]);
    expect(result.months[0]).toMatchObject({
      runCount: 2,
      scoredNoteCount: 20,
      accuracy: 0.6,
      meanTimingMs: -5,
    });
  });

  it('labels aggregate-only archive coverage instead of inventing old bar detail', () => {
    const result = computeLongitudinalProgress(archive(), {});

    expect(result.aggregateOnlyArchivedRunCount).toBe(2);
    expect(result.firstEvidenceDate).toBe('2026-07-03');
    expect(result.lastEvidenceDate).toBe('2026-07-03');
  });

  it('keeps all-time evidence while bounding the chart to 12 active months', () => {
    const months = [
      ...Array.from(
        { length: 12 },
        (_, index) => `2025-${String(index + 1).padStart(2, '0')}`,
      ),
      '2026-01',
      '2026-02',
    ];
    const recentRuns = Object.fromEntries(
      months.map((month) => [
        `song-${month}`,
        [run({ completedAt: `${month}-01T00:00:00.000Z` })],
      ]),
    );
    const result = computeLongitudinalProgress({}, recentRuns);

    expect(result.allTime.runCount).toBe(14);
    expect(result.months).toHaveLength(MAX_LONGITUDINAL_ACTIVE_MONTHS);
    expect(result.months[0].month).toBe('2025-03');
    expect(result.months.at(-1)?.month).toBe('2026-02');
    expect(result.omittedActiveMonthCount).toBe(2);
  });

  it('includes undated evidence in all history but not in a fake month', () => {
    const result = computeLongitudinalProgress(
      {},
      {
        song: [run({ completedAt: 'legacy-date-unreadable' })],
      },
    );

    expect(result.allTime.runCount).toBe(1);
    expect(result.months).toEqual([]);
    expect(result.unknownDateRunCount).toBe(1);
  });
});
