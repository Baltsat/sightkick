import { describe, expect, it } from 'vitest';
import { planRecoveryRegion, planRecoveryReturnContext } from './checkpoints';
import { DEFAULT_TUTOR_SETTINGS, TutorChartPlan } from './types';

function chart(sectionStarts: number[] = []): TutorChartPlan {
  return {
    measures: Array.from({ length: 10 }, (_, index) => ({
      index,
      startTick: index * 1920,
      endTick: (index + 1) * 1920,
      expectedKeys: 4,
      sectionStart: sectionStarts.includes(index),
    })),
  };
}

describe('planRecoveryRegion', () => {
  it('uses a nearby authored section boundary and adds a context bar', () => {
    expect(
      planRecoveryRegion(chart([0, 4]), 6, 7, DEFAULT_TUTOR_SETTINGS),
    ).toEqual({
      startMeasure: 4,
      endMeasure: 8,
      startTick: 7680,
      endTick: 17280,
      resumeMeasure: 9,
      resumeTick: 17280,
    });
  });

  it('falls back to a complete lead-in bar', () => {
    expect(
      planRecoveryRegion(chart(), 5, 5, DEFAULT_TUTOR_SETTINGS),
    ).toMatchObject({ startMeasure: 4, endMeasure: 6 });
  });

  it('clamps safely at the beginning and end of the chart', () => {
    expect(
      planRecoveryRegion(chart([0]), 0, 0, DEFAULT_TUTOR_SETTINGS),
    ).toMatchObject({ startMeasure: 0, endMeasure: 1 });
    expect(
      planRecoveryRegion(chart([0]), 9, 9, DEFAULT_TUTOR_SETTINGS),
    ).toMatchObject({
      startMeasure: 8,
      endMeasure: 9,
      resumeMeasure: undefined,
      resumeTick: undefined,
    });
  });

  it('adds one real return-context bar after a clean anchor', () => {
    const anchor = planRecoveryRegion(chart(), 4, 4, DEFAULT_TUTOR_SETTINGS);

    expect(anchor).toMatchObject({ startMeasure: 3, endMeasure: 5 });
    expect(planRecoveryReturnContext(chart(), anchor!)).toEqual({
      startMeasure: 3,
      endMeasure: 6,
      startTick: 5760,
      endTick: 13440,
      resumeMeasure: 7,
      resumeTick: 13440,
    });
  });

  it('does not invent a return context beyond the chart', () => {
    const anchor = planRecoveryRegion(chart([0]), 8, 8, DEFAULT_TUTOR_SETTINGS);

    expect(anchor).toMatchObject({ startMeasure: 7, endMeasure: 9 });
    expect(planRecoveryReturnContext(chart([0]), anchor!)).toBeUndefined();
  });
});
