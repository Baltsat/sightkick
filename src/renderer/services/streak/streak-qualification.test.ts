import { describe, expect, it } from 'vitest';
import type { StreakQualificationContext } from './streak-qualification';
import { streakCreditForTick } from './streak-qualification';

const sixteenthContext = {
  resolution: 480,
  measures: [
    {
      notes: [0, 120, 240].map((tick) => ({ tick, isRest: false })),
    },
  ],
  playbackSpeed: 0.8,
  timingStandard: 'target' as const,
} as unknown as StreakQualificationContext;

describe('streakCreditForTick', () => {
  it('counts a target-window sixteenth at 0.8x as one clean sixteenth', () => {
    expect(streakCreditForTick(sixteenthContext, 120)).toBe(1);
  });

  it('discounts sparse quarter notes and slowed playback', () => {
    const quarterContext = {
      ...sixteenthContext,
      measures: [
        {
          notes: [0, 480, 960].map((tick) => ({ tick, isRest: false })),
        },
      ],
      playbackSpeed: 0.5,
    } as unknown as StreakQualificationContext;

    expect(streakCreditForTick(quarterContext, 480)).toBeCloseTo(0.15625);
  });

  it('does not award badge credit under a non-target window', () => {
    expect(
      streakCreditForTick(
        { ...sixteenthContext, timingStandard: 'ceiling' },
        120,
      ),
    ).toBe(0);
  });
});
