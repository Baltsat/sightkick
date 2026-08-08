import { Difficulty } from 'scan-chart';

/**
 * Pure XP formula for one completed run.
 *
 * Lives renderer-side, not main-process: everything it needs (note count,
 * accuracy, difficulty, whether this is the day's first run) is already in
 * the renderer's hands the instant a run ends, and keeping it a pure
 * function of its inputs — like `practice-stats/compute.ts`'s
 * `summarizeRun` — makes the formula trivially unit-testable without an
 * electron-store or IPC round trip. The main process only ever sees the
 * resulting number (via `record-practice-day`); it never recomputes XP
 * itself.
 */

/** XP per note hit, before the accuracy/difficulty multipliers apply. */
export const BASE_XP_PER_NOTE = 1;

/**
 * Every completed attempt earns at least this much — Duolingo never
 * awards 0 XP for finishing a lesson, even a rough one, and a floor keeps
 * a scraped-through 1-note run from feeling like it didn't count.
 */
export const MIN_XP_FOR_ATTEMPT = 5;

/** Flat bonus for the first completed run of the local day. */
export const FIRST_RUN_OF_DAY_BONUS_XP = 20;

/**
 * Easy..Expert ramps linearly from 1x to 2x across the app's 4 fixed
 * difficulties, per the "easy 1x .. expert 2x" spec.
 */
export const DIFFICULTY_XP_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1,
  medium: 1 + 1 / 3,
  hard: 1 + 2 / 3,
  expert: 2,
};

export interface RunXpInput {
  /** Notes actually hit this run (`RunSummary.totalHits`). */
  totalHits: number;
  /** `RunSummary.overallAccuracy`, 0..1. */
  overallAccuracy: number;
  difficulty: Difficulty;
  /** Whether this is the local day's first completed run. */
  isFirstRunOfDay: boolean;
}

/**
 * `totalHits * accuracyMultiplier * difficultyMultiplier`, floored at
 * `MIN_XP_FOR_ATTEMPT`, plus `FIRST_RUN_OF_DAY_BONUS_XP` when it's the
 * day's first run.
 *
 * `accuracyMultiplier` runs 0.5x (0% accuracy) .. 1.5x (100% accuracy) —
 * a completed run always earns *something* even at low accuracy (this is
 * practice, not an exam), but landing more notes is always worth more.
 */
export function computeRunXp({
  totalHits,
  overallAccuracy,
  difficulty,
  isFirstRunOfDay,
}: RunXpInput): number {
  const clampedAccuracy = Math.min(Math.max(overallAccuracy, 0), 1);
  const accuracyMultiplier = 0.5 + clampedAccuracy;
  const difficultyMultiplier = DIFFICULTY_XP_MULTIPLIER[difficulty];
  const raw =
    Math.max(totalHits, 0) *
    BASE_XP_PER_NOTE *
    accuracyMultiplier *
    difficultyMultiplier;
  const base = Math.max(Math.round(raw), MIN_XP_FOR_ATTEMPT);

  return base + (isFirstRunOfDay ? FIRST_RUN_OF_DAY_BONUS_XP : 0);
}
