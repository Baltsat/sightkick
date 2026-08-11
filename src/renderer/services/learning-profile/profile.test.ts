import { describe, expect, it } from 'vitest';
import { RunSummary } from '../practice-stats';
import {
  DRUM_SKILL_AXIS_IDS,
  axesForCoachSkillTag,
  axesForDrumSkillTag,
  buildDrumLearningProfile,
  drumSkillAxis,
} from '.';

function run(
  sequence: number,
  overrides: Partial<RunSummary> = {},
): RunSummary {
  return {
    completedAt: `2026-08-${String(sequence).padStart(2, '0')}T12:00:00.000Z`,
    totalHits: 80,
    totalMisses: 20,
    totalWrong: 2,
    overallAccuracy: 0.8,
    laneAccuracy: [
      { element: 'snare', hits: 45, misses: 5, accuracy: 0.9 },
      { element: 'kick', hits: 20, misses: 30, accuracy: 0.4 },
    ],
    laneBias: [],
    timingBias: {
      meanMs: 12,
      medianMs: 10,
      spreadMs: 42,
      earlyCount: 10,
      lateCount: 40,
      onTimeCount: 30,
      sampleCount: 80,
    },
    wrongHitCounts: [],
    mode: 'practice',
    playbackSpeed: 0.8,
    bestStreak: 18,
    ...overrides,
  };
}

describe('drum skill mappings', () => {
  it('maps controlled Coach tags and authored vocabulary onto stable axes', () => {
    expect(axesForCoachSkillTag('kick-independence')).toEqual([
      'foot-control',
      'limb-coordination',
    ]);
    expect(axesForDrumSkillTag('Sixteenth HiHat')).toEqual([
      'reading-subdivision',
      'hand-control',
    ]);
    expect(axesForDrumSkillTag('accented-paradiddle-grid')).toEqual(
      expect.arrayContaining(['hand-control', 'limb-coordination']),
    );
    expect(axesForDrumSkillTag('unknown-private-tag')).toEqual([]);
    expect(axesForDrumSkillTag(null)).toEqual([]);
  });
});

describe('buildDrumLearningProfile', () => {
  it('always returns the eight ordered, interpretable axes with bounded scores', () => {
    const profile = buildDrumLearningProfile([run(1)]);

    expect(profile.axes.map(({ id }) => id)).toEqual(DRUM_SKILL_AXIS_IDS);
    expect(profile.axes.map(({ label }) => label)).toEqual([
      'Pulse & Timing',
      'Reading & Subdivision',
      'Hand Control',
      'Foot Control',
      'Limb Coordination',
      'Dynamics & Touch',
      'Groove & Pocket',
      'Fills & Kit Navigation',
    ]);
    expect(profile.axes.every(({ score }) => score >= 0 && score <= 100)).toBe(
      true,
    );
  });

  it('identifies an evidenced kick weakness without claiming high confidence from one run', () => {
    const profile = buildDrumLearningProfile([run(1)]);
    const foot = drumSkillAxis(profile, 'foot-control')!;
    const hands = drumSkillAxis(profile, 'hand-control')!;

    expect(foot.score).toBeLessThan(hands.score);
    expect(foot.confidence).toMatchObject({
      level: 'low',
      label: 'Low confidence',
      evidenceCount: 1,
    });
    expect(foot.limitingFactor.key).toBe('lane-kick');
    expect(profile.focusAxis).toBe('foot-control');
  });

  it('uses timing, streak, learning, and persisted Coach evidence transparently', () => {
    const profile = buildDrumLearningProfile([
      run(1, {
        learningEvidence: {
          skills: {
            triplets: { troubleCount: 2, recoveryRetryCount: 2 },
            dynamics: { recoveryCleanCount: 3 },
          },
        },
        coachEvidence: [
          {
            id: 'kick-sensitivity',
            kind: 'speed-sensitivity',
            severity: 'high',
            skillTag: 'kick-independence',
            sampleCount: 24,
            lane: 'kick',
          },
        ],
      }),
    ]);
    const reading = drumSkillAxis(profile, 'reading-subdivision')!;
    const dynamics = drumSkillAxis(profile, 'dynamics-touch')!;
    const pulse = drumSkillAxis(profile, 'pulse-timing')!;

    expect(reading.limitingFactor.label).toMatch(/Trouble|Recovery/);
    expect(dynamics.score).toBeGreaterThan(50);
    expect(pulse.limitingFactor.label).toMatch(/Timing|Beat|Pulse/);
    expect(profile.evidenceRuns).toBe(1);
  });

  it('reports improving, stable, and unknown trends from chronological evidence', () => {
    const improving = buildDrumLearningProfile([
      run(1, {
        totalHits: 40,
        totalMisses: 60,
        timingBias: {
          meanMs: 45,
          medianMs: 42,
          spreadMs: 80,
          earlyCount: 0,
          lateCount: 40,
          onTimeCount: 0,
          sampleCount: 40,
        },
      }),
      run(2, {
        totalHits: 55,
        totalMisses: 45,
        timingBias: {
          meanMs: 32,
          medianMs: 30,
          spreadMs: 65,
          earlyCount: 0,
          lateCount: 55,
          onTimeCount: 0,
          sampleCount: 55,
        },
      }),
      run(3, {
        totalHits: 90,
        totalMisses: 10,
        timingBias: {
          meanMs: 5,
          medianMs: 4,
          spreadMs: 24,
          earlyCount: 15,
          lateCount: 20,
          onTimeCount: 55,
          sampleCount: 90,
        },
      }),
      run(4, {
        totalHits: 94,
        totalMisses: 6,
        timingBias: {
          meanMs: 2,
          medianMs: 1,
          spreadMs: 18,
          earlyCount: 20,
          lateCount: 20,
          onTimeCount: 54,
          sampleCount: 94,
        },
      }),
    ]);

    expect(drumSkillAxis(improving, 'pulse-timing')!.trend.direction).toBe(
      'improving',
    );
    expect(drumSkillAxis(improving, 'pulse-timing')!.confidence.level).toBe(
      'medium',
    );
    expect(drumSkillAxis(improving, 'dynamics-touch')!.trend.direction).toBe(
      'unknown',
    );
  });

  it('is safe for empty, legacy, and malformed serialized summaries', () => {
    const malformed = {
      completedAt: 'not-a-date',
      totalHits: Number.NaN,
      totalMisses: -40,
      totalWrong: Number.POSITIVE_INFINITY,
      overallAccuracy: 17,
      laneAccuracy: [null, { element: 'laser', accuracy: 4 }],
      laneBias: 'bad',
      timingBias: { meanMs: 'late', spreadMs: null, sampleCount: 30 },
      coachEvidence: [{ skillTag: {}, sampleCount: 'many' }],
      learningEvidence: { skills: { mystery: { troubleCount: 'x' } } },
    } as unknown as RunSummary;
    const profile = buildDrumLearningProfile([
      malformed,
      null as unknown as RunSummary,
    ]);
    const empty = buildDrumLearningProfile(undefined);

    expect(profile.axes).toHaveLength(8);
    expect(profile.axes.every(({ score }) => Number.isFinite(score))).toBe(
      true,
    );
    expect(profile.computedThrough).toBeUndefined();
    expect(empty.evidenceRuns).toBe(0);
    expect(empty.axes.every(({ score }) => score === 50)).toBe(true);
    expect(
      empty.axes.every(({ confidence }) => confidence.level === 'low'),
    ).toBe(true);
    expect(empty.axes[0].confidence.detail).toContain('Low confidence');
  });
});
