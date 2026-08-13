import { ResolvedJudgement } from '../engine';

export type TutorPhase = 'off' | 'observing' | 'recovering' | 'complete';

export interface TutorSettings {
  enabled: boolean;
  autoRewind: boolean;
  livesEnabled: boolean;
  startingLives: number;
  triggerAccuracy: number;
  /** Minimum resolved chart-note outcomes before any interruption rule runs. */
  minimumResolvedEvents: number;
  /** At least this many distinct scoreable errors trigger a low-accuracy window. */
  minimumDistinctErrors: number;
  /** Two smaller failures of the same bar can also establish a pattern. */
  minimumRepeatedBarFailures: number;
  minimumRepeatedBarErrors: number;
  /** Repeated, matched actual-pad -> expected-pad pairs required for a route. */
  minimumRepeatedWrongPadPairs: number;
  /** Timing spread is considered only with this many real hit-timing samples. */
  minimumTimingSamples: number;
  /** A timing-spread trigger also needs more than one outlying hit. */
  minimumTimingOutliers: number;
  timingSpreadThresholdMs: number;
  /** Configurable clean-repetition predicate. */
  cleanMinimumAccuracy: number;
  cleanMinimumResolvedEvents: number;
  cleanMaximumMisses: number;
  cleanMaximumWrongHits: number;
  requiredCleanRepetitions: number;
  /**
   * A near-miss no longer erases all learning progress. Failed repetitions
   * retain this fraction of one earned quality repetition.
   */
  recoveryProgressRetention: number;
  /** Accuracy that earns a small tempo promotion when leaving recovery. */
  strongRecoveryAccuracy: number;
  minimumSpeed: number;
  speedStep: number;
  maximumFailedRecoveryAttempts: number;
  maximumCheckpointBars: number;
  leadInBars: number;
  contextBarsAfterFailure: number;
}

export const DEFAULT_TUTOR_SETTINGS: TutorSettings = {
  enabled: true,
  autoRewind: true,
  livesEnabled: false,
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
  recoveryProgressRetention: 0.5,
  strongRecoveryAccuracy: 0.97,
  minimumSpeed: 0.5,
  speedStep: 0.1,
  maximumFailedRecoveryAttempts: 6,
  maximumCheckpointBars: 4,
  leadInBars: 1,
  contextBarsAfterFailure: 1,
};

/**
 * Guided Practice deliberately waits for a sustained pattern before taking
 * over. The original defaults are retained for deterministic service tests
 * and advanced callers; the product surface applies this learner-facing
 * profile so an isolated timing cluster cannot trap a developing player in
 * recovery. Two good-enough repetitions establish retention, a near miss
 * keeps half of the earned progress, and the failed-attempt cap guarantees a
 * terminal path back to the song at the adapted tempo.
 */
export const GUIDED_PRACTICE_TUTOR_SETTINGS: Partial<TutorSettings> = {
  triggerAccuracy: 0.68,
  minimumResolvedEvents: 16,
  minimumDistinctErrors: 5,
  minimumRepeatedBarFailures: 3,
  minimumRepeatedBarErrors: 3,
  minimumRepeatedWrongPadPairs: 3,
  minimumTimingSamples: 8,
  minimumTimingOutliers: 3,
  timingSpreadThresholdMs: 90,
  // Guided Practice is a learning surface, not an audition. One miss in a
  // normal eight-to-sixteen-note phrase can still be a useful repetition.
  cleanMinimumAccuracy: 0.84,
  cleanMinimumResolvedEvents: 6,
  cleanMaximumMisses: 2,
  cleanMaximumWrongHits: 3,
  requiredCleanRepetitions: 2,
  recoveryProgressRetention: 0.5,
  strongRecoveryAccuracy: 0.94,
  speedStep: 0,
  maximumFailedRecoveryAttempts: 1,
};

export interface TutorMeasureSpec {
  index: number;
  startTick: number;
  endTick: number;
  expectedKeys: number;
  /** A known phrase/section boundary supplied by a chart or lesson author. */
  sectionStart?: boolean;
}

export interface TutorChartPlan {
  measures: TutorMeasureSpec[];
}

export interface TutorWindowStats {
  startMeasure: number;
  endMeasure: number;
  expected: number;
  resolved: number;
  hits: number;
  misses: number;
  wrong: number;
  /** Misses plus scoreable wrong hits, each counted by its immutable id. */
  distinctErrorIds: string[];
  timingSampleCount: number;
  timingSpreadMs: number;
  timingOutlierCount: number;
  wrongPadPairs: TutorWrongPadPair[];
  accuracy: number;
  distinctMissIds: string[];
}

export interface TutorWrongPadPair {
  actualElement: string;
  expectedElement: string;
  count: number;
}

/** Session-only count of weak completed bars. It is never carried to a new run. */
export type TutorBarFailureHistory = Record<number, number>;

export type TutorTriggerReason =
  | 'repeated-wrong-pad-pair'
  | 'three-distinct-errors'
  | 'repeated-same-bar-failure'
  | 'timing-spread';

export interface TutorTrigger {
  id: string;
  reason: TutorTriggerReason;
  stats: TutorWindowStats;
  repeatedBarCount?: number;
  wrongPadPair?: TutorWrongPadPair;
}

export interface TutorRecoveryRegion {
  startMeasure: number;
  endMeasure: number;
  startTick: number;
  endTick: number;
  resumeMeasure?: number;
  resumeTick?: number;
}

export type TutorRecoveryDeferralReason = 'maximum-failed-attempts';

export type TutorRecoveryAttemptResult = 'clean' | 'retry' | 'deferred';

export interface TutorRecoveryAttempt {
  id: string;
  recoveryId: string;
  repetition: number;
  speed: number;
  result: TutorRecoveryAttemptResult;
  /** Continuous 0..1 phrase quality used by the adaptive release UI. */
  qualityScore?: number;
  deferralReason?: TutorRecoveryDeferralReason;
  stats: TutorWindowStats;
  /** Immutable outcome timeline for this exact repetition. */
  judgements?: readonly Readonly<ResolvedJudgement>[];
}

export interface TutorRecovery {
  id: string;
  trigger: TutorTrigger;
  region: TutorRecoveryRegion;
  repetition: number;
  cleanRepetitions: number;
  /** Continuous retained progress toward `requiredCleanRepetitions`. */
  qualityProgress: number;
  /** Strongest observed phrase-quality score in this recovery. */
  bestQuality: number;
}

export interface TutorRecoveryOutcome {
  recoveryId: string;
  status: 'mastered' | 'deferred';
  startMeasure: number;
  endMeasure: number;
  cleanRepetitions: number;
  qualityProgress: number;
  bestQuality: number;
  resumeSpeed: number;
}

export interface TutorIntervention {
  id: string;
  trigger: TutorTrigger;
  /**
   * Detached, immutable evidence from the exact window that caused this
   * intervention. Absent only on records created before this field existed.
   * It deliberately includes non-scoreable context; detector thresholds still
   * use scoreable outcomes only, while Coach can explain what was actually
   * observed without depending on mutable replay state.
   */
  triggerJudgements?: readonly Readonly<ResolvedJudgement>[];
  region?: TutorRecoveryRegion;
  startedAtSpeed: number;
  livesRemaining: number;
}

export interface TutorState {
  phase: TutorPhase;
  settings: TutorSettings;
  targetSpeed: number;
  currentSpeed: number;
  livesRemaining: number;
  judgementsByMeasure: Record<number, ResolvedJudgement[]>;
  /** Kept in the reducer so repeated-bar evidence is deterministic and scoped to one run. */
  barFailureHistory: TutorBarFailureHistory;
  recovery?: TutorRecovery;
  /** Last terminal loop result remains visible after returning to the song. */
  lastRecoveryOutcome?: TutorRecoveryOutcome;
  interventions: TutorIntervention[];
  recoveryAttempts: TutorRecoveryAttempt[];
  nextSequence: number;
  lastCompletedMeasure: number;
  ignoreTriggersThroughMeasure: number;
}

export type TutorEvent =
  | { type: 'start'; targetSpeed: number }
  /**
   * The learner moved the speed control themselves, mid-run. Unlike `start`,
   * this must never wipe judgements/interventions/recoveryAttempts - it only
   * keeps the reducer's notion of "the real speed right now" honest so
   * messaging and evidence never contradict what is actually playing. See
   * useTutorSession's TutorSessionStore.syncTargetSpeed.
   */
  | { type: 'speed-changed'; speed: number }
  | { type: 'judgement'; judgement: ResolvedJudgement }
  | { type: 'measure-complete'; measureIndex: number }
  | { type: 'song-complete' }
  | { type: 'stop' };

export type TutorCommand =
  | {
      type: 'material-failure';
      trigger: TutorTrigger;
      livesRemaining: number;
    }
  | {
      type: 'begin-recovery';
      recovery: TutorRecovery;
      speed: number;
    }
  | {
      type: 'repeat-recovery';
      recovery: TutorRecovery;
      speed: number;
      attempt: TutorRecoveryAttempt;
    }
  | {
      type: 'resume-main';
      recoveryId: string;
      speed: number;
      reason: 'clean-repetitions' | TutorRecoveryDeferralReason;
      failedAttempts?: number;
      maximumFailedAttempts?: number;
      resumeMeasure?: number;
      resumeTick?: number;
      attempt: TutorRecoveryAttempt;
    }
  | { type: 'session-complete' };

export interface TutorTransition {
  state: TutorState;
  commands: TutorCommand[];
}
