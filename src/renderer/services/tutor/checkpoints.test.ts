import { describe, expect, it } from 'vitest';
import { planRecoveryRegion } from './checkpoints';
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
});
