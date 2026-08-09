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
