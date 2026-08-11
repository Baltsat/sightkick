import { skillNodeById } from './skill-graph';
import { AtomicSkillState, SkillReview } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function timestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function lastEvidenceAt(state: AtomicSkillState): string | undefined {
  return [
    state.last_acquisition_at,
    state.last_retention_at,
    state.last_transfer_at,
  ]
    .filter((value): value is string => timestamp(value) !== undefined)
    .sort((left, right) => timestamp(right)! - timestamp(left)!)[0];
}

function reviewIndex(state: AtomicSkillState): number {
  if (state.stage === 'assessed') {
    return 0;
  }

  if (state.stage === 'provisional') {
    return 1;
  }

  if (state.stage === 'retained') {
    return 2;
  }

  return 3;
}

export function nextReviewAt(state: AtomicSkillState): string | undefined {
  if (state.stage === 'unknown' || state.evidence_boundary === 'unsupported') {
    return undefined;
  }

  const evidence_at = lastEvidenceAt(state);

  if (!evidence_at) {
    return undefined;
  }

  const node = skillNodeById().get(state.skill_id);
  const days = node?.default_review_days[reviewIndex(state)];
  const at = timestamp(evidence_at);

  if (days === undefined || at === undefined) {
    return undefined;
  }

  return new Date(at + days * DAY_MS).toISOString();
}

export function dueReviews(
  states: readonly AtomicSkillState[],
  now: string,
): readonly SkillReview[] {
  const now_ms = timestamp(now);

  if (now_ms === undefined) {
    return [];
  }

  return states
    .map((state) => {
      const due_at = state.next_review_at ?? nextReviewAt(state);
      const due_ms = timestamp(due_at);

      if (!due_at || due_ms === undefined) {
        return undefined;
      }

      return {
        skill_id: state.skill_id,
        due_at,
        overdue: due_ms <= now_ms,
        stage: state.stage,
      } satisfies SkillReview;
    })
    .filter((review): review is SkillReview => review !== undefined)
    .sort(
      (left, right) =>
        left.due_at.localeCompare(right.due_at) ||
        left.skill_id.localeCompare(right.skill_id),
    );
}
