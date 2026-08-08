import { Song } from '../../../types';
import { GameMode } from '../../types';
import { ALL_DIFFICULTIES } from '../../../constants';
import { KIT_ELEMENTS } from '../../constants';
import { LaneAccuracy } from '../practice-stats';
import { getStarRating } from '../../scoring';

/**
 * Pure achievement derivation. No storage of its own — every badge is
 * computed fresh from data the app already persists elsewhere
 * (`practiceRuns`, `songs[].scoreData`, the daily-streak rollup), per the
 * "no new heavy storage" brief. The caller (`useGamification`) is
 * responsible for gathering that data and keeping a lightweight
 * "already shown" cache for the unlock toast — this module only answers
 * "is this badge unlocked right now".
 *
 * `bestStarsForSong`/`LESSON_MASTERED_STARS` below intentionally duplicate
 * ~10 lines already in `hooks/useLessons/helpers.ts` instead of importing
 * from it. That module is under active redesign by another agent
 * (Seasons) per this branch's file fence — staying import-free keeps this
 * module isolated from that in-flight rewrite. Keep the constant in sync
 * by hand if the mastery threshold ever changes.
 */

export type AchievementId =
  | 'first-blood'
  | 'perfect-10'
  | 'week-one'
  | 'century'
  | 'full-kit'
  | 'season-finale'
  | 'night-owl'
  | 'early-bird'
  | 'speed-demon';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  /** Shown once unlocked. */
  description: string;
  /** Shown while locked, as a hint toward earning it. */
  hint: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-blood',
    title: 'First Blood',
    description: 'Completed your first practice run.',
    hint: 'Finish any run to unlock.',
  },
  {
    id: 'perfect-10',
    title: 'Perfect 10',
    description: 'Landed 10 runs at 95%+ accuracy.',
    hint: 'Play runs at 95%+ accuracy — any song, any mode.',
  },
  {
    id: 'week-one',
    title: 'Week One',
    description: 'Kept a 7-day practice streak alive.',
    hint: 'Practice every day for a week.',
  },
  {
    id: 'century',
    title: 'Century',
    description: 'Earned 100 stars across your library.',
    hint: 'Earn stars by scoring runs in Perform mode.',
  },
  {
    id: 'full-kit',
    title: 'Full Kit',
    description: 'Hit 80%+ accuracy on every drum in one run.',
    hint: 'Land 80%+ on kick, snare, hi-hat, toms, ride and crash in a single run.',
  },
  {
    id: 'season-finale',
    title: 'Season Finale',
    description: 'Mastered every lesson in a Drumroll Method unit.',
    hint: 'Master (3⭐) every lesson in one Method unit.',
  },
  {
    id: 'night-owl',
    title: 'Night Owl',
    description: 'Practiced after 11pm.',
    hint: 'Finish a run after 11pm.',
  },
  {
    id: 'early-bird',
    title: 'Early Bird',
    description: 'Practiced before 8am.',
    hint: 'Finish a run before 8am.',
  },
  {
    id: 'speed-demon',
    title: 'Speed Demon',
    description: '3-starred an Expert chart at full speed.',
    hint: 'Score 3+ stars on Expert in Perform mode (always full speed).',
  },
];

/** Minimal per-run shape achievement checks need. `localHour` (0-23) is
 * resolved by the caller from `RunSummary.completedAt` — kept out of this
 * module so it stays a pure function of plain numbers, never `Date`/TZ. */
export interface AchievementRun {
  overallAccuracy: number;
  laneAccuracy: LaneAccuracy[];
  localHour: number;
  mode?: GameMode;
}

export interface AchievementsInput {
  /** Every stored run across every song (see `load-all-practice-runs`). */
  runs: AchievementRun[];
  songList: Song[];
  /** Longest streak ever reached, within retention. */
  longestStreak: number;
}

export interface AchievementResult {
  id: AchievementId;
  unlocked: boolean;
}

const PERFECT_RUN_ACCURACY = 0.95;
const PERFECT_RUN_COUNT = 10;
const CENTURY_STARS = 100;
const WEEK_ONE_STREAK = 7;
/** "Before 8am" per the brief - inclusive of the very early hours. */
const EARLY_BIRD_BEFORE_HOUR = 8;
/** "After 11pm" per the brief. */
const NIGHT_OWL_AT_OR_AFTER_HOUR = 23;
const SPEED_DEMON_MIN_STARS = 3;
// Kept in sync by hand with hooks/useLessons/helpers.ts's
// LESSON_MASTERED_STARS - see the module doc comment above.
const LESSON_MASTERED_STARS = 3;

/** Best star rating (0-5) earned on a song across every played difficulty. */
export function bestStarsForSong(song: Song): number {
  if (!song.scoreData) {
    return 0;
  }

  return ALL_DIFFICULTIES.reduce((best, difficulty) => {
    const data = song.scoreData?.[difficulty];

    return data ? Math.max(best, getStarRating(data)) : best;
  }, 0);
}

/** Sum of each song's best star rating - the same "career total" the
 * library header's total-stars figure and the Century badge both use. */
export function totalStarsAcrossLibrary(songList: Song[]): number {
  return songList.reduce((sum, song) => sum + bestStarsForSong(song), 0);
}

function hasFirstBlood(runs: AchievementRun[]): boolean {
  return runs.length > 0;
}

function hasPerfect10(runs: AchievementRun[]): boolean {
  return (
    runs.filter((run) => run.overallAccuracy >= PERFECT_RUN_ACCURACY).length >=
    PERFECT_RUN_COUNT
  );
}

function hasWeekOne(longestStreak: number): boolean {
  return longestStreak >= WEEK_ONE_STREAK;
}

function hasCentury(songList: Song[]): boolean {
  return totalStarsAcrossLibrary(songList) >= CENTURY_STARS;
}

function hasFullKit(runs: AchievementRun[]): boolean {
  const laneCount = KIT_ELEMENTS.size;

  return runs.some(
    (run) =>
      run.laneAccuracy.length === laneCount &&
      run.laneAccuracy.every((lane) => lane.accuracy >= 0.8),
  );
}

function hasSeasonFinale(songList: Song[]): boolean {
  const byUnit = new Map<string, Song[]>();

  for (const song of songList) {
    if (!song.lesson) {
      continue;
    }

    const unitSongs = byUnit.get(song.lesson.unit) ?? [];

    unitSongs.push(song);
    byUnit.set(song.lesson.unit, unitSongs);
  }

  return [...byUnit.values()].some(
    (unitSongs) =>
      unitSongs.length > 0 &&
      unitSongs.every(
        (song) => bestStarsForSong(song) >= LESSON_MASTERED_STARS,
      ),
  );
}

function hasNightOwl(runs: AchievementRun[]): boolean {
  return runs.some((run) => run.localHour >= NIGHT_OWL_AT_OR_AFTER_HOUR);
}

function hasEarlyBird(runs: AchievementRun[]): boolean {
  return runs.some((run) => run.localHour < EARLY_BIRD_BEFORE_HOUR);
}

function hasSpeedDemon(songList: Song[]): boolean {
  // Perform mode locks playback at 1x (see modes.ts MODE_POLICIES.perform),
  // so any scored Expert run is "at 1x" by construction - no separate
  // speed check needed.
  return songList.some((song) => {
    const data = song.scoreData?.expert;

    return data !== undefined && getStarRating(data) >= SPEED_DEMON_MIN_STARS;
  });
}

export function computeAchievements(
  input: AchievementsInput,
): AchievementResult[] {
  const { runs, songList, longestStreak } = input;

  return [
    { id: 'first-blood', unlocked: hasFirstBlood(runs) },
    { id: 'perfect-10', unlocked: hasPerfect10(runs) },
    { id: 'week-one', unlocked: hasWeekOne(longestStreak) },
    { id: 'century', unlocked: hasCentury(songList) },
    { id: 'full-kit', unlocked: hasFullKit(runs) },
    { id: 'season-finale', unlocked: hasSeasonFinale(songList) },
    { id: 'night-owl', unlocked: hasNightOwl(runs) },
    { id: 'early-bird', unlocked: hasEarlyBird(runs) },
    { id: 'speed-demon', unlocked: hasSpeedDemon(songList) },
  ];
}
