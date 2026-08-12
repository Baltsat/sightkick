import { Song } from '../../../types';
import {
  AchievementId,
  AchievementRun,
  computeAchievements,
} from './achievements';

export interface Nudge {
  achievementId: AchievementId;
  message: string;
}

export interface NudgeInput {
  runs: AchievementRun[];
  songList: Song[];
  currentStreak: number;
  longestStreak: number;
}

const PRACTICE_RHYTHM_DAYS = 7;

export function pickNudge(input: NudgeInput): Nudge | undefined {
  const unlocked = new Set(
    computeAchievements({
      runs: input.runs,
      songList: input.songList,
      longestStreak: input.longestStreak,
    })
      .filter((result) => result.unlocked)
      .map((result) => result.id),
  );
  const remaining = PRACTICE_RHYTHM_DAYS - input.currentStreak;

  if (unlocked.has('week-one') || remaining <= 0) {
    return undefined;
  }

  return {
    achievementId: 'week-one',
    message: `${remaining} qualifying practice day${
      remaining === 1 ? '' : 's'
    } in a row unlocks Practice rhythm`,
  };
}
