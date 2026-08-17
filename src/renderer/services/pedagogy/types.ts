export const PEDAGOGY_POLICY_VERSION = 'pedagogy-v2.0';

export type EvidenceBoundary =
  | 'midi'
  | 'partial_midi'
  | 'self_report'
  | 'unsupported';

export type EdgeStrength = 'hard' | 'supporting' | 'transfer';

export interface SkillPrerequisite {
  id: string;
  strength: EdgeStrength;
}

export interface SkillNode {
  id: string;
  label: string;
  family: string;
  evidence_boundary: EvidenceBoundary;
  prerequisites: readonly SkillPrerequisite[];
  default_review_days: readonly number[];
}

export interface SkillDemand {
  skill_id: string;
  weight: number;
  target_bpm?: number;
  context: string;
}

export type ItemManifestSource =
  | 'curriculum'
  | 'chart_analysis'
  | 'manual_song_review';

export interface ItemSkillManifest {
  item_id: string;
  source: ItemManifestSource;
  source_revision: string;
  chart_revision?: string;
  demands: readonly SkillDemand[];
  context_signature: string;
  assessment_confidence: number;
  hard_prerequisite_confidence?: number;
  chart_total_notes?: number;
  section?: { start_bar: number; end_bar: number };
}

export interface ItemManifestValidation {
  valid: boolean;
  errors: readonly string[];
}

export type SkillStage =
  | 'unknown'
  | 'assessed'
  | 'provisional'
  | 'retained'
  | 'transferable';

export interface AtomicSkillState {
  skill_id: string;
  alpha: number;
  beta: number;
  effective_trials: number;
  best_supported_bpm?: number;
  last_acquisition_at?: string;
  last_retention_at?: string;
  last_transfer_at?: string;
  next_review_at?: string;
  stage: SkillStage;
  evidence_boundary: EvidenceBoundary;
}

export type SkillEvidenceKind = 'acquisition' | 'retention' | 'transfer';

export interface SkillEvidenceEvent {
  run_id: string;
  chart_revision: string;
  manifest_revision: string;
  skill_id: string;
  item_id: string;
  context_signature: string;
  evidence_kind: SkillEvidenceKind;
  quality: number;
  weight: number;
  playback_speed: number;
  completed_at: string;
  target_bpm?: number;
  scored_notes?: number;
  judging_window_ms?: number;
  raw_timing_spread_ms?: number;
  normalized_timing_stability?: number;
}

export interface AtomicEvidenceDerivation {
  events: readonly SkillEvidenceEvent[];
  rejected: boolean;
  reason?: string;
}

export interface SkillStateReplay {
  states: readonly AtomicSkillState[];
  rejected_events: readonly SkillEvidenceEvent[];
}

export interface SkillReview {
  skill_id: string;
  due_at: string;
  overdue: boolean;
  stage: SkillStage;
  context_signature?: string;
}

export interface ZpdScaffold {
  speed: number;
  steps: readonly ('preview' | 'slower_tempo' | 'short_loop' | 'Tutor')[];
}

export interface ZpdAdaptation {
  starting_speed: number;
  repeat_budget: number;
  quality_passes_to_advance: number;
  low_quality_passes_before_stop: number;
}

export type ZpdCandidateState =
  | 'assessment'
  | 'too_easy'
  | 'productive_acquisition'
  | 'productive_consolidation'
  | 'scaffold_first'
  | 'goal_preview_only';

export interface ZpdCandidate {
  item_id: string;
  kind: 'lesson' | 'song';
  title: string;
  available: boolean;
  liked?: boolean;
  manifest: ItemSkillManifest;
  sequence?: number;
  recent_attempts?: number;
}

export interface PracticeDecisionFactor {
  key:
    | 'zpd_fit'
    | 'bottleneck_reduction'
    | 'due_retention'
    | 'transfer'
    | 'preference'
    | 'evidence'
    | 'fatigue';
  value: number;
  contribution: number;
  detail: string;
}

export interface PracticeDecision {
  policy_version: string;
  item_id: string;
  source_revision: string;
  predicted_success: number;
  learning_value: number;
  state: ZpdCandidateState;
  independent_eligible: boolean;
  skill_fit: number;
  prereq_fit: number;
  tempo_fit: number;
  transfer_fit: number;
  uncertainty: number;
  hard_prerequisites: readonly string[];
  scaffold: ZpdScaffold;
  adaptation?: ZpdAdaptation;
  factors: readonly PracticeDecisionFactor[];
  explanation: string;
}

export interface ZpdRankedCandidate {
  candidate: ZpdCandidate;
  decision: PracticeDecision;
}

export interface SongGoal {
  song_id: string;
  preferred: boolean;
  target_section?: { start_bar: number; end_bar: number };
  goal_kind: 'first_playable_pass' | 'full_song' | 'performance_ready';
}

export interface SongGoalBlocker {
  skill_id: string;
  current: number;
  target: number;
}

export interface UnlockPath {
  goal: SongGoal;
  blockers: readonly SongGoalBlocker[];
  next_items: readonly { item_id: string; reason: string }[];
  next_song_probe?: {
    song_id: string;
    start_bar: number;
    end_bar: number;
    speed: number;
    section_label: string;
    test_label: string;
    required_skill_id: string;
  };
  free_play_available: true;
  confidence_note?: string;
}

export type PracticeCardKind = 'review' | 'build' | 'apply';

export interface PracticeCardOption {
  id: string;
  kind: PracticeCardKind;
  candidate_id: string;
  title: string;
  speed: number;
  source_label: string;
  completion_label: string;
  bar_range?: { start: number; end: number };
  audition?: NonNullable<UnlockPath['next_song_probe']>;
}

export interface PracticeCard {
  kind: PracticeCardKind;
  label: string;
  options: readonly PracticeCardOption[];
}

export interface PracticeCardSet {
  cards: readonly PracticeCard[];
  evidence_signature: string;
}

export type PracticeRhythm = 'daily' | 'weekly';

export interface WeeklyPracticeSet {
  rhythm: PracticeRhythm;
  cards: readonly {
    kind: PracticeCardKind;
    option: PracticeCardOption;
  }[];
  evidence_signature: string;
}

export type SessionIntent =
  | 'smart_start'
  | 'song'
  | 'exercise'
  | 'review'
  | 'free_play';

export type SessionEnergy = 'short' | 'standard' | 'deep';

export interface SessionRequest {
  intent: SessionIntent;
  energy: SessionEnergy;
  active_goal?: SongGoal;
  explicit_song_id?: string;
  recent_early_exits: number;
  now: string;
}

export interface SessionBlock {
  role: 'orient' | 'acquire' | 'apply' | 'retain' | 'transfer' | 'celebrate';
  candidate_id: string;
  bar_range?: { start: number; end: number };
  speed: number;
  scaffold: readonly ('preview' | 'slower_tempo' | 'short_loop' | 'Tutor')[];
  adaptation?: ZpdAdaptation;
  stop_rule: string;
  why: string;
}

export interface SessionPlan {
  request: SessionRequest;
  launch: SessionBlock;
  blocks: readonly SessionBlock[];
  reason: string;
}
