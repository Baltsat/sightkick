import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIpcMock, IpcMock } from '../test-support';
import { ScoreData, Song } from '../../../types';
import { RunSummary } from '../../services/practice-stats';
import { PracticeDays } from '../../services/streaks';
import { computeRunXp } from '../../services/xp';
import { GOAL_XP_BY_OPTION, useGamification } from './useGamification';

let ipc: IpcMock;

function song(extra: Partial<Song> = {}): Song {
  return {
    id: extra.id ?? 'song-1',
    dir: '/songs/song-1',
    name: 'Some Song',
    artist: 'Some Artist',
    album: 'Some Album',
    charter: 'Charter',
    genre: 'Metal',
    year: '2020',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 5,
    format: 'chart',
    audio: [],
    ...extra,
  };
}

function scoreForStars(stars: number): ScoreData {
  const accuracyByStars = [0.1, 0.3, 0.5, 0.7, 0.85, 1];

  return {
    hitNotes: Math.round(accuracyByStars[stars] * 100),
    totalNotes: 100,
    falseHits: 0,
  };
}

function fakeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: '2026-08-08T14:00:00.000Z',
    totalHits: 40,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 0.97,
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
    mode: 'perform',
    ...overrides,
  };
}

beforeEach(() => {
  ipc = installIpcMock();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 8, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mount / load', () => {
  it('requests practiceDays on mount and is not loaded until the reply lands', () => {
    const { result } = renderHook(() => useGamification([]));

    expect(ipc.sent).toEqual([{ channel: 'load-practice-days', args: [] }]);
    expect(result.current.isLoaded).toBe(false);
  });

  it('populates days and derived stats from the reply', () => {
    const { result } = renderHook(() => useGamification([]));
    const days: PracticeDays = {
      '2026-08-08': { runs: 1, stars: 2, minutes: 5, xp: 40 },
      '2026-08-07': { runs: 1, stars: 0, minutes: 3, xp: 10 },
    };

    act(() => {
      ipc.emit('load-practice-days', { days });
    });

    expect(result.current.isLoaded).toBe(true);
    expect(result.current.days).toEqual(days);
    expect(result.current.todayXp).toBe(40);
    expect(result.current.streak).toEqual({ current: 2, longest: 2 });
    expect(result.current.weekActivity[6]).toBe(true);
  });

  it('reflects goalOption -> goalXp via GOAL_XP_BY_OPTION and goalCrossedToday', () => {
    const { result } = renderHook(() => useGamification([]));

    act(() => {
      ipc.emit('load-practice-days', {
        days: { '2026-08-08': { runs: 1, stars: 0, minutes: 1, xp: 60 } },
      });
    });

    expect(result.current.goalXp).toBe(GOAL_XP_BY_OPTION.regular);
    expect(result.current.goalCrossedToday).toBe(true);

    act(() => {
      result.current.setGoalOption('intense');
    });

    expect(result.current.goalXp).toBe(GOAL_XP_BY_OPTION.intense);
    expect(result.current.goalCrossedToday).toBe(false);
  });

  it('derives totalStars from the songList prop, independent of the daily rollups', () => {
    const songList = [
      song({ id: 'a', scoreData: { expert: scoreForStars(5) } }),
      song({ id: 'b', scoreData: { expert: scoreForStars(3) } }),
    ];
    const { result } = renderHook(() => useGamification(songList));

    act(() => {
      ipc.emit('load-practice-days', { days: {} });
    });

    expect(result.current.totalStars).toBe(8);
  });

  it('stays in sync when another mounted instance broadcasts a record-practice-day reply', () => {
    const { result } = renderHook(() => useGamification([]));

    act(() => {
      ipc.emit('load-practice-days', { days: {} });
    });

    expect(result.current.todayXp).toBe(0);

    act(() => {
      ipc.emit('record-practice-day', {
        days: { '2026-08-08': { runs: 1, stars: 0, minutes: 4, xp: 25 } },
        wasFirstRunOfDay: true,
      });
    });

    expect(result.current.todayXp).toBe(25);
  });
});

describe('achievements', () => {
  it('is undefined until loadAchievements (or a recorded run) populates the cache', () => {
    const { result } = renderHook(() => useGamification([]));

    expect(result.current.achievements).toBeUndefined();
  });

  it('loadAchievements fetches every run and derives the full badge list', () => {
    const { result } = renderHook(() => useGamification([]));

    act(() => {
      result.current.loadAchievements();
    });

    expect(ipc.sent).toContainEqual({
      channel: 'load-all-practice-runs',
      args: [],
    });

    act(() => {
      ipc.emit('load-all-practice-runs', { runs: [fakeRun()] });
    });

    expect(result.current.achievements).toBeDefined();
    expect(result.current.achievements).toHaveLength(9);
    expect(
      result.current.achievements!.find((a) => a.id === 'first-blood')
        ?.unlocked,
    ).toBe(true);
    expect(
      result.current.achievements!.find((a) => a.id === 'century')?.unlocked,
    ).toBe(false);
  });
});

describe('recordRun', () => {
  it('sends record-practice-day with the computed XP and passed-through stars/minutes', () => {
    const { result } = renderHook(() => useGamification([]));

    act(() => {
      ipc.emit('load-practice-days', { days: {} });
    });

    act(() => {
      result.current.recordRun({
        totalHits: 40,
        overallAccuracy: 0.9,
        difficulty: 'hard',
        starsEarned: 4,
        minutes: 3.5,
      });
    });

    const expectedXp = computeRunXp({
      totalHits: 40,
      overallAccuracy: 0.9,
      difficulty: 'hard',
      isFirstRunOfDay: true,
    });

    expect(ipc.sent).toContainEqual({
      channel: 'record-practice-day',
      args: [{ date: '2026-08-08', xp: expectedXp, stars: 4, minutes: 3.5 }],
    });
  });

  it('reports goalCrossed only on the run that pushes today over the goal', () => {
    const { result } = renderHook(() => useGamification([]));

    act(() => {
      ipc.emit('load-practice-days', {
        days: { '2026-08-08': { runs: 1, stars: 0, minutes: 1, xp: 45 } },
      });
    });

    const onResult = vi.fn();

    act(() => {
      result.current.recordRun(
        {
          totalHits: 40,
          overallAccuracy: 1,
          difficulty: 'expert',
          starsEarned: 5,
          minutes: 2,
        },
        onResult,
      );
    });

    act(() => {
      ipc.emit('record-practice-day', {
        days: { '2026-08-08': { runs: 2, stars: 5, minutes: 3, xp: 130 } },
        wasFirstRunOfDay: false,
      });
    });

    act(() => {
      ipc.emit('load-all-practice-runs', { runs: [fakeRun()] });
    });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toMatchObject({ goalCrossed: true });

    // A second run the same (already-over-goal) day must not re-report it.
    onResult.mockClear();

    act(() => {
      result.current.recordRun(
        {
          totalHits: 10,
          overallAccuracy: 1,
          difficulty: 'expert',
          starsEarned: 5,
          minutes: 1,
        },
        onResult,
      );
    });

    act(() => {
      ipc.emit('record-practice-day', {
        days: { '2026-08-08': { runs: 3, stars: 10, minutes: 4, xp: 150 } },
        wasFirstRunOfDay: false,
      });
    });

    act(() => {
      ipc.emit('load-all-practice-runs', { runs: [fakeRun(), fakeRun()] });
    });

    expect(onResult.mock.calls[0][0]).toMatchObject({ goalCrossed: false });
  });

  it('reports a newly-unlocked achievement once, then stops repeating it on later runs', () => {
    const { result } = renderHook(() => useGamification([]));

    act(() => {
      ipc.emit('load-practice-days', { days: {} });
    });

    const onResult = vi.fn();

    act(() => {
      result.current.recordRun(
        {
          totalHits: 40,
          overallAccuracy: 1,
          difficulty: 'expert',
          starsEarned: 5,
          minutes: 2,
        },
        onResult,
      );
    });

    act(() => {
      ipc.emit('record-practice-day', {
        days: { '2026-08-08': { runs: 1, stars: 5, minutes: 2, xp: 100 } },
        wasFirstRunOfDay: true,
      });
    });

    act(() => {
      ipc.emit('load-all-practice-runs', { runs: [fakeRun()] });
    });

    const firstUnlocked = onResult.mock.calls[0][0].newlyUnlocked.map(
      (a: { id: string }) => a.id,
    );

    expect(firstUnlocked).toContain('first-blood');

    onResult.mockClear();

    act(() => {
      result.current.recordRun(
        {
          totalHits: 40,
          overallAccuracy: 1,
          difficulty: 'expert',
          starsEarned: 5,
          minutes: 2,
        },
        onResult,
      );
    });

    act(() => {
      ipc.emit('record-practice-day', {
        days: { '2026-08-08': { runs: 2, stars: 10, minutes: 4, xp: 200 } },
        wasFirstRunOfDay: false,
      });
    });

    act(() => {
      ipc.emit('load-all-practice-runs', { runs: [fakeRun(), fakeRun()] });
    });

    const secondUnlocked = onResult.mock.calls[0][0].newlyUnlocked.map(
      (a: { id: string }) => a.id,
    );

    expect(secondUnlocked).not.toContain('first-blood');
  });

  it('includes a nudge toward the closest locked achievement', () => {
    const { result } = renderHook(() => useGamification([]));

    act(() => {
      ipc.emit('load-practice-days', { days: {} });
    });

    const onResult = vi.fn();

    act(() => {
      result.current.recordRun(
        {
          totalHits: 40,
          overallAccuracy: 0.97,
          difficulty: 'expert',
          starsEarned: 0,
          minutes: 2,
        },
        onResult,
      );
    });

    act(() => {
      ipc.emit('record-practice-day', {
        days: { '2026-08-08': { runs: 1, stars: 0, minutes: 2, xp: 100 } },
        wasFirstRunOfDay: true,
      });
    });

    act(() => {
      const runs = Array.from({ length: 9 }, () =>
        fakeRun({ overallAccuracy: 0.97 }),
      );

      ipc.emit('load-all-practice-runs', { runs });
    });

    expect(onResult.mock.calls[0][0].nudge?.achievementId).toBe('perfect-10');
  });
});
