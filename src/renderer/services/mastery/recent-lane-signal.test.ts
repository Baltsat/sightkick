import { RunSummary } from '../practice-stats';
import { describe, expect, it } from 'vitest';
import {
  computeRecentLaneSignals,
  MIN_RECENT_LANE_SAMPLES,
} from './recent-lane-signal';

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const DAY_MS = 86_400_000;

function run(
  ageDays: number,
  laneAccuracy: RunSummary['laneAccuracy'],
): RunSummary {
  return {
    completedAt: new Date(NOW - ageDays * DAY_MS).toISOString(),
    totalHits: 0,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 0,
    laneAccuracy,
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 0,
      sampleCount: 0,
    },
  };
}

describe('computeRecentLaneSignals', () => {
  it('uses only the explicit recent window, keeps raw sample counts, and reports a supported trend', () => {
    const signals = computeRecentLaneSignals(
      [
        run(17, [{ element: 'tom2', hits: 6, misses: 4, accuracy: 0.6 }]),
        run(3, [{ element: 'tom2', hits: 9, misses: 1, accuracy: 0.9 }]),
        run(2, [{ element: 'tom3', hits: 3, misses: 1, accuracy: 0.75 }]),
        run(29, [{ element: 'tom2', hits: 0, misses: 40, accuracy: 0 }]),
      ],
      NOW,
    );
    const tom2 = signals.find((signal) => signal.element === 'tom2');
    const tom3 = signals.find((signal) => signal.element === 'tom3');

    expect(tom2).toMatchObject({
      accuracy: expect.closeTo(0.84, 3),
      sampleCount: 20,
      runCount: 2,
      evidenceState: 'measured',
      trendPp: expect.closeTo(30),
    });
    expect(tom3).toEqual({
      element: 'tom3',
      accuracy: 0.75,
      sampleCount: 4,
      runCount: 1,
      evidenceState: 'insufficient',
    });
    expect(tom3?.sampleCount).toBeLessThan(MIN_RECENT_LANE_SAMPLES);
  });

  it('does not invent a rolling-window date for an undated legacy summary', () => {
    const undated = run(0, [
      { element: 'kick', hits: 10, misses: 0, accuracy: 1 },
    ]);

    undated.completedAt = 'legacy-date-unavailable';

    expect(computeRecentLaneSignals([undated], NOW)).toEqual([]);
  });
});
