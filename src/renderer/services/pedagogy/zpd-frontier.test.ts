import { describe, expect, it } from 'vitest';
import { rankZpdFrontier } from './index';
import type {
  AtomicSkillState,
  ItemSkillManifest,
  ZpdCandidate,
} from './types';

function manifest(
  item_id: string,
  skill_id: string,
  target_bpm = 80,
): ItemSkillManifest {
  return {
    item_id,
    source: 'curriculum',
    source_revision: `${item_id}:rev`,
    demands: [
      {
        skill_id,
        weight: 1,
        target_bpm,
        context:
          'meter=4/4;subdivision=eighth;lanes=K,S,H;limbs=joint;transition=joint;phrase=groove',
      },
    ],
    context_signature:
      'meter=4/4;subdivision=eighth;lanes=K,S,H;limbs=joint;transition=joint;phrase=groove',
    assessment_confidence: 1,
  };
}

function candidate(
  item_id: string,
  skill_id: string,
  overrides: Partial<ZpdCandidate> = {},
): ZpdCandidate {
  return {
    item_id,
    kind: 'lesson',
    title: item_id,
    available: true,
    manifest: manifest(item_id, skill_id),
    ...overrides,
  };
}

function state(
  skill_id: string,
  overrides: Partial<AtomicSkillState> = {},
): AtomicSkillState {
  return {
    skill_id,
    alpha: 20,
    beta: 2,
    effective_trials: 8,
    best_supported_bpm: 80,
    last_retention_at: '2026-08-01T10:00:00.000Z',
    next_review_at: '2026-08-15T10:00:00.000Z',
    stage: 'retained',
    evidence_boundary: 'midi',
    ...overrides,
  };
}

describe('graph-aware ZPD frontier', () => {
  it('blocks independent work on a weak hard prerequisite and selects a concrete scaffold', () => {
    const ranked = rankZpdFrontier({
      candidates: [candidate('lesson:eighth', 'pulse.eighth')],
      states: [
        state('pulse.quarter', {
          alpha: 1.6,
          beta: 8,
          effective_trials: 4,
          stage: 'assessed',
        }),
      ],
      now: '2026-08-02T10:00:00.000Z',
    });

    expect(ranked[0]?.decision.independent_eligible).toBe(false);
    expect(ranked[0]?.decision.hard_prerequisites).toContain('pulse.quarter');
    expect(ranked[0]?.decision.scaffold.steps).toContain('Tutor');
    expect(ranked[0]?.decision.scaffold.speed).toBeLessThan(1);
  });

  it('is deterministic when equivalent candidates arrive in a different order', () => {
    const first = candidate('lesson:a', 'pulse.quarter');
    const second = candidate('lesson:b', 'pulse.quarter');
    const input = {
      states: [state('pulse.quarter')],
      now: '2026-08-02T10:00:00.000Z',
    };

    expect(
      rankZpdFrontier({ ...input, candidates: [first, second] }).map(
        ({ candidate: item }) => item.item_id,
      ),
    ).toEqual(
      rankZpdFrontier({ ...input, candidates: [second, first] }).map(
        ({ candidate: item }) => item.item_id,
      ),
    );
  });

  it('writes an inspectable decision receipt for each ranked candidate', () => {
    const decision = rankZpdFrontier({
      candidates: [candidate('lesson:quarter', 'pulse.quarter')],
      states: [state('pulse.quarter')],
      now: '2026-08-02T10:00:00.000Z',
    })[0]?.decision;

    expect(decision).toMatchObject({
      policy_version: 'pedagogy-v2.0',
      item_id: 'lesson:quarter',
      source_revision: 'lesson:quarter:rev',
    });
    expect(decision?.factors.map(({ key }) => key)).toEqual([
      'zpd_fit',
      'bottleneck_reduction',
      'due_retention',
      'transfer',
      'preference',
      'evidence',
      'fatigue',
    ]);
  });
});
