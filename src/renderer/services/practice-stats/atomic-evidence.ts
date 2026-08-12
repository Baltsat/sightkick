import type { SkillEvidenceEvent } from '../pedagogy/types';
import type { StoredPracticeRun } from './types';

function eventOrder(
  left: SkillEvidenceEvent,
  right: SkillEvidenceEvent,
): number {
  return (
    left.completed_at.localeCompare(right.completed_at) ||
    left.run_id.localeCompare(right.run_id) ||
    left.skill_id.localeCompare(right.skill_id) ||
    left.item_id.localeCompare(right.item_id)
  );
}

export function atomicEvidenceFromPracticeRuns(
  runs: readonly StoredPracticeRun[],
): readonly SkillEvidenceEvent[] {
  return runs
    .flatMap((run) => run.summary.atomicSkillEvidence ?? [])
    .sort(eventOrder);
}
