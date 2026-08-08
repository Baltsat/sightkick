import { describe, expect, it } from 'vitest';
import {
  aggregateLaneAccuracy,
  computeLaneAccuracy,
  computeLaneBias,
  computeRunsTrend,
  computeTimingBias,
  computeWrongHitCounts,
  summarizeRun,
} from './compute';
import { HitRecord, RunSummary } from './types';

function hit(
  element: HitRecord['element'],
  deltaMs: number,
  overrides: Partial<HitRecord> = {},
): HitRecord {
  return {
    tick: 0,
    timeSeconds: 0,
    deltaMs,
    element,
    verdict: 'hit',
    ...overrides,
  };
}

function miss(
  element: HitRecord['element'],
  overrides: Partial<HitRecord> = {},
): HitRecord {
  return {
    tick: 0,
    timeSeconds: 0,
    deltaMs: 0,
    element,
    verdict: 'miss',
    ...overrides,
  };
}

function wrong(
  element: HitRecord['element'],
  overrides: Partial<HitRecord> = {},
): HitRecord {
  return {
    tick: 0,
    timeSeconds: 0,
    deltaMs: 0,
    element,
    verdict: 'wrong',
    ...overrides,
  };
}

describe('computeLaneAccuracy', () => {
  it('computes hit/(hit+miss) per lane and ignores wrong hits', () => {
    const records: HitRecord[] = [
      hit('kick', 0),
      hit('kick', 5),
      miss('kick'),
      hit('snare', -5),
      miss('snare'),
      miss('snare'),
      wrong('kick'),
    ];

    expect(computeLaneAccuracy(records)).toEqual([
      { element: 'kick', hits: 2, misses: 1, accuracy: 2 / 3 },
      { element: 'snare', hits: 1, misses: 2, accuracy: 1 / 3 },
    ]);
  });

  it('returns a single entry for a single-lane song', () => {
    const records: HitRecord[] = [hit('kick', 0), hit('kick', 0), miss('kick')];

    expect(computeLaneAccuracy(records)).toEqual([
      { element: 'kick', hits: 2, misses: 1, accuracy: 2 / 3 },
    ]);
  });

  it('returns an empty array for no records', () => {
    expect(computeLaneAccuracy([])).toEqual([]);
  });

  it('orders lanes canonically regardless of record order', () => {
    const records: HitRecord[] = [
      hit('crash', 0),
      hit('kick', 0),
      hit('snare', 0),
    ];

    expect(computeLaneAccuracy(records).map((lane) => lane.element)).toEqual([
      'kick',
      'snare',
      'crash',
    ]);
  });
});

describe('computeTimingBias', () => {
  it('computes signed mean/median/spread from hit records only', () => {
    const records: HitRecord[] = [
      hit('kick', -20),
      hit('kick', -10),
      hit('kick', 10),
      hit('kick', 20),
      miss('kick', { deltaMs: 999 }),
      wrong('kick', { deltaMs: -999 }),
    ];
    const bias = computeTimingBias(records);

    expect(bias.meanMs).toBe(0);
    expect(bias.medianMs).toBe(0);
    expect(bias.sampleCount).toBe(4);
    expect(bias.earlyCount).toBe(2);
    expect(bias.lateCount).toBe(2);
    expect(bias.onTimeCount).toBe(0);
    // population stddev of [-20,-10,10,20] around mean 0
    expect(bias.spreadMs).toBeCloseTo(15.8114, 3);
  });

  it('handles an odd-length sample for the median', () => {
    const records = [hit('kick', -10), hit('kick', 0), hit('kick', 30)];

    expect(computeTimingBias(records).medianMs).toBe(0);
  });

  it('reports a positive mean when the player consistently drags late', () => {
    const records = [hit('kick', 5), hit('kick', 15), hit('kick', 25)];
    const bias = computeTimingBias(records);

    expect(bias.meanMs).toBe(15);
    expect(bias.earlyCount).toBe(0);
    expect(bias.lateCount).toBe(3);
  });

  it('is all zero/empty for an empty run', () => {
    expect(computeTimingBias([])).toEqual({
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 0,
      sampleCount: 0,
    });
  });

  it('has zero spread for a single sample', () => {
    expect(computeTimingBias([hit('kick', 42)]).spreadMs).toBe(0);
  });
});

describe('computeLaneBias', () => {
  it('reports mean signed bias per lane, hits only', () => {
    const records: HitRecord[] = [
      hit('kick', -20),
      hit('kick', -10),
      hit('snare', 10),
      miss('kick', { deltaMs: 500 }),
      wrong('snare', { deltaMs: 500 }),
    ];

    expect(computeLaneBias(records)).toEqual([
      { element: 'kick', meanMs: -15, sampleCount: 2 },
      { element: 'snare', meanMs: 10, sampleCount: 1 },
    ]);
  });

  it('omits lanes with no hits', () => {
    expect(computeLaneBias([miss('kick'), wrong('snare')])).toEqual([]);
  });
});

describe('computeWrongHitCounts', () => {
  it('counts wrong hits per lane struck', () => {
    const records: HitRecord[] = [
      wrong('hihat'),
      wrong('hihat'),
      wrong('kick'),
      hit('snare', 0),
      miss('tom1'),
    ];

    expect(computeWrongHitCounts(records)).toEqual([
      { element: 'kick', count: 1 },
      { element: 'hihat', count: 2 },
    ]);
  });

  it('is empty when there were no wrong hits', () => {
    expect(computeWrongHitCounts([hit('kick', 0), miss('snare')])).toEqual([]);
  });
});

describe('summarizeRun', () => {
  it('rolls every metric up into one run summary', () => {
    const records: HitRecord[] = [
      hit('kick', -10),
      hit('kick', 10),
      miss('kick'),
      hit('snare', 0),
      wrong('hihat'),
    ];
    const summary = summarizeRun(records, '2026-08-01T00:00:00.000Z');

    expect(summary.completedAt).toBe('2026-08-01T00:00:00.000Z');
    expect(summary.totalHits).toBe(3);
    expect(summary.totalMisses).toBe(1);
    expect(summary.totalWrong).toBe(1);
    expect(summary.overallAccuracy).toBeCloseTo(3 / 4);
    expect(summary.laneAccuracy).toEqual([
      { element: 'kick', hits: 2, misses: 1, accuracy: 2 / 3 },
      { element: 'snare', hits: 1, misses: 0, accuracy: 1 },
    ]);
    expect(summary.wrongHitCounts).toEqual([{ element: 'hihat', count: 1 }]);
    expect(summary.timingBias.sampleCount).toBe(3);
  });

  it('is a well-defined zero state for an empty run (no NaN anywhere)', () => {
    const summary = summarizeRun([], '2026-08-01T00:00:00.000Z');

    expect(summary.totalHits).toBe(0);
    expect(summary.totalMisses).toBe(0);
    expect(summary.totalWrong).toBe(0);
    expect(summary.overallAccuracy).toBe(0);
    expect(summary.laneAccuracy).toEqual([]);
    expect(summary.laneBias).toEqual([]);
    expect(summary.wrongHitCounts).toEqual([]);
    expect(summary.timingBias.meanMs).toBe(0);
    expect(Number.isNaN(summary.overallAccuracy)).toBe(false);
  });

  it('never calls Date.now — completedAt only reflects the argument passed in', () => {
    const summary = summarizeRun([hit('kick', 0)], 'fixed-timestamp');

    expect(summary.completedAt).toBe('fixed-timestamp');
  });
});

describe('computeRunsTrend', () => {
  function runAt(completedAt: string, accuracy: number): RunSummary {
    return {
      completedAt,
      totalHits: 0,
      totalMisses: 0,
      totalWrong: 0,
      overallAccuracy: accuracy,
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
    };
  }

  it('sorts by completedAt ascending regardless of input order', () => {
    const runs = [
      runAt('2026-08-03', 0.9),
      runAt('2026-08-01', 0.5),
      runAt('2026-08-02', 0.7),
    ];

    expect(computeRunsTrend(runs).map((point) => point.completedAt)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
  });

  it('caps the series to the last N runs', () => {
    const runs = Array.from({ length: 15 }, (_, i) =>
      runAt(`2026-08-${String(i + 1).padStart(2, '0')}`, i / 14),
    );
    const trend = computeRunsTrend(runs, 10);

    expect(trend).toHaveLength(10);
    expect(trend[0].completedAt).toBe('2026-08-06');
    expect(trend[9].completedAt).toBe('2026-08-15');
  });

  it('returns an empty series for no runs', () => {
    expect(computeRunsTrend([])).toEqual([]);
  });

  it('returns an empty series when limit is zero or negative', () => {
    const runs = [runAt('2026-08-01', 0.5)];

    expect(computeRunsTrend(runs, 0)).toEqual([]);
    expect(computeRunsTrend(runs, -3)).toEqual([]);
  });
});

describe('aggregateLaneAccuracy', () => {
  it('sums hits/misses per lane across multiple runs and recomputes accuracy', () => {
    const runA = summarizeRun(
      [hit('kick', 0), hit('kick', 0), miss('kick')],
      '2026-08-01T00:00:00.000Z',
    );
    const runB = summarizeRun(
      [hit('kick', 0), hit('snare', 0), miss('snare')],
      '2026-08-02T00:00:00.000Z',
    );
    const aggregate = aggregateLaneAccuracy([runA, runB]);
    const kick = aggregate.find((lane) => lane.element === 'kick')!;
    const snare = aggregate.find((lane) => lane.element === 'snare')!;

    // 3 kick hits, 1 kick miss across both runs.
    expect(kick).toEqual({
      element: 'kick',
      hits: 3,
      misses: 1,
      accuracy: 0.75,
    });
    expect(snare).toEqual({
      element: 'snare',
      hits: 1,
      misses: 1,
      accuracy: 0.5,
    });
  });

  it('weighs a lane by real attempt count, not by averaging each runs accuracy', () => {
    // Run A: 1/1 kick (100%). Run B: 1/9 kick hits (~11%). A naive average
    // of the two per-run accuracies would read ~55%; the real combined
    // accuracy across 10 attempts is 2/10 = 20%.
    const runA = summarizeRun([hit('kick', 0)], '2026-08-01T00:00:00.000Z');
    const runB = summarizeRun(
      [
        hit('kick', 0),
        miss('kick'),
        miss('kick'),
        miss('kick'),
        miss('kick'),
        miss('kick'),
        miss('kick'),
        miss('kick'),
        miss('kick'),
      ],
      '2026-08-02T00:00:00.000Z',
    );
    const aggregate = aggregateLaneAccuracy([runA, runB]);

    expect(aggregate.find((lane) => lane.element === 'kick')?.accuracy).toBe(
      0.2,
    );
  });

  it('returns [] for no runs', () => {
    expect(aggregateLaneAccuracy([])).toEqual([]);
  });

  it('returns lanes in canonical kit order regardless of input order', () => {
    const run = summarizeRun(
      [hit('crash', 0), hit('kick', 0), hit('snare', 0)],
      '2026-08-01T00:00:00.000Z',
    );

    expect(aggregateLaneAccuracy([run]).map((lane) => lane.element)).toEqual([
      'kick',
      'snare',
      'crash',
    ]);
  });
});
