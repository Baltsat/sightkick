import { Difficulty } from 'scan-chart';
import { AchievementDef } from '../../services/achievements';
import { Nudge } from '../../services/achievements/nudge';

/** Duolingo-style daily-goal presets, Casual..Intense. */
export type GoalOption = 'casual' | 'regular' | 'serious' | 'intense';

export const GOAL_XP_BY_OPTION: Record<GoalOption, number> = {
  casual: 30,
  regular: 50,
  serious: 100,
  intense: 200,
};

export const GOAL_OPTIONS: GoalOption[] = [
  'casual',
  'regular',
  'serious',
  'intense',
];

export const DEFAULT_GOAL_OPTION: GoalOption = 'regular';

/** What the caller (SongView) already knows about a just-completed run
 * that the gamification layer needs but doesn't compute itself. */
export interface RecordRunInput {
  totalHits: number;
  overallAccuracy: number;
  difficulty: Difficulty;
  /** Star rating earned this run (0-5), or 0 for a run that doesn't score
   * (Practice mode never sets scoreData - see modes.ts). */
  starsEarned: number;
  /** Wall-clock practice time this run represents, already adjusted for
   * playback speed (a 4-minute chart at 0.5x is 8 practice minutes). */
  minutes: number;
}

export interface RecordRunResult {
  xpEarned: number;
  /** True only on the run that pushes today's XP from under goal to at/over
   * it - not "is today's goal met", which stays true on every later run of
   * the same day too. */
  goalCrossed: boolean;
  streakCurrent: number;
  newlyUnlocked: AchievementDef[];
  nudge?: Nudge;
}
