import type { RunSummary } from '../practice-stats';
import { nextReviewAt } from './review-scheduler';
import { skillNodeById } from './skill-graph';
import {
  AtomicEvidenceDerivation,
  AtomicSkillState,
  ItemSkillManifest,
  SkillEvidenceEvent,
  SkillEvidenceKind,
  SkillStage,
  SkillStateReplay,
} from './types';

export const ATOMIC_PRIOR_ALPHA = 1.5;

export const ATOMIC_PRIOR_BETA = 1.5;

export const MINIMUM_SCORED_NOTES = 4;

export const QUALIFYING_QUALITY = 0.82;

export const RETENTION_DELAY_MS = 24 * 60 * 60 * 1000;

export const PROVISIONAL_HALF_LIFE_DAYS = 21;

export const RETAINED_HALF_LIFE_DAYS = 35;

export const CANONICAL_TIMING_WINDOW_MS = 100;

export interface DeriveAtomicEvidenceInput {
  run_id: string;
  summary: RunSummary;
  manifest: ItemSkillManifest;
  previous_events?: readonly SkillEvidenceEvent[];
  source_reliability?: number;
}

export interface ReplayAtomicSkillStateOptions {
  now?: string;
  manifests?: readonly ItemSkillManifest[];
  skill_ids?: readonly string[];
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function eventOrder(
  left: SkillEvidenceEvent,
  right: SkillEvidenceEvent,
): number {
  return (
    (timestamp(left.completed_at) ?? Number.POSITIVE_INFINITY) -
      (timestamp(right.completed_at) ?? Number.POSITIVE_INFINITY) ||
    left.run_id.localeCompare(right.run_id) ||
    left.skill_id.localeCompare(right.skill_id) ||
    left.item_id.localeCompare(right.item_id)
  );
}

function eventKey(event: SkillEvidenceEvent): string {
  return [
    event.run_id,
    event.chart_revision,
    event.manifest_revision,
    event.skill_id,
    event.item_id,
    event.context_signature,
  ].join('|');
}

function qualifying(event: SkillEvidenceEvent): boolean {
  return (
    event.quality >= QUALIFYING_QUALITY &&
    event.playback_speed >= 0.9 &&
    (event.scored_notes ?? MINIMUM_SCORED_NOTES) >= MINIMUM_SCORED_NOTES
  );
}

function qualityFor(summary: RunSummary, manifest: ItemSkillManifest) {
  const scored_notes =
    Math.max(0, summary.totalHits) + Math.max(0, summary.totalMisses);
  const expected_notes = Math.max(12, manifest.chart_total_notes ?? 12);
  const phrase_completion = clamp01(scored_notes / expected_notes);
  const accurate_coverage =
    clamp01(summary.overallAccuracy) * phrase_completion;
  const judging_window_ms = finitePositive(
    summary.timingWindowMs,
    CANONICAL_TIMING_WINDOW_MS,
  );
  const reference_window_ms = Math.min(
    judging_window_ms,
    CANONICAL_TIMING_WINDOW_MS,
  );
  const raw_timing_spread_ms = Math.max(0, summary.timingBias.spreadMs);
  const timing_stability = clamp01(
    1 - raw_timing_spread_ms / reference_window_ms,
  );
  const correct_lane_rate = clamp01(
    summary.totalHits / Math.max(1, summary.totalHits + summary.totalWrong),
  );
  const quality = clamp01(
    0.55 * accurate_coverage +
      0.2 * timing_stability +
      0.15 * correct_lane_rate +
      0.1 * phrase_completion,
  );

  return {
    quality,
    scored_notes,
    judging_window_ms,
    raw_timing_spread_ms,
    timing_stability,
  };
}

function initialState(skill_id: string): AtomicSkillState | undefined {
  const node = skillNodeById().get(skill_id);

  if (!node) {
    return undefined;
  }

  return {
    skill_id,
    alpha: ATOMIC_PRIOR_ALPHA,
    beta: ATOMIC_PRIOR_BETA,
    effective_trials: 0,
    stage: 'unknown',
    evidence_boundary: node.evidence_boundary,
  };
}

export function initialAtomicSkillState(
  skill_id: string,
): AtomicSkillState | undefined {
  return initialState(skill_id);
}

function latestByKind(
  events: readonly SkillEvidenceEvent[],
  kind: SkillEvidenceKind,
): string | undefined {
  return [...events]
    .filter((event) => event.evidence_kind === kind)
    .sort(eventOrder)
    .at(-1)?.completed_at;
}

function stageFor(events: readonly SkillEvidenceEvent[]): SkillStage {
  if (events.length === 0) {
    return 'unknown';
  }

  const qualifying_events = events.filter(qualifying);
  const qualifying_contexts = new Map<string, number>();

  qualifying_events.forEach((event) =>
    qualifying_contexts.set(
      event.context_signature,
      (qualifying_contexts.get(event.context_signature) ?? 0) + 1,
    ),
  );

  const provisional = [...qualifying_contexts.values()].some(
    (count) => count >= 2,
  );

  if (!provisional) {
    return 'assessed';
  }

  if (qualifying_events.some((event) => event.evidence_kind === 'transfer')) {
    return 'transferable';
  }

  if (qualifying_events.some((event) => event.evidence_kind === 'retention')) {
    return 'retained';
  }

  return 'provisional';
}

function bestSupportedBpm(
  events: readonly SkillEvidenceEvent[],
): number | undefined {
  const contexts_by_bpm = new Map<number, Set<string>>();

  events.filter(qualifying).forEach((event) => {
    const bpm = event.target_bpm
      ? event.target_bpm * event.playback_speed
      : event.playback_speed;

    if (!Number.isFinite(bpm) || bpm <= 0) {
      return;
    }

    const rounded = Math.round(bpm * 100) / 100;
    const contexts = contexts_by_bpm.get(rounded) ?? new Set<string>();

    contexts.add(event.context_signature);
    contexts_by_bpm.set(rounded, contexts);
  });

  return [...contexts_by_bpm.entries()]
    .filter(([, contexts]) => contexts.size >= 2)
    .map(([bpm]) => bpm)
    .sort((left, right) => right - left)[0];
}

function validEvent(
  event: SkillEvidenceEvent,
  manifests: ReadonlyMap<string, ItemSkillManifest> | undefined,
): boolean {
  const node = skillNodeById().get(event.skill_id);

  if (!node || node.evidence_boundary === 'unsupported') {
    return false;
  }

  if (
    !event.run_id ||
    !event.chart_revision ||
    !event.item_id ||
    !event.context_signature ||
    timestamp(event.completed_at) === undefined ||
    !Number.isFinite(event.quality) ||
    event.quality < 0 ||
    event.quality > 1 ||
    !Number.isFinite(event.weight) ||
    event.weight <= 0 ||
    !Number.isFinite(event.playback_speed) ||
    event.playback_speed <= 0
  ) {
    return false;
  }

  const manifest = manifests?.get(event.item_id);

  return !manifest || manifest.source_revision === event.manifest_revision;
}

function stateForEvents(
  skill_id: string,
  events: readonly SkillEvidenceEvent[],
): AtomicSkillState | undefined {
  const state = initialState(skill_id);

  if (!state) {
    return undefined;
  }

  if (state.evidence_boundary === 'unsupported') {
    return state;
  }

  const own_events = events.filter((event) => event.skill_id === skill_id);

  own_events.forEach((event) => {
    state.alpha += event.weight * event.quality;
    state.beta += event.weight * (1 - event.quality);
    state.effective_trials += event.weight;
  });
  state.stage = stageFor(own_events);
  state.last_acquisition_at = latestByKind(own_events, 'acquisition');
  state.last_retention_at = latestByKind(own_events, 'retention');
  state.last_transfer_at = latestByKind(own_events, 'transfer');
  state.best_supported_bpm = bestSupportedBpm(own_events);
  state.next_review_at = nextReviewAt(state);

  return state;
}

export function replayAtomicSkillState(
  events: readonly SkillEvidenceEvent[],
  options: ReplayAtomicSkillStateOptions = {},
): SkillStateReplay {
  const manifests = options.manifests
    ? new Map(options.manifests.map((manifest) => [manifest.item_id, manifest]))
    : undefined;
  const rejected_events: SkillEvidenceEvent[] = [];
  const seen = new Set<string>();
  const accepted = [...events].sort(eventOrder).filter((event) => {
    const key = eventKey(event);

    if (seen.has(key) || !validEvent(event, manifests)) {
      rejected_events.push(event);

      return false;
    }

    seen.add(key);

    return true;
  });
  const skill_ids = new Set<string>([
    ...accepted.map((event) => event.skill_id),
    ...(options.skill_ids ?? []),
  ]);
  const states = [...skill_ids]
    .sort()
    .map((skill_id) => stateForEvents(skill_id, accepted))
    .filter((state): state is AtomicSkillState => state !== undefined);

  return { states, rejected_events };
}

function previousState(
  skill_id: string,
  events: readonly SkillEvidenceEvent[],
): AtomicSkillState | undefined {
  return replayAtomicSkillState(events, { skill_ids: [skill_id] }).states[0];
}

export function classifySkillEvidenceKind({
  skill_id,
  context_signature,
  completed_at,
  previous_events,
}: {
  skill_id: string;
  context_signature: string;
  completed_at: string;
  previous_events: readonly SkillEvidenceEvent[];
}): SkillEvidenceKind {
  const completed_ms = timestamp(completed_at);

  if (completed_ms === undefined) {
    return 'acquisition';
  }

  const prior = previous_events.filter(
    (event) =>
      event.skill_id === skill_id &&
      qualifying(event) &&
      (timestamp(event.completed_at) ?? Number.POSITIVE_INFINITY) <=
        completed_ms - RETENTION_DELAY_MS,
  );
  const prior_state = previousState(skill_id, previous_events);
  const same_context = prior.some(
    (event) => event.context_signature === context_signature,
  );
  const different_context = prior.some(
    (event) => event.context_signature !== context_signature,
  );

  if (
    different_context &&
    (prior_state?.stage === 'retained' || prior_state?.stage === 'transferable')
  ) {
    return 'transfer';
  }

  if (same_context) {
    return 'retention';
  }

  return 'acquisition';
}

export function deriveAtomicSkillEvidence({
  run_id,
  summary,
  manifest,
  previous_events = [],
  source_reliability = 1,
}: DeriveAtomicEvidenceInput): AtomicEvidenceDerivation {
  const chart_revision = summary.context?.chartRevision;

  if (!chart_revision) {
    return {
      events: [],
      rejected: true,
      reason: 'Run has no immutable chart revision.',
    };
  }

  if (
    manifest.chart_revision !== undefined &&
    chart_revision !== manifest.chart_revision
  ) {
    return {
      events: [],
      rejected: true,
      reason: 'Run chart revision does not match the item manifest.',
    };
  }

  const metrics = qualityFor(summary, manifest);

  if (metrics.scored_notes < MINIMUM_SCORED_NOTES) {
    return {
      events: [],
      rejected: true,
      reason: 'Run has too little scored evidence for atomic attribution.',
    };
  }

  if (manifest.assessment_confidence <= 0) {
    return {
      events: [],
      rejected: true,
      reason: 'Item manifest has no assessment confidence.',
    };
  }

  const reliability = clamp01(source_reliability);
  const events = manifest.demands.flatMap((demand) => {
    const node = skillNodeById().get(demand.skill_id);

    if (!node || node.evidence_boundary === 'unsupported') {
      return [];
    }

    const context_signature = manifest.context_signature;

    return [
      {
        run_id,
        chart_revision,
        manifest_revision: manifest.source_revision,
        skill_id: demand.skill_id,
        item_id: manifest.item_id,
        context_signature,
        evidence_kind: classifySkillEvidenceKind({
          skill_id: demand.skill_id,
          context_signature,
          completed_at: summary.completedAt,
          previous_events,
        }),
        quality: metrics.quality,
        weight:
          demand.weight *
          Math.min(1, metrics.scored_notes / 12) *
          manifest.assessment_confidence *
          reliability,
        playback_speed: finitePositive(summary.playbackSpeed, 1),
        completed_at: summary.completedAt,
        target_bpm: demand.target_bpm,
        scored_notes: metrics.scored_notes,
        judging_window_ms: metrics.judging_window_ms,
        raw_timing_spread_ms: metrics.raw_timing_spread_ms,
        normalized_timing_stability: metrics.timing_stability,
      } satisfies SkillEvidenceEvent,
    ];
  });

  if (events.length === 0) {
    return {
      events: [],
      rejected: true,
      reason: 'Item manifest contains no observable atomic demands.',
    };
  }

  return { events, rejected: false };
}

export function decayedAtomicSkillState(
  state: AtomicSkillState,
  now: string,
): AtomicSkillState {
  const last_at = [
    state.last_acquisition_at,
    state.last_retention_at,
    state.last_transfer_at,
  ]
    .filter(
      (value): value is string =>
        value !== undefined && timestamp(value) !== undefined,
    )
    .sort((left, right) => (timestamp(right) ?? 0) - (timestamp(left) ?? 0))[0];
  const now_ms = timestamp(now);
  const last_ms = last_at ? timestamp(last_at) : undefined;

  if (
    now_ms === undefined ||
    last_ms === undefined ||
    state.stage === 'unknown'
  ) {
    return { ...state };
  }

  const days = Math.max(0, now_ms - last_ms) / (24 * 60 * 60 * 1000);
  const half_life =
    state.stage === 'retained' || state.stage === 'transferable'
      ? RETAINED_HALF_LIFE_DAYS
      : PROVISIONAL_HALF_LIFE_DAYS;
  const decay = 2 ** (-days / half_life);

  return {
    ...state,
    alpha: ATOMIC_PRIOR_ALPHA + (state.alpha - ATOMIC_PRIOR_ALPHA) * decay,
    beta: ATOMIC_PRIOR_BETA + (state.beta - ATOMIC_PRIOR_BETA) * decay,
  };
}

export function skillProbability(state: AtomicSkillState | undefined): number {
  if (!state || state.evidence_boundary === 'unsupported') {
    return 0.5;
  }

  const total = state.alpha + state.beta;

  return total > 0 ? clamp01(state.alpha / total) : 0.5;
}

export function skillConfidence(state: AtomicSkillState | undefined): number {
  if (!state || state.evidence_boundary === 'unsupported') {
    return 0;
  }

  return clamp01(1 - Math.exp(-state.effective_trials / 4));
}

export function lowerConfidenceBound(
  state: AtomicSkillState | undefined,
): number {
  if (!state || state.evidence_boundary === 'unsupported') {
    return 0;
  }

  const probability = skillProbability(state);
  const total = Math.max(1, state.alpha + state.beta);
  const spread = Math.sqrt((probability * (1 - probability)) / (total + 1));

  return clamp01(probability - 1.64 * spread);
}
