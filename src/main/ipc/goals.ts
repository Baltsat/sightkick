import { randomUUID } from 'crypto';
import { IpcMainEvent } from 'electron';
import { Difficulty } from 'scan-chart';
import { appState } from '../AppState';

/**
 * Store-backed CRUD for mastery goals ("play THIS song at THIS difficulty,
 * by THIS date"). Deliberately its own file, not an addition to
 * `practiceStats.ts` — same reasoning as `gamification.ts`: goals are a new
 * store surface (`goals`, a flat array), not an extension of the per-song
 * run history `practiceStats.ts` owns. This file never reads or writes the
 * `practiceRuns.*` keys; the mastery model that scores a goal reads run
 * history separately, via the existing `load-practice-runs` /
 * `load-all-practice-runs` IPC.
 */

const GOALS_STORE_KEY = 'goals';

/** A generous ceiling, not a realistic one — goals are hand-created one at
 * a time (unlike runs/days, nothing appends to this automatically), so
 * this exists purely as a defensive bound rather than a rolling window. */
export const MAX_STORED_GOALS = 50;

export interface Goal {
  id: string;
  songId: string;
  difficulty: Difficulty;
  /** ISO date ("YYYY-MM-DD"), optional. */
  targetDate?: string;
  createdAt: string;
  /** Exactly one stored goal has `isPrimary: true` at a time — see
   * `setPrimary` below for how that's enforced. */
  isPrimary: boolean;
}

export interface IpcSaveGoalPayload {
  /** Omit to create a new goal; include to update an existing one in
   * place (e.g. changing its target date). */
  id?: string;
  songId: string;
  difficulty: Difficulty;
  targetDate?: string;
  /** Defaults to `true` for the very first goal ever created (so a
   * player's first goal is never accidentally goal-less-primary), and to
   * `false` otherwise unless explicitly requested. */
  isPrimary?: boolean;
}

export interface IpcGoalsResponse {
  goals: Goal[];
}

export interface IpcGoalsError {
  error: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadGoals(): Goal[] {
  return (appState.store.get(GOALS_STORE_KEY) as Goal[] | undefined) ?? [];
}

/** Caps to the most recent `MAX_STORED_GOALS` (oldest dropped first, same
 * convention as `practiceStats.ts`'s run cap), persists, and returns the
 * capped list — callers must reply with *this* return value, not their
 * pre-cap array, or the reply would claim a goal was saved that storage
 * just silently dropped. */
function storeGoals(goals: Goal[]): Goal[] {
  const capped = goals.slice(-MAX_STORED_GOALS);

  appState.store.set(GOALS_STORE_KEY, capped);

  return capped;
}

/** Sets exactly one goal's `isPrimary` to `true`, unsetting every other
 * goal — "at most one primary goal" is enforced here, centrally, rather
 * than trusted to every call site that might set one. */
function withPrimarySetTo(goals: Goal[], id: string): Goal[] {
  return goals.map((goal) => ({ ...goal, isPrimary: goal.id === id }));
}

/**
 * Creates a new goal, or updates an existing one (by `id`) in place.
 * Setting `isPrimary: true` demotes every other stored goal to non-primary
 * in the same write. Replies with the full goal list either way, so every
 * mounted consumer (Profile, the song-row "Set a goal" entry point) can
 * refresh from one broadcast, mirroring `gamification.ts`'s
 * full-state-reply pattern.
 */
export function saveGoal(
  event: IpcMainEvent,
  payload: IpcSaveGoalPayload,
): void {
  try {
    const { id, songId, difficulty, targetDate, isPrimary } = payload;

    if (!songId) {
      throw new Error('songId is required');
    }

    if (!difficulty) {
      throw new Error('difficulty is required');
    }

    const existing = loadGoals();
    const existingIndex = id ? existing.findIndex((g) => g.id === id) : -1;
    const isFirstGoalEver = existing.length === 0 && existingIndex === -1;
    const resolvedIsPrimary = isPrimary ?? isFirstGoalEver;
    let next: Goal[];

    if (existingIndex >= 0) {
      const updated: Goal = {
        ...existing[existingIndex],
        songId,
        difficulty,
        targetDate,
      };

      next = [...existing];
      next[existingIndex] = updated;
    } else {
      const created: Goal = {
        id: randomUUID(),
        songId,
        difficulty,
        targetDate,
        createdAt: new Date().toISOString(),
        isPrimary: false,
      };

      next = [...existing, created];
    }

    const targetId =
      existingIndex >= 0
        ? existing[existingIndex].id
        : next[next.length - 1].id;

    if (resolvedIsPrimary) {
      next = withPrimarySetTo(next, targetId);
    }

    event.reply('save-goal', { goals: storeGoals(next) });
  } catch (error) {
    event.reply('save-goal', { error: toErrorMessage(error) });
  }
}

/** Loads every stored goal, `[]` when none exist yet. */
export function loadGoalsIpc(event: IpcMainEvent): void {
  try {
    event.reply('load-goals', { goals: loadGoals() });
  } catch (error) {
    event.reply('load-goals', { error: toErrorMessage(error) });
  }
}

/** Deletes one goal by id. Deleting the primary goal leaves the list with
 * no primary goal at all — the renderer is left to decide whether to
 * prompt for a new primary rather than this silently guessing one. */
export function deleteGoal(event: IpcMainEvent, id: string): void {
  try {
    if (!id) {
      throw new Error('id is required');
    }

    const next = loadGoals().filter((goal) => goal.id !== id);

    event.reply('delete-goal', { goals: storeGoals(next) });
  } catch (error) {
    event.reply('delete-goal', { error: toErrorMessage(error) });
  }
}

/** Marks one existing goal primary, demoting every other one. Errors
 * (rather than silently no-op-ing) when `id` doesn't match a stored
 * goal, so a stale id in the renderer surfaces instead of quietly losing
 * the primary designation. */
export function setPrimaryGoal(event: IpcMainEvent, id: string): void {
  try {
    if (!id) {
      throw new Error('id is required');
    }

    const existing = loadGoals();

    if (!existing.some((goal) => goal.id === id)) {
      throw new Error(`no stored goal with id ${id}`);
    }

    const next = withPrimarySetTo(existing, id);

    event.reply('set-primary-goal', { goals: storeGoals(next) });
  } catch (error) {
    event.reply('set-primary-goal', { error: toErrorMessage(error) });
  }
}
