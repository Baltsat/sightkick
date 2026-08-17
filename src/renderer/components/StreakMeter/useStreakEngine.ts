import { useEffect, useRef, useState } from 'react';
import { Engine } from '../../services/engine';
import {
  INITIAL_STREAK_STATE,
  registerFailure,
  registerHit,
  resetForSeek,
  streakCreditForTick,
  StreakStage,
  StreakState,
  StreakQualificationContext,
} from '../../services/streak';

export const STREAK_CELEBRATION_DURATION_MS = 1800;

export const STREAK_CELEBRATION_COOLDOWN_MS = 12000;

export interface StreakUiState {
  streak: StreakState;
  /** Bumped every time a hit crosses into a new stage - use as a React
   * `key` on the announce flash so it remounts (and thus replays its CSS
   * animation) on every stage-up, even two in quick succession. */
  announceSeq: number;
  /** The stage that most recently triggered a stage-up. Paired with
   * `announceSeq` rather than cleared afterward: the flash's own CSS
   * animation ends at `opacity: 0` with `animation-fill-mode: forwards`
   * (see base.css), so there's nothing left to visually clean up between
   * stage-ups - the next `announceSeq` bump is what replays it. */
  announceStage: StreakStage | undefined;
  /** Bumped on every real failure reset (a miss/wrong hit that actually
   * dropped a running streak) - drives the shatter/dim pulse. NOT bumped
   * by an administrative seek/restart reset (see `resetForSeek` in
   * `services/streak`) - that one is silent by design. */
  shatterSeq: number;
}

export const INITIAL_STREAK_UI_STATE: StreakUiState = {
  streak: INITIAL_STREAK_STATE,
  announceSeq: 0,
  announceStage: undefined,
  shatterSeq: 0,
};

/**
 * Subscribes to one Engine's final Judge outcomes and reset events and turns
 * them into streak UI state. Renderer miss flashes are deliberately ignored:
 * they can happen before the late-hit window closes and while scrubbing, so
 * they are visual feedback rather than reliable evidence of a failed note.
 *
 * Meant to be called once per song view (in SongView) and the result
 * threaded down to `<StreakMeter>` and stamped onto the run summary at
 * `onEnded`, rather than subscribed to redundantly in more than one
 * place.
 */
export function useStreakEngine(
  engine: Engine | undefined,
  qualification?: StreakQualificationContext,
): StreakUiState {
  const [ui, setUi] = useState<StreakUiState>(INITIAL_STREAK_UI_STATE);
  const lastCelebrationAt = useRef(Number.NEGATIVE_INFINITY);
  // Track which Engine instance `ui` currently reflects, so a new instance
  // (song change, or first mount) can reset the streak. This adjusts state
  // during render - React's own documented pattern for "reset state when a
  // prop changes" - rather than from inside the effect below, which would
  // mean calling setState synchronously in an effect body (a cascading-
  // render footgun the lint rules here catch on purpose).
  const [syncedEngine, setSyncedEngine] = useState(engine);

  if (engine !== syncedEngine) {
    setSyncedEngine(engine);
    setUi(INITIAL_STREAK_UI_STATE);
  }

  useEffect(() => {
    if (!ui.announceStage) {
      return undefined;
    }

    const announceSeq = ui.announceSeq;
    const timer = window.setTimeout(() => {
      setUi((previous) =>
        previous.announceSeq === announceSeq
          ? { ...previous, announceStage: undefined }
          : previous,
      );
    }, STREAK_CELEBRATION_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [ui.announceSeq, ui.announceStage]);

  useEffect(() => {
    lastCelebrationAt.current = Number.NEGATIVE_INFINITY;
  }, [engine]);

  useEffect(() => {
    if (!engine) {
      return undefined;
    }

    const applyFailure = () =>
      setUi((prev) => {
        const { state, didShatter } = registerFailure(prev.streak);

        if (!didShatter) {
          return { ...prev, streak: state };
        }

        return {
          ...prev,
          streak: state,
          shatterSeq: prev.shatterSeq + 1,
        };
      });
    const offJudgement = engine.onJudgement((judgement) => {
      if (judgement.verdict === 'hit' && judgement.expectedTick !== undefined) {
        const expectedTick = judgement.expectedTick;
        // All heads in a chord share an expected tick. Registering that tick
        // once keeps the streak musical: one notated event is one step.
        const noteId = `${judgement.measureIndex ?? 'unknown'}:${expectedTick}`;

        setUi((prev) => {
          const { state, stageUp } = registerHit(
            prev.streak,
            noteId,
            streakCreditForTick(qualification, expectedTick),
          );

          if (
            !stageUp ||
            Date.now() - lastCelebrationAt.current <
              STREAK_CELEBRATION_COOLDOWN_MS
          ) {
            return { ...prev, streak: state };
          }

          lastCelebrationAt.current = Date.now();

          return {
            ...prev,
            streak: state,
            announceSeq: prev.announceSeq + 1,
            announceStage: stageUp,
          };
        });

        return;
      }

      if (
        judgement.verdict === 'miss' ||
        (judgement.verdict === 'wrong' && judgement.scoreable)
      ) {
        applyFailure();
      }
    });
    const offReset = engine.onReset(() =>
      setUi((prev) => ({
        ...prev,
        streak: resetForSeek(prev.streak).state,
      })),
    );

    return () => {
      offJudgement();
      offReset();
    };
  }, [engine, qualification]);

  return ui;
}
