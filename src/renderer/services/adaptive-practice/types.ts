/** Whether the player is working through authored instruction or a song. */
export type AdaptivePracticeKind = 'lesson' | 'song';

export type TimingWindowConfidence = 'none' | 'low' | 'medium' | 'high';

export type TimingWindowStandard = 'target' | 'better' | 'ceiling';

export type TimingLadderAction =
  | 'hold'
  | 'tighten-window'
  | 'lower-tempo'
  | 'raise-tempo';

export interface TimingGrid {
  gapMs: number;
  effectiveTempoBpm?: number;
  subdivision?: string;
}

export interface TimingRunEvidence {
  overallAccuracy?: number;
  timingBias?: {
    spreadMs?: number;
    sampleCount?: number;
  };
  totalHits?: number;
  totalMisses?: number;
  totalWrong?: number;
  playbackSpeed?: number;
  completedAt?: string;
  timingStandard?: TimingWindowStandard;
  timingWindowMs?: number;
  timingGapMs?: number;
}

export interface TimingRunState {
  timingWindowMs: number;
  timingGapMs: number;
  timingStandard: TimingWindowStandard;
  playbackSpeed: number;
  effectiveTempoBpm?: number;
}

/**
 * Input is intentionally runtime-safe. Completed runs come from persisted
 * `RunSummary` values, but older or partially-written archives can contain
 * missing fields. The policy ignores evidence it cannot explain instead of
 * making a malformed value look like mastery.
 */
export interface AdaptiveTimingWindowInput {
  kind: AdaptivePracticeKind;
  grid?: TimingGrid;
  playbackSpeed?: number;
  runs?: readonly unknown[] | null;
  /** Defaults to six completed runs and is clamped to a small stable range. */
  recentRunLimit?: number;
}

export interface AdaptiveTimingEvidence {
  /** Runs with a valid 0..1 overall accuracy. */
  usableRuns: number;
  /** Runs that also contain a usable timing spread and sample count. */
  timedRuns: number;
  /** Recent, sufficiently sampled runs that meet the timing cleanliness rule. */
  highQualityRuns: number;
  weightedAccuracy?: number;
  weightedSpreadMs?: number;
}

export interface AdaptiveTimingWindowRecommendation extends TimingRunState {
  confidence: TimingWindowConfidence;
  ladderAction: TimingLadderAction;
  nextRun: TimingRunState;
  /** Short, user-facing explanation of why this pair was selected. */
  reason: string;
  evidence: AdaptiveTimingEvidence;
}
