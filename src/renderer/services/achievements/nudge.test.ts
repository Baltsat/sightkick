import { describe, expect, it } from 'vitest';
import { pickNudge } from './nudge';

describe('pickNudge', () => {
  it('keeps the only supporting nudge tied to qualifying practice rhythm', () => {
    const nudge = pickNudge({
      runs: [],
      songList: [],
      currentStreak: 6,
      longestStreak: 6,
    });

    expect(nudge).toMatchObject({
      achievementId: 'week-one',
      message: '1 qualifying practice day in a row unlocks Practice rhythm',
    });
  });

  it('does not surface a volume or time-of-day reward nudge', () => {
    expect(
      pickNudge({
        runs: [],
        songList: [],
        currentStreak: 7,
        longestStreak: 7,
      }),
    ).toBeUndefined();
  });
});
