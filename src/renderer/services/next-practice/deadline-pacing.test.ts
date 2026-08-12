import { describe, expect, it } from 'vitest';
import {
  DRUM_SKILL_AXES,
  DrumLearningProfile,
  DrumSkillAxisId,
} from '../learning-profile';
import {
  deadlinePacingForSkills,
  deriveDeadlinePacing,
} from './deadline-pacing';

const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const GOAL_DATE = '2026-09-10T12:00:00.000Z';

function fixtureProfile(
  overrides: Partial<Record<DrumSkillAxisId, number>> = {},
): DrumLearningProfile {
  return {
    axes: DRUM_SKILL_AXES.map((axis) => ({
      ...axis,
      score: overrides[axis.id] ?? 70,
      confidence: {
        level: 'medium',
        label: 'Medium confidence',
        evidenceCount: 4,
        evidenceWeight: 6,
        detail: 'Measured across four scored runs.',
      },
      trend: {
        direction: axis.id === 'hand-control' ? 'stable' : 'improving',
        delta: axis.id === 'hand-control' ? 0 : 5,
        detail: 'Fixture trend.',
      },
      limitingFactor: {
        key: 'fixture',
        label: 'Fixture',
        detail: 'Fixture evidence.',
        score: overrides[axis.id] ?? 70,
      },
    })),
    evidenceRuns: 4,
    computedThrough: '2026-08-27T10:00:00.000Z',
    strongestAxis: 'pulse-timing',
    focusAxis: 'hand-control',
  };
}

describe('deadline pacing', () => {
  it('derives prerequisite-ordered weekly targets from a measured eight-skill profile', () => {
    const pacing = deriveDeadlinePacing({
      goalDate: GOAL_DATE,
      learningProfile: fixtureProfile({ 'hand-control': 40 }),
      nowMs: NOW,
    });
    const handControl = pacing?.targets.find(
      ({ axisId }) => axisId === 'hand-control',
    );

    expect(pacing?.weeksRemaining).toBe(2);
    expect(pacing?.targets.map(({ axisId }) => axisId)).toEqual([
      'pulse-timing',
      'reading-subdivision',
      'hand-control',
      'foot-control',
      'limb-coordination',
      'dynamics-touch',
      'groove-pocket',
      'fills-kit-navigation',
    ]);
    expect(handControl).toMatchObject({
      prerequisiteAxisIds: ['pulse-timing'],
      currentScore: 40,
      deadlineTarget: 80,
      weeklyTarget: 60,
      behindBy: 20,
      weeklyTargets: [
        { week: 1, dueDate: '2026-09-03', targetScore: 60 },
        { week: 2, dueDate: '2026-09-10', targetScore: 80 },
      ],
      detail:
        '2 weeks left: Hand Control is 20 points behind its weekly target of 60/100. Its recent trend is stable.',
    });
    expect(deadlinePacingForSkills(['sixteenth-hihat'], pacing)).toMatchObject({
      axisId: 'hand-control',
      behindBy: 20,
      weeklyTarget: 60,
    });
  });

  it('returns no pacing when the goal or profile evidence cannot support it', () => {
    const profile = fixtureProfile({ 'hand-control': 40 });

    expect(
      deriveDeadlinePacing({
        goalDate: undefined,
        learningProfile: profile,
        nowMs: NOW,
      }),
    ).toBeUndefined();
    expect(
      deriveDeadlinePacing({
        goalDate: GOAL_DATE,
        learningProfile: { ...profile, evidenceRuns: 2 },
        nowMs: NOW,
      }),
    ).toBeUndefined();
  });
});
