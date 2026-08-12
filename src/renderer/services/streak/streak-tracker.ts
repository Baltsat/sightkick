import { STREAK_STAGES } from './constants';
import { StreakStage, StreakState, StreakTransition } from './types';

const EMPTY_NOTE_IDS: ReadonlySet<string> = new Set();

export const INITIAL_STREAK_STATE: StreakState = {
  count: 0,
  best: 0,
  stage: undefined,
  countedNoteIds: EMPTY_NOTE_IDS,
};

/**
 * The highest stage whose threshold `count` has reached, or `undefined`
 * below the first stage's threshold. `STREAK_STAGES` is ascending, and a
 * streak only ever grows by 1 per hit, so callers never need anything
 * fancier than "highest threshold at or under count".
 */
export function stageForCount(count: number): StreakStage | undefined {
  let reached: StreakStage | undefined;

  for (const stage of STREAK_STAGES) {
    if (count < stage.threshold) {
      break;
    }

    reached = stage;
  }

  return reached;
}

function noTransition(state: StreakState): StreakTransition {
  return { state, stageUp: undefined, didShatter: false };
}

/**
 * Registers one correct hit toward the streak. `noteId` identifies the
 * chart note it belongs to (see `StreakState.countedNoteIds`'s doc) - a
 * second key of a chord already counted this run is a no-op, not a second
 * increment.
 */
export function registerHit(
  state: StreakState,
  noteId: string,
): StreakTransition {
  if (state.countedNoteIds.has(noteId)) {
    return noTransition(state);
  }

  const count = state.count + 1;
  const best = Math.max(state.best, count);
  const stage = stageForCount(count);
  const stageUp = stage && stage.id !== state.stage?.id ? stage : undefined;
  const countedNoteIds = new Set(state.countedNoteIds);

  countedNoteIds.add(noteId);

  return {
    state: { count, best, stage, countedNoteIds },
    stageUp,
    didShatter: false,
  };
}

/**
 * Registers a miss or a wrong hit - both break the streak per
 * `STREAK_RESET_ON_MISS`. Idempotent while already at zero: a run of
 * several misses in a row only "shatters" once, on the hit that actually
 * had a streak to lose.
 */
export function registerFailure(state: StreakState): StreakTransition {
  if (state.count === 0) {
    return noTransition(state);
  }

  return {
    state: { ...INITIAL_STREAK_STATE, best: state.best },
    stageUp: undefined,
    didShatter: true,
  };
}

/**
 * Administrative reset for a seek or restart - reuses the same moment the
 * engine already rewinds Judge's hit state and GameRenderer's paint state
 * (Engine's `onSeek`), so the streak never has to detect a seek itself.
 *
 * Unlike `registerFailure`, this also zeroes `best`: after a seek, "best
 * streak of the run" is redefined as "best streak of the run since the
 * last seek", matching the same philosophy Engine's own `runRecords`
 * pruning already applies to the run summary (a looped section only ever
 * contributes its most recent pass, not a growing tally). It's silent -
 * `didShatter` is always false - because a seek isn't a setback, it's the
 * player choosing to go somewhere else.
 */
export function resetForSeek(state: StreakState): StreakTransition {
  if (state.count === 0 && state.best === 0) {
    return noTransition(state);
  }

  return noTransition(INITIAL_STREAK_STATE);
}
