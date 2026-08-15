import { describe, expect, it } from 'vitest';
import {
  ATOMIC_SKILL_GRAPH,
  curriculumSkillFacets,
  curriculumTaxonomyCoverage,
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
        expect.objectContaining({ skill_id: 'hand.singles' }),
        expect.objectContaining({ skill_id: 'pulse.sixteenth' }),
        expect.objectContaining({ skill_id: 'grid.sixteenth' }),
        expect.objectContaining({ skill_id: 'sticking.alternating' }),
        expect.objectContaining({ skill_id: 'dynamic.even_velocity' }),
        expect.objectContaining({ skill_id: 'tempo.100_119' }),
      ]),
    );
    expect(curriculumItemManifest('05.03')?.demands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill_id: 'pulse.eighth' }),
        expect.objectContaining({ skill_id: 'foot.kick_pulse' }),
        expect.objectContaining({ skill_id: 'coord.rock_three_way' }),
        expect.objectContaining({ skill_id: 'feel.backbeat' }),
        expect.objectContaining({ skill_id: 'limb.three_way' }),
        expect.objectContaining({ skill_id: 'dynamic.backbeat_contrast' }),
      ]),
    );
  });

  it('expands the 170-exercise curriculum into a deterministic, readable taxonomy', () => {
    const coverage = curriculumTaxonomyCoverage(CURRICULUM_ITEM_MANIFESTS);

    expect(ATOMIC_SKILL_GRAPH.length).toBeGreaterThanOrEqual(100);
    expect(coverage.item_count).toBe(170);
    expect(coverage.skill_count).toBeGreaterThanOrEqual(75);
    expect(
      CURRICULUM_ITEM_MANIFESTS.every(({ demands }) =>
        demands.some(({ skill_id }) => skill_id.startsWith('grid.')),
      ),
    ).toBe(true);
    expect(
      CURRICULUM_ITEM_MANIFESTS.every(({ demands }) =>
        demands.some(({ skill_id }) => skill_id.startsWith('tempo.')),
      ),
    ).toBe(true);
    expect(curriculumItemManifest('13.01')?.demands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill_id: 'sticking.paradiddle_accent' }),
        expect.objectContaining({ skill_id: 'reading.sticking_cues' }),
      ]),
    );
    expect(curriculumItemManifest('09.05')?.demands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill_id: 'dynamic.ghost_balance' }),
        expect.objectContaining({ skill_id: 'reading.dynamic_marks' }),
      ]),
    );
  });

  it('derives the same facets regardless of demand order', () => {
    const manifest = curriculumItemManifest('13.01')!;

    expect(curriculumSkillFacets(manifest)).toEqual(
      curriculumSkillFacets({
        ...manifest,
        demands: [...manifest.demands].reverse(),
      }),
    );
  });

  it('does not turn a skill trained by the item into its own hard gate', () => {
    const manifest = curriculumItemManifest('01.01')!;
    const demanded = new Set(manifest.demands.map(({ skill_id }) => skill_id));

    expect(
      hardPrerequisitesForManifest(manifest).some((skill_id) =>
        demanded.has(skill_id),
      ),
    ).toBe(false);
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
