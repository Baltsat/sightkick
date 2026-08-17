import { describe, expect, it } from 'vitest';
import { ResolvedJudgement } from '../engine';
import {
  detectTutorTrigger,
  isCleanRecovery,
  summarizeTutorWindow,
} from './detector';
import {
  DEFAULT_TUTOR_SETTINGS,
  GUIDED_PRACTICE_TUTOR_SETTINGS,
  TutorChartPlan,
} from './types';

const CHART: TutorChartPlan = {
  measures: Array.from({ length: 4 }, (_, index) => ({
    index,
    startTick: index * 100,
    endTick: (index + 1) * 100,
    expectedKeys: 4,
  })),
};

function expected(
  measureIndex: number,
  offset: number,
  verdict: 'hit' | 'miss',
  deltaMs?: number,
): ResolvedJudgement {
  return {
    id: `note:${measureIndex}:${offset}`,
    verdict,
    measureIndex,
    expectedTick: measureIndex * 100 + offset,
    expectedElement: 'snare',
    ...(deltaMs === undefined ? {} : { deltaMs }),
    scoreable: true,
  };
}

function wrong(
  measureIndex: number,
  offset: number,
  scoreable = true,
): ResolvedJudgement {
  return {
    id: `wrong:${measureIndex}:${offset}`,
    verdict: 'wrong',
    measureIndex,
    actualTick: measureIndex * 100 + offset,
    actualElement: 'tom1',
    scoreable,
  };
}

function detect(
  judgements: Record<number, ResolvedJudgement[]>,
  completedMeasure = 0,
  barFailureHistory = {},
  settings = DEFAULT_TUTOR_SETTINGS,
) {
  return detectTutorTrigger(
    CHART,
    judgements,
    completedMeasure,
    settings,
    'trigger:1',
    barFailureHistory,
  );
}

describe('tutor detector', () => {
  it('interrupts a sustained practice failure at that completed bar', () => {
    expect(
      detect(
        {
          0: [
            expected(0, 0, 'hit'),
            expected(0, 1, 'miss'),
            expected(0, 2, 'miss'),
            expected(0, 3, 'miss'),
          ],
        },
        0,
        {},
        { ...DEFAULT_TUTOR_SETTINGS, ...GUIDED_PRACTICE_TUTOR_SETTINGS },
      ),
    ).toMatchObject({
      reason: 'sustained-error-density',
      stats: { startMeasure: 0, endMeasure: 0, resolved: 4, misses: 3 },
    });
  });

  it('does not interrupt practice on one stray stroke', () => {
    expect(
      detect(
        {
          0: [
            expected(0, 0, 'hit'),
            expected(0, 1, 'hit'),
            expected(0, 2, 'hit'),
            expected(0, 3, 'miss'),
          ],
        },
        0,
        {},
        { ...DEFAULT_TUTOR_SETTINGS, ...GUIDED_PRACTICE_TUTOR_SETTINGS },
      ),
    ).toBeUndefined();
  });

  it('interrupts a catastrophic practice bar without waiting for a second bar', () => {
    expect(
      detect(
        {
          0: Array.from({ length: 4 }, (_, index) =>
            expected(0, index, 'miss'),
          ),
        },
        0,
        {},
        { ...DEFAULT_TUTOR_SETTINGS, ...GUIDED_PRACTICE_TUTOR_SETTINGS },
      ),
    ).toMatchObject({
      reason: 'sustained-error-density',
      stats: { startMeasure: 0, endMeasure: 0, accuracy: 0 },
    });
  });

  it('keeps the non-guided profile from interrupting on extra strokes alone', () => {
    expect(
      detect({
        0: [
          expected(0, 0, 'hit'),
          expected(0, 1, 'hit'),
          expected(0, 2, 'hit'),
          expected(0, 3, 'hit'),
          wrong(0, 0),
          wrong(0, 1),
          wrong(0, 2),
        ],
      }),
    ).toBeUndefined();
  });

  it('does not interrupt on one isolated miss', () => {
    expect(
      detect({
        0: [
          expected(0, 0, 'hit'),
          expected(0, 1, 'hit'),
          expected(0, 2, 'hit'),
          expected(0, 3, 'miss'),
        ],
      }),
    ).toBeUndefined();
  });

  it('does not interrupt a first weak bar with only two distinct errors', () => {
    expect(
      detect({
        0: [
          expected(0, 0, 'hit'),
          expected(0, 1, 'hit'),
          expected(0, 2, 'miss'),
          expected(0, 3, 'miss'),
        ],
      }),
    ).toBeUndefined();
  });

  it('detects three distinct errors only after enough resolved events', () => {
    const trigger = detect(
      {
        0: Array.from({ length: 4 }, (_, index) => expected(0, index, 'hit')),
        1: [
          expected(1, 0, 'hit'),
          expected(1, 1, 'miss'),
          expected(1, 2, 'miss'),
          expected(1, 3, 'miss'),
        ],
      },
      1,
    );

    expect(trigger?.reason).toBe('three-distinct-errors');
    expect(trigger?.stats).toMatchObject({
      expected: 8,
      resolved: 8,
      hits: 5,
      misses: 3,
      wrong: 0,
      accuracy: 0.625,
      distinctErrorIds: ['note:1:1', 'note:1:2', 'note:1:3'],
    });
  });

  it('requires two unambiguous wrong-pad pairs on the same transition', () => {
    const trigger = detect({
      0: [
        expected(0, 0, 'hit'),
        expected(0, 1, 'hit'),
        expected(0, 2, 'miss'),
        expected(0, 3, 'miss'),
        wrong(0, 2),
        wrong(0, 3),
      ],
    });

    expect(trigger).toMatchObject({
      reason: 'repeated-wrong-pad-pair',
      wrongPadPair: {
        actualElement: 'tom1',
        expectedElement: 'snare',
        count: 2,
      },
    });
  });

  it('matches 80–110 tick wrong-pad confusions inside the Practice window', () => {
    const practiceChart: TutorChartPlan = {
      measures: [
        { index: 0, startTick: 0, endTick: 480, expectedKeys: 4 },
        { index: 1, startTick: 480, endTick: 960, expectedKeys: 4 },
      ],
    };
    const hit = (id: string, expectedTick: number): ResolvedJudgement => ({
      id,
      verdict: 'hit',
      measureIndex: 0,
      expectedTick,
      expectedElement: 'snare',
      scoreable: true,
    });
    const miss = (id: string, expectedTick: number): ResolvedJudgement => ({
      id,
      verdict: 'miss',
      measureIndex: 0,
      expectedTick,
      expectedElement: 'snare',
      scoreable: true,
    });
    const wrongHit = (id: string, actualTick: number): ResolvedJudgement => ({
      id,
      verdict: 'wrong',
      measureIndex: 0,
      actualTick,
      actualElement: 'tom1',
      scoreable: true,
    });
    const judgements = {
      0: [
        hit('hit:0', 0),
        hit('hit:1', 120),
        miss('miss:0', 200),
        miss('miss:1', 320),
        wrongHit('wrong:0', 90),
        wrongHit('wrong:1', 400),
      ],
    };

    expect(
      summarizeTutorWindow(practiceChart, judgements, 0, 0).wrongPadPairs,
    ).toEqual([{ actualElement: 'tom1', expectedElement: 'snare', count: 2 }]);
    expect(
      detectTutorTrigger(
        practiceChart,
        judgements,
        0,
        DEFAULT_TUTOR_SETTINGS,
        'trigger:practice-window',
      )?.reason,
    ).toBe('repeated-wrong-pad-pair');
  });

  it('does not pair a wrong hit across a bar boundary', () => {
    const practiceChart: TutorChartPlan = {
      measures: [
        { index: 0, startTick: 0, endTick: 480, expectedKeys: 4 },
        { index: 1, startTick: 480, endTick: 960, expectedKeys: 4 },
      ],
    };
    const judgements: Record<number, ResolvedJudgement[]> = {
      0: [
        {
          id: 'miss:bar-1',
          verdict: 'miss',
          measureIndex: 0,
          expectedTick: 430,
          expectedElement: 'snare',
          scoreable: true,
        },
      ],
      1: [
        {
          id: 'wrong:bar-2',
          verdict: 'wrong',
          measureIndex: 1,
          actualTick: 500,
          actualElement: 'tom1',
          scoreable: true,
        },
      ],
    };

    expect(
      summarizeTutorWindow(practiceChart, judgements, 0, 1).wrongPadPairs,
    ).toEqual([]);
  });

  it('does not invent a wrong-pad transition from an ambiguous miss cluster', () => {
    expect(
      detect({
        0: [
          expected(0, 0, 'hit'),
          expected(0, 1, 'hit'),
          expected(0, 2, 'miss'),
          {
            ...expected(0, 2, 'miss'),
            id: 'note:0:2:chord',
            expectedElement: 'tom2',
          },
          wrong(0, 2),
          wrong(0, 3),
        ],
      })?.reason,
    ).not.toBe('repeated-wrong-pad-pair');
  });

  it('uses session-scoped repeated same-bar evidence for two smaller failures', () => {
    const trigger = detect(
      {
        0: [
          expected(0, 0, 'hit'),
          expected(0, 1, 'hit'),
          expected(0, 2, 'miss'),
          expected(0, 3, 'miss'),
        ],
      },
      0,
      { 0: 2 },
    );

    expect(trigger).toMatchObject({
      reason: 'repeated-same-bar-failure',
      repeatedBarCount: 2,
    });
  });

  it('requires sustained spread rather than one noisy timing outlier', () => {
    const isolatedOutlier = detect({
      0: [
        expected(0, 0, 'hit', 0),
        expected(0, 1, 'hit', 0),
        expected(0, 2, 'hit', 0),
        expected(0, 3, 'hit', 160),
      ],
    });
    const sustainedSpread = detect(
      {
        0: [
          expected(0, 0, 'hit', -80),
          expected(0, 1, 'hit', 80),
          expected(0, 2, 'hit', -80),
          expected(0, 3, 'hit', 80),
        ],
        1: [
          expected(1, 0, 'miss'),
          expected(1, 1, 'miss'),
          expected(1, 2, 'miss'),
          expected(1, 3, 'miss'),
        ],
      },
      1,
      {},
      { ...DEFAULT_TUTOR_SETTINGS, minimumDistinctErrors: 5 },
    );

    expect(isolatedOutlier).toBeUndefined();
    expect(sustainedSpread).toMatchObject({
      reason: 'timing-spread',
      stats: { timingSampleCount: 4, timingOutlierCount: 4 },
    });
  });

  it('replays the recorded DTX timing spread without interrupting a 100%-hit lesson', () => {
    const chart: TutorChartPlan = {
      measures: [
        { index: 0, startTick: 0, endTick: 600, expectedKeys: 6 },
        { index: 1, startTick: 600, endTick: 1_200, expectedKeys: 6 },
      ],
    };
    const deltas = [
      216.25, -115, -87.5, -46.25, 56.25, -198.75, 38.75, 7.5, -8.75, -40,
      -56.25, -87.5,
    ];
    const judgements: Record<number, ResolvedJudgement[]> = {
      0: deltas.slice(0, 6).map((deltaMs, index) => ({
        ...expected(0, index * 100, 'hit', deltaMs),
        id: `dtx:0:${index}`,
      })),
      1: [
        ...deltas.slice(6).map((deltaMs, index) => ({
          ...expected(1, index * 100, 'hit', deltaMs),
          id: `dtx:1:${index}`,
        })),
        wrong(1, 610),
        wrong(1, 620),
      ],
    };
    const settings = {
      ...DEFAULT_TUTOR_SETTINGS,
      ...GUIDED_PRACTICE_TUTOR_SETTINGS,
    };
    const stats = summarizeTutorWindow(chart, judgements, 0, 1);

    expect(stats).toMatchObject({
      resolved: 12,
      hits: 12,
      misses: 0,
      wrong: 2,
      accuracy: 1,
      timingSampleCount: 12,
    });
    expect(stats.timingSpreadMs).toBeGreaterThan(
      settings.timingSpreadThresholdMs,
    );
    expect(stats.timingOutlierCount).toBeGreaterThanOrEqual(
      settings.minimumTimingOutliers,
    );
    expect(
      detectTutorTrigger(
        chart,
        judgements,
        1,
        { ...settings, minimumResolvedEvents: 8 },
        'recorded-dtx-run',
      ),
    ).toBeUndefined();
  });

  it.each([2, 3])(
    'accepts the recorded 20-hit recovery pass with %i wrong pads',
    (wrongPads) => {
      const chart: TutorChartPlan = {
        measures: [
          { index: 0, startTick: 0, endTick: 2_000, expectedKeys: 20 },
        ],
      };
      const judgements: Record<number, ResolvedJudgement[]> = {
        0: [
          ...Array.from({ length: 20 }, (_, index) =>
            expected(0, index * 100, 'hit', 0),
          ),
          ...Array.from({ length: wrongPads }, (_, index) =>
            wrong(0, 2_000 + index),
          ),
        ],
      };
      const settings = {
        ...DEFAULT_TUTOR_SETTINGS,
        ...GUIDED_PRACTICE_TUTOR_SETTINGS,
      };

      expect(
        isCleanRecovery(
          summarizeTutorWindow(chart, judgements, 0, 0),
          settings,
        ),
      ).toBe(true);
    },
  );

  it('ignores warm-up taps and deduplicates authoritative judgement ids', () => {
    const hit = expected(0, 0, 'hit');
    const judgements = {
      0: [hit, hit, expected(0, 1, 'miss'), wrong(0, 1, false)],
    };

    expect(detect(judgements)).toBeUndefined();
    expect(summarizeTutorWindow(CHART, judgements, 0, 0)).toMatchObject({
      hits: 1,
      misses: 1,
      wrong: 0,
      resolved: 2,
    });
  });
});
