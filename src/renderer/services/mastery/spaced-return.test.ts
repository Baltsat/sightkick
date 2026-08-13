import { describe, expect, it } from 'vitest';
import { composePracticeSession, dueReviews } from '../pedagogy';
import type { AtomicSkillState, ZpdRankedCandidate } from '../pedagogy';

function candidate(
  item_id: string,
  skill_id: string,
  learning_value: number,
): ZpdRankedCandidate {
  return {
    candidate: {
      item_id,
      kind: 'lesson',
      title: item_id,
      available: true,
      manifest: {
        item_id,
        source: 'curriculum',
        source_revision: `${item_id}:rev-1`,
        demands: [
          {
            skill_id,
            weight: 1,
            context: 'meter=4/4;phrase=groove',
          },
        ],
        context_signature: 'meter=4/4;phrase=groove',
        assessment_confidence: 0.9,
      },
    },
    decision: {
      policy_version: 'pedagogy-v2.0',
      item_id,
      source_revision: `${item_id}:rev-1`,
      predicted_success: 0.78,
      learning_value,
      state: 'productive_acquisition',
      independent_eligible: true,
      skill_fit: 0.78,
      prereq_fit: 0.78,
      tempo_fit: 0.78,
      transfer_fit: 0.5,
      uncertainty: 0.2,
      hard_prerequisites: [],
      scaffold: { speed: 0.8, steps: ['slower_tempo'] },
      factors: [],
      explanation: `Build ${skill_id} from the scheduled evidence return.`,
    },
  };
}

describe('spaced return', () => {
  it('returns a day-old observed skill to Smart Start when its review becomes due', () => {
    const dayZero = '2026-08-10T08:00:00.000Z';
    const dayOne = '2026-08-11T08:00:00.000Z';
    const observed: AtomicSkillState = {
      skill_id: 'pulse.quarter',
      alpha: 2.3,
      beta: 1.7,
      effective_trials: 1,
      last_acquisition_at: dayZero,
      stage: 'assessed',
      evidence_boundary: 'midi',
    };
    const scheduled = candidate(
      'lesson:scheduled-return',
      'pulse.quarter',
      0.5,
    );
    const frontier = candidate('lesson:new-frontier', 'pulse.eighth', 0.95);

    expect(dueReviews([observed], dayZero)).toEqual([
      {
        skill_id: 'pulse.quarter',
        due_at: dayOne,
        overdue: false,
        stage: 'assessed',
      },
    ]);

    const nextDayReviews = dueReviews([observed], dayOne);

    expect(nextDayReviews).toEqual([
      {
        skill_id: 'pulse.quarter',
        due_at: dayOne,
        overdue: true,
        stage: 'assessed',
      },
    ]);

    const plan = composePracticeSession({
      request: {
        intent: 'smart_start',
        energy: 'short',
        recent_early_exits: 0,
        now: dayOne,
      },
      ranking: [frontier, scheduled],
      due_reviews: nextDayReviews,
    });

    expect(plan?.launch.candidate_id).toBe('lesson:scheduled-return');
    expect(plan?.blocks[1]).toMatchObject({
      candidate_id: 'lesson:scheduled-return',
      role: 'acquire',
    });
  });
});
