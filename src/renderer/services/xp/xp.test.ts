import { describe, expect, it } from 'vitest';
import {
  computeRunXp,
  DIFFICULTY_XP_MULTIPLIER,
  FIRST_RUN_OF_DAY_BONUS_XP,
  MIN_XP_FOR_ATTEMPT,
} from './xp';

describe('computeRunXp', () => {
  it('floors at MIN_XP_FOR_ATTEMPT for a barely-there attempt', () => {
    const xp = computeRunXp({
      totalHits: 1,
      overallAccuracy: 0,
      difficulty: 'easy',
      isFirstRunOfDay: false,
    });

    expect(xp).toBe(MIN_XP_FOR_ATTEMPT);
  });

  it('scales up with more notes hit', () => {
    const few = computeRunXp({
      totalHits: 10,
      overallAccuracy: 0.8,
      difficulty: 'medium',
      isFirstRunOfDay: false,
    });
    const many = computeRunXp({
      totalHits: 100,
      overallAccuracy: 0.8,
      difficulty: 'medium',
      isFirstRunOfDay: false,
    });

    expect(many).toBeGreaterThan(few);
  });

  it('rewards higher accuracy on an otherwise identical run', () => {
    const low = computeRunXp({
      totalHits: 50,
      overallAccuracy: 0.4,
      difficulty: 'hard',
      isFirstRunOfDay: false,
    });
    const high = computeRunXp({
      totalHits: 50,
      overallAccuracy: 1,
      difficulty: 'hard',
      isFirstRunOfDay: false,
    });

    expect(high).toBeGreaterThan(low);
  });

  it('applies the documented easy..expert multiplier ramp', () => {
    const input = (difficulty: keyof typeof DIFFICULTY_XP_MULTIPLIER) => ({
      totalHits: 60,
      overallAccuracy: 1,
      difficulty,
      isFirstRunOfDay: false,
    });

    // At 100% accuracy the multiplier is exactly accuracy(1.5) * difficulty.
    expect(computeRunXp(input('easy'))).toBe(
      Math.round(60 * 1.5 * DIFFICULTY_XP_MULTIPLIER.easy),
    );
    expect(computeRunXp(input('expert'))).toBe(
      Math.round(60 * 1.5 * DIFFICULTY_XP_MULTIPLIER.expert),
    );
    // Expert (2x) earns exactly double easy (1x) for an identical run.
    expect(computeRunXp(input('expert'))).toBe(2 * computeRunXp(input('easy')));
  });

  it('adds the flat first-run-of-day bonus on top of the base amount', () => {
    const base = computeRunXp({
      totalHits: 40,
      overallAccuracy: 0.9,
      difficulty: 'hard',
      isFirstRunOfDay: false,
    });
    const withBonus = computeRunXp({
      totalHits: 40,
      overallAccuracy: 0.9,
      difficulty: 'hard',
      isFirstRunOfDay: true,
    });

    expect(withBonus).toBe(base + FIRST_RUN_OF_DAY_BONUS_XP);
  });

  it('still applies the first-run bonus even on a floored attempt', () => {
    const xp = computeRunXp({
      totalHits: 0,
      overallAccuracy: 0,
      difficulty: 'easy',
      isFirstRunOfDay: true,
    });

    expect(xp).toBe(MIN_XP_FOR_ATTEMPT + FIRST_RUN_OF_DAY_BONUS_XP);
  });

  it('clamps out-of-range accuracy defensively rather than producing negative/absurd XP', () => {
    const xp = computeRunXp({
      totalHits: 10,
      overallAccuracy: -5,
      difficulty: 'easy',
      isFirstRunOfDay: false,
    });

    expect(xp).toBeGreaterThanOrEqual(MIN_XP_FOR_ATTEMPT);
  });
});
