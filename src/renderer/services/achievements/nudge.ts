import { Song } from '../../../types';
import {
  AchievementId,
  AchievementRun,
  computeAchievements,
  totalStarsAcrossLibrary,
} from './achievements';

/**
 * Picks the single most relevant "next best action" for the end-of-run
 * summary — the brief is explicit that this is ONE line, not a wall of
 * every locked badge's progress. "Most relevant" here means "closest to
 * unlocking": whichever locked, progress-trackable achievement needs the
 * fewest more of its unit (runs / streak days / stars) wins. Ties break by
 * the fixed order below (perfect-10, then week-one, then century).
 *
 * Binary badges with no meaningful "N more" framing (First Blood, Full Kit,
 * Season Finale, Night Owl, Early Bird, Speed Demon) are deliberately left
 * out of nudge selection — there's no honest "2 more" to say about them.
 */

export interface Nudge {
  achievementId: AchievementId;
  message: string;
}

interface NudgeCandidate {
  id: AchievementId;
  remaining: number;
  message: (remaining: number) => string;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export interface NudgeInput {
  /** Every stored run across every song, including the one that just
   * completed. */
  runs: AchievementRun[];
  songList: Song[];
  currentStreak: number;
  longestStreak: number;
}

const PERFECT_RUN_ACCURACY = 0.95;
const PERFECT_RUN_COUNT = 10;
const WEEK_ONE_STREAK = 7;
const CENTURY_STARS = 100;

export function pickNudge(input: NudgeInput): Nudge | undefined {
  const { runs, songList, currentStreak, longestStreak } = input;
  const unlocked = new Set(
    computeAchievements({ runs, songList, longestStreak })
      .filter((result) => result.unlocked)
      .map((result) => result.id),
  );
  const perfectRunCount = runs.filter(
    (run) => run.overallAccuracy >= PERFECT_RUN_ACCURACY,
  ).length;
  const allCandidates: NudgeCandidate[] = [
    {
      id: 'perfect-10',
      remaining: PERFECT_RUN_COUNT - perfectRunCount,
      message: (n) => `${plural(n, 'run')} like this and Perfect 10 unlocks`,
    },
    {
      id: 'week-one',
      remaining: WEEK_ONE_STREAK - currentStreak,
      message: (n) => `${plural(n, 'day')} in a row unlocks Week One`,
    },
    {
      id: 'century',
      remaining: CENTURY_STARS - totalStarsAcrossLibrary(songList),
      message: (n) => `${plural(n, 'more star')} unlocks Century`,
    },
  ];
  const candidates = allCandidates.filter(
    (candidate) => !unlocked.has(candidate.id) && candidate.remaining > 0,
  );

  if (candidates.length === 0) {
    return undefined;
  }

  const closest = candidates.reduce((best, candidate) =>
    candidate.remaining < best.remaining ? candidate : best,
  );

  return {
    achievementId: closest.id,
    message: closest.message(closest.remaining),
  };
}
