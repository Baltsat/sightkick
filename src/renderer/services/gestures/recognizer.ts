import { RESULT_KIT_COMMANDS } from './kit-commands';
import {
  DrumGestureDefinition,
  DrumGestureHit,
  DrumGestureState,
  DrumGestureSurface,
  DrumGestureTransition,
} from './types';

/** Result-screen commands, one strike each — see RESULT_KIT_COMMANDS. */
const RESULT_GESTURES: DrumGestureDefinition[] = RESULT_KIT_COMMANDS.map(
  ({ id, action, element }) => ({
    id,
    surfaces: ['result'],
    elements: [element],
    action,
    windowMs: 0,
    // The modal opens milliseconds after the last note, so the quiet gate is
    // what separates "a command" from the tail of the run that just ended.
    // useDrumGestures seeds the clock at the surface change for the same
    // reason: entering Results must not read as infinite silence.
    quietBeforeMs: 900,
    minimumGapMs: 0,
    maximumGapMs: 0,
    minimumVelocity: 56,
  }),
);

export const DRUM_GESTURES: DrumGestureDefinition[] = [
  {
    // Starting from the kit needs to be as simple as pressing the pedal, but
    // it must still be intentional. The silence and velocity gate prevent a
    // stray low-velocity kick during setup from launching a run.
    id: 'kit-command-start-kick',
    surfaces: ['home', 'ready'],
    elements: ['kick'],
    action: 'start',
    windowMs: 0,
    quietBeforeMs: 900,
    minimumGapMs: 0,
    maximumGapMs: 0,
    minimumVelocity: 56,
  },
  // The home screen's own door map (HOME_KIT_DOORS) is what the player sees
  // painted on the kit photograph, and HomeCockpit executes it directly from
  // the input bus. The four `home`-surface definitions that used to live
  // here were never wired to that screen and disagreed with it lane for lane
  // (they put Journey on tom1 while the picture says hi-hat), so they are
  // gone rather than left as a second, wrong answer to the same question.
  {
    id: 'kit-command-start',
    surfaces: ['home', 'ready'],
    elements: ['kick', 'crash', 'kick', 'crash'],
    action: 'start',
    windowMs: 1100,
    quietBeforeMs: 900,
    minimumGapMs: 60,
    maximumGapMs: 380,
    minimumVelocity: 56,
  },
  {
    id: 'kit-command-pause',
    surfaces: ['playing'],
    elements: ['kick', 'crash', 'kick', 'crash'],
    action: 'pause',
    windowMs: 1100,
    quietBeforeMs: 1200,
    minimumGapMs: 60,
    maximumGapMs: 380,
    minimumVelocity: 56,
  },
  {
    id: 'kit-command-resume',
    surfaces: ['paused'],
    elements: ['kick', 'crash', 'kick', 'crash'],
    action: 'resume',
    windowMs: 1100,
    quietBeforeMs: 900,
    minimumGapMs: 60,
    maximumGapMs: 380,
    minimumVelocity: 56,
  },
  {
    // Paused sits over a live run, so leaving from there keeps the
    // deliberate four-strike signature. Results is a finished run and gets
    // one strike per outcome instead — see RESULT_GESTURES.
    id: 'kit-command-paused-end',
    surfaces: ['paused'],
    elements: ['ride', 'kick', 'ride', 'crash'],
    action: 'end',
    windowMs: 1100,
    quietBeforeMs: 900,
    minimumGapMs: 60,
    maximumGapMs: 380,
    minimumVelocity: 56,
  },
  ...RESULT_GESTURES,
];

const COOLDOWN_MS = 900;
const MAX_WINDOW_MS = Math.max(
  ...DRUM_GESTURES.map((gesture) => gesture.windowMs),
);

/**
 * `sinceMs` seeds the quiet clock. Callers that enter a new surface pass the
 * moment of that transition, so `quietBeforeMs` is measured from when the
 * screen appeared rather than treated as infinite silence — otherwise the
 * first strike after a run ends satisfies every quiet gate on the result
 * screen instantly.
 */
export function createDrumGestureState(sinceMs?: number): DrumGestureState {
  return {
    recentHits: [],
    cooldownUntilMs: 0,
    ...(sinceMs === undefined ? {} : { lastHitTimeMs: sinceMs }),
  };
}

function matchesPrefix(
  definition: DrumGestureDefinition,
  hits: DrumGestureHit[],
): boolean {
  return hits.every(
    (hit, index) =>
      hit.velocity >= definition.minimumVelocity &&
      hit.element === definition.elements[index],
  );
}

function canStart(
  definition: DrumGestureDefinition,
  hit: DrumGestureHit,
  previousHitTimeMs: number | undefined,
): boolean {
  const quietFor =
    previousHitTimeMs === undefined
      ? Number.POSITIVE_INFINITY
      : hit.timeMs - previousHitTimeMs;

  return (
    definition.elements[0] === hit.element &&
    hit.velocity >= definition.minimumVelocity &&
    quietFor >= definition.quietBeforeMs
  );
}

/**
 * Recognize an exact, ordered kit command after a deliberate silence.
 * One-hit commands complete on the triggering hit; multi-hit commands still
 * require the full ordered signature. Any quiet strike, wrong lane, extra
 * strike, reversed order, or timing violation cancels the candidate. Normal
 * playing therefore cannot satisfy a command merely because the required
 * lanes happened somewhere in a rolling window.
 */
export function recognizeDrumGesture(
  state: DrumGestureState,
  hit: DrumGestureHit,
  surface: DrumGestureSurface,
  definitions: DrumGestureDefinition[] = DRUM_GESTURES,
): DrumGestureTransition {
  if (hit.timeMs < state.cooldownUntilMs) {
    return {
      state: { ...state, recentHits: [], lastHitTimeMs: hit.timeMs },
    };
  }

  const surfaceDefinitions = definitions.filter((definition) =>
    definition.surfaces.includes(surface),
  );
  const priorCandidate = state.recentHits.filter(
    (candidate) => hit.timeMs - candidate.timeMs <= MAX_WINDOW_MS,
  );

  if (priorCandidate.length > 0) {
    const candidate = [...priorCandidate, hit];
    const gapMs = hit.timeMs - priorCandidate[priorCandidate.length - 1].timeMs;
    const matchingDefinitions = surfaceDefinitions.filter(
      (definition) =>
        candidate.length <= definition.elements.length &&
        hit.timeMs - candidate[0].timeMs <= definition.windowMs &&
        gapMs >= definition.minimumGapMs &&
        gapMs <= definition.maximumGapMs &&
        matchesPrefix(definition, candidate),
    );
    const completed = matchingDefinitions.find(
      (definition) => candidate.length === definition.elements.length,
    );

    if (completed) {
      return {
        state: {
          recentHits: [],
          cooldownUntilMs: hit.timeMs + COOLDOWN_MS,
          lastHitTimeMs: hit.timeMs,
        },
        action: completed.action,
        gestureId: completed.id,
      };
    }

    if (matchingDefinitions.length > 0) {
      return {
        state: {
          ...state,
          recentHits: candidate,
          lastHitTimeMs: hit.timeMs,
        },
      };
    }
  }

  const started = surfaceDefinitions.some((definition) =>
    canStart(definition, hit, state.lastHitTimeMs),
  );
  const completed = surfaceDefinitions.find(
    (definition) =>
      definition.elements.length === 1 &&
      canStart(definition, hit, state.lastHitTimeMs),
  );

  if (completed) {
    return {
      state: {
        recentHits: [],
        cooldownUntilMs: hit.timeMs + COOLDOWN_MS,
        lastHitTimeMs: hit.timeMs,
      },
      action: completed.action,
      gestureId: completed.id,
    };
  }

  return {
    state: {
      ...state,
      recentHits: started ? [hit] : [],
      lastHitTimeMs: hit.timeMs,
    },
  };
}
