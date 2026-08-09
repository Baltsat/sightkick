import { describe, expect, it } from 'vitest';
import {
  archiveRunSummaries,
  emptyPracticeRunArchive,
  RunSummary,
} from '../../renderer/services/practice-stats';
import { summarizeRetiredLessons } from './retiredLessons';

function run(): RunSummary {
  return {
    completedAt: '2026-08-01T10:00:00.000Z',
    totalHits: 8,
    totalMisses: 2,
    totalWrong: 0,
    overallAccuracy: 0.8,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 8,
      sampleCount: 8,
    },
    wrongHitCounts: [],
  };
}

describe('summarizeRetiredLessons', () => {
  it('keeps retired goals and every history tier readable without double-counting aliases', () => {
    const summary = run();
    const archive = archiveRunSummaries(emptyPracticeRunArchive(), [summary]);
    const lessons = summarizeRetiredLessons({
      retiredLessonSongs: {
        'legacy-storage': {
          id: 'legacy-song-id',
          dir: '/legacy/lesson',
          name: 'Lesson 05.06 — Roadhouse Cat',
          sk_lesson_id: '05.06',
          scoreData: {
            expert: { totalNotes: 100, hitNotes: 80, falseHits: 0 },
          },
        } as never,
      },
      practiceRuns: {
        'legacy-storage': [summary],
        'legacy-song-id': [summary],
      },
      practiceRunDetails: {
        'legacy-storage': [{ summary, records: [] }],
      },
      practiceRunArchive: {
        'legacy-storage': archive,
        'legacy-song-id': archive,
      },
      goals: [
        {
          id: 'retired-goal',
          songId: 'legacy-song-id',
          difficulty: 'expert',
          createdAt: '2026-08-01T00:00:00.000Z',
          isPrimary: true,
        },
      ],
    });

    expect(lessons).toEqual([
      {
        legacySongIds: ['legacy-song-id', 'legacy-storage'],
        lessonId: '05.06',
        name: 'Lesson 05.06 — Roadhouse Cat',
        bestStars: 4,
        recentRunCount: 1,
        fullRunCount: 1,
        archivedRunCount: 1,
        goalCount: 1,
      },
    ]);
  });
});
