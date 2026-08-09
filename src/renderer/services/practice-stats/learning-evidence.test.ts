import { describe, expect, it } from 'vitest';
import { DEFAULT_TUTOR_SETTINGS } from '../tutor';
import { TutorRunEvidence } from './types';
import { learningEvidenceForTutorRun } from './learning-evidence';

const stats = (startMeasure: number, endMeasure: number) => ({
  startMeasure,
  endMeasure,
  expected: 8,
  resolved: 8,
  hits: 2,
  misses: 6,
  wrong: 0,
  distinctErrorIds: [],
  timingSampleCount: 0,
  timingSpreadMs: 0,
  timingOutlierCount: 0,
  wrongPadPairs: [],
  accuracy: 0.25,
  distinctMissIds: [],
});

function tutorEvidence(): TutorRunEvidence {
  return {
    settings: DEFAULT_TUTOR_SETTINGS,
    interventions: [
      {
        id: 'intervention:1',
        trigger: {
          id: 'trigger:1',
          reason: 'timing-spread',
          stats: stats(2, 3),
        },
        startedAtSpeed: 0.8,
        livesRemaining: 2,
      },
    ],
    recoveryAttempts: [
      {
        id: 'attempt:1',
        recoveryId: 'recovery:1',
        repetition: 1,
        speed: 0.7,
        result: 'clean',
        stats: stats(2, 3),
      },
      {
        id: 'attempt:2',
        recoveryId: 'recovery:1',
        repetition: 2,
        speed: 0.7,
        result: 'retry',
        stats: stats(3, 3),
      },
    ],
  };
}

describe('learningEvidenceForTutorRun', () => {
  it('stamps authored/observed skills, exact one-based bars, and recovery outcomes', () => {
    expect(
      learningEvidenceForTutorRun({
        chartRevision: 'song-1:expert:chart-sha',
        tutor: tutorEvidence(),
        authoredSkills: ['fills'],
      }),
    ).toEqual({
      skills: {
        fills: {
          troubleCount: 1,
          recoveryCleanCount: 1,
          recoveryRetryCount: 1,
        },
        timing: {
          troubleCount: 1,
          recoveryCleanCount: 1,
          recoveryRetryCount: 1,
        },
      },
      bars: {
        '3': { troubleCount: 1, recoveryCleanCount: 1 },
        '4': { troubleCount: 1, recoveryCleanCount: 1, recoveryRetryCount: 1 },
      },
    });
  });

  it('does not manufacture evidence for legacy/no-Tutor summaries or unkeyed bars', () => {
    expect(
      learningEvidenceForTutorRun({ chartRevision: 'song-1:expert:chart-sha' }),
    ).toBeUndefined();
    expect(
      learningEvidenceForTutorRun({
        chartRevision: '',
        tutor: tutorEvidence(),
      }),
    ).toBeUndefined();
  });
});
