import { describe, expect, it } from 'vitest';
import { LaneAccuracy, RunSummary } from '../practice-stats';
import {
  ACCURACY_WEIGHT,
  CONSISTENCY_WEIGHT,
  COVERAGE_WEIGHT,
  SPEED_WEIGHT,
  SUB_READINESS_WEIGHT,
  computeAccuracyValue,
  computeConsistencyValue,
  computeCoverageValue,
  computeLaneWeights,
  computeMastery,
  computeSpeedFactorValue,
  computeSubReadinessValue,
  isFullSpeedRun,
  scopeRunsToDifficulty,
  worstMasteryTerm,
} from './mastery';
import { MasteryGoal } from './types';

let seq = 0;

function fakeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  seq += 1;

  return {
    completedAt: `2026-01-${String(seq).padStart(2, '0')}T00:00:00.000Z`,
    totalHits: 90,
    totalMisses: 10,
    totalWrong: 0,
    overallAccuracy: 0.9,
    laneAccuracy: [],
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
    mode: 'perform',
    playbackSpeed: 1,
    difficulty: 'expert',
    ...overrides,
  };
}

function laneAccuracy(
  entries: [RunSummary['laneAccuracy'][number]['element'], number, number][],
): RunSummary['laneAccuracy'] {
  return entries.map(([element, hits, misses]) => ({
    element,
    hits,
    misses,
    accuracy: hits / (hits + misses),
  }));
}

const GOAL: MasteryGoal = { songId: 'song-1', difficulty: 'expert' };

describe('weights', () => {
  it('sum to 1', () => {
    const sum =
      ACCURACY_WEIGHT +
      CONSISTENCY_WEIGHT +
      SPEED_WEIGHT +
      COVERAGE_WEIGHT +
      SUB_READINESS_WEIGHT;

    expect(sum).toBeCloseTo(1);
  });

  it('accuracy is the dominant (largest) weight', () => {
    expect(ACCURACY_WEIGHT).toBeGreaterThan(CONSISTENCY_WEIGHT);
    expect(ACCURACY_WEIGHT).toBeGreaterThan(SPEED_WEIGHT);
    expect(ACCURACY_WEIGHT).toBeGreaterThan(COVERAGE_WEIGHT);
    expect(ACCURACY_WEIGHT).toBeGreaterThan(SUB_READINESS_WEIGHT);
  });
});

describe('isFullSpeedRun', () => {
  it('counts an explicit 1x run as full speed', () => {
    expect(isFullSpeedRun(fakeRun({ playbackSpeed: 1 }))).toBe(true);
  });

  it('rejects an explicit sub-1x run', () => {
    expect(isFullSpeedRun(fakeRun({ playbackSpeed: 0.7 }))).toBe(false);
  });

  it('treats a Perform run missing playbackSpeed as full speed', () => {
    expect(
      isFullSpeedRun(fakeRun({ playbackSpeed: undefined, mode: 'perform' })),
    ).toBe(true);
  });

  it('treats a legacy run missing both mode and playbackSpeed as full speed', () => {
    expect(
      isFullSpeedRun(fakeRun({ playbackSpeed: undefined, mode: undefined })),
    ).toBe(true);
  });

  it('does not assume full speed for a Practice run missing playbackSpeed', () => {
    expect(
      isFullSpeedRun(fakeRun({ playbackSpeed: undefined, mode: 'practice' })),
    ).toBe(false);
  });
});

describe('scopeRunsToDifficulty', () => {
  it('keeps only runs tagged with the goal difficulty', () => {
    const expertRun = fakeRun({ difficulty: 'expert' });
    const hardRun = fakeRun({ difficulty: 'hard' });
    const scoped = scopeRunsToDifficulty([expertRun, hardRun], 'expert');

    expect(scoped).toEqual([expertRun]);
  });

  it('drops untagged runs for a song with multiple charted difficulties', () => {
    const untagged = fakeRun({ difficulty: undefined });
    const scoped = scopeRunsToDifficulty([untagged], 'expert', [
      'expert',
      'hard',
    ]);

    expect(scoped).toEqual([]);
  });

  it('keeps untagged runs for a song that only ever had one charted difficulty', () => {
    const untagged = fakeRun({ difficulty: undefined });
    const scoped = scopeRunsToDifficulty([untagged], 'expert', ['expert']);

    expect(scoped).toEqual([untagged]);
  });

  it('keeps untagged runs when the song difficulty list is unknown', () => {
    const untagged = fakeRun({ difficulty: undefined });
    const scoped = scopeRunsToDifficulty([untagged], 'expert', undefined);

    expect(scoped).toEqual([untagged]);
  });

  it('sorts the result chronologically', () => {
    const later = fakeRun({ completedAt: '2026-02-01T00:00:00.000Z' });
    const earlier = fakeRun({ completedAt: '2026-01-01T00:00:00.000Z' });
    const scoped = scopeRunsToDifficulty([later, earlier], 'expert');

    expect(scoped).toEqual([earlier, later]);
  });
});

describe('computeAccuracyValue', () => {
  it('is 0 with no runs', () => {
    expect(computeAccuracyValue([])).toBe(0);
  });

  it('takes the best full-speed accuracy, ignoring slower runs', () => {
    const runs = [
      fakeRun({ overallAccuracy: 0.6, playbackSpeed: 1 }),
      fakeRun({ overallAccuracy: 0.95, playbackSpeed: 1 }),
      fakeRun({ overallAccuracy: 1, playbackSpeed: 0.7 }),
    ];

    expect(computeAccuracyValue(runs)).toBe(0.95);
  });

  it('is 0 when every run is below full speed', () => {
    const runs = [
      fakeRun({ overallAccuracy: 1, playbackSpeed: 0.5 }),
      fakeRun({ overallAccuracy: 0.9, playbackSpeed: 0.8 }),
    ];

    expect(computeAccuracyValue(runs)).toBe(0);
  });
});

describe('computeConsistencyValue', () => {
  it('is 0 with no runs', () => {
    expect(computeConsistencyValue([])).toBe(0);
  });

  it('is the median of the last 5 runs regardless of speed', () => {
    const runs = [0.5, 0.6, 0.7, 0.8, 0.9].map((overallAccuracy) =>
      fakeRun({ overallAccuracy, playbackSpeed: 0.6 }),
    );

    expect(computeConsistencyValue(runs)).toBe(0.7);
  });

  it('ignores runs older than the last 5', () => {
    const old = [0, 0, 0, 0, 0].map((overallAccuracy) =>
      fakeRun({ overallAccuracy }),
    );
    const recent = [0.8, 0.8, 0.8, 0.8, 0.8].map((overallAccuracy) =>
      fakeRun({ overallAccuracy }),
    );

    expect(computeConsistencyValue([...old, ...recent])).toBe(0.8);
  });
});

describe('computeSpeedFactorValue', () => {
  it('is 0 with no runs', () => {
    expect(computeSpeedFactorValue([])).toBe(0);
  });

  it('is 0 when no run is clean enough', () => {
    const runs = [fakeRun({ overallAccuracy: 0.5, playbackSpeed: 1 })];

    expect(computeSpeedFactorValue(runs)).toBe(0);
  });

  it('takes the best speed among clean runs', () => {
    const runs = [
      fakeRun({ overallAccuracy: 0.95, playbackSpeed: 0.6 }),
      fakeRun({ overallAccuracy: 0.92, playbackSpeed: 0.8 }),
    ];

    expect(computeSpeedFactorValue(runs)).toBeCloseTo(0.8);
  });

  it('clamps at 1 even when played faster than 1.0x', () => {
    const runs = [fakeRun({ overallAccuracy: 1, playbackSpeed: 1.5 })];

    expect(computeSpeedFactorValue(runs)).toBe(1);
  });

  it('counts a clean Perform run missing playbackSpeed as speed 1', () => {
    const runs = [
      fakeRun({
        overallAccuracy: 0.95,
        playbackSpeed: undefined,
        mode: 'perform',
      }),
    ];

    expect(computeSpeedFactorValue(runs)).toBe(1);
  });

  it('skips a clean Practice run missing playbackSpeed', () => {
    const runs = [
      fakeRun({
        overallAccuracy: 0.95,
        playbackSpeed: undefined,
        mode: 'practice',
      }),
    ];

    expect(computeSpeedFactorValue(runs)).toBe(0);
  });
});

describe('computeCoverageValue', () => {
  it('is 0 with no runs', () => {
    expect(computeCoverageValue([])).toBe(0);
  });

  it('divides the best-attempted run by the known chart total', () => {
    const runs = [fakeRun({ totalHits: 40, totalMisses: 10 })];

    expect(computeCoverageValue(runs, 100)).toBe(0.5);
  });

  it('falls back to the best-attempted count itself when the chart total is unknown', () => {
    const runs = [
      fakeRun({ totalHits: 20, totalMisses: 5 }),
      fakeRun({ totalHits: 30, totalMisses: 10 }),
    ];

    // Best attempted = 40; with no known denominator it reads as "fully
    // covered relative to what's been attempted", not as 100% of a chart
    // whose real size is unknown.
    expect(computeCoverageValue(runs, undefined)).toBe(1);
  });

  it('never exceeds 1 even if attempted counts (looped Practice) exceed the chart total', () => {
    const runs = [fakeRun({ totalHits: 150, totalMisses: 50 })];

    expect(computeCoverageValue(runs, 100)).toBe(1);
  });
});

describe('computeLaneWeights / computeSubReadinessValue', () => {
  it('weights lanes by their share of the song hits+misses', () => {
    const runs = [
      fakeRun({
        laneAccuracy: laneAccuracy([
          ['kick', 80, 0],
          ['snare', 20, 0],
        ]),
      }),
    ];
    const weights = computeLaneWeights(runs);

    expect(weights).toEqual(
      expect.arrayContaining([
        { element: 'kick', weight: 0.8 },
        { element: 'snare', weight: 0.2 },
      ]),
    );
  });

  it('is 0 with no lane data', () => {
    expect(computeSubReadinessValue([], [])).toBe(0);
  });

  it('is demand-weighted global accuracy, penalizing weak lanes the song leans on', () => {
    const laneWeights = [
      { element: 'kick' as const, weight: 0.8 },
      { element: 'snare' as const, weight: 0.2 },
    ];
    const global: LaneAccuracy[] = [
      { element: 'kick', hits: 5, misses: 5, accuracy: 0.5 },
      { element: 'snare', hits: 9, misses: 1, accuracy: 0.9 },
    ];

    // 0.8*0.5 + 0.2*0.9 = 0.58
    expect(computeSubReadinessValue(laneWeights, global)).toBeCloseTo(0.58);
  });

  it('treats a demanded lane with no global data as 0 readiness for that lane', () => {
    const laneWeights = [{ element: 'kick' as const, weight: 1 }];

    expect(computeSubReadinessValue(laneWeights, [])).toBe(0);
  });
});

describe('computeMastery — edge cases', () => {
  it('is entirely 0 with no runs', () => {
    const breakdown = computeMastery({ goal: GOAL, songRuns: [], allRuns: [] });

    expect(breakdown.mastery).toBe(0);
    expect(breakdown.runsConsidered).toBe(0);
    expect(breakdown.accuracy.value).toBe(0);
    expect(breakdown.consistency.value).toBe(0);
    expect(breakdown.speedFactor.value).toBe(0);
    expect(breakdown.coverage.value).toBe(0);
    expect(breakdown.subReadiness.value).toBe(0);
  });

  it('scores well below full mastery when every run is slow, even if accurate', () => {
    const runs = Array.from({ length: 5 }, () =>
      fakeRun({ overallAccuracy: 1, playbackSpeed: 0.6, mode: 'practice' }),
    );
    const breakdown = computeMastery({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });

    // Accuracy-at-1.0x is unproven (0), but consistency/coverage/sub-
    // readiness aren't speed-gated, so mastery is low but not zero.
    expect(breakdown.accuracy.value).toBe(0);
    expect(breakdown.consistency.value).toBe(1);
    expect(breakdown.mastery).toBeGreaterThan(0);
    expect(breakdown.mastery).toBeLessThan(70);
  });

  it('approaches 100 for a run of perfect, full-speed, fully-covering runs with strong global lane accuracy', () => {
    const runs = Array.from({ length: 5 }, () =>
      fakeRun({
        overallAccuracy: 1,
        playbackSpeed: 1,
        mode: 'perform',
        totalHits: 100,
        totalMisses: 0,
        laneAccuracy: laneAccuracy([
          ['kick', 60, 0],
          ['snare', 40, 0],
        ]),
      }),
    );
    const breakdown = computeMastery({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
      chartTotalNotes: 100,
    });

    expect(breakdown.mastery).toBe(100);
    expect(breakdown.runsConsidered).toBe(5);
  });

  it('runsConsidered reflects the difficulty-scoped count, not the raw input length', () => {
    const runs = [
      fakeRun({ difficulty: 'expert' }),
      fakeRun({ difficulty: 'expert' }),
      fakeRun({ difficulty: 'hard' }),
    ];
    const breakdown = computeMastery({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });

    expect(breakdown.runsConsidered).toBe(2);
  });
});

describe('worstMasteryTerm', () => {
  it('picks the lowest-value term', () => {
    const breakdown = computeMastery({
      goal: GOAL,
      songRuns: [fakeRun({ overallAccuracy: 1, playbackSpeed: 1 })],
      allRuns: [],
    });

    // subReadiness has no global lane data at all here → 0, strictly the
    // lowest alongside coverage's fallback-1 and accuracy's single-run 1 —
    // subReadiness is uniquely 0.
    expect(worstMasteryTerm(breakdown).key).toBe('subReadiness');
  });

  it('breaks ties toward the higher-weight term', () => {
    const breakdown = computeMastery({ goal: GOAL, songRuns: [], allRuns: [] });

    // Every term is 0 with no runs at all — accuracy has the largest
    // weight, so it should win the tie-break.
    expect(worstMasteryTerm(breakdown).key).toBe('accuracy');
  });
});
