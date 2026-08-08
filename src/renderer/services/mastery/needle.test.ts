import { describe, expect, it } from 'vitest';
import { computeMastery } from './mastery';
import { needleMoverLine } from './needle';
import { MasteryGoal } from './types';

const GOAL: MasteryGoal = { songId: 'song-1', difficulty: 'expert' };

describe('needleMoverLine', () => {
  it('prompts a first run when nothing has been considered yet', () => {
    const breakdown = computeMastery({ goal: GOAL, songRuns: [], allRuns: [] });

    expect(needleMoverLine(breakdown)).toMatch(/play a run/i);
  });

  it('names accuracy when it is the worst term', () => {
    const breakdown = computeMastery({
      goal: GOAL,
      songRuns: [
        {
          completedAt: '2026-01-01T00:00:00.000Z',
          totalHits: 10,
          totalMisses: 0,
          totalWrong: 0,
          overallAccuracy: 1,
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
          mode: 'practice',
          playbackSpeed: 0.5,
          difficulty: 'expert',
        },
      ],
      allRuns: [],
    });

    expect(needleMoverLine(breakdown)).toMatch(/accuracy at full speed/i);
  });
});
