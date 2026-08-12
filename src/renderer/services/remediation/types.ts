import type { CoachFinding, CoachSeverity, CoachSkillTag } from '../coach';

/**
 * This version is stored with every queue. Persisted remediation is deliberate
 * product state, so unknown versions are rejected rather than guessed at.
 */
export const REMEDIATION_QUEUE_VERSION = 1 as const;

/** Every task needs two good-enough learning passes before it can clear. */
export const REQUIRED_CONSECUTIVE_CLEAN_PASSES = 2;

export const MAX_REMEDIATION_BARS = 4;

/** Coach loops teach a pattern; they are not a zero-error audition. */
export const REMEDIATION_QUALITY_ACCURACY = 0.82;

export const REMEDIATION_NEAR_MISS_ACCURACY = 0.68;

/**
 * A conservative fallback when the chart caller has not supplied the exact
 * number of expected heads in the trouble-bar range.
 */
export const DEFAULT_MINIMUM_RESOLVED_NOTES = 4;

/** Coach loops start below full tempo unless the finding supplies a ramp. */
export const DEFAULT_REMEDIATION_SPEED = 0.7;

/**
 * Immutable identity of the completed run that opened this remediation path.
 * Keeping both ids lets the UI return to the original result even after the
 * player leaves the song and reopens the app.
 */
export interface RemediationSource {
  runId: string;
  sessionId: string;
  songId: string;
  chartRevision: string;
  completedAt: string;
}

export interface RemediationFindingReference {
  id: string;
  kind: CoachFinding['kind'];
  severity: CoachSeverity;
  skillTag: CoachSkillTag;
}

export type RemediationTaskStatus = 'pending' | 'active' | 'completed';

/** One observed loop pass, including failed evidence rather than only wins. */
export interface RemediationAttempt {
  completedAt: string;
  resolvedNotes: number;
  misses: number;
  wrongHits: number;
  /** Diagnostic fact, not the completion gate. */
  isErrorFree: boolean;
  /** Enough chart heads in this task's authored range were actually resolved. Zero is valid for an authored silent range. */
  hasSufficientCoverage: boolean;
  /** Coverage and the forgiving learning-quality gate were met. */
  qualifiesAsCleanPass: boolean;
  /** Retained whole-pass progress immediately after this attempt. */
  consecutiveCleanPassesAfter: number;
}

export interface RemediationTask {
  id: string;
  barStart: number;
  barEnd: number;
  findings: readonly RemediationFindingReference[];
  minimumResolvedNotes: number;
  /** Persisted so a reopened task resumes at the same authored tempo. */
  playbackSpeed: number;
  status: RemediationTaskStatus;
  /** Legacy field name; represents retained good-pass progress. */
  consecutiveCleanPasses: number;
  attempts: readonly RemediationAttempt[];
  completedAt?: string;
}

export type RemediationQueueStatus = 'active' | 'completed';

export interface RemediationQueue {
  version: typeof REMEDIATION_QUEUE_VERSION;
  id: string;
  source: RemediationSource;
  createdAt: string;
  status: RemediationQueueStatus;
  /** `tasks.length` once the final task is complete. */
  activeTaskIndex: number;
  tasks: readonly RemediationTask[];
  completedAt?: string;
}

export interface CreateRemediationQueueInput {
  source: RemediationSource;
  findings: readonly CoachFinding[];
  createdAt: string;
  /** Optional stable id; defaults to the source run identity. */
  id?: string;
  /**
   * The exact chart denominator is preferable. This callback is evaluated
   * only while the pure queue is created; its result is persisted in the
   * task, so reopening never depends on a live chart object.
   */
  minimumResolvedNotesForRange?: (
    barStart: number,
    barEnd: number,
    findings: readonly CoachFinding[],
  ) => number;
  playbackSpeedForRange?: (
    barStart: number,
    barEnd: number,
    findings: readonly CoachFinding[],
  ) => number;
}

export interface RecordRemediationPassInput {
  completedAt: string;
  resolvedNotes: number;
  misses: number;
  wrongHits: number;
}
