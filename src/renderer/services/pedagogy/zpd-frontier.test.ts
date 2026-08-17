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
  it('turns synthetic profile states into run-consumable speed and repeat budgets', () => {
    const profiles = [
      {
        name: 'assessment',
        states: [] as readonly AtomicSkillState[],
        expected_state: 'assessment',
        expected_budget: 1,
      },
      {
        name: 'acquisition',
        states: [
          state('pulse.quarter', {
            alpha: 6,
            beta: 3,
            effective_trials: 5,
            stage: 'provisional',
          }),
        ],
        expected_state: 'productive_acquisition',
        expected_budget: 2,
      },
      {
        name: 'consolidation',
        states: [state('pulse.quarter')],
        expected_state: 'productive_consolidation',
        expected_budget: 2,
      },
      {
        name: 'scaffold',
        states: [
          state('pulse.quarter', {
            alpha: 3,
            beta: 5,
            effective_trials: 4,
            best_supported_bpm: 70,
            stage: 'assessed',
          }),
        ],
        expected_state: 'scaffold_first',
        expected_budget: 4,
      },
    ] as const;

    profiles.forEach((profile) => {
      const decision = rankZpdFrontier({
        candidates: [candidate(`lesson:${profile.name}`, 'pulse.quarter')],
        states: profile.states,
        now: '2026-08-02T10:00:00.000Z',
      })[0]!.decision;
      const adaptation = decision.adaptation!;

      expect(decision.state, profile.name).toBe(profile.expected_state);
      expect(adaptation.repeat_budget, profile.name).toBe(
        profile.expected_budget,
      );
      expect(adaptation.starting_speed, profile.name).toBe(
        decision.scaffold.speed,
      );
      expect(adaptation.quality_passes_to_advance).toBeLessThanOrEqual(
        adaptation.repeat_budget,
      );
    });
  });

  it('reduces repetition after recent attempts without changing the ZPD state', () => {
    const input = {
      states: [
        state('pulse.quarter', {
          alpha: 3,
          beta: 5,
          effective_trials: 4,
          best_supported_bpm: 70,
          stage: 'assessed' as const,
        }),
      ],
      now: '2026-08-02T10:00:00.000Z',
    };
    const fresh = rankZpdFrontier({
      ...input,
      candidates: [candidate('lesson:fresh', 'pulse.quarter')],
    })[0]!.decision;
    const repeated = rankZpdFrontier({
      ...input,
      candidates: [
        candidate('lesson:repeated', 'pulse.quarter', { recent_attempts: 3 }),
      ],
    })[0]!.decision;

    expect(repeated.state).toBe(fresh.state);
    expect(repeated.adaptation!.repeat_budget).toBe(
      fresh.adaptation!.repeat_budget - 1,
    );
  });

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
    // The explanation is plain human copy for the same fact the machine
    // fields above encode — it must name the candidate's own skill by its
    // graph label ("eighth-note pulse"), never a raw dot-notation id.
    expect(ranked[0]?.decision.explanation).toContain('eighth-note pulse');
    expect(ranked[0]?.decision.explanation).not.toMatch(/pulse\.\w+/);
  });

  it('names the blocking prerequisite by label once the item is past assessment', () => {
    const ranked = rankZpdFrontier({
      candidates: [candidate('lesson:eighth', 'pulse.eighth')],
      states: [
        // Enough of the candidate's own evidence to clear the assessment
        // gate, so the weak hard prerequisite below is what actually
        // explains the scaffold.
        state('pulse.eighth', {
          alpha: 10,
          beta: 2,
          effective_trials: 10,
          stage: 'assessed',
        }),
        state('pulse.quarter', {
          alpha: 6,
          beta: 4,
          effective_trials: 6,
          stage: 'assessed',
        }),
      ],
      now: '2026-08-02T10:00:00.000Z',
    });

    expect(ranked[0]?.decision.independent_eligible).toBe(false);
    expect(ranked[0]?.decision.explanation).toContain('Quarter-note pulse');
    expect(ranked[0]?.decision.explanation).not.toMatch(/pulse\.\w+/);
  });

  it('never surfaces a raw skill_id or unexplained jargon in the explanation', () => {
    const cases: {
      overrides: Partial<ZpdCandidate>;
      states: readonly AtomicSkillState[];
    }[] = [
      {
        overrides: {},
        states: [],
      },
      {
        overrides: { liked: true },
        states: [state('coord.rock_three_way', { stage: 'retained' })],
      },
      {
        overrides: {},
        states: [
          state('coord.rock_three_way', {
            alpha: 20,
            beta: 1,
            best_supported_bpm: 220,
            stage: 'retained',
          }),
        ],
      },
    ];

    cases.forEach(({ overrides, states }) => {
      const ranked = rankZpdFrontier({
        candidates: [
          candidate('lesson:groove', 'coord.rock_three_way', overrides),
        ],
        states,
        now: '2026-08-02T10:00:00.000Z',
      });
      const explanation = ranked[0]?.decision.explanation ?? '';

      expect(explanation).not.toContain('coord.rock_three_way');
      expect(explanation.toLowerCase()).not.toMatch(
        /atom-level frontier|the receipt keeps/,
      );
      expect(explanation.length).toBeGreaterThan(0);
    });
  });

  it('names a saved favourite honestly, and only when it actually is one', () => {
    const liked = rankZpdFrontier({
      candidates: [
        candidate('song:favourite', 'pulse.quarter', { liked: true }),
      ],
      states: [state('pulse.quarter', { stage: 'retained' })],
      now: '2026-08-02T10:00:00.000Z',
    })[0]?.decision.explanation;
    const unliked = rankZpdFrontier({
      candidates: [candidate('song:other', 'pulse.quarter')],
      states: [state('pulse.quarter', { stage: 'retained' })],
      now: '2026-08-02T10:00:00.000Z',
    })[0]?.decision.explanation;

    expect(liked).toMatch(/saved favourites/);
    expect(unliked).not.toMatch(/saved favourites/);
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
