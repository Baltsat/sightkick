import { describe, expect, it } from 'vitest';
import { decideLessonProgression } from './lesson-progression';

const score = { hitNotes: 9, totalNotes: 10, falseHits: 0 };
const completeTargetSpeedTraversal = {
  startedAtBeginning: true,
  uninterrupted: true,
  minimumPlaybackSpeed: 1,
};

describe('lesson progression', () => {
  it('awards a star only for a full target-speed lesson Practice pass', () => {
    expect(
      decideLessonProgression({
        isLesson: true,
        gameMode: 'practice',
        traversal: completeTargetSpeedTraversal,
        score,
      }),
    ).toEqual({
      qualifies: true,
      fullCoverage: true,
      atTargetSpeed: true,
      meetsAccuracyTarget: true,
      accuracy: 0.9,
      starsEarned: 4,
    });
  });

  it.each([
    [
      'slow pass',
      true,
      'practice',
      { ...completeTargetSpeedTraversal, minimumPlaybackSpeed: 0.7 },
    ],
    [
      'mid-run slowdown',
      true,
      'practice',
      { ...completeTargetSpeedTraversal, minimumPlaybackSpeed: 0.9 },
    ],
    [
      'clicked-bar start',
      true,
      'practice',
      { ...completeTargetSpeedTraversal, startedAtBeginning: false },
    ],
    [
      'scrubbed or recovered run',
      true,
      'practice',
      { ...completeTargetSpeedTraversal, uninterrupted: false },
    ],
    ['ordinary song', false, 'practice', completeTargetSpeedTraversal],
    ['non-practice mode', true, 'perform', completeTargetSpeedTraversal],
  ] as const)(
    'keeps %s out of lesson progression',
    (_label, isLesson, gameMode, traversal) => {
      expect(
        decideLessonProgression({
          isLesson,
          gameMode,
          traversal,
          score,
        }).qualifies,
      ).toBe(false);
    },
  );

  it('keeps a complete target-speed pass below 90 percent out of progression', () => {
    expect(
      decideLessonProgression({
        isLesson: true,
        gameMode: 'practice',
        traversal: completeTargetSpeedTraversal,
        score: { hitNotes: 8, totalNotes: 10, falseHits: 0 },
      }),
    ).toMatchObject({
      qualifies: false,
      fullCoverage: true,
      atTargetSpeed: true,
      meetsAccuracyTarget: false,
      accuracy: 0.8,
    });
  });
});
