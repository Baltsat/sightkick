import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HitRecord,
  MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG,
  PracticeRunArchive,
  RunSummary,
  StoredPracticeRun,
} from '../../renderer/services/practice-stats';
import { FakeStore, lastReply, makeEvent, makeStore } from './test-support';

const storeHolder = vi.hoisted(() => ({
  current: undefined as FakeStore | undefined,
}));
const storeSetControl = vi.hoisted(() => ({
  calls: [] as (string | Record<string, unknown>)[],
  failNext: undefined as Error | undefined,
}));

vi.mock('../AppState', () => ({
  appState: {
    store: {
      get: (key: string) => storeHolder.current!.get(key),
      set: (
        keyOrSnapshot: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        storeSetControl.calls.push(keyOrSnapshot);

        if (storeSetControl.failNext) {
          const error = storeSetControl.failNext;

          storeSetControl.failNext = undefined;

          throw error;
        }

        if (typeof keyOrSnapshot === 'string') {
          storeHolder.current!.set(keyOrSnapshot, value);

          return;
        }

        Object.entries(keyOrSnapshot).forEach(([key, snapshotValue]) => {
          storeHolder.current!.set(key, snapshotValue);
        });
      },
    },
  },
}));

const {
  MAX_STORED_FULL_RUNS_PER_SONG,
  MAX_STORED_RUNS_PER_SONG,
  finalizePracticeAttemptCheckpoint,
  loadPracticeAttemptCheckpoints,
  loadPracticeRuns,
  savePracticeAttemptCheckpoint,
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

function fakeCheckpoint(
  sessionId = 'attempt-1',
  updatedAt = '2026-08-10T00:00:00.000Z',
) {
  return {
    checkpoint: {
      songId: 'song-1',
      sessionId,
      startedAt: '2026-08-09T23:59:00.000Z',
      updatedAt,
      chartRevision: 'chart-revision-1',
      mode: 'practice' as const,
      difficulty: 'expert' as const,
      playbackSpeed: 0.8,
      positionTick: 960,
      records: [fakeRecord(480)],
    },
  };
}

function emptyArchive() {
  return { schemaVersion: 1, days: {} };
}

function evidenceSummary(index: number, completedAt: string): RunSummary {
  return {
    ...fakeSummary((index + 1) / 100),
    completedAt,
    totalHits: index + 10,
    totalMisses: index + 2,
    totalWrong: index + 1,
    laneAccuracy: [
      {
        element: 'snare',
        hits: index + 4,
        misses: index + 1,
        accuracy: (index + 4) / (index + 5),
      },
    ],
    laneBias: [{ element: 'snare', meanMs: index - 5, sampleCount: index + 4 }],
    timingBias: {
      meanMs: index - 5,
      medianMs: index - 4,
      spreadMs: index + 2,
      earlyCount: index + 1,
      lateCount: 1,
      onTimeCount: 2,
      sampleCount: index + 4,
    },
    wrongHitCounts: [{ element: 'kick', count: index + 1 }],
    bestStreak: index + 6,
    mode: 'practice',
    difficulty: 'hard',
  };
}

beforeEach(() => {
  storeSetControl.calls.length = 0;
  storeSetControl.failNext = undefined;
});

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
      archive: emptyArchive(),
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

  it('round-trips compact judge attribution with the source scoring window', () => {
    storeHolder.current = makeStore({});

    const summary: RunSummary = {
      ...fakeSummary(),
      timingWindowMs: 105,
    };
    const record: HitRecord = {
      ...fakeRecord(480),
      deltaMs: 0,
      verdict: 'wrong',
      expectedTick: 480,
      actualTick: 492,
      expectedElement: 'kick',
      actualElement: 'snare',
    };

    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary,
      records: [record],
    });

    expect(storeHolder.current.get('practiceRunDetails.song-1')).toEqual([
      {
        summary,
        records: [
          {
            tick: 480,
            deltaMs: 0,
            element: 'snare',
            verdict: 'wrong',
            velocity: 92,
            expectedTick: 480,
            actualTick: 492,
            expectedElement: 'kick',
            actualElement: 'snare',
          },
        ],
      },
    ]);

    const event = makeEvent();

    loadPracticeRuns(event as never, 'song-1');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toEqual({
      songId: 'song-1',
      runs: [summary],
      fullRuns: [
        {
          summary,
          records: [
            {
              tick: 480,
              deltaMs: 0,
              element: 'snare',
              verdict: 'wrong',
              velocity: 92,
              expectedTick: 480,
              actualTick: 492,
              expectedElement: 'kick',
              actualElement: 'snare',
            },
          ],
        },
      ],
      archive: emptyArchive(),
    });
  });

  it('commits summary, archive, and detail evidence in one consistent snapshot', () => {
    const existing = Array.from(
      { length: MAX_STORED_RUNS_PER_SONG },
      (_, index) => evidenceSummary(index, '2026-07-01T12:00:00.000Z'),
    );
    const existingFullRun = {
      summary: existing[existing.length - 1],
      records: [fakeRecord(240)],
    };

    storeHolder.current = makeStore({
      practiceRuns: {
        'song-1': existing,
        'other-song': [fakeSummary(0.4)],
      },
      practiceRunArchive: {
        'song-1': emptyArchive(),
        'other-song': emptyArchive(),
      },
      practiceRunDetails: {
        'song-1': [existingFullRun],
        'other-song': [],
      },
    });

    const event = makeEvent();
    const summary = evidenceSummary(99, '2026-08-10T12:00:00.000Z');

    savePracticeRun(event as never, {
      songId: 'song-1',
      summary,
      records: [fakeRecord(960)],
    });

    expect(storeSetControl.calls).toHaveLength(1);
    expect(Object.keys(storeSetControl.calls[0])).toEqual([
      'practiceRuns',
      'practiceRunArchive',
      'practiceRunDetails',
    ]);

    const runs = storeHolder.current.get('practiceRuns.song-1') as RunSummary[];
    const archive = storeHolder.current.get(
      'practiceRunArchive.song-1',
    ) as PracticeRunArchive;
    const fullRuns = storeHolder.current.get(
      'practiceRunDetails.song-1',
    ) as StoredPracticeRun[];

    expect(runs).toEqual([...existing.slice(1), summary]);
    expect(archive.days['2026-07-01']).toMatchObject({ runCount: 1 });
    expect(fullRuns).toEqual([
      existingFullRun,
      {
        summary,
        records: [
          {
            tick: 960,
            deltaMs: -12,
            element: 'snare',
            verdict: 'hit',
            velocity: 92,
          },
        ],
      },
    ]);
    expect(lastReply(event, 'save-practice-run')!.args[0]).toEqual({
      songId: 'song-1',
      runs,
      fullRuns,
      archive,
    });
    expect(storeHolder.current.get('practiceRuns.other-song')).toEqual([
      fakeSummary(0.4),
    ]);
    expect(storeHolder.current.get('practiceRunArchive.other-song')).toEqual(
      emptyArchive(),
    );
    expect(storeHolder.current.get('practiceRunDetails.other-song')).toEqual(
      [],
    );
  });

  it('leaves all evidence unchanged on a failed snapshot write and converges on retry', () => {
    const existing = Array.from(
      { length: MAX_STORED_RUNS_PER_SONG },
      (_, index) => evidenceSummary(index, '2026-07-02T12:00:00.000Z'),
    );
    const initialState = {
      practiceRuns: { 'song-1': existing },
      practiceRunArchive: { 'song-1': emptyArchive() },
      practiceRunDetails: { 'song-1': [] },
    };
    const summary = evidenceSummary(100, '2026-08-10T13:00:00.000Z');
    const payload = {
      songId: 'song-1',
      summary,
      records: [fakeRecord(1440)],
    };

    storeHolder.current = makeStore(initialState);

    const beforeFailure = structuredClone(storeHolder.current.data);
    const failedEvent = makeEvent();

    storeSetControl.failNext = new Error('injected snapshot write failure');
    savePracticeRun(failedEvent as never, payload);

    expect(storeSetControl.calls).toHaveLength(1);
    expect(storeSetControl.calls[0]).not.toEqual(expect.any(String));
    expect(storeHolder.current.data).toEqual(beforeFailure);
    expect(lastReply(failedEvent, 'save-practice-run')!.args[0]).toEqual({
      error: 'injected snapshot write failure',
    });

    const retryEvent = makeEvent();

    savePracticeRun(retryEvent as never, payload);

    expect(storeSetControl.calls).toHaveLength(2);

    const retryState = structuredClone(storeHolder.current.data);
    const retryReply = lastReply(retryEvent, 'save-practice-run')!.args[0];

    storeHolder.current = makeStore(initialState);

    const cleanEvent = makeEvent();

    savePracticeRun(cleanEvent as never, payload);

    expect(storeHolder.current.data).toEqual(retryState);
    expect(lastReply(cleanEvent, 'save-practice-run')!.args[0]).toEqual(
      retryReply,
    );
  });

  it('round-trips versioned run context without changing legacy summary fields', () => {
    storeHolder.current = makeStore({});

    const summary: RunSummary = {
      ...fakeSummary(0.75),
      mode: 'practice',
      context: {
        sessionId: 'run-v2',
        schemaVersion: 2,
        appVersion: '1.2.0-kb.1',
        scoringPolicyVersion: 'judge-resolved-v2',
        startedAt: '2026-08-01T00:00:00.000Z',
        chartRevision: 'song-1:expert:v1',
        deviceId: 'yamaha-dtx402',
        deviceName: 'Yamaha DTX402',
        inputLatencyMs: 12,
        inputMapping: { snare: ['midi:38'], kick: ['midi:36'] },
      },
    };

    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary,
      records: [fakeRecord(480)],
    });

    const event = makeEvent();

    loadPracticeRuns(event as never, 'song-1');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toMatchObject({
      runs: [summary],
      fullRuns: [{ summary }],
    });
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

  it('archives every evicted summary without losing its statistical evidence', () => {
    const existing = Array.from({ length: MAX_STORED_RUNS_PER_SONG }, (_, i) =>
      evidenceSummary(i, '2024-01-05T12:00:00.000Z'),
    );

    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': existing },
    });

    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary: evidenceSummary(50, '2026-08-01T12:00:00.000Z'),
    });

    const event = makeEvent();
    const newest = evidenceSummary(51, '2026-08-02T12:00:00.000Z');

    savePracticeRun(event as never, { songId: 'song-1', summary: newest });

    const stored = storeHolder.current.get(
      'practiceRuns.song-1',
    ) as RunSummary[];

    expect(stored).toHaveLength(MAX_STORED_RUNS_PER_SONG);
    expect(stored[0]).toEqual(existing[2]);
    expect(stored[stored.length - 1]).toEqual(newest);

    const archive = storeHolder.current.get('practiceRunArchive.song-1') as {
      schemaVersion: number;
      days: Record<
        string,
        {
          runCount: number;
          totalHits: number;
          totalMisses: number;
          totalWrong: number;
          overallAccuracySum: number;
          bestStreak: number;
          timing: { sampleCount: number; totalDeltaMs: number };
          lanes: Record<
            string,
            { hits: number; misses: number; totalDeltaMs: number }
          >;
          wrongHits: Record<string, number>;
          modes: Record<string, number>;
          difficulties: Record<string, number>;
        }
      >;
    };
    const archivedDay = archive.days['2024-01-05'];
    const evicted = existing.slice(0, 2);

    expect(archive.schemaVersion).toBe(1);
    expect(archivedDay).toMatchObject({
      runCount: 2,
      totalHits: evicted[0].totalHits + evicted[1].totalHits,
      totalMisses: evicted[0].totalMisses + evicted[1].totalMisses,
      totalWrong: evicted[0].totalWrong + evicted[1].totalWrong,
      overallAccuracySum:
        evicted[0].overallAccuracy + evicted[1].overallAccuracy,
      bestStreak: evicted[1].bestStreak,
      timing: {
        sampleCount:
          evicted[0].timingBias.sampleCount + evicted[1].timingBias.sampleCount,
        totalDeltaMs:
          evicted[0].timingBias.meanMs * evicted[0].timingBias.sampleCount +
          evicted[1].timingBias.meanMs * evicted[1].timingBias.sampleCount,
      },
      lanes: {
        snare: {
          hits:
            evicted[0].laneAccuracy[0].hits + evicted[1].laneAccuracy[0].hits,
          misses:
            evicted[0].laneAccuracy[0].misses +
            evicted[1].laneAccuracy[0].misses,
          totalDeltaMs:
            evicted[0].laneBias[0].meanMs * evicted[0].laneBias[0].sampleCount +
            evicted[1].laneBias[0].meanMs * evicted[1].laneBias[0].sampleCount,
        },
      },
      wrongHits: { kick: 3 },
      modes: { practice: 2 },
      difficulties: { hard: 2 },
    });
    expect(stored.length + archivedDay.runCount).toBe(52);

    const loadEvent = makeEvent();

    loadPracticeRuns(loadEvent as never, 'song-1');

    expect(lastReply(loadEvent, 'load-practice-runs')!.args[0]).toMatchObject({
      songId: 'song-1',
      runs: stored,
      archive: {
        schemaVersion: 1,
        days: { '2024-01-05': { runCount: 2 } },
      },
    });
  });

  it('folds multiple evictions on the same day into one deterministic bucket', () => {
    const existing = Array.from({ length: MAX_STORED_RUNS_PER_SONG }, (_, i) =>
      evidenceSummary(i, '2021-11-09T09:00:00.000Z'),
    );

    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': existing },
    });

    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary: evidenceSummary(50, '2026-08-01T12:00:00.000Z'),
    });
    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary: evidenceSummary(51, '2026-08-02T12:00:00.000Z'),
    });

    const archive = storeHolder.current.get('practiceRunArchive.song-1') as {
      days: Record<string, { runCount: number; totalHits: number }>;
    };

    expect(Object.keys(archive.days)).toEqual(['2021-11-09']);
    expect(archive.days['2021-11-09']).toMatchObject({
      runCount: 2,
      totalHits: existing[0].totalHits + existing[1].totalHits,
    });
  });

  it('keeps separate, chronologically ordered archive buckets across years', () => {
    const existing = Array.from({ length: MAX_STORED_RUNS_PER_SONG }, (_, i) =>
      evidenceSummary(i, '2026-01-01T12:00:00.000Z'),
    );

    existing[0] = evidenceSummary(0, '2020-02-29T12:00:00.000Z');
    existing[1] = evidenceSummary(1, '2024-12-31T12:00:00.000Z');
    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': existing },
    });

    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary: evidenceSummary(50, '2026-08-01T12:00:00.000Z'),
    });
    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary: evidenceSummary(51, '2026-08-02T12:00:00.000Z'),
    });

    const archive = storeHolder.current.get('practiceRunArchive.song-1') as {
      days: Record<string, { runCount: number }>;
    };

    expect(Object.keys(archive.days)).toEqual(['2020-02-29', '2024-12-31']);
    expect(Object.values(archive.days).map(({ runCount }) => runCount)).toEqual(
      [1, 1],
    );
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
  it('loads legacy electron-store histories with an empty versioned archive', () => {
    const runs = [fakeSummary(0.5), fakeSummary(0.75)];

    storeHolder.current = makeStore({ practiceRuns: { 'song-1': runs } });

    const event = makeEvent();

    loadPracticeRuns(event as never, 'song-1');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toEqual({
      songId: 'song-1',
      runs,
      fullRuns: [],
      archive: emptyArchive(),
    });
  });

  it('loads legacy detailed records without adding judge attribution fields', () => {
    const summary = fakeSummary(0.75);
    const legacyRecord = {
      tick: 480,
      deltaMs: 0,
      element: 'snare',
      verdict: 'wrong' as const,
    };

    storeHolder.current = makeStore({
      practiceRuns: { 'song-1': [summary] },
      practiceRunDetails: {
        'song-1': [{ summary, records: [legacyRecord] }],
      },
    });

    const event = makeEvent();

    loadPracticeRuns(event as never, 'song-1');

    expect(lastReply(event, 'load-practice-runs')!.args[0]).toEqual({
      songId: 'song-1',
      runs: [summary],
      fullRuns: [{ summary, records: [legacyRecord] }],
      archive: emptyArchive(),
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
      archive: emptyArchive(),
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

describe('practice attempt checkpoints', () => {
  it('loads legacy compact records without adding future judge fields', () => {
    const legacyRecord = {
      tick: 480,
      deltaMs: 0,
      element: 'snare',
      verdict: 'wrong' as const,
    };

    storeHolder.current = makeStore({
      practiceAttemptCheckpoints: {
        'song-1': [
          {
            schemaVersion: 1,
            state: 'in-progress',
            songId: 'song-1',
            sessionId: 'legacy-attempt',
            startedAt: '2026-08-09T23:59:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
            chartRevision: 'chart-revision-1',
            mode: 'practice',
            difficulty: 'expert',
            playbackSpeed: 0.8,
            positionTick: 960,
            records: [legacyRecord],
          },
        ],
      },
    });

    const event = makeEvent();

    loadPracticeAttemptCheckpoints(event as never, 'song-1');

    expect(
      lastReply(event, 'load-practice-attempt-checkpoints')!.args[0],
    ).toEqual({
      songId: 'song-1',
      checkpoints: [
        expect.objectContaining({
          sessionId: 'legacy-attempt',
          records: [legacyRecord],
        }),
      ],
    });
  });

  it('upserts an in-progress attempt without manufacturing a completed run', () => {
    storeHolder.current = makeStore({});

    const firstEvent = makeEvent();

    savePracticeAttemptCheckpoint(
      firstEvent as never,
      fakeCheckpoint('attempt-1'),
    );

    expect(storeHolder.current.get('practiceRuns.song-1')).toBeUndefined();
    expect(
      storeHolder.current.get('practiceRunDetails.song-1'),
    ).toBeUndefined();
    expect(
      storeHolder.current.get('practiceAttemptCheckpoints.song-1'),
    ).toEqual([
      expect.objectContaining({
        state: 'in-progress',
        sessionId: 'attempt-1',
        records: [
          {
            tick: 480,
            deltaMs: -12,
            element: 'snare',
            verdict: 'hit',
            velocity: 92,
          },
        ],
      }),
    ]);

    const updateEvent = makeEvent();
    const updated = fakeCheckpoint('attempt-1', '2026-08-10T00:01:00.000Z');

    updated.checkpoint.positionTick = 1_920;
    updated.checkpoint.records = [fakeRecord(480), fakeRecord(960)];
    savePracticeAttemptCheckpoint(updateEvent as never, updated);

    expect(
      storeHolder.current.get('practiceAttemptCheckpoints.song-1'),
    ).toEqual([
      expect.objectContaining({
        sessionId: 'attempt-1',
        positionTick: 1_920,
        records: expect.arrayContaining([
          expect.objectContaining({ tick: 480 }),
          expect.objectContaining({ tick: 960 }),
        ]),
      }),
    ]);
    expect(
      lastReply(updateEvent, 'save-practice-attempt-checkpoint')!.args[0],
    ).toMatchObject({
      songId: 'song-1',
      checkpoints: [expect.objectContaining({ sessionId: 'attempt-1' })],
    });
  });

  it('keeps a bounded chronological recovery buffer per song', () => {
    storeHolder.current = makeStore({});

    for (
      let index = 0;
      index < MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG + 2;
      index += 1
    ) {
      const event = makeEvent();

      savePracticeAttemptCheckpoint(
        event as never,
        fakeCheckpoint(`attempt-${index}`, `2026-08-10T00:0${index}:00.000Z`),
      );
    }

    const checkpoints = storeHolder.current.get(
      'practiceAttemptCheckpoints.song-1',
    ) as { sessionId: string }[];

    expect(checkpoints).toHaveLength(MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG);
    expect(checkpoints.map(({ sessionId }) => sessionId)).toEqual(
      Array.from(
        { length: MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG },
        (_, index) => `attempt-${index + 2}`,
      ),
    );
  });

  it('loads interrupted evidence and clears only the finalized session', () => {
    storeHolder.current = makeStore({});
    savePracticeAttemptCheckpoint(
      makeEvent() as never,
      fakeCheckpoint('attempt-complete'),
    );
    savePracticeAttemptCheckpoint(
      makeEvent() as never,
      fakeCheckpoint('attempt-still-open', '2026-08-10T00:02:00.000Z'),
    );

    const loadEvent = makeEvent();

    loadPracticeAttemptCheckpoints(loadEvent as never, 'song-1');

    expect(
      lastReply(loadEvent, 'load-practice-attempt-checkpoints')!.args[0],
    ).toMatchObject({
      songId: 'song-1',
      checkpoints: [
        expect.objectContaining({ sessionId: 'attempt-complete' }),
        expect.objectContaining({ sessionId: 'attempt-still-open' }),
      ],
    });

    const finalizationEvent = makeEvent();

    finalizePracticeAttemptCheckpoint(finalizationEvent as never, {
      songId: 'song-1',
      sessionId: 'attempt-complete',
    });

    expect(
      storeHolder.current.get('practiceAttemptCheckpoints.song-1'),
    ).toEqual([expect.objectContaining({ sessionId: 'attempt-still-open' })]);
    expect(storeHolder.current.get('practiceRuns.song-1')).toBeUndefined();
    expect(
      lastReply(finalizationEvent, 'finalize-practice-attempt-checkpoint')!
        .args[0],
    ).toMatchObject({
      songId: 'song-1',
      checkpoints: [
        expect.objectContaining({ sessionId: 'attempt-still-open' }),
      ],
    });
  });

  it('can finalize an attempt atomically with its completed run', () => {
    storeHolder.current = makeStore({});
    savePracticeAttemptCheckpoint(
      makeEvent() as never,
      fakeCheckpoint('attempt-to-complete'),
    );

    const event = makeEvent();

    savePracticeRun(event as never, {
      songId: 'song-1',
      summary: fakeSummary(),
      records: [fakeRecord(480)],
      finalizeAttemptSessionId: 'attempt-to-complete',
    });

    expect(storeHolder.current.get('practiceRuns.song-1')).toEqual([
      fakeSummary(),
    ]);
    expect(
      storeHolder.current.get('practiceAttemptCheckpoints.song-1'),
    ).toEqual([]);
    expect(storeSetControl.calls.at(-1)).toEqual(
      expect.objectContaining({
        practiceRuns: expect.any(Object),
        practiceRunDetails: expect.any(Object),
        practiceAttemptCheckpoints: { 'song-1': [] },
      }),
    );
  });

  it('atomically retires both the resumed source and live run drafts', () => {
    storeHolder.current = makeStore({});
    savePracticeAttemptCheckpoint(
      makeEvent() as never,
      fakeCheckpoint('interrupted-source'),
    );
    savePracticeAttemptCheckpoint(
      makeEvent() as never,
      fakeCheckpoint('resumed-live-run'),
    );
    savePracticeAttemptCheckpoint(
      makeEvent() as never,
      fakeCheckpoint('unrelated-draft'),
    );

    savePracticeRun(makeEvent() as never, {
      songId: 'song-1',
      summary: fakeSummary(),
      records: [fakeRecord(480)],
      finalizeAttemptSessionIds: ['interrupted-source', 'resumed-live-run'],
    });

    expect(
      storeHolder.current.get('practiceAttemptCheckpoints.song-1'),
    ).toEqual([expect.objectContaining({ sessionId: 'unrelated-draft' })]);
  });
});
