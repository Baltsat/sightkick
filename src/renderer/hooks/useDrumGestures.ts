import { useEffect, useLayoutEffect, useRef } from 'react';
import { InputMapping } from '../../types';
import { inputBus } from '../input';
import {
  createDrumGestureState,
  DrumGestureAction,
  DrumGestureSurface,
  recognizeDrumGesture,
} from '../services/gestures';
import { KitElement } from '../services/practice-stats';

interface UseDrumGesturesParams {
  enabled: boolean;
  surface: DrumGestureSurface;
  mapping: InputMapping;
  onAction: (action: DrumGestureAction) => void;
  /** Called before the first possible multi-hit command reaches Engine. */
  onCandidateStart?: () => void;
  /** Releases buffered evidence when the pattern times out or diverges. */
  onCandidateCancel?: () => void;
}

const CANDIDATE_RELEASE_MS = 1_150;

function mappedKitElement(
  mapping: InputMapping,
  controlId: string,
): KitElement | undefined {
  return (Object.keys(mapping) as KitElement[]).find(
    (element) => mapping[element]?.includes(controlId),
  );
}

export function useDrumGestures({
  enabled,
  surface,
  mapping,
  onAction,
  onCandidateStart,
  onCandidateCancel,
}: UseDrumGesturesParams): void {
  const enabledRef = useRef(enabled);
  const surfaceRef = useRef(surface);
  const mappingRef = useRef(mapping);
  const actionRef = useRef(onAction);
  const candidateStartRef = useRef(onCandidateStart);
  const candidateCancelRef = useRef(onCandidateCancel);
  const stateRef = useRef(createDrumGestureState());
  const releaseTimerRef = useRef<number | undefined>(undefined);

  // Physical MIDI can arrive between React committing a new surface and the
  // browser flushing passive effects. Synchronize every decision ref in the
  // layout phase so a first hit on Results can never complete a stale Playing
  // gesture (and a newly disabled recovery preview cannot accept one more
  // command from the screen that just disappeared).
  useLayoutEffect(() => {
    const surfaceChanged = surfaceRef.current !== surface;

    if (
      (!enabled || surfaceChanged) &&
      stateRef.current.recentHits.length > 0
    ) {
      candidateCancelRef.current?.();
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = undefined;
    }

    enabledRef.current = enabled;
    surfaceRef.current = surface;
    mappingRef.current = mapping;
    actionRef.current = onAction;
    candidateStartRef.current = onCandidateStart;
    candidateCancelRef.current = onCandidateCancel;

    if (!enabled || surfaceChanged) {
      stateRef.current = createDrumGestureState();
    }
  }, [
    enabled,
    mapping,
    onAction,
    onCandidateCancel,
    onCandidateStart,
    surface,
  ]);

  useEffect(
    () =>
      inputBus.subscribePriority(({ controlId, value }) => {
        if (!enabledRef.current || value === 0) {
          return;
        }

        const element = mappedKitElement(mappingRef.current, controlId);

        if (!element) {
          return;
        }

        const previousState = stateRef.current;
        const transition = recognizeDrumGesture(
          previousState,
          { element, velocity: value, timeMs: performance.now() },
          surfaceRef.current,
        );
        const previousCandidateStartedAt = previousState.recentHits[0]?.timeMs;
        const nextCandidateStartedAt = transition.state.recentHits[0]?.timeMs;
        const candidateChanged =
          previousCandidateStartedAt !== undefined &&
          previousCandidateStartedAt !== nextCandidateStartedAt;

        if (candidateChanged && !transition.action) {
          candidateCancelRef.current?.();
          window.clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = undefined;
        }

        stateRef.current = transition.state;

        if (
          nextCandidateStartedAt !== undefined &&
          nextCandidateStartedAt !== previousCandidateStartedAt
        ) {
          candidateStartRef.current?.();
          window.clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = window.setTimeout(() => {
            if (
              stateRef.current.recentHits[0]?.timeMs === nextCandidateStartedAt
            ) {
              stateRef.current = createDrumGestureState();
              candidateCancelRef.current?.();
            }

            releaseTimerRef.current = undefined;
          }, CANDIDATE_RELEASE_MS);
        }

        if (transition.action) {
          window.clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = undefined;

          if (previousCandidateStartedAt !== undefined) {
            // Let all subscribers, including Engine/Judge, process the final
            // physical strike before SongView closes the evidence transaction
            // and moves transport for the recognized command.
            queueMicrotask(() => actionRef.current(transition.action!));
          } else {
            actionRef.current(transition.action);
          }
        }
      }),
    [],
  );

  useEffect(
    () => () => {
      window.clearTimeout(releaseTimerRef.current);

      if (stateRef.current.recentHits.length > 0) {
        candidateCancelRef.current?.();
      }
    },
    [],
  );
}
