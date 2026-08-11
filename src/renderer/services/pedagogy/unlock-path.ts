import { hardPrerequisitesForManifest } from './item-manifest';
import { skillNodeById } from './skill-graph';
import { skillProbability } from './skill-state';
import { AtomicSkillState, ItemSkillManifest } from './types';

export function shortestUnmetHardPrerequisitePath(
  manifest: ItemSkillManifest,
  states: readonly AtomicSkillState[],
  target = 0.68,
): readonly string[] {
  const by_id = new Map(states.map((state) => [state.skill_id, state]));
  const graph = skillNodeById();

  if (hardPrerequisitesForManifest(manifest).length === 0) {
    return [];
  }

  const queue = manifest.demands
    .flatMap((demand) =>
      (graph.get(demand.skill_id)?.prerequisites ?? [])
        .filter((prerequisite) => prerequisite.strength === 'hard')
        .map((prerequisite) => [prerequisite.id]),
    )
    .sort((left, right) => left.join('|').localeCompare(right.join('|')));

  while (queue.length > 0) {
    const path = queue.shift()!;
    const skill_id = path.at(-1)!;

    if (skillProbability(by_id.get(skill_id)) < target) {
      return path;
    }

    const next = (graph.get(skill_id)?.prerequisites ?? [])
      .filter((prerequisite) => prerequisite.strength === 'hard')
      .map((prerequisite) => [...path, prerequisite.id])
      .filter((candidate) => new Set(candidate).size === candidate.length);

    queue.push(...next);
    queue.sort(
      (left, right) =>
        left.length - right.length ||
        left.join('|').localeCompare(right.join('|')),
    );
  }

  return [];
}

export * from './song-goals';
