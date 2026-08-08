import { describe, expect, it } from 'vitest';
import { RunSummary } from '../practice-stats';
import { computeMastery } from './mastery';
import {
  MIN_POINTS_FOR_PROJECTION,
  masteryTimeline,
  projectMasteryTrend,
} from './timeline';
import { MasteryGoal } from './types';

function fakeRun(day: number, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    totalHits: 90,
    totalMisses: 10,
    totalWrong: 0,
    overallAccuracy: 0.9,
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
    playbackSpeed: 1,
    difficulty: 'expert',
    ...overrides,
  };
}

const GOAL: MasteryGoal = { songId: 'song-1', difficulty: 'expert' };

describe('masteryTimeline', () => {
  it('is empty with no runs', () => {
    expect(masteryTimeline({ goal: GOAL, songRuns: [], allRuns: [] })).toEqual(
      [],
    );
  });

  it('produces one point per scoped run, in chronological order', () => {
    const runs = [
      fakeRun(3, { overallAccuracy: 0.5 }),
      fakeRun(1, { overallAccuracy: 0.3 }),
      fakeRun(2, { overallAccuracy: 0.4 }),
    ];
    const timeline = masteryTimeline({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });

    expect(timeline.map((p) => p.completedAt)).toEqual([
      runs[1].completedAt,
      runs[2].completedAt,
      runs[0].completedAt,
    ]);
    expect(timeline.map((p) => p.runIndex)).toEqual([0, 1, 2]);
  });

  it("the last point's mastery equals a direct computeMastery call over the same full run set", () => {
    const runs = [
      fakeRun(1, { overallAccuracy: 0.6 }),
      fakeRun(2, { overallAccuracy: 0.8 }),
      fakeRun(3, { overallAccuracy: 1 }),
    ];
    const timeline = masteryTimeline({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });
    const direct = computeMastery({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });

    expect(timeline[timeline.length - 1].mastery).toBe(direct.mastery);
  });

  it('excludes runs outside the goal difficulty from the timeline', () => {
    const runs = [
      fakeRun(1, { difficulty: 'expert' }),
      fakeRun(2, { difficulty: 'hard' }),
    ];
    const timeline = masteryTimeline({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });

    expect(timeline).toHaveLength(1);
  });
});

describe('projectMasteryTrend', () => {
  it('projects nothing with fewer than MIN_POINTS_FOR_PROJECTION points', () => {
    const runs = Array.from({ length: MIN_POINTS_FOR_PROJECTION - 1 }, (_, i) =>
      fakeRun(i + 1, { overallAccuracy: 0.5 + i * 0.1 }),
    );
    const timeline = masteryTimeline({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });
    const projection = projectMasteryTrend(timeline);

    expect(projection.slopePerDay).toBe(0);
    expect(projection.projectedMasteryDate).toBeNull();
  });

  it('projects a future date for a clearly rising trend', () => {
    const runs = [1, 4, 7, 10, 13].map((day, i) =>
      fakeRun(day, {
        overallAccuracy: 0.5 + i * 0.1,
        playbackSpeed: 1,
        mode: 'perform',
      }),
    );
    const timeline = masteryTimeline({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });
    const projection = projectMasteryTrend(timeline);

    expect(projection.slopePerDay).toBeGreaterThan(0);
    expect(projection.projectedMasteryDate).not.toBeNull();
  });

  it('does not project a date for a flat trend', () => {
    const runs = [1, 4, 7, 10].map((day) =>
      fakeRun(day, { overallAccuracy: 0.5, playbackSpeed: 1, mode: 'perform' }),
    );
    const timeline = masteryTimeline({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });
    const projection = projectMasteryTrend(timeline);

    expect(projection.projectedMasteryDate).toBeNull();
  });

  it('computes a projected value at an explicit target date when given one', () => {
    const runs = [1, 4, 7, 10, 13].map((day, i) =>
      fakeRun(day, {
        overallAccuracy: 0.5 + i * 0.1,
        playbackSpeed: 1,
        mode: 'perform',
      }),
    );
    const timeline = masteryTimeline({
      goal: GOAL,
      songRuns: runs,
      allRuns: runs,
    });
    const projection = projectMasteryTrend(timeline, '2026-02-01');

    expect(projection.projectedMasteryAtTargetDate).toBeDefined();
    expect(projection.projectedMasteryAtTargetDate!).toBeGreaterThan(
      timeline[timeline.length - 1].mastery,
    );
  });
});
