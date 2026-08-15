import { describe, expect, it } from 'vitest';
import { ResolvedJudgement } from '../engine';
import { createTutorState, transitionTutor } from './machine';
import {
  GUIDED_PRACTICE_TUTOR_SETTINGS,
  TutorChartPlan,
  TutorEvent,
  TutorState,
} from './types';

const CHART: TutorChartPlan = {
  measures: Array.from({ length: 6 }, (_, index) => ({
    index,
    startTick: index * 100,
    endTick: (index + 1) * 100,
    expectedKeys: 4,
    sectionStart: index === 0,
    beatCount: 4,
    strongOnsets: [0, 25, 50, 75].map((offset) => index * 100 + offset),
    noteOnsets: [0, 25, 50, 75].map((offset) => ({
      tick: index * 100 + offset,
      expectedKeys: 1,
    })),
  })),
};

function judgement(
  measureIndex: number,
  offset: number,
  verdict: 'hit' | 'miss',
): ResolvedJudgement {
  return {
    id: `note:${measureIndex}:${offset}`,
    verdict,
    measureIndex,
    expectedTick: measureIndex * 100 + offset,
    scoreable: true,
  };
}

function wrongJudgement(
  measureIndex: number,
  offset: number,
  scoreable = true,
): ResolvedJudgement {
  return {
    id: `wrong:${measureIndex}:${offset}`,
    verdict: 'wrong',
    measureIndex,
    actualTick: measureIndex * 100 + offset,
    actualElement: 'tom1',
    expectedElement: 'snare',
    deltaMs: 23,
    velocity: 87,
    scoreable,
  };
}

function dispatch(state: TutorState, event: TutorEvent) {
  return transitionTutor(state, event, CHART);
}

function addMeasure(
  state: TutorState,
  measureIndex: number,
  verdicts: ('hit' | 'miss')[],
): TutorState {
  return verdicts.reduce(
    (current, verdict, offset) =>
      dispatch(current, {
        type: 'judgement',
        judgement: judgement(measureIndex, offset, verdict),
      }).state,
    state,
  );
}

function addCleanRegion(state: TutorState, start: number, end: number) {
  let next = state;

  for (let measure = start; measure <= end; measure += 1) {
    next = addMeasure(next, measure, ['hit', 'hit', 'hit', 'hit']);
  }

  return next;
}

function addFailedRegion(state: TutorState, start: number, end: number) {
  let next = state;

  for (let measure = start; measure <= end; measure += 1) {
    next = addMeasure(next, measure, ['hit', 'hit', 'miss', 'miss']);
  }

  return next;
}

function beginFailedSession(settings = {}) {
  let state = dispatch(createTutorState(settings), {
    type: 'start',
    targetSpeed: 1,
  }).state;

  state = addMeasure(state, 0, ['hit', 'hit', 'hit', 'hit']);
  state = addMeasure(state, 1, ['hit', 'miss', 'miss', 'miss']);

  return dispatch(state, { type: 'measure-complete', measureIndex: 1 });
}

describe('tutor machine', () => {
  it('starts observing at the requested target speed', () => {
    const result = dispatch(createTutorState(), {
      type: 'start',
      targetSpeed: 0.8,
    });

    expect(result.state).toMatchObject({
      phase: 'observing',
      targetSpeed: 0.8,
      currentSpeed: 0.8,
      livesRemaining: 3,
      settings: { livesEnabled: false },
    });
  });

  it('replaces a stale judgement when a rewind re-resolves the same note id', () => {
    let state = dispatch(createTutorState(), {
      type: 'start',
      targetSpeed: 1,
    }).state;

    state = dispatch(state, {
      type: 'judgement',
      judgement: judgement(0, 0, 'miss'),
    }).state;

    expect(state.judgementsByMeasure[0]).toEqual([
      expect.objectContaining({ id: 'note:0:0', verdict: 'miss' }),
    ]);

    // A loop wrap (or any other rewind) resets Judge and replays the same
    // chart position, so the corrected outcome arrives with the identical
    // deterministic id ('note:0:0') as the earlier miss - not a new one.
    state = dispatch(state, {
      type: 'judgement',
      judgement: judgement(0, 0, 'hit'),
    }).state;

    expect(state.judgementsByMeasure[0]).toEqual([
      expect.objectContaining({ id: 'note:0:0', verdict: 'hit' }),
    ]);
  });

  it('normalizes an invalid failed-attempt cap to a bounded value', () => {
    expect(
      createTutorState({ maximumFailedRecoveryAttempts: 0 }).settings
        .maximumFailedRecoveryAttempts,
    ).toBe(1);
    expect(
      createTutorState({ maximumFailedRecoveryAttempts: Number.NaN }).settings
        .maximumFailedRecoveryAttempts,
    ).toBe(6);
  });

  it('arms one recovery without draining energy in relaxed practice', () => {
    const result = beginFailedSession();

    expect(result.state.phase).toBe('recovering');
    expect(result.state.livesRemaining).toBe(3);
    expect(result.state.interventions).toHaveLength(1);
    expect(result.state.interventions[0]).toMatchObject({
      startedAtSpeed: 1,
      livesRemaining: 3,
      trigger: { reason: 'three-distinct-errors' },
    });
    expect(result.state.recovery?.region).toMatchObject({
      startMeasure: 0,
      endMeasure: 2,
      resumeMeasure: 3,
    });
    expect(result.commands.map((command) => command.type)).toEqual([
      'material-failure',
      'begin-recovery',
    ]);
  });

  it('starts on the hard subdivision, expands after quality passes, and regresses after repeated failure', () => {
    let { state } = beginFailedSession({
      recursiveChunkGrowthEnabled: true,
      maximumChunkAttemptsPerWindow: 4,
      chunkRegressionFailureThreshold: 2,
    });

    expect(state.recovery).toMatchObject({
      region: {
        startTick: 100,
        endTick: 125,
        stage: 'seed',
      },
      chunkGrowth: {
        activeWindowIndex: 0,
        status: 'active',
      },
    });

    for (let pass = 0; pass < 2; pass += 1) {
      state = addMeasure(state, 1, ['hit', 'hit', 'hit', 'hit']);

      const result = dispatch(state, { type: 'recovery-pass-complete' });

      if (pass === 0) {
        expect(result.commands[0]).toMatchObject({
          type: 'repeat-recovery',
          attempt: { chunkTransition: 'repeat' },
        });
      } else {
        expect(result.commands[0]).toMatchObject({
          type: 'repeat-recovery',
          attempt: { chunkTransition: 'expand' },
        });
      }

      state = result.state;
    }

    expect(state.recovery?.chunkGrowth?.activeWindowIndex).toBe(1);
    expect(state.recovery?.region.startTick).toBeLessThanOrEqual(100);
    expect(state.recovery?.region.endTick).toBeGreaterThanOrEqual(125);

    for (let failure = 0; failure < 2; failure += 1) {
      const region = state.recovery!.region;

      state = addFailedRegion(state, region.startMeasure, region.endMeasure);
      state = dispatch(state, { type: 'recovery-pass-complete' }).state;
    }

    expect(state.recovery?.chunkGrowth).toMatchObject({
      activeWindowIndex: 0,
      status: 'active',
    });
    expect(state.recoveryAttempts.at(-1)).toMatchObject({
      chunkTransition: 'regress',
    });
  });

  it('preserves an immutable raw snapshot of the failed trigger window', () => {
    let state = dispatch(createTutorState(), {
      type: 'start',
      targetSpeed: 1,
    }).state;
    const scoreableWrong = wrongJudgement(1, 10);
    const contextualTap = wrongJudgement(1, 11, false);

    state = addMeasure(state, 0, ['hit', 'hit', 'hit', 'hit']);
    state = addMeasure(state, 1, ['hit', 'miss', 'miss', 'miss']);
    state = dispatch(state, {
      type: 'judgement',
      judgement: scoreableWrong,
    }).state;
    state = dispatch(state, {
      type: 'judgement',
      judgement: contextualTap,
    }).state;

    const result = dispatch(state, {
      type: 'measure-complete',
      measureIndex: 1,
    });
    const snapshot = result.state.interventions[0].triggerJudgements;

    expect(result.state.judgementsByMeasure[0]).toBeUndefined();
    expect(result.state.judgementsByMeasure[1]).toBeUndefined();
    expect(snapshot?.map(({ id }) => id)).toEqual([
      'note:0:0',
      'note:0:1',
      'note:0:2',
      'note:0:3',
      'note:1:0',
      'note:1:1',
      'note:1:2',
      'note:1:3',
      'wrong:1:10',
      'wrong:1:11',
    ]);
    expect(snapshot?.at(-2)).toMatchObject({
      verdict: 'wrong',
      actualElement: 'tom1',
      expectedElement: 'snare',
      deltaMs: 23,
      velocity: 87,
      scoreable: true,
    });
    expect(snapshot?.at(-1)).toMatchObject({
      id: 'wrong:1:11',
      scoreable: false,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.at(-1))).toBe(true);

    scoreableWrong.deltaMs = 999;

    expect(snapshot?.at(-2)?.deltaMs).toBe(23);
  });

  it('does not rewind when auto-rewind is disabled', () => {
    let state = dispatch(
      createTutorState({ autoRewind: false, livesEnabled: true }),
      {
        type: 'start',
        targetSpeed: 1,
      },
    ).state;

    state = addMeasure(state, 0, ['miss', 'miss', 'miss', 'miss']);

    const result = dispatch(state, {
      type: 'measure-complete',
      measureIndex: 0,
    });

    expect(result.state.phase).toBe('observing');
    expect(result.state.livesRemaining).toBe(2);
    expect(result.state.judgementsByMeasure[0]).toBeUndefined();
    expect(result.commands.map((command) => command.type)).toEqual([
      'material-failure',
    ]);

    state = addMeasure(result.state, 1, ['miss', 'miss', 'miss', 'miss']);

    const overlappingWindow = dispatch(state, {
      type: 'measure-complete',
      measureIndex: 1,
    });

    expect(overlappingWindow.state.livesRemaining).toBe(1);
    expect(overlappingWindow.state.interventions).toHaveLength(2);
  });

  it('keeps lives unchanged when the lives game is disabled', () => {
    let state = dispatch(createTutorState({ livesEnabled: false }), {
      type: 'start',
      targetSpeed: 1,
    }).state;

    state = addMeasure(state, 0, ['miss', 'miss', 'miss', 'miss']);

    const result = dispatch(state, {
      type: 'measure-complete',
      measureIndex: 0,
    });

    expect(result.state.livesRemaining).toBe(3);
  });

  it('burns one challenge life only when the player opts in', () => {
    let state = dispatch(createTutorState({ livesEnabled: true }), {
      type: 'start',
      targetSpeed: 1,
    }).state;

    state = addMeasure(state, 0, ['miss', 'miss', 'miss', 'miss']);

    const result = dispatch(state, {
      type: 'measure-complete',
      measureIndex: 0,
    });

    expect(result.state.livesRemaining).toBe(2);
    expect(result.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'material-failure',
          livesRemaining: 2,
        }),
      ]),
    );
  });

  it('honors all smart-rewind and lives toggle combinations independently', () => {
    for (const autoRewind of [false, true]) {
      for (const livesEnabled of [false, true]) {
        let state = dispatch(createTutorState({ autoRewind, livesEnabled }), {
          type: 'start',
          targetSpeed: 1,
        }).state;

        state = addMeasure(state, 0, ['miss', 'miss', 'miss', 'miss']);

        const result = dispatch(state, {
          type: 'measure-complete',
          measureIndex: 0,
        });

        expect(result.state.phase).toBe(
          autoRewind ? 'recovering' : 'observing',
        );
        expect(result.state.livesRemaining).toBe(livesEnabled ? 2 : 3);
        expect(
          result.commands.some((command) => command.type === 'begin-recovery'),
        ).toBe(autoRewind);
        expect(result.state.interventions).toHaveLength(1);
      }
    }
  });

  it('requires two clean repetitions before resuming the main song', () => {
    let { state } = beginFailedSession();
    const anchor = state.recovery?.region;
    const recoveryId = state.recovery?.id;

    expect(anchor).toBeDefined();
    state = addCleanRegion(
      state,
      anchor?.startMeasure ?? 0,
      anchor?.endMeasure ?? 0,
    );

    const first = dispatch(state, {
      type: 'measure-complete',
      measureIndex: anchor?.endMeasure ?? 0,
    });

    expect(first.state.phase).toBe('recovering');
    expect(first.state.recovery?.cleanRepetitions).toBe(1);
    expect(first.state.recovery).toMatchObject({
      approach: 'return-context',
      region: { startMeasure: 0, endMeasure: 3 },
    });
    expect(first.commands[0].type).toBe('repeat-recovery');
    expect(first.state.recoveryAttempts[0].approach).toBe('anchor');
    expect(first.state.recoveryAttempts[0].judgements).toHaveLength(12);
    expect(Object.isFrozen(first.state.recoveryAttempts[0].judgements)).toBe(
      true,
    );
    expect(
      Object.isFrozen(first.state.recoveryAttempts[0].judgements?.[0]),
    ).toBe(true);

    const returnContext = first.state.recovery?.region;

    state = addCleanRegion(
      first.state,
      returnContext?.startMeasure ?? 0,
      returnContext?.endMeasure ?? 0,
    );

    const second = dispatch(state, {
      type: 'measure-complete',
      measureIndex: returnContext?.endMeasure ?? 0,
    });

    expect(second.state.phase).toBe('observing');
    expect(second.commands[0]).toMatchObject({
      type: 'resume-main',
      speed: 1,
      reason: 'clean-repetitions',
      resumeMeasure: 4,
      resumeTick: 400,
    });
    expect(second.state.recoveryAttempts).toEqual([
      expect.objectContaining({ approach: 'anchor' }),
      expect.objectContaining({ approach: 'return-context' }),
    ]);
    expect(second.state.lastRecoveryOutcome).toEqual({
      recoveryId,
      status: 'mastered',
      startMeasure: anchor?.startMeasure,
      endMeasure: returnContext?.endMeasure,
      cleanRepetitions: 2,
      qualityProgress: 2,
      bestQuality: 1,
      resumeSpeed: 1,
    });
  });

  it('keeps earned progress after a useful near miss', () => {
    let { state } = beginFailedSession();
    const region = state.recovery!.region;

    state = addCleanRegion(state, region.startMeasure, region.endMeasure);
    state = dispatch(state, {
      type: 'measure-complete',
      measureIndex: region.endMeasure,
    }).state;

    const returnContext = state.recovery!.region;

    for (
      let measure = returnContext.startMeasure;
      measure <= returnContext.endMeasure;
      measure += 1
    ) {
      state = addMeasure(
        state,
        measure,
        measure === returnContext.endMeasure
          ? ['hit', 'hit', 'miss', 'miss']
          : ['hit', 'hit', 'hit', 'hit'],
      );
    }

    const nearMiss = dispatch(state, {
      type: 'measure-complete',
      measureIndex: returnContext.endMeasure,
    });

    expect(nearMiss.state.phase).toBe('recovering');
    expect(nearMiss.state.recovery?.qualityProgress).toBeGreaterThan(0.5);
    expect(nearMiss.state.recovery?.qualityProgress).toBeLessThan(1);
    expect(nearMiss.state.recovery?.bestQuality).toBe(1);
  });

  it('accepts developing guided-practice passes without demanding perfection', () => {
    let { state } = beginFailedSession({
      ...GUIDED_PRACTICE_TUTOR_SETTINGS,
      minimumResolvedEvents: 8,
      minimumDistinctErrors: 3,
    });

    for (let repetition = 0; repetition < 2; repetition += 1) {
      const region = state.recovery!.region;

      for (
        let measure = region.startMeasure;
        measure <= region.endMeasure;
        measure += 1
      ) {
        state = addMeasure(
          state,
          measure,
          measure === region.endMeasure
            ? ['hit', 'hit', 'hit', 'miss']
            : ['hit', 'hit', 'hit', 'hit'],
        );
      }

      state = dispatch(state, {
        type: 'measure-complete',
        measureIndex: region.endMeasure,
      }).state;
    }

    expect(state.phase).toBe('observing');
    expect(state.lastRecoveryOutcome).toMatchObject({
      status: 'mastered',
      qualityProgress: 2,
    });
  });

  it('keeps a guided-practice recovery at the player-selected speed and exits after one failed pass', () => {
    let state = dispatch(
      createTutorState({
        ...GUIDED_PRACTICE_TUTOR_SETTINGS,
        minimumResolvedEvents: 8,
        minimumDistinctErrors: 3,
      }),
      { type: 'start', targetSpeed: 0.7 },
    ).state;

    state = addMeasure(state, 0, ['hit', 'hit', 'hit', 'hit']);
    state = addMeasure(state, 1, ['hit', 'miss', 'miss', 'miss']);
    state = dispatch(state, {
      type: 'measure-complete',
      measureIndex: 1,
    }).state;

    const region = state.recovery!.region;

    state = addFailedRegion(state, region.startMeasure, region.endMeasure);

    const result = dispatch(state, {
      type: 'measure-complete',
      measureIndex: region.endMeasure,
    });

    expect(result.state).toMatchObject({
      phase: 'observing',
      currentSpeed: 0.7,
    });
    expect(result.commands).toEqual([
      expect.objectContaining({
        type: 'resume-main',
        speed: 0.7,
        reason: 'maximum-failed-attempts',
      }),
    ]);
  });

  it('slows after a failed recovery and releases after two quality passes', () => {
    let { state } = beginFailedSession();
    const region = state.recovery?.region;
    const start = region?.startMeasure ?? 0;
    const end = region?.endMeasure ?? 0;

    for (let measure = start; measure <= end; measure += 1) {
      state = addMeasure(state, measure, ['hit', 'hit', 'miss', 'miss']);
    }

    const failed = dispatch(state, {
      type: 'measure-complete',
      measureIndex: end,
    });

    expect(failed.state.currentSpeed).toBe(0.9);
    expect(failed.commands[0]).toMatchObject({
      type: 'repeat-recovery',
      speed: 0.9,
    });

    state = failed.state;

    for (let repetition = 0; repetition < 2; repetition += 1) {
      const recovery = state.recovery!.region;

      state = addCleanRegion(state, recovery.startMeasure, recovery.endMeasure);
      state = dispatch(state, {
        type: 'measure-complete',
        measureIndex: recovery.endMeasure,
      }).state;
    }

    expect(state.currentSpeed).toBe(1);
    expect(state.phase).toBe('observing');
    expect(state.lastRecoveryOutcome).toMatchObject({
      status: 'mastered',
      qualityProgress: 2,
      resumeSpeed: 1,
    });
    expect(state.recoveryAttempts).toHaveLength(3);
  });

  it('defers at the configured failed-recovery limit and safely resumes', () => {
    let { state } = beginFailedSession({
      maximumFailedRecoveryAttempts: 2,
    });
    const region = state.recovery?.region;
    const start = region?.startMeasure ?? 0;
    const end = region?.endMeasure ?? 0;

    for (let failedAttempt = 1; failedAttempt < 2; failedAttempt += 1) {
      state = addFailedRegion(state, start, end);

      const result = dispatch(state, {
        type: 'measure-complete',
        measureIndex: end,
      });

      expect(result.state.phase).toBe('recovering');
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        type: 'repeat-recovery',
        attempt: { result: 'retry' },
      });
      state = result.state;
    }

    state = addFailedRegion(state, start, end);

    const deferred = dispatch(state, {
      type: 'measure-complete',
      measureIndex: end,
    });

    expect(deferred.state).toMatchObject({
      phase: 'observing',
      currentSpeed: 0.8,
      livesRemaining: 3,
      recovery: undefined,
      ignoreTriggersThroughMeasure: end,
      lastRecoveryOutcome: {
        status: 'deferred',
      },
    });
    expect(deferred.state.recoveryAttempts).toHaveLength(2);
    expect(deferred.state.recoveryAttempts.at(-1)).toMatchObject({
      result: 'deferred',
      deferralReason: 'maximum-failed-attempts',
      stats: {
        expected: 12,
        resolved: 12,
        hits: 6,
        misses: 6,
        wrong: 0,
        accuracy: 0.5,
      },
    });
    expect(deferred.commands).toEqual([
      expect.objectContaining({
        type: 'resume-main',
        reason: 'maximum-failed-attempts',
        failedAttempts: 2,
        maximumFailedAttempts: 2,
        speed: 0.8,
        resumeMeasure: 3,
        resumeTick: 300,
        attempt: expect.objectContaining({
          result: 'deferred',
          deferralReason: 'maximum-failed-attempts',
        }),
      }),
    ]);
  });

  it('records a duplicate judgement only once', () => {
    let state = dispatch(createTutorState(), {
      type: 'start',
      targetSpeed: 1,
    }).state;
    const hit = judgement(0, 0, 'hit');

    state = dispatch(state, { type: 'judgement', judgement: hit }).state;
    state = dispatch(state, { type: 'judgement', judgement: hit }).state;

    expect(state.judgementsByMeasure[0]).toHaveLength(1);
  });

  it('finishes with an explicit terminal command', () => {
    const state = dispatch(createTutorState(), {
      type: 'start',
      targetSpeed: 1,
    }).state;
    const result = dispatch(state, { type: 'song-complete' });

    expect(result.state.phase).toBe('complete');
    expect(result.commands).toEqual([{ type: 'session-complete' }]);
  });
});
