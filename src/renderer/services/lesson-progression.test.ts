import { describe, expect, it } from 'vitest';
import type { LessonEntry, LessonProgress } from '../hooks/useLessons';
import { decideLessonProgression, makeLessonsOpen } from './lesson-progression';

const score = { hitNotes: 9, totalNotes: 10, falseHits: 0 };
const completeTargetSpeedTraversal = {
  startedAtBeginning: true,
  uninterrupted: true,
  minimumPlaybackSpeed: 1,
};

function makeEntry(id: string, unlocked: boolean): LessonEntry {
  return {
    song: { id } as LessonEntry['song'],
    lesson: { id } as LessonEntry['lesson'],
    bestStars: 0,
    cleared: false,
    unlocked,
    clearsNeeded: unlocked ? 0 : 1,
  };
}

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

  it('opens all 170 lessons while retaining the authored next recommendation', () => {
    const entries = Array.from({ length: 170 }, (_, index) =>
      makeEntry(`lesson-${String(index + 1).padStart(3, '0')}`, index === 0),
    );
    const progress: LessonProgress = {
      entries,
      groups: [{ unit: 'Method', entries }],
      totalLessons: entries.length,
      unlockedCount: 1,
      totalStars: 0,
      clearedCount: 0,
      continueEntry: entries[0],
      nextLockedEntry: entries[1],
    };
    const open = makeLessonsOpen(progress);

    expect(open.unlockedCount).toBe(170);
    expect(open.entries.every((entry) => entry.unlocked)).toBe(true);
    expect(open.entries.every((entry) => entry.clearsNeeded === 0)).toBe(true);
    expect(open.continueEntry?.song.id).toBe('lesson-001');
    expect(open.nextLockedEntry).toBeUndefined();
    expect(progress.entries[169].unlocked).toBe(false);
  });
});
