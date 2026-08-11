import { describe, expect, it } from 'vitest';
import {
  curriculumItemManifest,
  CURRICULUM_ITEM_MANIFESTS,
  hardPrerequisitesForManifest,
  validateItemSkillManifests,
  validateSkillGraph,
} from './index';

describe('atomic skill graph and curriculum manifests', () => {
  it('is acyclic, declares a boundary for every node, and maps all 170 exercises', () => {
    expect(validateSkillGraph()).toEqual({ valid: true, errors: [] });
    expect(CURRICULUM_ITEM_MANIFESTS).toHaveLength(170);
    expect(validateItemSkillManifests(CURRICULUM_ITEM_MANIFESTS)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('preserves the required atomic attribution examples', () => {
    expect(curriculumItemManifest('01.01')?.demands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill_id: 'hand.singles', weight: 0.55 }),
        expect.objectContaining({ skill_id: 'pulse.sixteenth', weight: 0.45 }),
      ]),
    );
    expect(curriculumItemManifest('05.03')?.demands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill_id: 'pulse.eighth', weight: 0.2 }),
        expect.objectContaining({ skill_id: 'foot.kick_pulse', weight: 0.2 }),
        expect.objectContaining({
          skill_id: 'coord.rock_three_way',
          weight: 0.35,
        }),
        expect.objectContaining({ skill_id: 'feel.backbeat', weight: 0.25 }),
      ]),
    );
  });

  it('does not let a low-confidence chart analysis create hard prerequisite gates', () => {
    const manifest = {
      item_id: 'song:uncertain',
      source: 'chart_analysis' as const,
      source_revision: 'chart:uncertain',
      demands: [
        {
          skill_id: 'coord.rock_three_way',
          weight: 1,
          context:
            'meter=4/4;subdivision=eighth;lanes=K,S,H;limbs=joint;transition=joint;phrase=groove',
        },
      ],
      context_signature:
        'meter=4/4;subdivision=eighth;lanes=K,S,H;limbs=joint;transition=joint;phrase=groove',
      assessment_confidence: 0.45,
    };

    expect(hardPrerequisitesForManifest(manifest)).toEqual([]);
  });
});
