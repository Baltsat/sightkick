import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeCurrentStreak,
  computeLongestStreak,
  computeStreak,
  DayRollup,
  localDateKey,
  PracticeDays,
  recentActivity,
} from './streaks';

function day(runs = 1): DayRollup {
  return { runs, stars: 0, minutes: 0, xp: 0 };
}

// Fixed local reference date so every test is independent of the host
// machine's clock, without ever touching UTC/ISO conversion.
const TODAY = new Date(2026, 7, 8); // 2026-08-08 (local)

describe('localDateKey', () => {
  it('formats a local date as YYYY-MM-DD, zero-padded', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('never touches UTC — a date built from local fields round-trips', () => {
    // A late-evening local time whose UTC equivalent could be the *next*
    // calendar day in positive-offset timezones - localDateKey must still
    // report the local day.
    const lateEvening = new Date(2026, 7, 8, 23, 45);

    expect(localDateKey(lateEvening)).toBe('2026-08-08');
  });
});

describe('addDays', () => {
  it('moves forward and backward across a month boundary', () => {
    expect(localDateKey(addDays(new Date(2026, 7, 31), 1))).toBe('2026-09-01');
    expect(localDateKey(addDays(new Date(2026, 8, 1), -1))).toBe('2026-08-31');
  });
});

describe('computeCurrentStreak', () => {
  it('is 0 with no practice history', () => {
    expect(computeCurrentStreak({}, TODAY)).toBe(0);
  });

  it('today-counts-once: a single run today gives a streak of 1', () => {
    const days: PracticeDays = { [localDateKey(TODAY)]: day() };

    expect(computeCurrentStreak(days, TODAY)).toBe(1);
  });

  it('today-counts-once: many runs today still give a streak of 1', () => {
    const days: PracticeDays = { [localDateKey(TODAY)]: day(9) };

    expect(computeCurrentStreak(days, TODAY)).toBe(1);
  });

  it('yesterday-continues: no run yet today, but yesterday and the day before both have runs', () => {
    const days: PracticeDays = {
      [localDateKey(addDays(TODAY, -1))]: day(),
      [localDateKey(addDays(TODAY, -2))]: day(),
    };

    expect(computeCurrentStreak(days, TODAY)).toBe(2);
  });

  it('gap-breaks: a 2-day gap (nothing today or yesterday) resets to 0', () => {
    const days: PracticeDays = {
      [localDateKey(addDays(TODAY, -2))]: day(),
      [localDateKey(addDays(TODAY, -3))]: day(),
      [localDateKey(addDays(TODAY, -4))]: day(),
    };

    expect(computeCurrentStreak(days, TODAY)).toBe(0);
  });

  it('a day with 0 stored runs does not count as activity', () => {
    const days: PracticeDays = {
      [localDateKey(TODAY)]: day(0),
      [localDateKey(addDays(TODAY, -1))]: day(0),
    };

    expect(computeCurrentStreak(days, TODAY)).toBe(0);
  });

  it('a 0-run entry for today does not block the yesterday-continues case', () => {
    // Today's rollup exists (e.g. created by an aborted run) but has no
    // completed runs yet - the streak should still read through yesterday
    // rather than treating the mere presence of a today entry as "broken".
    const days: PracticeDays = {
      [localDateKey(TODAY)]: day(0),
      [localDateKey(addDays(TODAY, -1))]: day(),
    };

    expect(computeCurrentStreak(days, TODAY)).toBe(1);
  });

  it('counts a real unbroken chain ending today', () => {
    const days: PracticeDays = {
      [localDateKey(TODAY)]: day(),
      [localDateKey(addDays(TODAY, -1))]: day(),
      [localDateKey(addDays(TODAY, -2))]: day(),
      [localDateKey(addDays(TODAY, -3))]: day(),
    };

    expect(computeCurrentStreak(days, TODAY)).toBe(4);
  });
});

describe('computeLongestStreak', () => {
  it('is 0 with no history', () => {
    expect(computeLongestStreak({})).toBe(0);
  });

  it('finds the longest chain even when it is not the most recent one', () => {
    const days: PracticeDays = {
      // A 3-day chain, far in the past...
      [localDateKey(addDays(TODAY, -30))]: day(),
      [localDateKey(addDays(TODAY, -29))]: day(),
      [localDateKey(addDays(TODAY, -28))]: day(),
      // ...then a gap...
      // ...then a shorter, more recent 2-day chain.
      [localDateKey(addDays(TODAY, -1))]: day(),
      [localDateKey(TODAY)]: day(),
    };

    expect(computeLongestStreak(days)).toBe(3);
  });

  it('ignores days with 0 runs when finding chains', () => {
    const days: PracticeDays = {
      [localDateKey(addDays(TODAY, -2))]: day(),
      [localDateKey(addDays(TODAY, -1))]: day(0),
      [localDateKey(TODAY)]: day(),
    };

    expect(computeLongestStreak(days)).toBe(1);
  });
});

describe('computeStreak', () => {
  it('combines current and longest', () => {
    const days: PracticeDays = {
      [localDateKey(addDays(TODAY, -1))]: day(),
      [localDateKey(TODAY)]: day(),
    };

    expect(computeStreak(days, TODAY)).toEqual({ current: 2, longest: 2 });
  });
});

describe('recentActivity', () => {
  it('returns 7 entries oldest-first with today last', () => {
    const days: PracticeDays = {
      [localDateKey(TODAY)]: day(),
      [localDateKey(addDays(TODAY, -2))]: day(),
    };
    const activity = recentActivity(days, TODAY);

    expect(activity).toHaveLength(7);
    expect(activity[6]).toBe(true); // today
    expect(activity[4]).toBe(true); // today - 2
    expect(activity[5]).toBe(false); // today - 1
    expect(activity[0]).toBe(false); // today - 6
  });

  it('supports a custom window size', () => {
    const days: PracticeDays = { [localDateKey(TODAY)]: day() };

    expect(recentActivity(days, TODAY, 3)).toEqual([false, false, true]);
  });
});
