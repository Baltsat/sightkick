import { hardPrerequisitesForManifest } from './item-manifest';
import {
  decayedAtomicSkillState,
  lowerConfidenceBound,
  skillConfidence,
  skillProbability,
} from './skill-state';
import {
  AtomicSkillState,
  ItemSkillManifest,
  PracticeDecision,
  PracticeDecisionFactor,
  SkillReview,
  SongGoal,
  ZpdCandidate,
  ZpdCandidateState,
  ZpdRankedCandidate,
} from './types';

export const INDEPENDENT_PREREQUISITE_BOUND = 0.55;

export interface ZpdFrontierInput {
  candidates: readonly ZpdCandidate[];
  states: readonly AtomicSkillState[];
  now: string;
  active_goal?: SongGoal;
  active_goal_manifest?: ItemSkillManifest;
  due_reviews?: readonly SkillReview[];
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function weightedHarmonicMean(
  values: readonly { value: number; weight: number }[],
): number {
  const positive = values.filter(({ weight }) => weight > 0);
  const total_weight = positive.reduce((total, item) => total + item.weight, 0);

  if (total_weight === 0) {
    return 0.5;
  }

  const denominator = positive.reduce(
    (total, item) => total + item.weight / Math.max(0.05, item.value),
    0,
  );

  return denominator > 0 ? clamp01(total_weight / denominator) : 0.5;
}

function stateMap(
  states: readonly AtomicSkillState[],
  now: string,
): ReadonlyMap<string, AtomicSkillState> {
  return new Map(
    states.map((state) => [
      state.skill_id,
      decayedAtomicSkillState(state, now),
    ]),
  );
}

function skillFit(
  manifest: ItemSkillManifest,
  states: ReadonlyMap<string, AtomicSkillState>,
): number {
  return weightedHarmonicMean(
    manifest.demands.map((demand) => ({
      value: skillProbability(states.get(demand.skill_id)),
      weight: demand.weight,
    })),
  );
}

function hardPrerequisiteFit(
  manifest: ItemSkillManifest,
  states: ReadonlyMap<string, AtomicSkillState>,
): { fit: number; ids: readonly string[]; independent_eligible: boolean } {
  const ids = hardPrerequisitesForManifest(manifest);

  if (ids.length === 0) {
    return { fit: 1, ids, independent_eligible: true };
  }

  const values = ids.map((id) => {
    const state = states.get(id);

    return state ? lowerConfidenceBound(state) : 0.45;
  });
  const independent_eligible = ids.every((id) => {
    const state = states.get(id);

    return (
      state !== undefined &&
      (state.stage === 'retained' || state.stage === 'transferable') &&
      lowerConfidenceBound(state) >= INDEPENDENT_PREREQUISITE_BOUND
    );
  });

  return {
    fit: Math.min(...values),
    ids,
    independent_eligible,
  };
}

function tempoFit(
  manifest: ItemSkillManifest,
  states: ReadonlyMap<string, AtomicSkillState>,
): number {
  return weightedHarmonicMean(
    manifest.demands.map((demand) => {
      const frontier = states.get(demand.skill_id)?.best_supported_bpm;

      if (!frontier || !demand.target_bpm) {
        return { value: 0.5, weight: demand.weight };
      }

      const ratio = demand.target_bpm / frontier;
      const value =
        ratio <= 1 ? 1 : ratio <= 1.15 ? 0.82 : Math.exp(-1.7 * (ratio - 1));

      return { value: clamp01(value), weight: demand.weight };
    }),
  );
}

function transferFit(
  manifest: ItemSkillManifest,
  states: ReadonlyMap<string, AtomicSkillState>,
): number {
  const value_for_stage: Record<AtomicSkillState['stage'], number> = {
    unknown: 0.25,
    assessed: 0.35,
    provisional: 0.5,
    retained: 0.75,
    transferable: 0.95,
  };

  return manifest.demands.reduce(
    (total, demand) =>
      total +
      demand.weight *
        value_for_stage[states.get(demand.skill_id)?.stage ?? 'unknown'],
    0,
  );
}

function uncertaintyFor(
  manifest: ItemSkillManifest,
  states: ReadonlyMap<string, AtomicSkillState>,
): number {
  return manifest.demands.reduce(
    (total, demand) =>
      total +
      demand.weight * (1 - skillConfidence(states.get(demand.skill_id))),
    0,
  );
}

function desiredState(
  predicted_success: number,
  uncertainty: number,
  effective_trials: number,
  independent_eligible: boolean,
): ZpdCandidateState {
  if (effective_trials < 0.25 && uncertainty >= 0.75) {
    return 'assessment';
  }

  if (predicted_success > 0.9) {
    return 'too_easy';
  }

  if (predicted_success >= 0.78 && predicted_success <= 0.9) {
    return 'productive_consolidation';
  }

  if (predicted_success >= 0.68 && predicted_success <= 0.82) {
    return independent_eligible ? 'productive_acquisition' : 'scaffold_first';
  }

  if (predicted_success >= 0.45) {
    return 'scaffold_first';
  }

  return 'goal_preview_only';
}

function scaffoldFor(
  state: ZpdCandidateState,
  manifest: ItemSkillManifest,
  states: ReadonlyMap<string, AtomicSkillState>,
  independent_eligible: boolean,
): PracticeDecision['scaffold'] {
  const steps: Array<'preview' | 'slower_tempo' | 'short_loop' | 'Tutor'> = [];
  const targets = manifest.demands
    .map((demand) => demand.target_bpm)
    .filter((value): value is number => value !== undefined && value > 0);
  const frontiers = manifest.demands
    .map((demand) => states.get(demand.skill_id)?.best_supported_bpm)
    .filter((value): value is number => value !== undefined && value > 0);
  const target = targets.length ? Math.min(...targets) : undefined;
  const frontier = frontiers.length ? Math.min(...frontiers) : undefined;
  let speed = 1;

  if (
    state === 'assessment' ||
    state === 'scaffold_first' ||
    state === 'goal_preview_only'
  ) {
    steps.push('preview', 'short_loop');
  }

  if (target && (!frontier || target > frontier * 1.05)) {
    steps.push('slower_tempo');
    speed = frontier ? clamp01((frontier * 1.1) / target) : 0.7;
  }

  if (!independent_eligible) {
    steps.push('Tutor');
  }

  if (state === 'goal_preview_only') {
    speed = Math.min(speed, 0.6);
  }

  return {
    speed: Math.max(0.5, Math.round(speed * 100) / 100),
    steps: [...new Set(steps)],
  };
}

function zpdFit(state: ZpdCandidateState, predicted_success: number): number {
  const target =
    state === 'productive_consolidation'
      ? 0.84
      : state === 'productive_acquisition'
      ? 0.75
      : state === 'scaffold_first'
      ? 0.58
      : 0.5;

  return clamp01(1 - Math.abs(predicted_success - target) / 0.35);
}

function bottleneckReduction(
  manifest: ItemSkillManifest,
  goal_manifest: ItemSkillManifest | undefined,
  states: ReadonlyMap<string, AtomicSkillState>,
): number {
  if (!goal_manifest) {
    return 0;
  }

  const goal_weights = new Map(
    goal_manifest.demands.map((demand) => [demand.skill_id, demand.weight]),
  );

  return clamp01(
    manifest.demands.reduce((total, demand) => {
      const goal_weight = goal_weights.get(demand.skill_id) ?? 0;
      const weakness = 1 - skillProbability(states.get(demand.skill_id));

      return total + demand.weight * goal_weight * weakness;
    }, 0) * 3,
  );
}

function dueRetentionValue(
  manifest: ItemSkillManifest,
  due_reviews: readonly SkillReview[],
): number {
  const due = new Set(
    due_reviews
      .filter((review) => review.overdue)
      .map((review) => review.skill_id),
  );

  return manifest.demands.reduce(
    (total, demand) => total + (due.has(demand.skill_id) ? demand.weight : 0),
    0,
  );
}

function transferValue(
  manifest: ItemSkillManifest,
  states: ReadonlyMap<string, AtomicSkillState>,
): number {
  return manifest.demands.reduce((total, demand) => {
    const stage = states.get(demand.skill_id)?.stage;
    const value = stage === 'retained' ? 1 : stage === 'provisional' ? 0.5 : 0;

    return total + demand.weight * value;
  }, 0);
}

function explanationFor(
  state: ZpdCandidateState,
  hard_prerequisites: readonly string[],
  independent_eligible: boolean,
): string {
  if (state === 'assessment') {
    return 'Play a short phrase so your next lesson has a clear starting point.';
  }

  if (state === 'goal_preview_only') {
    return 'This target is still a preview; the receipt keeps its nearest prerequisite visible without blocking free play.';
  }

  if (!independent_eligible) {
    return `A scaffold is selected because ${hard_prerequisites.join(
      ', ',
    )} is not yet retained for independent work.`;
  }

  if (state === 'too_easy') {
    return 'This is retained enough for review or confidence restoration, not the main learning block.';
  }

  return 'This item fits the current atom-level frontier and its evidence is recorded with the decision.';
}

export function scoreZpdCandidate(
  candidate: ZpdCandidate,
  input: Omit<ZpdFrontierInput, 'candidates'>,
): ZpdRankedCandidate {
  const states = stateMap(input.states, input.now);
  const skill_fit = skillFit(candidate.manifest, states);
  const prerequisite = hardPrerequisiteFit(candidate.manifest, states);
  const tempo_fit = tempoFit(candidate.manifest, states);
  const transfer_fit = transferFit(candidate.manifest, states);
  const uncertainty = uncertaintyFor(candidate.manifest, states);
  const predicted_success = Math.min(
    0.95,
    Math.max(
      0.05,
      0.45 * skill_fit +
        0.2 * prerequisite.fit +
        0.15 * tempo_fit +
        0.1 * transfer_fit +
        0.1 * (0.5 * uncertainty),
    ),
  );
  const effective_trials = candidate.manifest.demands.reduce(
    (total, demand) =>
      total + (states.get(demand.skill_id)?.effective_trials ?? 0),
    0,
  );
  const state = desiredState(
    predicted_success,
    uncertainty,
    effective_trials,
    prerequisite.independent_eligible,
  );
  const scaffold = scaffoldFor(
    state,
    candidate.manifest,
    states,
    prerequisite.independent_eligible,
  );
  const fit = zpdFit(state, predicted_success);
  const bottleneck = bottleneckReduction(
    candidate.manifest,
    input.active_goal_manifest,
    states,
  );
  const retention = dueRetentionValue(
    candidate.manifest,
    input.due_reviews ?? [],
  );
  const transfer = transferValue(candidate.manifest, states);
  const preference = candidate.liked ? 1 : 0;
  const evidence = uncertainty;
  const fatigue = clamp01((candidate.recent_attempts ?? 0) / 3);
  const factors: readonly PracticeDecisionFactor[] = [
    {
      key: 'zpd_fit',
      value: fit,
      contribution: 0.35 * fit,
      detail: `Predicted success ${Math.round(
        predicted_success * 100,
      )}% is evaluated against the current ZPD band.`,
    },
    {
      key: 'bottleneck_reduction',
      value: bottleneck,
      contribution: 0.2 * bottleneck,
      detail: 'Reduces an active favourite-song bottleneck when one is known.',
    },
    {
      key: 'due_retention',
      value: retention,
      contribution: 0.15 * retention,
      detail: 'Rewards a skill-specific delayed review only when it is due.',
    },
    {
      key: 'transfer',
      value: transfer,
      contribution: 0.1 * transfer,
      detail:
        'Favors a musical context that can test an already retained pattern.',
    },
    {
      key: 'preference',
      value: preference,
      contribution: 0.1 * preference,
      detail:
        'Uses the learner preference as a tie-breaker, not a difficulty override.',
    },
    {
      key: 'evidence',
      value: evidence,
      contribution: 0.1 * evidence,
      detail: 'Values a short diagnostic where the evidence remains thin.',
    },
    {
      key: 'fatigue',
      value: fatigue,
      contribution: -0.1 * fatigue,
      detail:
        'Avoids repeating the same recent task when another valid option exists.',
    },
  ];
  const learning_value = clamp01(
    factors.reduce((total, factor) => total + factor.contribution, 0),
  );
  const decision: PracticeDecision = {
    policy_version: 'pedagogy-v2.0',
    item_id: candidate.item_id,
    source_revision: candidate.manifest.source_revision,
    predicted_success,
    learning_value,
    state,
    independent_eligible: prerequisite.independent_eligible,
    skill_fit,
    prereq_fit: prerequisite.fit,
    tempo_fit,
    transfer_fit,
    uncertainty,
    hard_prerequisites: prerequisite.ids,
    scaffold,
    factors,
    explanation: explanationFor(
      state,
      prerequisite.ids,
      prerequisite.independent_eligible,
    ),
  };

  return { candidate, decision };
}

export function rankZpdFrontier(
  input: ZpdFrontierInput,
): readonly ZpdRankedCandidate[] {
  return input.candidates
    .filter((candidate) => candidate.available)
    .map((candidate) => scoreZpdCandidate(candidate, input))
    .sort(
      (left, right) =>
        right.decision.learning_value - left.decision.learning_value ||
        (left.candidate.sequence ?? Number.MAX_SAFE_INTEGER) -
          (right.candidate.sequence ?? Number.MAX_SAFE_INTEGER) ||
        left.candidate.item_id.localeCompare(right.candidate.item_id),
    );
}
