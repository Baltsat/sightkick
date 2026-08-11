import { describe, expect, it } from 'vitest';
import { buildSongUnlockPath } from './index';
import type {
  AtomicSkillState,
  PracticeDecision,
  ZpdCandidate,
  ZpdRankedCandidate,
} from './types';

function ranked(
  item_id: string,
  kind: ZpdCandidate['kind'],
  assessment_confidence = 0.9,
): ZpdRankedCandidate {
  const candidate: ZpdCandidate = {
    item_id,
    kind,
    title: item_id,
    available: true,
    manifest: {
      item_id,
      source: kind === 'song' ? 'chart_analysis' : 'curriculum',
      source_revision: `${item_id}:rev`,
      demands: [
        {
          skill_id: 'pulse.eighth',
          weight: 1,
          context: 'meter=4/4;phrase=groove',
        },
      ],
      context_signature: 'meter=4/4;phrase=groove',
      assessment_confidence,
      ...(kind === 'song' ? { section: { start_bar: 5, end_bar: 8 } } : {}),
    },
  };
  const decision: PracticeDecision = {
    policy_version: 'pedagogy-v2.0',
    item_id,
    source_revision: candidate.manifest.source_revision,
    predicted_success: 0.72,
    learning_value: kind === 'lesson' ? 0.9 : 0.7,
    state: 'productive_acquisition',
    independent_eligible: true,
    skill_fit: 0.5,
    prereq_fit: 0.5,
    tempo_fit: 0.5,
    transfer_fit: 0.5,
    uncertainty: 0.5,
    hard_prerequisites: [],
    scaffold: { speed: 0.7, steps: ['short_loop'] },
    factors: [],
    explanation: 'test',
  };

  return { candidate, decision };
}

const weak_state: AtomicSkillState = {
  skill_id: 'pulse.eighth',
  alpha: 2,
  beta: 6,
  effective_trials: 4,
  stage: 'assessed',
  evidence_boundary: 'midi',
};

describe('favourite-song goal paths', () => {
  it('exposes a non-blocking path, next exercise, and safe section probe', () => {
    const song = ranked('song:favourite', 'song');
    const path = buildSongUnlockPath({
      goal: {
        song_id: 'song:favourite',
        preferred: true,
        target_section: { start_bar: 5, end_bar: 8 },
        goal_kind: 'first_playable_pass',
      },
      song: song.candidate,
      ranking: [ranked('lesson:pulse', 'lesson'), song],
      states: [weak_state],
    });

    expect(path.free_play_available).toBe(true);
    expect(path.blockers[0]?.skill_id).toBe('pulse.eighth');
    expect(path.next_items[0]?.item_id).toBe('lesson:pulse');
    expect(path.next_song_probe).toMatchObject({
      song_id: 'song:favourite',
      start_bar: 5,
      end_bar: 8,
    });
  });

  it('keeps missing chart confidence visible instead of inventing a probe', () => {
    const song = ranked('song:uncertain', 'song', 0.4);
    const path = buildSongUnlockPath({
      goal: {
        song_id: 'song:uncertain',
        preferred: true,
        goal_kind: 'full_song',
      },
      song: song.candidate,
      ranking: [song],
      states: [weak_state],
    });

    expect(path.next_song_probe).toBeUndefined();
    expect(path.confidence_note).toContain('too low');
  });
});
