import {
  axesForDrumSkillTag,
  normalizeDrumSkillTag,
} from '../learning-profile';
import type {
  DrumLearningProfile,
  DrumSkillAxisId,
  DrumSkillAxisProfile,
  SkillTrendDirection,
} from '../learning-profile';
import type {
  CandidateDeadlinePacing,
  DeadlinePacingSummary,
  DeadlineSkillTarget,
  DeadlineWeeklyTarget,
} from './types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEADLINE_TARGET_SCORE = 80;
const MIN_PROFILE_EVIDENCE_RUNS = 3;
const MIN_AXIS_EVIDENCE_RUNS = 2;
const AXIS_PREREQUISITES: Readonly<
  Record<DrumSkillAxisId, readonly DrumSkillAxisId[]>
> = {
  'pulse-timing': [],
  'reading-subdivision': ['pulse-timing'],
  'hand-control': ['pulse-timing'],
  'foot-control': ['pulse-timing'],
  'limb-coordination': ['hand-control', 'foot-control'],
  'dynamics-touch': ['hand-control'],
  'groove-pocket': ['pulse-timing', 'limb-coordination'],
  'fills-kit-navigation': [
    'reading-subdivision',
    'hand-control',
    'limb-coordination',
  ],
};
const AXIS_ORDER: readonly DrumSkillAxisId[] = [
  'pulse-timing',
  'reading-subdivision',
  'hand-control',
  'foot-control',
  'limb-coordination',
  'dynamics-touch',
  'groove-pocket',
  'fills-kit-navigation',
];

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

function round(value: number): number {
  return Math.round(value);
}

function dateOnly(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function isUsableAxis(axis: DrumSkillAxisProfile): boolean {
  return (
    Number.isFinite(axis.score) &&
    axis.confidence.evidenceCount >= MIN_AXIS_EVIDENCE_RUNS &&
    axis.trend.direction !== 'unknown'
  );
}

function trendAdjustment(direction: SkillTrendDirection): number {
  if (direction === 'declining') {
    return 0.2;
  }

  return direction === 'stable' ? 0.1 : 0;
}

function targetForAxis(
  axis: DrumSkillAxisProfile,
  weeksRemaining: number,
  nowMs: number,
  deadlineMs: number,
): DeadlineSkillTarget {
  const currentScore = round(Math.min(Math.max(axis.score, 0), 100));
  const deadlineTarget = Math.max(DEADLINE_TARGET_SCORE, currentScore);
  const gain = deadlineTarget - currentScore;
  const weeklyTargets: DeadlineWeeklyTarget[] = Array.from(
    { length: weeksRemaining },
    (_, index) => {
      const week = index + 1;

      return {
        week,
        dueDate: dateOnly(Math.min(deadlineMs, nowMs + week * WEEK_MS)),
        targetScore: round(currentScore + (gain * week) / weeksRemaining),
      };
    },
  );
  const weeklyTarget = weeklyTargets[0].targetScore;
  const behindBy = Math.max(0, weeklyTarget - currentScore);
  const pacingValue = clamp01(
    behindBy / 20 + trendAdjustment(axis.trend.direction),
  );
  const detail = `${weeksRemaining} week${
    weeksRemaining === 1 ? '' : 's'
  } left: ${axis.label} is ${behindBy} point${
    behindBy === 1 ? '' : 's'
  } behind its weekly target of ${weeklyTarget}/100. Its recent trend is ${
    axis.trend.direction
  }.`;

  return {
    axisId: axis.id,
    label: axis.label,
    prerequisiteAxisIds: AXIS_PREREQUISITES[axis.id],
    currentScore,
    deadlineTarget,
    weeklyTargets,
    weeklyTarget,
    behindBy,
    pacingValue,
    trend: axis.trend.direction,
    trendDelta: Number.isFinite(axis.trend.delta) ? axis.trend.delta : 0,
    evidenceRuns: axis.confidence.evidenceCount,
    detail,
  };
}

export function deriveDeadlinePacing({
  goalDate,
  learningProfile,
  nowMs,
}: {
  goalDate?: string;
  learningProfile?: DrumLearningProfile;
  nowMs: number;
}): DeadlinePacingSummary | undefined {
  const deadlineMs = goalDate ? Date.parse(goalDate) : Number.NaN;

  if (
    !goalDate ||
    !learningProfile ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(deadlineMs) ||
    deadlineMs <= nowMs ||
    learningProfile.evidenceRuns < MIN_PROFILE_EVIDENCE_RUNS
  ) {
    return undefined;
  }

  const weeksRemaining = Math.max(1, Math.ceil((deadlineMs - nowMs) / WEEK_MS));
  const axisById = new Map(
    learningProfile.axes.filter(isUsableAxis).map((axis) => [axis.id, axis]),
  );
  const targets = AXIS_ORDER.flatMap((axisId) => {
    const axis = axisById.get(axisId);

    return axis ? [targetForAxis(axis, weeksRemaining, nowMs, deadlineMs)] : [];
  });

  if (targets.length === 0) {
    return undefined;
  }

  return { goalDate, weeksRemaining, targets };
}

function axesForSkills(skills: readonly string[]): DrumSkillAxisId[] {
  return [
    ...new Set(
      skills.flatMap((skill) => {
        const normalized = normalizeDrumSkillTag(skill);

        return AXIS_ORDER.includes(normalized as DrumSkillAxisId)
          ? [normalized as DrumSkillAxisId]
          : axesForDrumSkillTag(normalized);
      }),
    ),
  ];
}

export function deadlinePacingForSkills(
  skills: readonly string[],
  pacing: DeadlinePacingSummary | undefined,
): CandidateDeadlinePacing | undefined {
  if (!pacing || skills.length === 0) {
    return undefined;
  }

  const targetByAxis = new Map(
    pacing.targets.map((target) => [target.axisId, target]),
  );
  const target = axesForSkills(skills)
    .map((axisId) => targetByAxis.get(axisId))
    .filter((value): value is DeadlineSkillTarget => value !== undefined)
    .filter(({ behindBy }) => behindBy > 0)
    .sort(
      (left, right) =>
        right.pacingValue - left.pacingValue ||
        right.behindBy - left.behindBy ||
        left.axisId.localeCompare(right.axisId),
    )[0];

  return target
    ? {
        axisId: target.axisId,
        label: target.label,
        weeklyTarget: target.weeklyTarget,
        behindBy: target.behindBy,
        value: target.pacingValue,
        detail: target.detail,
      }
    : undefined;
}
