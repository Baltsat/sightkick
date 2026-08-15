import { describe, expect, it, vi } from 'vitest';
import {
  AI_TUTOR_POLICY_VERSION,
  AiTutorDecision,
  AiTutorPracticeState,
  enforce_ai_tutor_safety,
  parse_ai_tutor_decision,
  request_ai_tutor_advisory,
} from '.';

const decision: AiTutorDecision = {
  next_action: 'change_window',
  window: {
    start_measure: 88,
    end_measure: 91,
    start_tick: 42_240,
    end_tick: 44_160,
  },
  tempo: { playback_speed: 0.8, target_bpm: 96 },
  encouragement_line: 'Keep the hi-hat steady through the tom handoff.',
  rationale: 'The second attempt improved coverage but the transition is weak.',
};

function practice_state(): AiTutorPracticeState {
  return {
    policy_version: AI_TUTOR_POLICY_VERSION,
    request_id: 'practice-001',
    captured_at: '2026-08-15T08:00:00.000Z',
    profile: {
      atomic_skills: [
        {
          skill_id: 'kit.tom_t2_t3',
          stage: 'assessed',
          readiness: 0.58,
          evidence_confidence: 0.44,
          best_supported_bpm: 88,
        },
      ],
      preferred_song_id: 'tik-tok',
      feedback_preference: 'standard',
    },
    current_chunk_plan: {
      chunk_id: 'tik-tok:88-91',
      deterministic_decision_id: 'deterministic-001',
      item_id: 'tik-tok',
      source_revision: 'chart-2026-08-14',
      reason: 'Repeated tom transition errors near the final chorus.',
      cue: 'Keep the hi-hat pulse through the tom handoff.',
      window: {
        start_measure: 88,
        end_measure: 91,
        start_tick: 42_240,
        end_tick: 44_160,
      },
      allowed_window: {
        start_measure: 86,
        end_measure: 93,
        start_tick: 41_280,
        end_tick: 45_120,
      },
      playback_speed: 0.8,
      target_bpm: 96,
      repeat_count: 1,
      maximum_repeats: 3,
      terminal_state: 'active',
      chunk_stage: 'half',
      active_window_index: 2,
      available_windows: [
        {
          stage: 'seed',
          label: 'bar 89',
          window: {
            start_measure: 88,
            end_measure: 88,
            start_tick: 42_240,
            end_tick: 42_720,
          },
        },
        {
          stage: 'grow-right',
          label: 'bars 89–90',
          window: {
            start_measure: 88,
            end_measure: 89,
            start_tick: 42_240,
            end_tick: 43_200,
          },
        },
        {
          stage: 'half',
          label: 'bars 89–92',
          window: {
            start_measure: 88,
            end_measure: 91,
            start_tick: 42_240,
            end_tick: 44_160,
          },
        },
        {
          stage: 'full',
          label: 'bars 87–94',
          window: {
            start_measure: 86,
            end_measure: 93,
            start_tick: 41_280,
            end_tick: 45_120,
          },
        },
      ],
    },
    last_attempts: [
      {
        attempt_id: 'attempt-001',
        completed_at: '2026-08-15T07:59:30.000Z',
        window: {
          start_measure: 88,
          end_measure: 91,
          start_tick: 42_240,
          end_tick: 44_160,
        },
        playback_speed: 0.8,
        accuracy: 0.71,
        coverage: 0.79,
        timing_spread_ms: 91,
        misses: 4,
        wrong_hits: 3,
        wrong_pad_pairs: [{ actual: 'tom2', expected: 'tom3', count: 2 }],
      },
    ],
    zpd: {
      predicted_success: 0.64,
      state: 'scaffold_first',
      productive_band: { minimum: 0.68, maximum: 0.82 },
      minimum_playback_speed: 0.7,
      maximum_playback_speed: 0.9,
      minimum_target_bpm: 84,
      maximum_target_bpm: 108,
      hard_prerequisites: ['kit.tom_t2_t3'],
      scaffold: ['slower_tempo', 'short_loop', 'Tutor'],
    },
    session: {
      intent: 'song',
      energy: 'standard',
      elapsed_seconds: 540,
      remaining_seconds: 180,
      allowed_actions: [
        'repeat_window',
        'change_window',
        'change_tempo',
        'advance_chunk',
        'return_to_song',
        'end_session',
      ],
    },
  };
}

describe('AI tutor decision validation', () => {
  it('accepts the structured decision contract', () => {
    expect(parse_ai_tutor_decision(decision)).toEqual(decision);
  });

  it('rejects an inverted practice window', () => {
    expect(() =>
      parse_ai_tutor_decision({
        ...decision,
        window: {
          start_measure: 92,
          end_measure: 88,
          start_tick: 42_240,
          end_tick: 44_160,
        },
      }),
    ).toThrow('window.start_measure must not exceed window.end_measure');
  });
});

describe('AI tutor application safety', () => {
  it('bounds window and tempo after model judgment', () => {
    const safe = enforce_ai_tutor_safety(practice_state(), {
      ...decision,
      window: {
        start_measure: 80,
        end_measure: 100,
        start_tick: 40_000,
        end_tick: 46_000,
      },
      tempo: { playback_speed: 1.2, target_bpm: 132 },
    });

    expect(safe.decision.window).toEqual({
      start_measure: 88,
      end_measure: 91,
      start_tick: 42_240,
      end_tick: 44_160,
    });
    expect(safe.decision.tempo).toEqual({
      playback_speed: 0.9,
      target_bpm: 108,
    });
    expect(safe.safety_adjustments).toEqual([
      'window_boundary',
      'tempo_bounds',
      'bpm_bounds',
    ]);
  });

  it('ends the loop when the application repeat cap is reached', () => {
    const state = practice_state();

    state.current_chunk_plan.repeat_count = 3;

    const safe = enforce_ai_tutor_safety(state, {
      ...decision,
      next_action: 'repeat_window',
    });

    expect(safe.decision.next_action).toBe('return_to_song');
    expect(safe.safety_adjustments).toEqual(['repeat_cap']);
  });

  it('forces the terminal session state after the model responds', () => {
    const state = practice_state();

    state.current_chunk_plan.terminal_state = 'completed';

    const safe = enforce_ai_tutor_safety(state, decision);

    expect(safe.decision.next_action).toBe('end_session');
    expect(safe.safety_adjustments).toEqual(['terminal_state']);
  });

  it('rejects a model BPM when the deterministic plan has no safe BPM range', () => {
    const state = practice_state();

    state.current_chunk_plan.target_bpm = null;
    state.zpd.minimum_target_bpm = null;
    state.zpd.maximum_target_bpm = null;

    const safe = enforce_ai_tutor_safety(state, decision);

    expect(safe.decision.tempo.target_bpm).toBeNull();
    expect(safe.safety_adjustments).toEqual(['bpm_unavailable']);
  });
});

describe('AI tutor feature flag', () => {
  it('is off by default and never invokes the transport or consumer', async () => {
    const request_decision = vi.fn();
    const consume_advisory = vi.fn();

    await expect(
      request_ai_tutor_advisory(practice_state(), {
        transport: { request_decision },
        consume_advisory,
      }),
    ).resolves.toEqual({ status: 'disabled' });
    expect(request_decision).not.toHaveBeenCalled();
    expect(consume_advisory).not.toHaveBeenCalled();
  });

  it('emits an advisory annotation when explicitly enabled', async () => {
    const state = practice_state();
    const consume_advisory = vi.fn();
    const request_decision = vi.fn(async () => ({
      request_id: state.request_id,
      transport: 'codex-cli' as const,
      started_at: '2026-08-15T08:00:00.000Z',
      completed_at: '2026-08-15T08:00:01.000Z',
      latency_ms: 1_000,
      decision,
    }));
    const result = await request_ai_tutor_advisory(state, {
      flags: { enabled: true },
      transport: { request_decision },
      now: () => '2026-08-15T08:00:01.000Z',
      consume_advisory,
    });

    expect(result.status).toBe('advisory');
    expect(consume_advisory).toHaveBeenCalledWith(
      expect.objectContaining({
        advisory_only: true,
        deterministic_decision_id: 'deterministic-001',
        decision,
      }),
    );
  });

  it('discards a response for an older practice snapshot', async () => {
    const state = practice_state();
    const request_decision = vi.fn(async () => ({
      request_id: 'older-request',
      transport: 'codex-cli' as const,
      started_at: '2026-08-15T08:00:00.000Z',
      completed_at: '2026-08-15T08:00:01.000Z',
      latency_ms: 1_000,
      decision,
    }));

    await expect(
      request_ai_tutor_advisory(state, {
        flags: { enabled: true },
        transport: { request_decision },
      }),
    ).resolves.toEqual({
      status: 'fallback',
      reason: 'stale_response',
      detail: 'The AI tutor response belongs to another practice snapshot.',
    });
  });

  it('aborts a slow transport and returns the deterministic fallback state', async () => {
    const request_decision = vi.fn(
      (_state: AiTutorPracticeState, signal?: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    );

    await expect(
      request_ai_tutor_advisory(practice_state(), {
        flags: { enabled: true },
        transport: { request_decision },
        timeout_ms: 5,
      }),
    ).resolves.toEqual({
      status: 'fallback',
      reason: 'timeout',
      detail: 'aborted',
    });
  });
});
