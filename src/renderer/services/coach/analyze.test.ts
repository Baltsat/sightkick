import { describe, expect, it } from 'vitest';
import { RunSummary, StoredPracticeRun } from '../practice-stats';
import { analyzePracticeRuns } from './analyze';
import { CoachChart } from './types';

const chart: CoachChart = {
  resolution: 480,
  tempos: [{ tick: 0, bpm: 120 }],
  measures: [
    {
      index: 0,
      startTick: 0,
      endTick: 1920,
      isCompound: false,
      tupletCount: 0,
      notes: Array.from({ length: 8 }, (_, index) => ({
        tick: index * 240,
        element: index % 2 === 0 ? ('hihat' as const) : ('snare' as const),
      })),
    },
    {
      index: 1,
      startTick: 1920,
      endTick: 3840,
      isCompound: false,
      tupletCount: 0,
      notes: Array.from({ length: 8 }, (_, index) => ({
        tick: 1920 + index * 240,
        element: index < 4 ? ('tom1' as const) : ('tom3' as const),
      })),
    },
    {
      index: 2,
      startTick: 3840,
      endTick: 5760,
      isCompound: false,
      tupletCount: 0,
      notes: Array.from({ length: 8 }, (_, index) => ({
        tick: 3840 + index * 240,
        element: 'kick' as const,
      })),
    },
    {
      index: 3,
      startTick: 5760,
      endTick: 7680,
      isCompound: false,
      tupletCount: 0,
      notes: Array.from({ length: 8 }, (_, index) => ({
        tick: 5760 + index * 240,
        element: 'tom1' as const,
      })),
    },
  ],
};

function summary(speed: number, accuracy: number): RunSummary {
  return {
    completedAt: `2026-08-08T00:00:0${speed}.000Z`,
    totalHits: 10,
    totalMisses: 2,
    totalWrong: 0,
    overallAccuracy: accuracy,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 0,
      sampleCount: 0,
    },
    wrongHitCounts: [],
    mode: 'practice',
    playbackSpeed: speed,
  };
}

function run(speed: number, accuracy: number): StoredPracticeRun {
  return {
    summary: summary(speed, accuracy),
    records: [
      ...Array.from({ length: 8 }, (_, index) => ({
        tick: index * 240,
        deltaMs: 4,
        element: index % 2 === 0 ? ('hihat' as const) : ('snare' as const),
        verdict: 'hit' as const,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        tick: 1920 + index * 240,
        deltaMs: 8,
        element: 'tom1' as const,
        verdict: 'hit' as const,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        tick: 2400 + index * 240,
        deltaMs: 0,
        element: 'tom3' as const,
        verdict: 'miss' as const,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        tick: 3840 + index * 240,
        deltaMs: 44,
        element: 'kick' as const,
        verdict: 'hit' as const,
      })),
      { tick: 5760, deltaMs: 0, element: 'snare', verdict: 'wrong' },
      { tick: 5760, deltaMs: 0, element: 'tom1', verdict: 'miss' },
    ],
  };
}

describe('analyzePracticeRuns', () => {
  it('ranks trouble bars, pattern cliffs, lane evidence, speed loss, and pad confusions', () => {
    const result = analyzePracticeRuns({
      chart,
      runs: [run(0.7, 0.94), run(1, 0.58)],
    });

    expect(result.analyzedRuns).toBe(2);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trouble-bars',
          skillTag: 'fills',
          evidence: expect.objectContaining({ barStart: 2 }),
        }),
        expect.objectContaining({
          kind: 'breakdown-transition',
          evidence: expect.objectContaining({ barStart: 2 }),
        }),
        expect.objectContaining({
          kind: 'lane-weakness',
          evidence: expect.objectContaining({ lane: 'kick', meanMs: 44 }),
        }),
        expect.objectContaining({ kind: 'speed-sensitivity' }),
        expect.objectContaining({
          kind: 'pad-confusion',
          evidence: expect.objectContaining({
            actualElement: 'snare',
            expectedElement: 'tom1',
          }),
        }),
      ]),
    );
  });

  it('returns no invented findings without scored evidence', () => {
    expect(analyzePracticeRuns({ chart, runs: [] })).toEqual({
      analyzedRuns: 0,
      findings: [],
    });
  });

  it('requires repeated unambiguous wrong-pad pairs before naming a pad transition', () => {
    const paired: StoredPracticeRun = {
      summary: summary(1, 0.5),
      records: [
        { tick: 0, deltaMs: 0, element: 'snare', verdict: 'miss' },
        { tick: 0, deltaMs: 0, element: 'tom1', verdict: 'wrong' },
        { tick: 240, deltaMs: 0, element: 'snare', verdict: 'miss' },
        { tick: 240, deltaMs: 0, element: 'tom1', verdict: 'wrong' },
      ],
    };
    const singleOrAmbiguous: StoredPracticeRun = {
      summary: summary(1, 0.5),
      records: [
        { tick: 0, deltaMs: 0, element: 'snare', verdict: 'miss' },
        { tick: 0, deltaMs: 0, element: 'hihat', verdict: 'miss' },
        { tick: 0, deltaMs: 0, element: 'tom1', verdict: 'wrong' },
      ],
    };

    expect(
      analyzePracticeRuns({ chart, runs: [singleOrAmbiguous] }).findings.some(
        (finding) => finding.kind === 'pad-confusion',
      ),
    ).toBe(false);
    expect(analyzePracticeRuns({ chart, runs: [paired] }).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'pad-confusion',
          evidence: expect.objectContaining({
            actualElement: 'tom1',
            expectedElement: 'snare',
            matchedWrongPadPairs: 2,
          }),
          reason: expect.objectContaining({
            code: 'repeated-unambiguous-wrong-pad-pairs',
          }),
        }),
      ]),
    );
  });

  it('describes a measured lane, not an unobserved limb or technique', () => {
    const result = analyzePracticeRuns({
      chart,
      runs: [
        {
          summary: summary(1, 1),
          records: Array.from({ length: 6 }, (_, index) => ({
            tick: 3840 + index * 240,
            deltaMs: -44,
            element: 'kick' as const,
            verdict: 'hit' as const,
          })),
        },
      ],
    });
    const lane = result.findings.find(
      (finding) => finding.kind === 'lane-weakness',
    );

    expect(lane).toMatchObject({
      title: 'kick lane records early hits around 120 BPM',
      summary: expect.stringContaining('kick lane · 100% accuracy'),
      reason: { code: 'lane-accuracy-or-timing' },
    });
    expect(`${lane?.title} ${lane?.summary}`).not.toMatch(
      /limb|hand|rebound|technique|dynamics|reading/i,
    );
  });

  it('groups authored 82–85 BPM tempo jitter into one adequately sampled lane region', () => {
    const jitterChart: CoachChart = {
      ...chart,
      tempos: [
        { tick: 0, bpm: 82 },
        { tick: 100, bpm: 83 },
        { tick: 200, bpm: 84 },
        { tick: 300, bpm: 85 },
        { tick: 400, bpm: 82 },
        { tick: 500, bpm: 83 },
        { tick: 600, bpm: 84 },
        { tick: 700, bpm: 85 },
      ],
      measures: [
        {
          ...chart.measures[0],
          endTick: 800,
        },
      ],
    };
    const jitterRecords = Array.from({ length: 8 }, (_, index) => ({
      tick: index * 100,
      deltaMs: 60,
      element: 'kick' as const,
      verdict: 'hit' as const,
    }));
    const result = analyzePracticeRuns({
      chart: jitterChart,
      runs: [
        { summary: summary(1, 1), records: jitterRecords },
        { summary: summary(1, 1), records: jitterRecords },
      ],
    });
    const laneFindings = result.findings.filter(
      (finding) => finding.kind === 'lane-weakness',
    );

    expect(laneFindings).toEqual([
      expect.objectContaining({
        severity: 'high',
        title: 'kick lane records late hits around 85 BPM',
        evidence: expect.objectContaining({
          bpm: 85,
          sampleCount: 16,
        }),
      }),
    ]);
  });

  it('counts wrong-only strikes as failed bar outcomes', () => {
    const wrongOnly: StoredPracticeRun = {
      summary: summary(1, 0.5),
      records: [
        ...Array.from({ length: 4 }, (_, index) => ({
          tick: 1920 + index * 240,
          deltaMs: 0,
          element: 'kick' as const,
          verdict: 'hit' as const,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          tick: 2880 + index * 120,
          deltaMs: 0,
          element: 'snare' as const,
          verdict: 'wrong' as const,
        })),
      ],
    };
    const trouble = analyzePracticeRuns({
      chart,
      runs: [wrongOnly],
    }).findings.find((finding) => finding.kind === 'trouble-bars');

    expect(trouble).toMatchObject({
      evidence: {
        barStart: 2,
        barEnd: 2,
        accuracy: 0.5,
        sampleCount: 8,
        hitCount: 4,
        missCount: 0,
        wrongHitCount: 4,
      },
    });
  });

  it('does not count a paired wrong strike twice after its matching miss', () => {
    const paired: StoredPracticeRun = {
      summary: summary(1, 0.75),
      records: [
        ...Array.from({ length: 6 }, (_, index) => ({
          tick: index * 240,
          deltaMs: 0,
          element: index % 2 === 0 ? ('hihat' as const) : ('snare' as const),
          verdict: 'hit' as const,
        })),
        { tick: 1440, deltaMs: 0, element: 'hihat', verdict: 'miss' },
        { tick: 1680, deltaMs: 0, element: 'snare', verdict: 'miss' },
        { tick: 1440, deltaMs: 0, element: 'tom1', verdict: 'wrong' },
        { tick: 1680, deltaMs: 0, element: 'tom1', verdict: 'wrong' },
      ],
    };
    const trouble = analyzePracticeRuns({
      chart,
      runs: [paired],
    }).findings.find((finding) => finding.kind === 'trouble-bars');

    expect(trouble).toMatchObject({
      evidence: {
        barStart: 1,
        barEnd: 1,
        accuracy: 0.75,
        sampleCount: 8,
        hitCount: 6,
        missCount: 2,
        wrongHitCount: 2,
      },
    });
  });
});
