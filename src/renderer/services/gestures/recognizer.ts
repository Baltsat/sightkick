import {
  DrumGestureDefinition,
  DrumGestureHit,
  DrumGestureState,
  DrumGestureSurface,
  DrumGestureTransition,
} from './types';

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
  {
    id: 'kit-command-home-songs',
    surfaces: ['home'],
    elements: ['snare'],
    action: 'open-songs',
    windowMs: 0,
    quietBeforeMs: 650,
    minimumGapMs: 0,
    maximumGapMs: 0,
    minimumVelocity: 56,
  },
  {
    id: 'kit-command-home-journey',
    surfaces: ['home'],
    elements: ['tom1'],
    action: 'open-journey',
    windowMs: 0,
    quietBeforeMs: 650,
    minimumGapMs: 0,
    maximumGapMs: 0,
    minimumVelocity: 56,
  },
  {
    id: 'kit-command-home-coach',
    surfaces: ['home'],
    elements: ['ride'],
    action: 'open-coach',
    windowMs: 0,
    quietBeforeMs: 650,
    minimumGapMs: 0,
    maximumGapMs: 0,
    minimumVelocity: 56,
  },
  {
    id: 'kit-command-home-profile',
    surfaces: ['home'],
    elements: ['crash'],
    action: 'open-profile',
    windowMs: 0,
    quietBeforeMs: 650,
    minimumGapMs: 0,
    maximumGapMs: 0,
    minimumVelocity: 56,
  },
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
    id: 'kit-command-continue',
    surfaces: ['result'],
    elements: ['kick', 'crash', 'kick', 'crash'],
    action: 'continue',
    windowMs: 1100,
    quietBeforeMs: 900,
    minimumGapMs: 60,
    maximumGapMs: 380,
    minimumVelocity: 56,
  },
  {
    id: 'kit-command-retry',
    surfaces: ['result'],
    elements: ['snare', 'kick', 'snare', 'kick'],
    action: 'retry',
    windowMs: 1100,
    quietBeforeMs: 900,
    minimumGapMs: 60,
    maximumGapMs: 380,
    minimumVelocity: 56,
  },
  {
    id: 'kit-command-end',
    surfaces: ['paused', 'result'],
    elements: ['ride', 'kick', 'ride', 'crash'],
    action: 'end',
    windowMs: 1100,
    quietBeforeMs: 900,
    minimumGapMs: 60,
    maximumGapMs: 380,
    minimumVelocity: 56,
  },
];

const COOLDOWN_MS = 900;
const MAX_WINDOW_MS = Math.max(
  ...DRUM_GESTURES.map((gesture) => gesture.windowMs),
);

export function createDrumGestureState(): DrumGestureState {
  return { recentHits: [], cooldownUntilMs: 0 };
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
