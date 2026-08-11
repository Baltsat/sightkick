import {
  ATOMIC_SKILL_GRAPH,
  hardPrerequisitesFor,
  skillNodeById,
} from './skill-graph';
import { GENERATED_CURRICULUM_ITEM_MANIFESTS } from './generated-curriculum-manifest';
import { ItemManifestValidation, ItemSkillManifest, SkillNode } from './types';

export const MIN_HARD_PREREQUISITE_CONFIDENCE = 0.8;

function finite01(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateItemSkillManifest(
  manifest: ItemSkillManifest,
  nodes: readonly SkillNode[] = ATOMIC_SKILL_GRAPH,
): ItemManifestValidation {
  const errors: string[] = [];
  const by_id = skillNodeById(nodes);
  const total_weight = manifest.demands.reduce(
    (total, demand) => total + demand.weight,
    0,
  );

  if (!manifest.item_id.trim()) {
    errors.push('Item manifest lacks an item id.');
  }

  if (!manifest.source_revision.trim()) {
    errors.push(`Item manifest ${manifest.item_id} lacks a source revision.`);
  }

  if (
    manifest.chart_revision !== undefined &&
    !manifest.chart_revision.trim()
  ) {
    errors.push(
      `Item manifest ${manifest.item_id} has an empty chart revision.`,
    );
  }

  if (!manifest.context_signature.trim()) {
    errors.push(
      `Item manifest ${manifest.item_id} lacks a musical context signature.`,
    );
  }

  if (!finite01(manifest.assessment_confidence)) {
    errors.push(
      `Item manifest ${manifest.item_id} has invalid assessment confidence.`,
    );
  }

  if (manifest.demands.length === 0) {
    errors.push(`Item manifest ${manifest.item_id} has no atomic demands.`);
  }

  manifest.demands.forEach((demand) => {
    const skill = by_id.get(demand.skill_id);

    if (!skill) {
      errors.push(
        `Item manifest ${manifest.item_id} references unknown skill ${demand.skill_id}.`,
      );

      return;
    }

    if (skill.evidence_boundary === 'unsupported') {
      errors.push(
        `Item manifest ${manifest.item_id} assigns scored demand to unsupported skill ${demand.skill_id}.`,
      );
    }

    if (!(Number.isFinite(demand.weight) && demand.weight > 0)) {
      errors.push(
        `Item manifest ${manifest.item_id} has invalid weight for ${demand.skill_id}.`,
      );
    }

    if (!demand.context.trim()) {
      errors.push(
        `Item manifest ${manifest.item_id} lacks context for ${demand.skill_id}.`,
      );
    }

    if (demand.target_bpm !== undefined && demand.target_bpm <= 0) {
      errors.push(
        `Item manifest ${manifest.item_id} has invalid tempo for ${demand.skill_id}.`,
      );
    }
  });

  if (Math.abs(total_weight - 1) > 0.00001) {
    errors.push(
      `Item manifest ${manifest.item_id} demand weights sum to ${total_weight}, not 1.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateItemSkillManifests(
  manifests: readonly ItemSkillManifest[],
  nodes: readonly SkillNode[] = ATOMIC_SKILL_GRAPH,
): ItemManifestValidation {
  const errors = manifests.flatMap(
    (manifest) => validateItemSkillManifest(manifest, nodes).errors,
  );
  const ids = new Set(manifests.map((manifest) => manifest.item_id));

  if (ids.size !== manifests.length) {
    errors.push('Item manifests contain duplicate item ids.');
  }

  return { valid: errors.length === 0, errors };
}

export function hardPrerequisitesForManifest(
  manifest: ItemSkillManifest,
  nodes: readonly SkillNode[] = ATOMIC_SKILL_GRAPH,
): readonly string[] {
  const confidence =
    manifest.hard_prerequisite_confidence ?? manifest.assessment_confidence;

  if (confidence < MIN_HARD_PREREQUISITE_CONFIDENCE) {
    return [];
  }

  return [
    ...new Set(
      manifest.demands.flatMap((demand) =>
        hardPrerequisitesFor(demand.skill_id, nodes),
      ),
    ),
  ].sort();
}

export const CURRICULUM_ITEM_MANIFESTS = GENERATED_CURRICULUM_ITEM_MANIFESTS;

export function curriculumItemManifest(
  item_id: string,
): ItemSkillManifest | undefined {
  return CURRICULUM_ITEM_MANIFESTS.find(
    (manifest) => manifest.item_id === item_id,
  );
}
