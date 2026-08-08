/**
 * Pure date/streak math for the daily-practice streak feature.
 *
 * Every function here takes `Date`/`PracticeDays` as explicit inputs and
 * reads only LOCAL calendar fields (`getFullYear`/`getMonth`/`getDate`) —
 * never `toISOString`/UTC conversions, and never a string parsed with
 * `new Date(dateString)` (which JS parses as UTC midnight, silently
 * shifting the "local day" near midnight in most timezones). That keeps
 * every function a pure function of its inputs, matching
 * `practice-stats/compute.ts`'s convention of never touching the clock
 * itself — callers (the `useGamification` hook) pass in `new Date()` at
 * the one real edge that needs "now".
 */

/** One day's rolled-up practice activity, keyed by `localDateKey`. */
export interface DayRollup {
  runs: number;
  stars: number;
  minutes: number;
  xp: number;
}

export type PracticeDays = Record<string, DayRollup>;

/** "YYYY-MM-DD" built from a Date's LOCAL calendar fields (never UTC). */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** `delta` local calendar days from `date` (negative goes backward). */
export function addDays(date: Date, delta: number): Date {
  const next = new Date(date);

  next.setDate(next.getDate() + delta);

  return next;
}

/**
 * Parses a `localDateKey`-shaped string back into a local-midnight `Date`
 * by splitting the string, not by handing it to `new Date(string)` — that
 * constructor treats a bare `YYYY-MM-DD` as UTC, which would silently
 * disagree with `localDateKey`'s own local-field construction.
 */
function keyToLocalDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);

  return new Date(year, month - 1, day);
}

function hasActivity(days: PracticeDays, key: string): boolean {
  return (days[key]?.runs ?? 0) > 0;
}

export interface StreakInfo {
  current: number;
  longest: number;
}

/**
 * Consecutive practiced days ending today or yesterday.
 *
 * - Today counts once it has its first run, even before any other day
 *   exists (streak becomes 1 immediately) — "today counts once" per day,
 *   not per run.
 * - If today has no run yet but yesterday does, the streak still shows
 *   the count through yesterday (it isn't broken just because today
 *   hasn't happened yet) — "yesterday continues".
 * - If neither today nor yesterday has a run, the streak is 0 regardless
 *   of how long a run it used to be — "gap breaks".
 */
export function computeCurrentStreak(days: PracticeDays, today: Date): number {
  const todayKey = localDateKey(today);
  const yesterday = addDays(today, -1);
  const yesterdayKey = localDateKey(yesterday);
  let anchor: Date;

  if (hasActivity(days, todayKey)) {
    anchor = today;
  } else if (hasActivity(days, yesterdayKey)) {
    anchor = yesterday;
  } else {
    return 0;
  }

  let count = 0;
  let cursor = anchor;

  while (hasActivity(days, localDateKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }

  return count;
}

/**
 * Longest run of consecutive practiced days anywhere in the retained
 * history. Note this is "longest within retention" — the main-process
 * store caps how many days it keeps (see `MAX_STORED_PRACTICE_DAYS` in
 * `src/main/ipc/gamification.ts`), so a streak from further back than
 * that cap can no longer be seen or counted here.
 */
export function computeLongestStreak(days: PracticeDays): number {
  const activeKeys = Object.keys(days)
    .filter((key) => hasActivity(days, key))
    .sort();

  if (activeKeys.length === 0) {
    return 0;
  }

  let longest = 1;
  let current = 1;

  for (let i = 1; i < activeKeys.length; i += 1) {
    const expectedNextKey = localDateKey(
      addDays(keyToLocalDate(activeKeys[i - 1]), 1),
    );

    current = expectedNextKey === activeKeys[i] ? current + 1 : 1;
    longest = Math.max(longest, current);
  }

  return longest;
}

export function computeStreak(days: PracticeDays, today: Date): StreakInfo {
  return {
    current: computeCurrentStreak(days, today),
    longest: computeLongestStreak(days),
  };
}

/**
 * Practiced/not-practiced for the last `count` local days, oldest first,
 * today last — the shape the header's 7 day-dots render directly.
 */
export function recentActivity(
  days: PracticeDays,
  today: Date,
  count = 7,
): boolean[] {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(today, index - (count - 1));

    return hasActivity(days, localDateKey(date));
  });
}
