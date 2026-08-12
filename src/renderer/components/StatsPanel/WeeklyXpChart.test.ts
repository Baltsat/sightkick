import { describe, expect, it } from 'vitest';
import { weeklyBarHeights } from './WeeklyXpChart';

describe('weeklyBarHeights', () => {
  it('scales the tallest bar to fill the available height when it exceeds goal', () => {
    const heights = weeklyBarHeights([10, 100, 50], 50, 96);

    expect(heights[1]).toBe(96);
  });

  it('scales against the goal (not the data max) when every day falls short', () => {
    // Max value is 20, goal is 50 - the goal should be the scale
    // reference so a short week doesn't visually read as "full".
    const heights = weeklyBarHeights([10, 20, 0], 50, 100);

    expect(heights[1]).toBe(40); // 20/50 * 100
  });

  it('is 0 for a day with no XP', () => {
    expect(weeklyBarHeights([0], 50, 100)).toEqual([0]);
  });

  it('gives a real (non-zero-looking) bar to any positive XP, even a tiny one', () => {
    const heights = weeklyBarHeights([1, 1000], 50, 100);

    expect(heights[0]).toBeGreaterThan(0);
  });

  it('does not divide by zero when both goal and data are 0', () => {
    expect(weeklyBarHeights([0, 0], 0, 100)).toEqual([0, 0]);
  });
});
