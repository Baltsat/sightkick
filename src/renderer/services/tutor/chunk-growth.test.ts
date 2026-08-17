import { describe, expect, it } from 'vitest';
import type { Measure } from '../../../chart-parser/types';
import { buildTutorChartPlan } from './chart';
import {
  createTutorChunkGrowthState,
  planTutorChunkGrowth,
  recordTutorChunkAttempt,
} from './chunk-growth';
import type {
  TutorChartPlan,
  TutorChunkGrowthPlan,
  TutorRecoveryRegion,
} from './types';

function measure(index: number): Measure {
  const startTick = index * 768;

  return {
    timeSig: [4, 4],
    sigChange: false,
    hasClef: true,
    isCompound: false,
    startTick,
    endTick: startTick + 768,
    notes: Array.from({ length: 16 }, (_, noteIndex) => ({
      notes: ['c/5'],
      duration: '16',
      dots: 0,
      isRest: false,
      tick: startTick + noteIndex * 48,
    })),
    tuplets: [],
  };
}

const fullPhrase: TutorRecoveryRegion = {
  startMeasure: 0,
  endMeasure: 1,
  startTick: 0,
  endTick: 1536,
};
const BOULEVARD_HARD_070X_RECORDS = [
  { tick: 172813, verdict: 'wrong', expectedTick: 172800 },
  { tick: 172800, verdict: 'miss' },
  { tick: 172800, verdict: 'miss' },
  { tick: 173056, verdict: 'wrong', expectedTick: 173040 },
  { tick: 173084, verdict: 'wrong', expectedTick: 173040 },
  { tick: 173127, verdict: 'wrong', expectedTick: 173040 },
  { tick: 173040, verdict: 'miss' },
  { tick: 173313, verdict: 'wrong', expectedTick: 173280 },
  { tick: 173280, verdict: 'miss' },
  { tick: 173280, verdict: 'miss' },
  { tick: 173556, verdict: 'wrong', expectedTick: 173520 },
  { tick: 173556, verdict: 'wrong', expectedTick: 173520 },
  { tick: 173520, verdict: 'miss' },
] as const;
const BOULEVARD_HARD_PHRASE: TutorRecoveryRegion = {
  startMeasure: 0,
  endMeasure: 2,
  startTick: 172032,
  endTick: 174336,
};
const BOULEVARD_HARD_CHART: TutorChartPlan = {
  measures: Array.from({ length: 3 }, (_, index) => {
    const startTick = 172032 + index * 768;
    const onsets = [0, 240, 480, 720].map((offset) => startTick + offset);

    return {
      index,
      startTick,
      endTick: startTick + 768,
      expectedKeys: 4,
      beatCount: 4,
      strongOnsets: onsets,
      noteOnsets: onsets.map((tick) => ({ tick, expectedKeys: 1 })),
    };
  }),
};

describe('recursive tutor chunk growth', () => {
  it('plans the saved Boulevard hard 0.7× breakdown from its actual missed and wrong note records', () => {
    const hardTicks = BOULEVARD_HARD_070X_RECORDS.map((record) =>
      'expectedTick' in record ? record.expectedTick : record.tick,
    );
    const plan = planTutorChunkGrowth(
      BOULEVARD_HARD_CHART,
      BOULEVARD_HARD_PHRASE,
      hardTicks,
    );

    expect(plan.hardTick).toBe(173040);
    expect(plan.windows[0]).toMatchObject({
      stage: 'seed',
      startTick: 173040,
      endTick: 173280,
      expectedKeys: 1,
    });
    expect(plan.windows.at(-1)).toMatchObject({
      stage: 'full',
      startTick: 172032,
      endTick: 174336,
    });
  });

  it('keeps recursive control when a phrase has no authored interior boundary', () => {
    const phrase = { ...fullPhrase, endMeasure: 0, endTick: 768 };
    const plan = planTutorChunkGrowth({ measures: [] }, phrase, []);

    expect(plan.windows).toEqual([
      expect.objectContaining({
        stage: 'full',
        startTick: 0,
        endTick: 768,
      }),
    ]);
  });

  it('starts at the densest hard spot on a strong onset and grows nested musical windows into the full phrase', () => {
    const chart = buildTutorChartPlan([measure(0), measure(1)]);
    const plan = planTutorChunkGrowth(chart, fullPhrase, [432, 432, 528]);

    expect(plan.windows[0]).toMatchObject({
      stage: 'seed',
      startTick: 384,
      endTick: 480,
      expectedKeys: 2,
      label: 'bar 1 · beat 3 → beat 3-and',
    });
    expect(plan.windows).toContainEqual(
      expect.objectContaining({
        stage: 'half',
        startTick: 0,
        endTick: 768,
      }),
    );
    expect(plan.windows.at(-1)).toMatchObject({
      stage: 'full',
      startTick: 0,
      endTick: 1536,
    });
    expect(plan.windows.length).toBeLessThanOrEqual(8);

    const strongTicks = new Set([
      0, 96, 192, 288, 384, 480, 576, 672, 768, 864, 960, 1056, 1152, 1248,
      1344, 1440, 1536,
    ]);

    plan.windows.forEach((window, index) => {
      expect(strongTicks.has(window.startTick)).toBe(true);
      expect(strongTicks.has(window.endTick)).toBe(true);

      if (index > 0) {
        expect(window.startTick).toBeLessThanOrEqual(
          plan.windows[index - 1].startTick,
        );
        expect(window.endTick).toBeGreaterThanOrEqual(
          plan.windows[index - 1].endTick,
        );
      }
    });
  });

  it('does not cut a tuplet figure at a grid point with no musical onset', () => {
    const tripletMeasure = measure(0);

    tripletMeasure.notes = [0, 64, 128, 192, 256, 320, 384, 448, 512].map(
      (tick) => ({
        notes: ['c/5'],
        duration: '8',
        dots: 0,
        isRest: false,
        tick,
      }),
    );

    const chart = buildTutorChartPlan([tripletMeasure]);
    const phrase = { ...fullPhrase, endMeasure: 0, endTick: 768 };
    const plan = planTutorChunkGrowth(chart, phrase, [64, 64]);
    const boundaries = new Set([
      ...(chart.measures[0].strongOnsets ?? []),
      phrase.endTick,
    ]);

    expect(boundaries.has(96)).toBe(false);
    plan.windows.forEach((window) => {
      expect(boundaries.has(window.startTick)).toBe(true);
      expect(boundaries.has(window.endTick)).toBe(true);
    });
  });

  it('expands only after qualifying passes, regresses one window after repeated failure, and reaches mastery', () => {
    const chart = buildTutorChartPlan([measure(0), measure(1)]);
    const state = createTutorChunkGrowthState(
      planTutorChunkGrowth(chart, fullPhrase, [432]),
      {
        requiredQualifyingPasses: 2,
        maximumAttemptsPerWindow: 4,
        regressionFailureThreshold: 2,
        maximumTotalAttempts: 20,
      },
    );
    const firstPass = recordTutorChunkAttempt(state, 'qualifying');
    const expanded = recordTutorChunkAttempt(firstPass.state, 'qualifying');
    const firstFailure = recordTutorChunkAttempt(expanded.state, 'failed');
    const regressed = recordTutorChunkAttempt(firstFailure.state, 'failed');

    expect(firstPass.transition).toBe('repeat');
    expect(expanded.transition).toBe('expand');
    expect(expanded.state.activeWindowIndex).toBe(1);
    expect(firstFailure.transition).toBe('repeat');
    expect(regressed.transition).toBe('regress');
    expect(regressed.state.activeWindowIndex).toBe(0);

    let current = regressed.state;

    while (current.status === 'active') {
      const first = recordTutorChunkAttempt(current, 'qualifying');

      current =
        first.state.status === 'active' && first.transition === 'repeat'
          ? recordTutorChunkAttempt(first.state, 'qualifying').state
          : first.state;
    }

    expect(current.status).toBe('mastered');
    expect(current.activeWindowIndex).toBe(current.plan.windows.length - 1);
  });

  it('defers from an unplayable seed at the per-window cap and stays terminal', () => {
    const plan: TutorChunkGrowthPlan = {
      phrase: fullPhrase,
      hardTick: 432,
      windows: [
        {
          ...fullPhrase,
          stage: 'full',
          expectedKeys: 4,
          label: 'bars 1–2',
        },
      ],
    };
    let state = createTutorChunkGrowthState(plan, {
      requiredQualifyingPasses: 2,
      maximumAttemptsPerWindow: 3,
      regressionFailureThreshold: 2,
      maximumTotalAttempts: 3,
    });

    state = recordTutorChunkAttempt(state, 'failed').state;
    state = recordTutorChunkAttempt(state, 'near-miss').state;

    const deferred = recordTutorChunkAttempt(state, 'failed');
    const afterTerminal = recordTutorChunkAttempt(deferred.state, 'qualifying');

    expect(deferred.transition).toBe('defer');
    expect(deferred.state.status).toBe('deferred');
    expect(afterTerminal.state).toBe(deferred.state);
  });
});
