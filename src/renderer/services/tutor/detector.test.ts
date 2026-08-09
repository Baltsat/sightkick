import { describe, expect, it } from 'vitest';
import { ResolvedJudgement } from '../engine';
import { detectTutorTrigger, summarizeTutorWindow } from './detector';
import { DEFAULT_TUTOR_SETTINGS, TutorChartPlan } from './types';

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
) {
  return detectTutorTrigger(
    CHART,
    judgements,
    completedMeasure,
    DEFAULT_TUTOR_SETTINGS,
    'trigger:1',
    barFailureHistory,
  );
}

describe('tutor detector', () => {
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
    const sustainedSpread = detect({
      0: [
        expected(0, 0, 'hit', -80),
        expected(0, 1, 'hit', 80),
        expected(0, 2, 'hit', -80),
        expected(0, 3, 'hit', 80),
      ],
    });

    expect(isolatedOutlier).toBeUndefined();
    expect(sustainedSpread).toMatchObject({
      reason: 'timing-spread',
      stats: { timingSampleCount: 4, timingOutlierCount: 4 },
    });
  });

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
