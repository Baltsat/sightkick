import { describe, expect, it, vi } from 'vitest';
import { RunSummary } from '../../renderer/services/practice-stats';
import { PracticeDays } from '../../renderer/services/streaks';
import { FakeStore, lastReply, makeEvent, makeStore } from './test-support';

const storeHolder = vi.hoisted(() => ({
  current: undefined as FakeStore | undefined,
}));

vi.mock('../AppState', () => ({
  appState: {
    store: {
      get: (key: string) => storeHolder.current!.get(key),
      set: (key: string, value: unknown) =>
        storeHolder.current!.set(key, value),
    },
  },
}));

const {
  MAX_STORED_PRACTICE_DAYS,
  loadAllPracticeRuns,
  loadPracticeDays,
  recordPracticeDay,
} = await import('./gamification');

function fakeRun(overallAccuracy = 1): RunSummary {
  return {
    completedAt: '2026-08-01T00:00:00.000Z',
    totalHits: 1,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy,
    laneAccuracy: [],
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 0,
      sampleCount: 0,
    },
  };
}

describe('recordPracticeDay', () => {
  it('creates a fresh rollup for a new day and reports it as the first run', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    recordPracticeDay(event as never, {
      date: '2026-08-08',
      xp: 25,
      stars: 2,
      minutes: 4,
    });

    expect(storeHolder.current.get('practiceDays')).toEqual({
      '2026-08-08': { runs: 1, stars: 2, minutes: 4, xp: 25 },
    });
    expect(lastReply(event, 'record-practice-day')!.args[0]).toEqual({
      days: { '2026-08-08': { runs: 1, stars: 2, minutes: 4, xp: 25 } },
      wasFirstRunOfDay: true,
    });
  });

  it('accumulates a second run on the same day and reports it as not-first', () => {
    storeHolder.current = makeStore({
      practiceDays: {
        '2026-08-08': { runs: 1, stars: 2, minutes: 4, xp: 25 },
      },
    });

    const event = makeEvent();

    recordPracticeDay(event as never, {
      date: '2026-08-08',
      xp: 10,
      stars: 0,
      minutes: 3,
    });

    expect(storeHolder.current.get('practiceDays.2026-08-08')).toEqual({
      runs: 2,
      stars: 2,
      minutes: 7,
      xp: 35,
    });
    expect(lastReply(event, 'record-practice-day')!.args[0]).toMatchObject({
      wasFirstRunOfDay: false,
    });
  });

  it('keeps different days independent', () => {
    storeHolder.current = makeStore({
      practiceDays: { '2026-08-07': { runs: 1, stars: 1, minutes: 5, xp: 15 } },
    });

    const event = makeEvent();

    recordPracticeDay(event as never, {
      date: '2026-08-08',
      xp: 20,
      stars: 0,
      minutes: 2,
    });

    const days = storeHolder.current.get('practiceDays') as PracticeDays;

    expect(days['2026-08-07']).toEqual({
      runs: 1,
      stars: 1,
      minutes: 5,
      xp: 15,
    });
    expect(days['2026-08-08']).toEqual({
      runs: 1,
      stars: 0,
      minutes: 2,
      xp: 20,
    });
  });

  it('caps stored days at MAX_STORED_PRACTICE_DAYS, dropping the oldest', () => {
    const existing: PracticeDays = {};

    for (let i = 0; i < MAX_STORED_PRACTICE_DAYS; i += 1) {
      const day = String((i % 27) + 1).padStart(2, '0');
      const month = String(Math.floor(i / 27) + 1).padStart(2, '0');

      existing[`2020-${month}-${day}`] = {
        runs: 1,
        stars: 0,
        minutes: 1,
        xp: 1,
      };
    }

    storeHolder.current = makeStore({ practiceDays: existing });

    const event = makeEvent();

    recordPracticeDay(event as never, {
      date: '2099-01-01',
      xp: 5,
      stars: 0,
      minutes: 1,
    });

    const days = storeHolder.current.get('practiceDays') as PracticeDays;

    expect(Object.keys(days)).toHaveLength(MAX_STORED_PRACTICE_DAYS);
    expect(days['2099-01-01']).toBeDefined();
    // The lexically-earliest original day should have been dropped.
    expect(days['2020-01-01']).toBeUndefined();
  });

  it('replies with an error when date is missing', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    recordPracticeDay(event as never, {
      date: '',
      xp: 1,
      stars: 0,
      minutes: 1,
    });

    expect(lastReply(event, 'record-practice-day')!.args[0]).toEqual({
      error: 'date is required',
    });
  });
});

describe('loadPracticeDays', () => {
  it('replies with the stored rollups', () => {
    const days: PracticeDays = {
      '2026-08-08': { runs: 1, stars: 0, minutes: 1, xp: 5 },
    };

    storeHolder.current = makeStore({ practiceDays: days });

    const event = makeEvent();

    loadPracticeDays(event as never);

    expect(lastReply(event, 'load-practice-days')!.args[0]).toEqual({ days });
  });

  it('replies with {} when nothing is stored yet', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    loadPracticeDays(event as never);

    expect(lastReply(event, 'load-practice-days')!.args[0]).toEqual({
      days: {},
    });
  });
});

describe('loadAllPracticeRuns', () => {
  it('flattens every song into one array', () => {
    const runA = fakeRun(0.5);
    const runB = fakeRun(0.9);
    const runC = fakeRun(1);

    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': [runA, runB], 'song-2': [runC] },
    });

    const event = makeEvent();

    loadAllPracticeRuns(event as never);

    expect(lastReply(event, 'load-all-practice-runs')!.args[0]).toEqual({
      runs: [runA, runB, runC],
    });
  });

  it('replies with an empty list when no runs exist yet', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    loadAllPracticeRuns(event as never);

    expect(lastReply(event, 'load-all-practice-runs')!.args[0]).toEqual({
      runs: [],
    });
  });
});
