import type { SkillEvidenceEvent } from './types';

interface TutorEvidenceInput {
  interventions?: readonly unknown[];
  recoveryAttempts?: readonly { result?: string }[];
}

interface CoachEvidenceInput {
  id?: string;
  resolved?: boolean;
  remediationLessonId?: string;
  barStart?: number;
  barEnd?: number;
}

export interface LearningEvidenceReceiptInput {
  atomicSkillEvidence?: readonly SkillEvidenceEvent[];
  timingWindowMs?: number;
  tutor?: TutorEvidenceInput;
  coachEvidence?: readonly CoachEvidenceInput[];
}

export interface LearningEvidenceReceipt {
  atomic: {
    recorded: number;
    acquisition: number;
    retention: number;
    transfer: number;
    observableSkillIds: readonly string[];
    normalizedTimingReceipts: number;
  };
  timing?: {
    windowMs: number;
    normalizedAtomicReceipts: number;
  };
  tutor?: {
    interventions: number;
    cleanAttempts: number;
    retryAttempts: number;
    deferredAttempts: number;
  };
  coach: {
    findings: number;
    unresolvedFindings: number;
    remediationLessonIds: readonly string[];
    barRanges: readonly string[];
  };
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function countByKind(
  events: readonly SkillEvidenceEvent[],
  kind: SkillEvidenceEvent['evidence_kind'],
): number {
  return events.filter((event) => event.evidence_kind === kind).length;
}

function barRange(finding: CoachEvidenceInput): string | undefined {
  return positiveFinite(finding.barStart) && positiveFinite(finding.barEnd)
    ? `${Math.trunc(finding.barStart)}–${Math.trunc(finding.barEnd)}`
    : undefined;
}

export function learningEvidenceReceipt(
  input: LearningEvidenceReceiptInput,
): LearningEvidenceReceipt {
  const events = input.atomicSkillEvidence ?? [];
  const normalizedTimingReceipts = events.filter(
    (event) =>
      positiveFinite(event.judging_window_ms) &&
      typeof event.normalized_timing_stability === 'number' &&
      Number.isFinite(event.normalized_timing_stability),
  ).length;
  const coachEvidence = input.coachEvidence ?? [];
  const attempts = input.tutor?.recoveryAttempts ?? [];
  const windowMs = input.timingWindowMs;

  return {
    atomic: {
      recorded: events.length,
      acquisition: countByKind(events, 'acquisition'),
      retention: countByKind(events, 'retention'),
      transfer: countByKind(events, 'transfer'),
      observableSkillIds: [
        ...new Set(
          events
            .map((event) => event.skill_id)
            .filter((skillId) => skillId.trim().length > 0),
        ),
      ].sort(),
      normalizedTimingReceipts,
    },
    ...(positiveFinite(windowMs)
      ? {
          timing: {
            windowMs,
            normalizedAtomicReceipts: normalizedTimingReceipts,
          },
        }
      : {}),
    ...(input.tutor
      ? {
          tutor: {
            interventions: input.tutor.interventions?.length ?? 0,
            cleanAttempts: attempts.filter(
              (attempt) => attempt.result === 'clean',
            ).length,
            retryAttempts: attempts.filter(
              (attempt) => attempt.result === 'retry',
            ).length,
            deferredAttempts: attempts.filter(
              (attempt) => attempt.result === 'deferred',
            ).length,
          },
        }
      : {}),
    coach: {
      findings: coachEvidence.length,
      unresolvedFindings: coachEvidence.filter(
        (finding) => finding.resolved !== true,
      ).length,
      remediationLessonIds: [
        ...new Set(
          coachEvidence
            .map((finding) => finding.remediationLessonId?.trim())
            .filter((lessonId): lessonId is string => Boolean(lessonId)),
        ),
      ].sort(),
      barRanges: [
        ...new Set(
          coachEvidence
            .map(barRange)
            .filter((range): range is string => range !== undefined),
        ),
      ].sort(),
    },
  };
}
