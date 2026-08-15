import {
  AiTutorDecision,
  AiTutorNextAction,
  AiTutorPracticeState,
  SafeAiTutorDecision,
} from './types';

const REPEAT_ACTIONS: ReadonlySet<AiTutorNextAction> = new Set([
  'repeat_window',
  'change_window',
  'change_tempo',
]);

function clamp_number(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function terminal_decision(
  state: AiTutorPracticeState,
  action: 'return_to_song' | 'end_session',
  rationale: string,
): AiTutorDecision {
  return {
    next_action: action,
    window: state.current_chunk_plan.window,
    tempo: {
      playback_speed: state.current_chunk_plan.playback_speed,
      target_bpm: state.current_chunk_plan.target_bpm,
    },
    encouragement_line:
      action === 'return_to_song'
        ? 'Take the repaired phrase back to the song.'
        : 'That is enough focused work for this session.',
    rationale,
  };
}

function fallback_action(
  state: AiTutorPracticeState,
): 'return_to_song' | 'end_session' {
  return state.session.allowed_actions.includes('return_to_song')
    ? 'return_to_song'
    : 'end_session';
}

export function enforce_ai_tutor_safety(
  state: AiTutorPracticeState,
  model_decision: AiTutorDecision,
): SafeAiTutorDecision {
  const adjustments: string[] = [];

  if (
    state.current_chunk_plan.terminal_state !== 'active' ||
    state.session.remaining_seconds <= 0
  ) {
    adjustments.push('terminal_state');

    return {
      model_decision,
      decision: terminal_decision(
        state,
        'end_session',
        'The application terminal state ended this advisory path.',
      ),
      safety_adjustments: adjustments,
    };
  }

  if (!state.session.allowed_actions.includes(model_decision.next_action)) {
    adjustments.push('disallowed_action');

    return {
      model_decision,
      decision: terminal_decision(
        state,
        fallback_action(state),
        'The application rejected an action outside the current plan.',
      ),
      safety_adjustments: adjustments,
    };
  }

  if (
    state.current_chunk_plan.repeat_count >=
      state.current_chunk_plan.maximum_repeats &&
    REPEAT_ACTIONS.has(model_decision.next_action)
  ) {
    adjustments.push('repeat_cap');

    return {
      model_decision,
      decision: terminal_decision(
        state,
        fallback_action(state),
        'The application repeat cap ended this recovery loop.',
      ),
      safety_adjustments: adjustments,
    };
  }

  const selected_window = state.current_chunk_plan.available_windows.find(
    ({ window }) =>
      window.start_tick === model_decision.window.start_tick &&
      window.end_tick === model_decision.window.end_tick,
  );
  const window = selected_window?.window ?? state.current_chunk_plan.window;

  if (
    !selected_window ||
    window.start_measure !== model_decision.window.start_measure ||
    window.end_measure !== model_decision.window.end_measure
  ) {
    adjustments.push('window_boundary');
  }

  const playback_speed = clamp_number(
    model_decision.tempo.playback_speed,
    state.zpd.minimum_playback_speed,
    state.zpd.maximum_playback_speed,
  );

  if (playback_speed !== model_decision.tempo.playback_speed) {
    adjustments.push('tempo_bounds');
  }

  let target_bpm = model_decision.tempo.target_bpm;

  if (target_bpm !== null) {
    if (
      state.zpd.minimum_target_bpm === null ||
      state.zpd.maximum_target_bpm === null
    ) {
      adjustments.push('bpm_unavailable');
      target_bpm = state.current_chunk_plan.target_bpm;
    } else {
      const bounded_bpm = clamp_number(
        target_bpm,
        state.zpd.minimum_target_bpm,
        state.zpd.maximum_target_bpm,
      );

      if (bounded_bpm !== target_bpm) {
        adjustments.push('bpm_bounds');
        target_bpm = bounded_bpm;
      }
    }
  }

  return {
    model_decision,
    decision: {
      ...model_decision,
      window,
      tempo: { playback_speed, target_bpm },
    },
    safety_adjustments: adjustments,
  };
}
