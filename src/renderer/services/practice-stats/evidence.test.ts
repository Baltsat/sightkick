import { describe, expect, it } from 'vitest';
import { decideRunEvidence } from './evidence';
import { HitRecord } from './types';

const miss: HitRecord = {
  tick: 0,
  timeSeconds: 0,
  deltaMs: 0,
  element: 'snare',
  verdict: 'miss',
};
const wrong: HitRecord = {
  ...miss,
  verdict: 'wrong',
};
const hit: HitRecord = {
  ...miss,
  verdict: 'hit',
};

describe('decideRunEvidence', () => {
  it('drops an untouched autoplay whose only records are derived misses', () => {
    expect(
      decideRunEvidence({
        score: { hitNotes: 0, totalNotes: 8, falseHits: 0 },
        records: [miss],
        guidedReady: false,
      }),
    ).toEqual({
      hasIntent: false,
      persistEligible: false,
      rewardEligible: false,
    });
  });

  it('stores an all-wrong attempt without minting rewards', () => {
    expect(
      decideRunEvidence({
        score: { hitNotes: 0, totalNotes: 8, falseHits: 1 },
        records: [wrong, miss],
        guidedReady: false,
      }),
    ).toEqual({
      hasIntent: true,
      persistEligible: true,
      rewardEligible: false,
    });
  });

  it('stores a hands-free ready attempt even when the player then misses every note', () => {
    expect(
      decideRunEvidence({
        score: { hitNotes: 0, totalNotes: 8, falseHits: 0 },
        records: [miss],
        guidedReady: true,
      }),
    ).toEqual({
      hasIntent: true,
      persistEligible: true,
      rewardEligible: false,
    });
  });

  it('recognizes input archived before a tutor rewind without treating miss-only intervention data as intent', () => {
    const baseTutor = {
      settings: {
        enabled: true,
        autoRewind: true,
        livesEnabled: true,
        startingLives: 3,
        triggerAccuracy: 0.8,
        minimumResolvedEvents: 4,
        minimumDistinctErrors: 3,
        minimumRepeatedBarFailures: 2,
        minimumRepeatedBarErrors: 2,
        minimumRepeatedWrongPadPairs: 2,
        minimumTimingSamples: 4,
        minimumTimingOutliers: 2,
        timingSpreadThresholdMs: 65,
        cleanMinimumAccuracy: 0.9,
        cleanMinimumResolvedEvents: 4,
        cleanMaximumMisses: 0,
        cleanMaximumWrongHits: 0,
        requiredCleanRepetitions: 2,
        minimumSpeed: 0.5,
        speedStep: 0.1,
        maximumFailedRecoveryAttempts: 6,
        maximumCheckpointBars: 4,
        leadInBars: 1,
        contextBarsAfterFailure: 1,
      },
      recoveryAttempts: [],
    };
    const intervention = {
      id: 'intervention:1',
      trigger: {
        id: 'trigger:1',
        reason: 'three-distinct-errors' as const,
        stats: {
          startMeasure: 0,
          endMeasure: 1,
          expected: 8,
          resolved: 8,
          hits: 1,
          misses: 7,
          wrong: 0,
          distinctErrorIds: ['miss:1'],
          timingSampleCount: 0,
          timingSpreadMs: 0,
          timingOutlierCount: 0,
          wrongPadPairs: [],
          accuracy: 0.125,
          distinctMissIds: ['miss:1'],
        },
      },
      startedAtSpeed: 1,
      livesRemaining: 2,
    };

    expect(
      decideRunEvidence({
        score: { hitNotes: 0, totalNotes: 8, falseHits: 0 },
        records: [miss],
        guidedReady: false,
        tutor: {
          ...baseTutor,
          interventions: [
            {
              ...intervention,
              triggerJudgements: [
                {
                  id: 'note:0:c/5',
                  verdict: 'hit',
                  scoreable: true,
                },
              ],
            },
          ],
        },
      }).persistEligible,
    ).toBe(true);

    expect(
      decideRunEvidence({
        score: { hitNotes: 0, totalNotes: 8, falseHits: 0 },
        records: [miss],
        guidedReady: false,
        tutor: {
          ...baseTutor,
          interventions: [
            {
              ...intervention,
              triggerJudgements: [
                {
                  id: 'note:0:c/5',
                  verdict: 'miss',
                  scoreable: true,
                },
              ],
            },
          ],
        },
      }).persistEligible,
    ).toBe(false);
  });

  it('stores and rewards a run with an authoritative correct hit', () => {
    expect(
      decideRunEvidence({
        score: { hitNotes: 1, totalNotes: 8, falseHits: 0 },
        records: [hit, miss],
        guidedReady: false,
      }),
    ).toEqual({
      hasIntent: true,
      persistEligible: true,
      rewardEligible: true,
    });
  });
});
