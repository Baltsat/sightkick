import { clamp } from 'es-toolkit';
import { ResolvedJudgement } from '../engine';
import { planRecoveryRegion, planRecoveryReturnContext } from './checkpoints';
import {
  detectTutorTrigger,
  isCleanRecovery,
  isRepeatableBarFailure,
  recoveryQualityScore,
  summarizeTutorWindow,
} from './detector';
import {
  DEFAULT_TUTOR_SETTINGS,
  TutorChartPlan,
  TutorCommand,
  TutorEvent,
  TutorRecovery,
  TutorRecoveryAttempt,
  TutorSettings,
  TutorState,
  TutorTransition,
} from './types';

function speedToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeFailedRecoveryAttemptLimit(value: number): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.trunc(value))
    : DEFAULT_TUTOR_SETTINGS.maximumFailedRecoveryAttempts;
}

function normalizeUnitInterval(value: number, fallback: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

function normalizePositiveCount(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;
}

function nextId(state: TutorState, prefix: string): string {
  return `${prefix}:${state.nextSequence}`;
}

function clearJudgements(
  source: TutorState['judgementsByMeasure'],
  startMeasure: number,
  endMeasure: number,
): TutorState['judgementsByMeasure'] {
  const next = { ...source };

  for (let index = startMeasure; index <= endMeasure; index += 1) {
    delete next[index];
  }

  return next;
}

function snapshotJudgements(
  source: TutorState['judgementsByMeasure'],
  startMeasure: number,
  endMeasure: number,
): readonly Readonly<ResolvedJudgement>[] {
  const snapshot: Readonly<ResolvedJudgement>[] = [];

  for (let index = startMeasure; index <= endMeasure; index += 1) {
    (source[index] ?? []).forEach((judgement) => {
      snapshot.push(Object.freeze({ ...judgement }));
    });
  }

  return Object.freeze(snapshot);
}

export function createTutorState(
  settings: Partial<TutorSettings> = {},
): TutorState {
  const mergedSettings = { ...DEFAULT_TUTOR_SETTINGS, ...settings };
  const resolvedSettings = {
    ...mergedSettings,
    recoveryProgressRetention: normalizeUnitInterval(
      mergedSettings.recoveryProgressRetention,
      DEFAULT_TUTOR_SETTINGS.recoveryProgressRetention,
    ),
    strongRecoveryAccuracy: normalizeUnitInterval(
      mergedSettings.strongRecoveryAccuracy,
      DEFAULT_TUTOR_SETTINGS.strongRecoveryAccuracy,
    ),
    requiredCleanRepetitions: normalizePositiveCount(
      mergedSettings.requiredCleanRepetitions,
      DEFAULT_TUTOR_SETTINGS.requiredCleanRepetitions,
    ),
    maximumFailedRecoveryAttempts: normalizeFailedRecoveryAttemptLimit(
      mergedSettings.maximumFailedRecoveryAttempts,
    ),
  };

  return {
    phase: resolvedSettings.enabled ? 'observing' : 'off',
    settings: resolvedSettings,
    targetSpeed: 1,
    currentSpeed: 1,
    livesRemaining: resolvedSettings.startingLives,
    judgementsByMeasure: {},
    barFailureHistory: {},
    interventions: [],
    recoveryAttempts: [],
    nextSequence: 1,
    lastCompletedMeasure: -1,
    ignoreTriggersThroughMeasure: -1,
  };
}

function recordJudgement(
  state: TutorState,
  event: Extract<TutorEvent, { type: 'judgement' }>,
): TutorState {
  const { judgement } = event;
  const measureIndex = judgement.measureIndex;

  if (measureIndex === undefined) {
    return state;
  }

  const existing = state.judgementsByMeasure[measureIndex] ?? [];
  const existingIndex = existing.findIndex((item) => item.id === judgement.id);
  // Judge's note-judgement ids are deterministic by chart position, not by
  // pass (`note:${tick}:${prefix}` - see judge.ts's noteJudgementId), so the
  // same id can legitimately arrive twice in one run: once, then again after
  // a rewind (a Tutor-initiated retry, or one the Tutor didn't initiate at
  // all, like a natural loop wrap) re-resolves that exact note. The newest
  // resolution is authoritative - a corrected hit after an earlier miss
  // must replace the stale verdict, not be silently dropped behind it.
  const nextMeasureJudgements =
    existingIndex === -1
      ? [...existing, judgement]
      : existing.map((item, index) =>
          index === existingIndex ? judgement : item,
        );

  return {
    ...state,
    judgementsByMeasure: {
      ...state.judgementsByMeasure,
      [measureIndex]: nextMeasureJudgements,
    },
  };
}

function recordBarFailure(
  state: TutorState,
  chart: TutorChartPlan,
  completedMeasure: number,
): TutorState {
  const stats = summarizeTutorWindow(
    chart,
    state.judgementsByMeasure,
    completedMeasure,
    completedMeasure,
  );

  if (!isRepeatableBarFailure(stats, state.settings)) {
    return state;
  }

  return {
    ...state,
    barFailureHistory: {
      ...state.barFailureHistory,
      [completedMeasure]: (state.barFailureHistory[completedMeasure] ?? 0) + 1,
    },
  };
}

function beginRecovery(
  state: TutorState,
  chart: TutorChartPlan,
  completedMeasure: number,
): TutorTransition {
  // Same-bar evidence belongs to the reducer, not the component. It is reset
  // by `start`, so a fresh canonical run never inherits a prior attempt.
  const observedState = recordBarFailure(state, chart, completedMeasure);
  const triggerId = nextId(observedState, 'trigger');
  const trigger = detectTutorTrigger(
    chart,
    observedState.judgementsByMeasure,
    completedMeasure,
    observedState.settings,
    triggerId,
    observedState.barFailureHistory,
  );

  if (!trigger) {
    return { state: observedState, commands: [] };
  }

  const triggerJudgements = snapshotJudgements(
    observedState.judgementsByMeasure,
    trigger.stats.startMeasure,
    trigger.stats.endMeasure,
  );
  const livesRemaining = observedState.settings.livesEnabled
    ? Math.max(0, observedState.livesRemaining - 1)
    : observedState.livesRemaining;
  const materialFailure: TutorCommand = {
    type: 'material-failure',
    trigger,
    livesRemaining,
  };

  if (!observedState.settings.autoRewind) {
    const intervention = {
      id: nextId(
        {
          ...observedState,
          nextSequence: observedState.nextSequence + 1,
        },
        'intervention',
      ),
      trigger,
      triggerJudgements,
      startedAtSpeed: observedState.currentSpeed,
      livesRemaining,
    };

    return {
      state: {
        ...observedState,
        livesRemaining,
        interventions: [...observedState.interventions, intervention],
        nextSequence: observedState.nextSequence + 2,
        ignoreTriggersThroughMeasure: trigger.stats.endMeasure,
        judgementsByMeasure: clearJudgements(
          observedState.judgementsByMeasure,
          trigger.stats.startMeasure,
          trigger.stats.endMeasure,
        ),
      },
      commands: [materialFailure],
    };
  }

  const region = planRecoveryRegion(
    chart,
    trigger.stats.startMeasure,
    trigger.stats.endMeasure,
    observedState.settings,
  );

  if (!region) {
    return { state: observedState, commands: [materialFailure] };
  }

  const recovery: TutorRecovery = {
    id: nextId(
      {
        ...observedState,
        nextSequence: observedState.nextSequence + 1,
      },
      'recovery',
    ),
    trigger,
    region,
    approach: 'anchor',
    repetition: 1,
    cleanRepetitions: 0,
    qualityProgress: 0,
    bestQuality: 0,
  };
  const intervention = {
    id: nextId(
      {
        ...observedState,
        nextSequence: observedState.nextSequence + 2,
      },
      'intervention',
    ),
    trigger,
    triggerJudgements,
    region,
    startedAtSpeed: observedState.currentSpeed,
    livesRemaining,
  };
  const nextState: TutorState = {
    ...observedState,
    phase: 'recovering',
    livesRemaining,
    recovery,
    interventions: [...observedState.interventions, intervention],
    nextSequence: observedState.nextSequence + 3,
    judgementsByMeasure: clearJudgements(
      observedState.judgementsByMeasure,
      region.startMeasure,
      region.endMeasure,
    ),
  };

  return {
    state: nextState,
    commands: [
      materialFailure,
      {
        type: 'begin-recovery',
        recovery,
        speed: observedState.currentSpeed,
      },
    ],
  };
}

function finishRecoveryAttempt(
  state: TutorState,
  chart: TutorChartPlan,
): TutorTransition {
  const recovery = state.recovery;

  if (!recovery) {
    return { state, commands: [] };
  }

  const stats = summarizeTutorWindow(
    chart,
    state.judgementsByMeasure,
    recovery.region.startMeasure,
    recovery.region.endMeasure,
  );
  const clean = isCleanRecovery(stats, state.settings);
  const qualityScore = recoveryQualityScore(stats, state.settings);
  const priorFailedAttempts = state.recoveryAttempts.filter(
    (attempt) =>
      attempt.recoveryId === recovery.id &&
      (attempt.result === 'retry' || attempt.result === 'deferred'),
  ).length;
  const failedAttempts = priorFailedAttempts + (clean ? 0 : 1);
  const shouldDefer =
    !clean && failedAttempts >= state.settings.maximumFailedRecoveryAttempts;
  const judgements = snapshotJudgements(
    state.judgementsByMeasure,
    recovery.region.startMeasure,
    recovery.region.endMeasure,
  );
  const attempt: TutorRecoveryAttempt = {
    id: nextId(state, 'attempt'),
    recoveryId: recovery.id,
    repetition: recovery.repetition,
    approach: recovery.approach ?? 'anchor',
    speed: state.currentSpeed,
    result: clean ? 'clean' : shouldDefer ? 'deferred' : 'retry',
    qualityScore,
    ...(shouldDefer
      ? { deferralReason: 'maximum-failed-attempts' as const }
      : {}),
    stats,
    judgements,
  };
  const attempts = [...state.recoveryAttempts, attempt];
  const maximumProgressLoss = 1 - state.settings.recoveryProgressRetention;
  const qualityProgress = clean
    ? Math.min(
        state.settings.requiredCleanRepetitions,
        recovery.qualityProgress + 1,
      )
    : Math.max(
        0,
        recovery.qualityProgress -
          Math.min(maximumProgressLoss, 1 - qualityScore),
      );
  const cleanRepetitions = Math.floor(qualityProgress);
  const bestQuality = Math.max(recovery.bestQuality, qualityScore);
  let nextSpeed = state.currentSpeed;

  if (!clean) {
    nextSpeed = speedToTenth(
      clamp(
        state.currentSpeed - state.settings.speedStep,
        state.settings.minimumSpeed,
        state.targetSpeed,
      ),
    );
  }

  const hasEarnedRelease =
    clean && qualityProgress >= state.settings.requiredCleanRepetitions;

  if (hasEarnedRelease || shouldDefer) {
    const canPromoteTempo =
      hasEarnedRelease &&
      qualityScore >= state.settings.strongRecoveryAccuracy &&
      stats.wrong === 0;
    const resumeSpeed = speedToTenth(
      shouldDefer
        ? nextSpeed
        : canPromoteTempo
          ? Math.min(
              state.targetSpeed,
              state.currentSpeed + state.settings.speedStep,
            )
          : state.currentSpeed,
    );
    const nextState: TutorState = {
      ...state,
      phase: 'observing',
      // The adapted tempo carries into the rest of the song. A hard phrase
      // must not snap the player back to 1.0x at the next bar; strong evidence
      // earns one bounded step instead.
      currentSpeed: resumeSpeed,
      // Reaching the bounded safety release is a checkpoint transition, not
      // an invitation to continue displaying an impossible 0/3 game state.
      // Refill the checkpoint lives while preserving the deferred recovery
      // attempt as evidence for Coach and the end-of-run review.
      livesRemaining: shouldDefer
        ? state.settings.startingLives
        : state.livesRemaining,
      recovery: undefined,
      lastRecoveryOutcome: {
        recoveryId: recovery.id,
        status: shouldDefer ? 'deferred' : 'mastered',
        startMeasure: recovery.region.startMeasure,
        endMeasure: recovery.region.endMeasure,
        cleanRepetitions,
        qualityProgress,
        bestQuality,
        resumeSpeed,
      },
      recoveryAttempts: attempts,
      nextSequence: state.nextSequence + 1,
      ignoreTriggersThroughMeasure: recovery.region.endMeasure,
      judgementsByMeasure: clearJudgements(
        state.judgementsByMeasure,
        recovery.region.startMeasure,
        recovery.region.endMeasure,
      ),
    };

    return {
      state: nextState,
      commands: [
        {
          type: 'resume-main',
          recoveryId: recovery.id,
          speed: resumeSpeed,
          reason: shouldDefer ? 'maximum-failed-attempts' : 'clean-repetitions',
          ...(shouldDefer
            ? {
                failedAttempts,
                maximumFailedAttempts:
                  state.settings.maximumFailedRecoveryAttempts,
              }
            : {}),
          resumeMeasure: recovery.region.resumeMeasure,
          resumeTick: recovery.region.resumeTick,
          attempt,
        },
      ],
    };
  }

  const returnContext =
    clean && (recovery.approach ?? 'anchor') === 'anchor'
      ? planRecoveryReturnContext(chart, recovery.region)
      : undefined;
  const nextRecovery: TutorRecovery = {
    ...recovery,
    ...(returnContext
      ? { region: returnContext, approach: 'return-context' as const }
      : {}),
    repetition: recovery.repetition + 1,
    cleanRepetitions,
    qualityProgress,
    bestQuality,
  };
  const nextState: TutorState = {
    ...state,
    currentSpeed: nextSpeed,
    recovery: nextRecovery,
    recoveryAttempts: attempts,
    nextSequence: state.nextSequence + 1,
    judgementsByMeasure: clearJudgements(
      state.judgementsByMeasure,
      recovery.region.startMeasure,
      recovery.region.endMeasure,
    ),
  };

  return {
    state: nextState,
    commands: [
      {
        type: 'repeat-recovery',
        recovery: nextRecovery,
        speed: nextSpeed,
        attempt,
      },
    ],
  };
}

export function transitionTutor(
  state: TutorState,
  event: TutorEvent,
  chart: TutorChartPlan,
): TutorTransition {
  if (event.type === 'stop') {
    return {
      state: { ...state, phase: 'off', recovery: undefined },
      commands: [],
    };
  }

  if (event.type === 'start') {
    const targetSpeed = speedToTenth(clamp(event.targetSpeed, 0.3, 2));

    return {
      state: {
        ...createTutorState(state.settings),
        phase: state.settings.enabled ? 'observing' : 'off',
        targetSpeed,
        currentSpeed: targetSpeed,
      },
      commands: [],
    };
  }

  if (event.type === 'speed-changed') {
    // The learner's own speed control is the single source of truth for
    // tempo. This only refreshes the reducer's bookkeeping value so later
    // messaging/evidence (e.g. a recovery attempt's recorded `speed`) never
    // contradicts what is actually playing - it never resets progress and
    // never itself commands the engine (see useTutorSession.executeCommand,
    // which no longer applies any tutor-computed speed to playback).
    const speed = speedToTenth(clamp(event.speed, 0.3, 2));

    return {
      state: { ...state, currentSpeed: speed, targetSpeed: speed },
      commands: [],
    };
  }

  if (state.phase === 'off') {
    return { state, commands: [] };
  }

  if (event.type === 'song-complete') {
    return {
      state: { ...state, phase: 'complete', recovery: undefined },
      commands: [{ type: 'session-complete' }],
    };
  }

  if (event.type === 'judgement') {
    return { state: recordJudgement(state, event), commands: [] };
  }

  const completedState = {
    ...state,
    lastCompletedMeasure: Math.max(
      state.lastCompletedMeasure,
      event.measureIndex,
    ),
  };

  if (
    completedState.phase === 'recovering' &&
    completedState.recovery &&
    event.measureIndex >= completedState.recovery.region.endMeasure
  ) {
    return finishRecoveryAttempt(completedState, chart);
  }

  if (
    completedState.phase === 'observing' &&
    event.measureIndex > completedState.ignoreTriggersThroughMeasure
  ) {
    return beginRecovery(completedState, chart, event.measureIndex);
  }

  return { state: completedState, commands: [] };
}
