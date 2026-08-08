import { describe, expect, it, vi } from 'vitest';
import { HitRecord, RunSummary } from '../../renderer/services/practice-stats';
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
  MAX_STORED_FULL_RUNS_PER_SONG,
  MAX_STORED_RUNS_PER_SONG,
  loadPracticeRuns,
  savePracticeRun,
} = await import('./practiceStats');

function fakeSummary(overallAccuracy = 1): RunSummary {
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

function fakeRecord(tick = 0): HitRecord {
  return {
    tick,
    timeSeconds: tick / 480,
    deltaMs: -12,
    element: 'snare',
    verdict: 'hit',
    velocity: 92,
  };
}

describe('savePracticeRun', () => {
  it('appends the run and persists it under the song id', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();
    const summary = fakeSummary();

    savePracticeRun(event as never, { songId: 'song-1', summary });

    expect(storeHolder.current.get('practiceRuns.song-1')).toEqual([summary]);
    expect(lastReply(event, 'save-practice-run')!.args[0]).toEqual({
      songId: 'song-1',
      runs: [summary],
      fullRuns: [],
    });
  });

  it('stores compact hit records separately from the summary history', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();
    const summary = fakeSummary();

    savePracticeRun(event as never, {
      songId: 'song-1',
      summary,
      records: [fakeRecord(480)],
    });

    expect(storeHolder.current.get('practiceRunDetails.song-1')).toEqual([
      {
        summary,
        records: [
          {
            tick: 480,
            deltaMs: -12,
            element: 'snare',
            verdict: 'hit',
            velocity: 92,
          },
        ],
      },
    ]);
  });

  it('caps full-resolution history independently at thirty runs', () => {
    const existing = Array.from(
      { length: MAX_STORED_FULL_RUNS_PER_SONG },
      (_, index) => ({
        summary: fakeSummary(index),
        records: [{ ...fakeRecord(index), timeSeconds: undefined }],
      }),
    );

    storeHolder.current = makeStore({
      practiceRunDetails: { 'song-1': existing },
    });

    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary: fakeSummary(999),
      records: [fakeRecord(999)],
    });

    const stored = storeHolder.current.get(
      'practiceRunDetails.song-1',
    ) as unknown[];

    expect(stored).toHaveLength(MAX_STORED_FULL_RUNS_PER_SONG);
    expect(stored[0]).toMatchObject({ summary: { overallAccuracy: 1 } });
    expect(stored[stored.length - 1]).toMatchObject({
      summary: { overallAccuracy: 999 },
    });
  });

  it('appends to an existing history for the song', () => {
    const first = fakeSummary(0.5);

    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': [first] },
    });

    const event = makeEvent();
    const second = fakeSummary(0.9);

    savePracticeRun(event as never, { songId: 'song-1', summary: second });

    expect(storeHolder.current.get('practiceRuns.song-1')).toEqual([
      first,
      second,
    ]);
  });

  it('keeps runs for different songs independent', () => {
    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': [fakeSummary(0.5)] },
    });

    const event = makeEvent();

    savePracticeRun(event as never, {
      songId: 'song-2',
      summary: fakeSummary(0.2),
    });

    expect(storeHolder.current.get('practiceRuns.song-1')).toHaveLength(1);
    expect(storeHolder.current.get('practiceRuns.song-2')).toHaveLength(1);
  });

  it('caps stored runs at MAX_STORED_RUNS_PER_SONG, dropping the oldest', () => {
    const existing = Array.from({ length: MAX_STORED_RUNS_PER_SONG }, (_, i) =>
      fakeSummary(i),
    );

    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': existing },
    });

    const event = makeEvent();
    const newest = fakeSummary(999);

    savePracticeRun(event as never, { songId: 'song-1', summary: newest });

    const stored = storeHolder.current.get(
      'practiceRuns.song-1',
    ) as RunSummary[];

    expect(stored).toHaveLength(MAX_STORED_RUNS_PER_SONG);
    // the oldest run (accuracy 0) was dropped, newest is now last
    expect(stored[0].overallAccuracy).toBe(1);
    expect(stored[stored.length - 1]).toEqual(newest);
  });

  it('replies with an error when songId is missing', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    savePracticeRun(event as never, {
      songId: '',
      summary: fakeSummary(),
    });

    expect(lastReply(event, 'save-practice-run')!.args[0]).toEqual({
      error: 'songId is required',
    });
  });
});

describe('loadPracticeRuns', () => {
  it('replies with the stored run history for the song', () => {
    const runs = [fakeSummary(0.5), fakeSummary(0.75)];

    storeHolder.current = makeStore({ practiceRuns: { 'song-1': runs } });

    const event = makeEvent();

    loadPracticeRuns(event as never, 'song-1');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toEqual({
      songId: 'song-1',
      runs,
      fullRuns: [],
    });
  });

  it('replies with an empty list for a song with no stored runs', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    loadPracticeRuns(event as never, 'song-1');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toEqual({
      songId: 'song-1',
      runs: [],
      fullRuns: [],
    });
  });

  it('returns full-resolution runs when available', () => {
    const fullRuns = [
      { summary: fakeSummary(0.8), records: [fakeRecord(240)] },
    ];

    storeHolder.current = makeStore({
      practiceRunDetails: { 'song-1': fullRuns },
    });

    const event = makeEvent();

    loadPracticeRuns(event as never, 'song-1');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toMatchObject({
      songId: 'song-1',
      fullRuns,
    });
  });

  it('replies with an error when songId is missing', () => {
    storeHolder.current = makeStore({});

    const event = makeEvent();

    loadPracticeRuns(event as never, '');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toEqual({
      error: 'songId is required',
    });
  });
});
