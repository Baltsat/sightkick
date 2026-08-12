/** Whether the player is working through authored instruction or a song. */
export type AdaptivePracticeKind = 'lesson' | 'song';

export type TimingWindowConfidence = 'none' | 'low' | 'medium' | 'high';

export type TimingWindowPhase =
  | 'starting'
  | 'developing'
  | 'calibrating'
  | 'tightening';

/**
 * Input is intentionally runtime-safe. Completed runs come from persisted
 * `RunSummary` values, but older or partially-written archives can contain
 * missing fields. The policy ignores evidence it cannot explain instead of
 * making a malformed value look like mastery.
 */
export interface AdaptiveTimingWindowInput {
  kind: AdaptivePracticeKind;
  runs?: readonly unknown[] | null;
  /** Defaults to six completed runs and is clamped to a small stable range. */
  recentRunLimit?: number;
}

export interface AdaptiveTimingEvidence {
  /** Runs with a valid 0..1 overall accuracy. */
  usableRuns: number;
  /** Runs that also contain a usable timing spread and sample count. */
  timedRuns: number;
  /** Recent, sufficiently sampled runs that meet the tightening standard. */
  highQualityRuns: number;
  weightedAccuracy?: number;
  weightedSpreadMs?: number;
}

export interface AdaptiveTimingWindowRecommendation {
  /** Symmetric early/late hit tolerance passed to the scoring engine. */
  timingWindowMs: number;
  confidence: TimingWindowConfidence;
  phase: TimingWindowPhase;
  /** Short, user-facing explanation of why this window was selected. */
  reason: string;
  evidence: AdaptiveTimingEvidence;
}
