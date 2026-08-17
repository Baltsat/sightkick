import { describe, expect, it } from 'vitest';
import {
  build_codex_ai_tutor_prompt,
  build_codex_shell_command,
} from './codex-transport';
import {
  AI_TUTOR_POLICY_VERSION,
  AiTutorPracticeState,
} from '../../renderer/services/ai-tutor';

describe('Codex AI tutor shell transport', () => {
  it('uses an absolute binary and closes stdin for the non-interactive run', () => {
    const command = build_codex_shell_command(
      '/Users/player/.bun/bin/codex',
      '/tmp/schema.json',
      '/tmp/output.json',
      "teacher's practice state",
    );

    expect(command).toContain("'/Users/player/.bun/bin/codex' 'exec'");
    expect(command).toContain("'--output-schema' '/tmp/schema.json'");
    expect(command).toContain("'--output-last-message' '/tmp/output.json'");
    expect(command).toContain("'teacher'\"'\"'s practice state'");
    expect(command).toMatch(/<\/dev\/null$/);
    expect(command).not.toContain(' -m ');
  });

  it('embeds the SimpleEnglish output contract', () => {
    const prompt = build_codex_ai_tutor_prompt({
      policy_version: AI_TUTOR_POLICY_VERSION,
      request_id: 'copy-contract',
      captured_at: '2026-08-16T00:00:00.000Z',
      profile: {
        atomic_skills: [],
        preferred_song_id: null,
        feedback_preference: 'standard',
      },
      current_chunk_plan: {
        chunk_id: 'chunk',
        deterministic_decision_id: 'decision',
        item_id: 'item',
        source_revision: 'revision',
        reason: '2 misses in bar 4.',
        cue: 'Replay bar 4.',
        window: {
          start_measure: 3,
          end_measure: 3,
          start_tick: 1_440,
          end_tick: 1_920,
        },
        allowed_window: {
          start_measure: 3,
          end_measure: 3,
          start_tick: 1_440,
          end_tick: 1_920,
        },
        playback_speed: 0.8,
        target_bpm: 96,
        repeat_count: 0,
        maximum_repeats: 2,
        terminal_state: 'active',
        chunk_stage: 'seed',
        active_window_index: 0,
        available_windows: [
          {
            stage: 'seed',
            label: 'bar 4',
            window: {
              start_measure: 3,
              end_measure: 3,
              start_tick: 1_440,
              end_tick: 1_920,
            },
          },
        ],
      },
      last_attempts: [],
      zpd: {
        predicted_success: 0.7,
        state: 'productive_acquisition',
        productive_band: { minimum: 0.68, maximum: 0.82 },
        minimum_playback_speed: 0.7,
        maximum_playback_speed: 0.9,
        minimum_target_bpm: 84,
        maximum_target_bpm: 108,
        hard_prerequisites: [],
        scaffold: [],
      },
      session: {
        intent: 'song',
        energy: 'short',
        elapsed_seconds: 60,
        remaining_seconds: 120,
        allowed_actions: ['repeat_window'],
      },
    } satisfies AiTutorPracticeState);
    const instructions = prompt.split('\n\nPRACTICE_STATE')[0];

    expect(instructions).toContain(
      'Start encouragement_line with 1 next action.',
    );
    expect(instructions).toContain(
      'Keep each rationale sentence to 25 words or fewer.',
    );
    expect(instructions).toContain('Do not use semicolons.');
    expect(instructions).toContain('The schema validator rejects output');
  });

  it('rejects a relative Codex binary path', () => {
    expect(() =>
      build_codex_shell_command(
        'codex',
        '/tmp/schema.json',
        '/tmp/output.json',
        'state',
      ),
    ).toThrow('The Codex binary path must be absolute.');
  });
});
