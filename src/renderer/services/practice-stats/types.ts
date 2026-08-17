import { Difficulty } from 'scan-chart';
import { InputMapping } from '../../../types';
import { GameMode } from '../../types';
import type {
  TutorIntervention,
  TutorRecoveryAttempt,
  TutorSettings,
} from '../tutor/types';
import type { SkillEvidenceEvent } from '../pedagogy/types';
import type {
  TimingLadderAction,
  TimingRunState,
  TimingWindowStandard,
} from '../adaptive-practice/types';

export const PRACTICE_RUN_SCHEMA_VERSION = 3;

/**
 * An incomplete, local-only capture of a practice attempt. It is deliberately
 * not a RunSummary: checkpoints never award XP, affect mastery, or appear in
 * completed-history analytics. Their sole job is to make the latest scored
 * evidence recoverable if the app closes, crashes, or the player walks away.
 */
export const PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION = 1;

/** Keep a small recovery buffer without allowing abandoned attempts to grow indefinitely. */
export const MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG = 3;

/**
 * Full hit evidence is still bounded while an attempt is open. This limit is
 * intentionally much larger than a normal song chart; it is a safety rail for
 * unusually long sessions, not a normal truncation policy.
 */
export const MAX_PRACTICE_ATTEMPT_RECORDS = 20_000;

export const MAX_PERSISTED_RUN_SECTIONS = 512;

export const SCORING_POLICY_VERSION = 'judge-evidence-v3';

/**
 * A drum-kit lane a hit record can be attributed to. Deliberately narrower
 * than the app-wide `InputElement` (which also covers non-kit controls like
 * `up`/`pause`) — practice analytics only ever score kit lanes.
 */
export type KitElement = keyof InputMapping;

export interface MidiInputTelemetry {
  rawMessageCount: number;
  lastMidiTimestamp?: number;
  selectedPortEpoch: number;
  lastMappedLane?: KitElement;
}

/** Outcome of a single scored input against the chart. */
export type HitVerdict = 'hit' | 'miss' | 'wrong';

/**
 * One scored event captured during a run.
 *
 * `deltaMs` is the signed actual-vs-expected timing offset in milliseconds
 * (negative = struck early, positive = struck late). It is only meaningful
 * for `verdict: 'hit'` records: a miss never had a strike to time, and a
 * wrong hit isn't matched to an expected note, so neither has a real
 * "expected" instant to compare against. Callers should pass `0` for those
 * two cases — every compute function in this module ignores `deltaMs` on
 * non-`'hit'` records regardless of its value.
 */
export interface HitRecord {
  tick: number;
  timeSeconds: number;
  deltaMs: number;
  element: KitElement;
  verdict: HitVerdict;
  velocity?: number;
  expectedTick?: number;
  actualTick?: number;
  expectedElement?: KitElement;
  actualElement?: KitElement;
}

export type StoredHitRecord = Pick<
  HitRecord,
  | 'tick'
  | 'deltaMs'
  | 'element'
  | 'verdict'
  | 'velocity'
  | 'expectedTick'
  | 'actualTick'
  | 'expectedElement'
  | 'actualElement'
>;

export interface LaneAccuracy {
  element: KitElement;
  hits: number;
  misses: number;
  /** hits / (hits + misses). Lane only appears when hits + misses > 0. */
  accuracy: number;
}

export interface LaneBias {
  element: KitElement;
  /** Mean signed deltaMs across this lane's 'hit' records. */
  meanMs: number;
  sampleCount: number;
}

export interface WrongHitCount {
  element: KitElement;
  count: number;
}

export interface TimingBiasStats {
  meanMs: number;
  medianMs: number;
  /** Population standard deviation of signed deltaMs across 'hit' records. */
  spreadMs: number;
  earlyCount: number;
  lateCount: number;
  onTimeCount: number;
  sampleCount: number;
}

export interface PracticeRunContext {
  sessionId: string;
  schemaVersion: number;
  appVersion: string;
  scoringPolicyVersion: string;
  startedAt: string;
  chartRevision: string;
  deviceId?: string;
  deviceName?: string;
  inputLatencyMs: number;
  inputMapping: InputMapping;
}

export type PracticeAttemptTermination =
  | 'natural-end'
  | 'in-progress'
  | 'abandoned';

export interface PracticeAttemptOutcome {
  completion: 'completed' | 'partial';
  termination: PracticeAttemptTermination;
  scope: 'full-chart' | 'loop-range';
  rangeStartTick?: number;
  rangeEndTick?: number;
}

export interface TutorRunEvidence {
  settings: TutorSettings;
  interventions: TutorIntervention[];
  recoveryAttempts: TutorRecoveryAttempt[];
}

/**
 * Optional compact learning evidence stamped by a chart-aware caller. It is
 * deliberately separate from raw hit records: older summaries did not carry
 * enough immutable bar/skill context to recreate it later, so consumers must
 * treat an absent value as unavailable rather than infer a trouble bar.
 */
export interface RunLearningEvidenceCount {
  troubleCount?: number;
  recoveryCleanCount?: number;
  recoveryRetryCount?: number;
  recoveryDeferredCount?: number;
}

export interface RunLearningEvidence {
  /** Controlled curriculum/Coach skill tags when the caller has them. */
  skills?: Record<string, RunLearningEvidenceCount>;
  /** One-based chart bar numbers when the chart revision and bar mapping exist. */
  bars?: Record<string, RunLearningEvidenceCount>;
}

export interface RunSectionEvidence {
  barStart: number;
  barEnd: number;
  startTick?: number;
  endTick?: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  expectedNotes: number;
  hits: number;
  misses: number;
  wrongHits: number;
  patternSignatures?: string[];
  patternSignature?: string;
  attempted?: boolean;
}

export interface PracticeCardRunEvidence {
  kind: 'review' | 'build' | 'apply';
  candidate_id: string;
  source_label: string;
}

export interface SongSectionAuditionEvidence {
  song_id: string;
  start_bar: number;
  end_bar: number;
  speed: number;
  section_label: string;
  test_label: string;
  required_skill_id: string;
}

/**
 * Compact, deterministic Coach evidence produced while the full hit records
 * for a newly finished run are still available. This is intentionally an
 * evidence summary rather than a reconstructed Coach card: old summaries do
 * not gain this field and consumers must not invent it for them.
 */
export interface PersistedCoachFindingEvidence {
  id: string;
  kind: string;
  severity: 'high' | 'medium' | 'low';
  skillTag: string;
  sampleCount: number;
  barStart?: number;
  barEnd?: number;
  lane?: KitElement;
  slowSpeed?: number;
  actualElement?: KitElement;
  expectedElement?: KitElement;
  /** Present only when the exact finding has an authored supported route. */
  remediationLessonId?: string;
  resolved?: boolean;
}

/**
 * Everything computed for one completed run. `completedAt` is supplied by
 * the caller (an ISO timestamp) — this module never touches the clock, so
 * the same input always produces the same output.
 *
 * `mode` and `playbackSpeed` are not computed here — `summarizeRun` stays a
 * pure function of `HitRecord[]`, which knows nothing about game mode or
 * player controls. SongView stamps both onto the summary it stores/sends,
 * additively, after `summarizeRun` returns it. They're optional so runs
 * persisted before this field existed still deserialize cleanly.
 */
export interface RunSummary {
  completedAt: string;
  totalHits: number;
  totalMisses: number;
  totalWrong: number;
  /** totalHits / (totalHits + totalMisses); 0 when there were no scoreable attempts. */
  overallAccuracy: number;
  laneAccuracy: LaneAccuracy[];
  laneBias: LaneBias[];
  timingBias: TimingBiasStats;
  wrongHitCounts: WrongHitCount[];
  /** Which mode this run was played in. Absent on runs stored before this
   * field existed. */
  mode?: GameMode;
  /** Playback speed the run was played at. Perform locks speed at 1x, so
   * a Perform run is always 1 here; Practice reflects whatever the player
   * had dialed in via the speed control at the moment the run ended. */
  playbackSpeed?: number;
  /** Difficulty the run was played at. Stamped on by SongView the same way
   * as `mode`/`playbackSpeed` (never computed by `summarizeRun`), so it's
   * optional for the same reason: runs persisted before this field existed
   * still deserialize cleanly, just without a known difficulty. Consumers
   * that need to scope run history to one difficulty (e.g. the mastery
   * model) should treat a missing value as "unknown" rather than assuming
   * any particular difficulty. */
  difficulty?: Difficulty;
  /** Highest consecutive-correct-hit streak reached during the run (the
   * in-play "STREAK/RAGE mode" HUD - see `services/streak`). Stamped on by
   * SongView the same way as `mode`/`playbackSpeed`/`difficulty` (never
   * computed by `summarizeRun`, which knows nothing about the streak
   * feature), so it's optional for the same reason: runs persisted before
   * this field existed still deserialize cleanly. Kept here (rather than
   * only living in-memory) so achievements/stats can use it later without
   * SongView having to re-derive it. */
  bestStreak?: number;
  /** Versioned, immutable context for reconstructing and migrating a run. */
  context?: PracticeRunContext;
  /** Whether this is a finished run or deliberately excluded partial evidence. */
  attemptOutcome?: PracticeAttemptOutcome;
  /** Practice-only intervention evidence captured before any rewind. */
  tutor?: TutorRunEvidence;
  /** Exact skill/bar evidence, only on runs where a chart-aware caller saved it. */
  learningEvidence?: RunLearningEvidence;
  /** Deterministic Coach/remediation evidence captured at run completion. */
  coachEvidence?: PersistedCoachFindingEvidence[];
  /** Source symmetric scoring window used for this run, in milliseconds. */
  timingWindowMs?: number;
  timingGapMs?: number;
  timingStandard?: TimingWindowStandard;
  timingLadderAction?: TimingLadderAction;
  effectiveTempoBpm?: number;
  timingNextRun?: TimingRunState;
  opening?: {
    playbackSpeed: number;
    timingStandard: 'target';
    timingWindowMs: number;
    timingGapMs: number;
    effectiveTempoBpm: number;
    demand: {
      tempoBpm: number;
      subdivision: string;
      gapMsAtOneX: number;
      notesPerBeat: number;
      maxSimultaneousNotes: number;
    };
    evidenceRunCount: number;
    reason: string;
  };
  /** Authored lesson skills stamped for longitudinal atomic-skill evidence. */
  authoredSkills?: string[];
  atomicSkillEvidence?: SkillEvidenceEvent[];
  sectionEvidence?: RunSectionEvidence[];
  practiceCard?: PracticeCardRunEvidence;
  audition?: SongSectionAuditionEvidence;
}

export interface RunTrendPoint {
  completedAt: string;
  accuracy: number;
  biasMeanMs: number;
}

export interface StoredPracticeRun {
  summary: RunSummary;
  records: StoredHitRecord[];
}

/**
 * Crash-recovery evidence for a run that has not reached its natural end.
 *
 * `state` is intentionally fixed to `in-progress`: a recovered checkpoint
 * must never be confused with a completed performance or silently promoted
 * into the completed run archive.
 */
export interface PracticeAttemptCheckpoint {
  schemaVersion: number;
  state: 'in-progress';
  songId: string;
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  chartRevision: string;
  mode: GameMode;
  difficulty: Difficulty;
  playbackSpeed: number;
  /** Authored chart position at the most recent durable checkpoint. */
  positionTick: number;
  /** The part of the chart the learner was working on when this was captured. */
  scope?: Pick<
    PracticeAttemptOutcome,
    'scope' | 'rangeStartTick' | 'rangeEndTick'
  >;
  /** Compact scored evidence observed so far, never a synthesized result. */
  records: StoredHitRecord[];
  midiTelemetry?: MidiInputTelemetry;
}

export type PracticeAttemptCheckpointBySong = Record<
  string,
  PracticeAttemptCheckpoint[]
>;
