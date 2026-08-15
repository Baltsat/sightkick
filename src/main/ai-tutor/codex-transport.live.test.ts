import { expect, it } from 'vitest';
import {
  AI_TUTOR_POLICY_VERSION,
  AiTutorPracticeState,
  enforce_ai_tutor_safety,
} from '../../renderer/services/ai-tutor';
import {
  AiTutorRoundTripLog,
  create_codex_ai_tutor_transport,
} from './codex-transport';

const live_test = process.env.SIGHTKICK_AI_TUTOR_LIVE === '1' ? it : it.skip;
const state: AiTutorPracticeState = {
  policy_version: AI_TUTOR_POLICY_VERSION,
  request_id: 'tik-tok-final-chorus-2026-08-15',
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
      {
        skill_id: 'kit.fill_return',
        stage: 'provisional',
        readiness: 0.67,
        evidence_confidence: 0.62,
        best_supported_bpm: 92,
      },
      {
        skill_id: 'coord.rock_three_way',
        stage: 'retained',
        readiness: 0.84,
        evidence_confidence: 0.81,
        best_supported_bpm: 112,
      },
    ],
    preferred_song_id: 'tik-tok',
    feedback_preference: 'standard',
  },
  current_chunk_plan: {
    chunk_id: 'tik-tok:88-91',
    deterministic_decision_id: 'chunk-trainer:88-91:0.8',
    item_id: 'tik-tok',
    source_revision: 'chart-2026-08-14',
    reason: 'The final-chorus tom handoff broke twice after a stable song run.',
    cue: 'Keep the hi-hat pulse through the tom handoff and land the groove return.',
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
      attempt_id: 'attempt-anchor',
      completed_at: '2026-08-15T07:58:50.000Z',
      window: {
        start_measure: 88,
        end_measure: 90,
        start_tick: 42_240,
        end_tick: 43_680,
      },
      playback_speed: 0.8,
      accuracy: 0.62,
      coverage: 0.71,
      timing_spread_ms: 118,
      misses: 6,
      wrong_hits: 4,
      wrong_pad_pairs: [{ actual: 'tom2', expected: 'tom3', count: 3 }],
    },
    {
      attempt_id: 'attempt-return-context',
      completed_at: '2026-08-15T07:59:30.000Z',
      window: {
        start_measure: 88,
        end_measure: 91,
        start_tick: 42_240,
        end_tick: 44_160,
      },
      playback_speed: 0.8,
      accuracy: 0.78,
      coverage: 0.86,
      timing_spread_ms: 82,
      misses: 3,
      wrong_hits: 2,
      wrong_pad_pairs: [{ actual: 'tom2', expected: 'tom3', count: 1 }],
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
    hard_prerequisites: ['kit.tom_t2_t3', 'kit.fill_return'],
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

live_test(
  'records one real schema-validated Codex round-trip',
  async () => {
    const logs: AiTutorRoundTripLog[] = [];
    const transport = create_codex_ai_tutor_transport({
      timeout_ms: 120_000,
      logger: (entry) => logs.push(entry),
    });
    const receipt = await transport.request_decision(state);
    const safe = enforce_ai_tutor_safety(state, receipt.decision);
    const record = { request: state, response: receipt, safe };

    process.stdout.write(`AI_TUTOR_ROUND_TRIP ${JSON.stringify(record)}\n`);
    expect(receipt.request_id).toBe(state.request_id);
    expect(logs.map((entry) => entry.phase)).toEqual(['request', 'response']);
    expect(safe.decision.window.start_measure).toBeGreaterThanOrEqual(86);
    expect(safe.decision.window.end_measure).toBeLessThanOrEqual(93);
    expect(safe.decision.tempo.playback_speed).toBeGreaterThanOrEqual(0.7);
    expect(safe.decision.tempo.playback_speed).toBeLessThanOrEqual(0.9);
  },
  130_000,
);
