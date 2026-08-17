export const AI_TUTOR_POLICY_VERSION = 'ai-tutor-spike-v1';

export type AiTutorNextAction =
  | 'repeat_window'
  | 'change_window'
  | 'change_tempo'
  | 'advance_chunk'
  | 'return_to_song'
  | 'end_session';

export interface AiTutorWindow {
  start_measure: number;
  end_measure: number;
  start_tick: number;
  end_tick: number;
}

export interface AiTutorTempo {
  playback_speed: number;
  target_bpm: number | null;
}

export interface AiTutorDecision {
  next_action: AiTutorNextAction;
  window: AiTutorWindow;
  tempo: AiTutorTempo;
  encouragement_line: string;
  rationale: string;
}

export interface AiTutorSkillSnapshot {
  skill_id: string;
  stage: 'unknown' | 'assessed' | 'provisional' | 'retained' | 'transferable';
  readiness: number;
  evidence_confidence: number;
  best_supported_bpm: number | null;
}

export interface AiTutorAttemptSnapshot {
  attempt_id: string;
  completed_at: string;
  window: AiTutorWindow;
  playback_speed: number;
  accuracy: number;
  coverage: number;
  timing_spread_ms: number;
  misses: number;
  wrong_hits: number;
  wrong_pad_pairs: readonly {
    actual: string;
    expected: string;
    count: number;
  }[];
}

export interface AiTutorPracticeState {
  policy_version: typeof AI_TUTOR_POLICY_VERSION;
  request_id: string;
  captured_at: string;
  profile: {
    atomic_skills: readonly AiTutorSkillSnapshot[];
    preferred_song_id: string | null;
    feedback_preference: 'less' | 'standard' | 'more';
  };
  current_chunk_plan: {
    chunk_id: string;
    deterministic_decision_id: string;
    item_id: string;
    source_revision: string;
    reason: string;
    cue: string;
    window: AiTutorWindow;
    allowed_window: AiTutorWindow;
    playback_speed: number;
    target_bpm: number | null;
    repeat_count: number;
    maximum_repeats: number;
    terminal_state: 'active' | 'completed' | 'stopped';
    chunk_stage: 'seed' | 'grow-right' | 'grow-left' | 'half' | 'full';
    active_window_index: number;
    available_windows: readonly {
      stage: 'seed' | 'grow-right' | 'grow-left' | 'half' | 'full';
      label: string;
      window: AiTutorWindow;
    }[];
  };
  last_attempts: readonly AiTutorAttemptSnapshot[];
  zpd: {
    predicted_success: number;
    state:
      | 'assessment'
      | 'too_easy'
      | 'productive_acquisition'
      | 'productive_consolidation'
      | 'scaffold_first'
      | 'goal_preview_only';
    productive_band: { minimum: number; maximum: number };
    minimum_playback_speed: number;
    maximum_playback_speed: number;
    minimum_target_bpm: number | null;
    maximum_target_bpm: number | null;
    hard_prerequisites: readonly string[];
    scaffold: readonly ('preview' | 'slower_tempo' | 'short_loop' | 'Tutor')[];
  };
  session: {
    intent: 'smart_start' | 'song' | 'exercise' | 'review' | 'free_play';
    energy: 'short' | 'standard' | 'deep';
    elapsed_seconds: number;
    remaining_seconds: number;
    allowed_actions: readonly AiTutorNextAction[];
  };
}

export interface AiTutorTransportReceipt {
  request_id: string;
  transport: 'codex-cli';
  started_at: string;
  completed_at: string;
  latency_ms: number;
  decision: AiTutorDecision;
}

export interface AiTutorTransport {
  request_decision: (
    state: AiTutorPracticeState,
    signal?: AbortSignal,
  ) => Promise<AiTutorTransportReceipt>;
}

export interface SafeAiTutorDecision {
  model_decision: AiTutorDecision;
  decision: AiTutorDecision;
  safety_adjustments: readonly string[];
}

export interface AiTutorAdvisoryAnnotation extends SafeAiTutorDecision {
  advisory_only: true;
  request_id: string;
  deterministic_decision_id: string;
  received_at: string;
  latency_ms: number;
  transport: 'codex-cli';
}

export type AiTutorAdvisoryResult =
  | { status: 'disabled' }
  | { status: 'advisory'; annotation: AiTutorAdvisoryAnnotation }
  | {
      status: 'fallback';
      reason: 'unavailable' | 'timeout' | 'transport_error' | 'stale_response';
      detail: string;
    };
