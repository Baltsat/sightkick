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
    const region = state.recovery?.region;
    const recoveryId = state.recovery?.id;

    expect(region).toBeDefined();
    state = addCleanRegion(
      state,
      region?.startMeasure ?? 0,
      region?.endMeasure ?? 0,
    );

    const first = dispatch(state, {
      type: 'measure-complete',
      measureIndex: region?.endMeasure ?? 0,
    });

    expect(first.state.phase).toBe('recovering');
    expect(first.state.recovery?.cleanRepetitions).toBe(1);
    expect(first.commands[0].type).toBe('repeat-recovery');
    expect(first.state.recoveryAttempts[0].judgements).toHaveLength(12);
    expect(Object.isFrozen(first.state.recoveryAttempts[0].judgements)).toBe(
      true,
    );
    expect(
      Object.isFrozen(first.state.recoveryAttempts[0].judgements?.[0]),
    ).toBe(true);

    state = addCleanRegion(
      first.state,
      region?.startMeasure ?? 0,
      region?.endMeasure ?? 0,
    );

    const second = dispatch(state, {
      type: 'measure-complete',
      measureIndex: region?.endMeasure ?? 0,
    });

    expect(second.state.phase).toBe('observing');
    expect(second.commands[0]).toMatchObject({
      type: 'resume-main',
      speed: 1,
      reason: 'clean-repetitions',
      resumeMeasure: 3,
      resumeTick: 300,
    });
    expect(second.state.recoveryAttempts).toHaveLength(2);
    expect(second.state.lastRecoveryOutcome).toEqual({
      recoveryId,
      status: 'mastered',
      startMeasure: region?.startMeasure,
      endMeasure: region?.endMeasure,
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

    for (
      let measure = region.startMeasure;
      measure <= region.endMeasure;
      measure += 1
    ) {
      state = addMeasure(
        state,
        measure,
        measure === region.endMeasure
          ? ['hit', 'hit', 'miss', 'miss']
          : ['hit', 'hit', 'hit', 'hit'],
      );
    }

    const nearMiss = dispatch(state, {
      type: 'measure-complete',
      measureIndex: region.endMeasure,
    });

    expect(nearMiss.state.phase).toBe('recovering');
    expect(nearMiss.state.recovery?.qualityProgress).toBeGreaterThan(0.5);
    expect(nearMiss.state.recovery?.qualityProgress).toBeLessThan(1);
    expect(nearMiss.state.recovery?.bestQuality).toBe(1);
  });

  it('accepts developing guided-practice passes without demanding perfection', () => {
    let { state } = beginFailedSession({
      ...GUIDED_PRACTICE_TUTOR_SETTINGS,
      minimumDistinctErrors: 3,
    });
    const region = state.recovery!.region;

    for (let repetition = 0; repetition < 2; repetition += 1) {
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
      state = addCleanRegion(state, start, end);
      state = dispatch(state, {
        type: 'measure-complete',
        measureIndex: end,
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
