import type { RunSummary } from '../practice-stats';
import { skillNodeById } from '../pedagogy/skill-graph';
import type { SkillEvidenceKind } from '../pedagogy/types';
import type { PatternPlayerProfile } from '../pattern-model';
import type { StruggleReport } from '../struggle';

const MAX_TREND_RUNS = 8;

export interface RunInsightTrendPoint {
  completedAt: string;
  hitRate: number;
  playbackSpeed?: number;
}

export interface AtomicSkillMovement {
  skillId: string;
  label: string;
  family: string;
  movement: string;
  qualityPercent: number;
  positiveEvidence: number;
}

export interface RunInsights {
  current: {
    hitRatePercent: number;
    hits: number;
    misses: number;
    wrong: number;
    playbackSpeed?: number;
  };
  trend: {
    points: RunInsightTrendPoint[];
    summary: string;
  };
  skills: AtomicSkillMovement[];
}

export interface FocusSectionInsight {
  label: string;
  barStart: number;
  barEnd: number;
  tempoMultiplier: number;
  passCriteria: string;
  novel: boolean;
}

export interface LessonRecommendationInsight {
  lessonId: string;
  title?: string;
  family: string;
}

function movementLabel(kind: SkillEvidenceKind): string {
  if (kind === 'retention') {
    return 'Held on revisit';
  }

  if (kind === 'transfer') {
    return 'Carried into a new song';
  }

  return 'First evidence';
}

function rounded(value: number, places: number): number {
  const scale = 10 ** places;

  return Math.round(value * scale) / scale;
}

function runKey(run: RunSummary): string {
  return run.context?.sessionId ?? run.completedAt;
}

function recentRuns(
  current: RunSummary,
  history: readonly RunSummary[],
): RunSummary[] {
  const runs = new Map(history.map((run) => [runKey(run), run]));

  runs.set(runKey(current), current);

  return [...runs.values()]
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
    .slice(-MAX_TREND_RUNS);
}

function trendSummary(points: readonly RunInsightTrendPoint[]): string {
  if (points.length <= 1) {
    return 'First saved run — this is the baseline.';
  }

  const current = points.at(-1)?.hitRate ?? 0;
  const previous = points.at(-2)?.hitRate ?? 0;
  const delta = Math.round((current - previous) * 100);

  if (delta === 0) {
    return 'Level with the previous saved run.';
  }

  return `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(
    delta,
  )} points from the previous saved run.`;
}

function skillMovements(summary: RunSummary): AtomicSkillMovement[] {
  const nodes = skillNodeById();
  const bySkill = new Map<
    string,
    NonNullable<RunSummary['atomicSkillEvidence']>
  >();

  (summary.atomicSkillEvidence ?? []).forEach((event) => {
    bySkill.set(event.skill_id, [
      ...(bySkill.get(event.skill_id) ?? []),
      event,
    ]);
  });

  return [...bySkill.entries()].map(([skillId, events]) => {
    const node = nodes.get(skillId);
    const totalWeight = events.reduce((sum, event) => sum + event.weight, 0);
    const quality =
      events.reduce((sum, event) => sum + event.quality * event.weight, 0) /
      totalWeight;
    const positiveEvidence = events.reduce(
      (sum, event) => sum + event.weight * event.quality,
      0,
    );

    return {
      skillId,
      label: node?.label ?? skillId,
      family: node?.family ?? 'unclassified',
      movement: movementLabel(events[0].evidence_kind),
      qualityPercent: Math.round(quality * 100),
      positiveEvidence: rounded(positiveEvidence, 2),
    };
  });
}

export function buildRunInsights(
  current: RunSummary | undefined,
  history: readonly RunSummary[] = [],
): RunInsights | undefined {
  if (!current) {
    return undefined;
  }

  const points = recentRuns(current, history).map((run) => ({
    completedAt: run.completedAt,
    hitRate: run.overallAccuracy,
    playbackSpeed: run.playbackSpeed,
  }));

  return {
    current: {
      hitRatePercent: Math.round(current.overallAccuracy * 100),
      hits: current.totalHits,
      misses: current.totalMisses,
      wrong: current.totalWrong,
      playbackSpeed: current.playbackSpeed,
    },
    trend: {
      points,
      summary: trendSummary(points),
    },
    skills: skillMovements(current),
  };
}

export function recommendedReplaySpeed(
  summary: RunSummary | undefined,
): number | undefined {
  if (
    !summary ||
    summary.playbackSpeed === undefined ||
    summary.totalHits + summary.totalMisses < 4 ||
    summary.overallAccuracy > 0.15
  ) {
    return undefined;
  }

  const next = rounded(Math.max(0.3, summary.playbackSpeed - 0.1), 1);

  return next < summary.playbackSpeed ? next : undefined;
}

export function hasSectionCoverageMismatch(
  summary: RunSummary | undefined,
  focus: FocusSectionInsight | undefined,
): boolean {
  if (!summary || !focus || !summary.sectionEvidence?.length) {
    return false;
  }

  const sectionNotes = summary.sectionEvidence.reduce(
    (sum, section) => sum + section.expectedNotes,
    0,
  );

  return (
    sectionNotes > 0 &&
    sectionNotes < (summary.totalHits + summary.totalMisses) * 0.5
  );
}

export function recommendedActionReplaySpeed(
  summary: RunSummary | undefined,
  focus: FocusSectionInsight | undefined,
): number | undefined {
  return hasSectionCoverageMismatch(summary, focus)
    ? focus?.tempoMultiplier
    : recommendedReplaySpeed(summary);
}

export function focusSectionFromStruggle(
  report: StruggleReport | undefined,
): FocusSectionInsight | undefined {
  const section =
    report?.status === 'available' ? report.collapseSections[0] : undefined;

  if (!section) {
    return undefined;
  }

  const cleanPasses = section.drill.passCriteria.requiredConsecutiveCleanPasses;

  return {
    label:
      section.barStart === section.barEnd
        ? `Bar ${section.barStart}`
        : `Bars ${section.barStart}–${section.barEnd}`,
    barStart: section.barStart,
    barEnd: section.barEnd,
    tempoMultiplier: section.drill.tempoMultiplier,
    passCriteria: `Land ${
      section.drill.passCriteria.minimumResolvedNotes
    } notes at ${Math.round(
      section.drill.passCriteria.minimumAccuracy * 100,
    )}%+ for ${cleanPasses} clean pass${cleanPasses === 1 ? '' : 'es'}.`,
    novel: section.isNovel,
  };
}

export function lessonRecommendationsFromPatternProfile(
  profile: PatternPlayerProfile | undefined,
): LessonRecommendationInsight[] {
  if (!profile) {
    return [];
  }

  const ids = new Set<string>();

  return [...profile.families]
    .filter(({ coverage }) => coverage === 'played')
    .sort(
      (left, right) =>
        left.strength - right.strength ||
        left.family.label.localeCompare(right.family.label),
    )
    .flatMap(({ family }) =>
      family.lesson_ids.map((lessonId) => ({
        lessonId,
        family: family.label,
      })),
    )
    .filter(({ lessonId }) => {
      if (ids.has(lessonId)) {
        return false;
      }

      ids.add(lessonId);

      return true;
    })
    .slice(0, 2);
}

export type { PatternPlayerProfile, StruggleReport };
