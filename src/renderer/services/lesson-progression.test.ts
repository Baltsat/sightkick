import { describe, expect, it } from 'vitest';
import { decideLessonProgression } from './lesson-progression';

const score = { hitNotes: 9, totalNotes: 10, falseHits: 0 };
const completeTargetSpeedTraversal = {
  startedAtBeginning: true,
  uninterrupted: true,
  minimumPlaybackSpeed: 1,
};

describe('lesson progression', () => {
  it('clears a complete good-enough lesson Practice pass', () => {
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
      meetsLearningTempo: true,
      meetsAccuracyTarget: true,
      accuracy: 0.9,
      starsEarned: 4,
    });
  });

  it.each([
    [
      'below learning tempo',
      true,
      'practice',
      { ...completeTargetSpeedTraversal, minimumPlaybackSpeed: 0.6 },
    ],
    [
      'clicked-bar start',
      true,
      'practice',
      { ...completeTargetSpeedTraversal, startedAtBeginning: false },
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

  it('allows Tutor recovery and an authored 0.7x start to advance learning', () => {
    expect(
      decideLessonProgression({
        isLesson: true,
        gameMode: 'practice',
        traversal: {
          ...completeTargetSpeedTraversal,
          minimumPlaybackSpeed: 0.7,
        },
        score: { hitNotes: 9, totalNotes: 10, falseHits: 1 },
      }),
    ).toMatchObject({
      qualifies: true,
      fullCoverage: true,
      atTargetSpeed: false,
      meetsLearningTempo: true,
      accuracy: 0.82,
    });
  });

  it('keeps a complete pass below 82 percent out of progression', () => {
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
      meetsLearningTempo: true,
      meetsAccuracyTarget: false,
      accuracy: 0.8,
    });
  });
});
