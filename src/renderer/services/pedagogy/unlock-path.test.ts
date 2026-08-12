import { describe, expect, it } from 'vitest';
import { shortestUnmetHardPrerequisitePath } from './index';
import type { AtomicSkillState, ItemSkillManifest } from './types';

const manifest: ItemSkillManifest = {
  item_id: 'song:three-way',
  source: 'manual_song_review',
  source_revision: 'song:three-way:rev',
  demands: [
    {
      skill_id: 'coord.rock_three_way',
      weight: 1,
      context: 'meter=4/4;phrase=groove',
    },
  ],
  context_signature: 'meter=4/4;phrase=groove',
  assessment_confidence: 1,
};
const secure_state: AtomicSkillState = {
  skill_id: 'coord.two_way',
  alpha: 20,
  beta: 2,
  effective_trials: 8,
  stage: 'retained',
  evidence_boundary: 'midi',
};

describe('favourite-song prerequisite paths', () => {
  it('finds the nearest unmet hard prerequisite deterministically', () => {
    expect(shortestUnmetHardPrerequisitePath(manifest, [])).toEqual([
      'coord.two_way',
    ]);
    expect(shortestUnmetHardPrerequisitePath(manifest, [secure_state])).toEqual(
      ['coord.two_way', 'foot.kick_pulse'],
    );
  });
});
