import {
  TutorRunEvidence,
  RunLearningEvidence,
  RunLearningEvidenceCount,
} from './types';

type EvidenceCounterKey = keyof RunLearningEvidenceCount;

const TRIGGER_SKILL: Partial<Record<string, string>> = {
  'repeated-wrong-pad-pair': 'pad-accuracy',
  'timing-spread': 'timing',
};

function increment(
  target: Record<string, RunLearningEvidenceCount>,
  key: string,
  counter: EvidenceCounterKey,
): void {
  const current = target[key] ?? {};

  target[key] = {
    ...current,
    [counter]: (current[counter] ?? 0) + 1,
  };
}

function barNumbers(stats: {
  startMeasure: number;
  endMeasure: number;
}): number[] {
  if (
    !Number.isInteger(stats.startMeasure) ||
    !Number.isInteger(stats.endMeasure) ||
    stats.startMeasure < 0 ||
    stats.endMeasure < stats.startMeasure
  ) {
    return [];
  }

  return Array.from(
    { length: stats.endMeasure - stats.startMeasure + 1 },
    (_, index) => stats.startMeasure + index + 1,
  );
}

function normalizedSkillTags(tags: readonly string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()))]
    .filter(Boolean)
    .sort();
}

function rangesOverlap(
  left: { startMeasure: number; endMeasure: number },
  right: { startMeasure: number; endMeasure: number },
): boolean {
  return (
    left.startMeasure <= right.endMeasure &&
    right.startMeasure <= left.endMeasure
  );
}

/**
 * Builds compact evidence only from the Tutor's immutable intervention and
 * recovery records. It never examines aggregate accuracy or legacy summaries
 * to guess a bar. The caller supplies the current chart revision explicitly,
 * because bars have no durable meaning without that key.
 */
export function learningEvidenceForTutorRun({
  chartRevision,
  tutor,
  authoredSkills,
}: {
  chartRevision: string;
  tutor?: TutorRunEvidence;
  authoredSkills?: readonly string[];
}): RunLearningEvidence | undefined {
  if (!chartRevision.trim() || !tutor) {
    return undefined;
  }

  const skills: Record<string, RunLearningEvidenceCount> = {};
  const bars: Record<string, RunLearningEvidenceCount> = {};
  const authorSkills = normalizedSkillTags(authoredSkills);
  const interventionSkills = tutor.interventions.map((intervention) => [
    ...new Set([
      ...authorSkills,
      ...(TRIGGER_SKILL[intervention.trigger.reason]
        ? [TRIGGER_SKILL[intervention.trigger.reason]!]
        : []),
    ]),
  ]);

  tutor.interventions.forEach((intervention, index) => {
    const eventSkills = interventionSkills[index];

    eventSkills.forEach((skill) => increment(skills, skill, 'troubleCount'));
    barNumbers(intervention.trigger.stats).forEach((bar) =>
      increment(bars, String(bar), 'troubleCount'),
    );
  });

  tutor.recoveryAttempts.forEach((attempt) => {
    const recoveryCounter: EvidenceCounterKey =
      attempt.result === 'clean'
        ? 'recoveryCleanCount'
        : attempt.result === 'retry'
        ? 'recoveryRetryCount'
        : 'recoveryDeferredCount';
    const matchingInterventionSkills = tutor.interventions.flatMap(
      (intervention, index) =>
        rangesOverlap(intervention.trigger.stats, attempt.stats)
          ? interventionSkills[index]
          : [],
    );

    [...new Set(matchingInterventionSkills)].forEach((skill) =>
      increment(skills, skill, recoveryCounter),
    );
    barNumbers(attempt.stats).forEach((bar) =>
      increment(bars, String(bar), recoveryCounter),
    );
  });

  return Object.keys(skills).length > 0 || Object.keys(bars).length > 0
    ? {
        ...(Object.keys(skills).length > 0 ? { skills } : {}),
        ...(Object.keys(bars).length > 0 ? { bars } : {}),
      }
    : undefined;
}
