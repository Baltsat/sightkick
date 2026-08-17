import { noteFlags, noteTypes } from 'scan-chart';
import type { ParsedChart } from '../../../chart-parser/types';
import { skillNodeById } from './skill-graph';
import {
  decayedAtomicSkillState,
  skillConfidence,
  skillProbability,
} from './skill-state';
import type {
  AtomicSkillState,
  ItemSkillManifest,
  PracticeDecision,
  SkillDemand,
  ZpdCandidate,
} from './types';
import { scoreZpdCandidate } from './zpd-frontier';

export const MY_WAVE_POLICY_VERSION = 'my-wave-v2';

export type MyWaveIntent = 'songs' | 'learning' | 'mixed';

export type MyWaveStep = 'step_up' | 'consolidate' | 'stretch' | 'diagnostic';

export type MyWaveEvidenceLevel =
  | 'chart_and_manifest'
  | 'chart'
  | 'manifest'
  | 'thin';

type DrumLane = 'kick' | 'snare' | 'hihat' | 'ride' | 'crash' | 'tom';

type Subdivision = 'quarter' | 'eighth' | 'triplet' | 'sixteenth' | 'mixed';

export interface DrumChartFeatures {
  tempo_bpm: number;
  tempo_pressure: number;
  subdivision: Subdivision;
  subdivision_density: number;
  limb_independence_load: number;
  kick_snare_hat_interplay: number;
  fill_density: number;
  syncopation: number;
  hand_stroke_density: number;
  dynamic_range: number;
  section_repetition: number;
  meter: string;
  active_lanes: readonly DrumLane[];
  note_count: number;
  onset_count: number;
  evidence_confidence: number;
}

export interface MyWaveItem {
  id: string;
  title: string;
  kind: 'song' | 'lesson';
  chart?: ParsedChart;
  chart_revision?: string;
  manifest?: ItemSkillManifest;
}

export interface MyWavePlayedItem extends MyWaveItem {
  playback_speed?: number;
}

export interface MyWaveCandidate extends MyWaveItem {
  available: boolean;
  unlocked?: boolean;
  liked?: boolean;
  replay_count?: number;
  sequence?: number;
  target_speed?: number;
}

export interface MyWaveAffection {
  value: number;
  favourite: boolean;
  replay_count: number;
  replay_share: number;
}

export interface MyWaveItemProfile {
  item_id: string;
  features?: DrumChartFeatures;
  demands: readonly SkillDemand[];
  evidence_level: MyWaveEvidenceLevel;
  evidence_confidence: number;
}

export interface MyWaveDifficulty {
  chart_difficulty: number;
  learner_relative_difficulty: number;
  skill_readiness: number;
  learner_confidence: number;
  evidence_confidence: number;
}

export interface MyWaveSimilarity {
  total: number;
  skill: number;
  chart: number;
  context: number;
  matched_skills: readonly string[];
}

export interface MyWaveEvidenceReceipt {
  level: MyWaveEvidenceLevel;
  source_manifest_revision?: string;
  candidate_manifest_revision?: string;
  source_chart_revision?: string;
  candidate_chart_revision?: string;
  source_playback_speed: number;
  candidate_playback_speed: number;
  source_chart_notes: number;
  candidate_chart_notes: number;
  source_skill_ids: readonly string[];
  candidate_skill_ids: readonly string[];
  atomic_state_count: number;
}

export interface MyWaveReceipt {
  policy_version: typeof MY_WAVE_POLICY_VERSION;
  source_item_id: string;
  candidate_item_id: string;
  intent: MyWaveIntent;
  planned_step: MyWaveStep;
  selected_step: MyWaveStep;
  similarity: MyWaveSimilarity;
  source_difficulty: MyWaveDifficulty;
  candidate_difficulty: MyWaveDifficulty;
  difficulty_delta: number;
  affection: MyWaveAffection;
  predicted_success?: number;
  zpd_state?: PracticeDecision['state'];
  zpd_decision?: PracticeDecision;
  evidence: MyWaveEvidenceReceipt;
  reason: string;
}

export interface MyWaveRecommendation {
  candidate: MyWaveCandidate;
  step: MyWaveStep;
  reason: string;
  similarity: MyWaveSimilarity;
  difficulty: MyWaveDifficulty;
  affection: MyWaveAffection;
  receipt: MyWaveReceipt;
}

export interface BuildMyWaveInput {
  played: MyWavePlayedItem;
  candidates: readonly MyWaveCandidate[];
  atomic_states: readonly AtomicSkillState[];
  now: string;
  intent: MyWaveIntent;
  limit?: number;
}

export interface MyWaveResult {
  policy_version: typeof MY_WAVE_POLICY_VERSION;
  strategy:
    | 'skill_zpd_wave'
    | 'thin_evidence_wave'
    | 'none_available'
    | 'no_zpd_candidate';
  source: MyWaveItemProfile;
  recommendations: readonly MyWaveRecommendation[];
}

interface ChartOnset {
  tick: number;
  lanes: DrumLane[];
  note_count: number;
  accent_count: number;
  ghost_count: number;
}

interface ChartBar {
  start: number;
  end: number;
  numerator: number;
  denominator: number;
}

interface GridPosition {
  beat_ticks: number;
  offset: number;
}

interface Readiness {
  value: number;
  confidence: number;
}

interface PreparedCandidate {
  candidate: MyWaveCandidate;
  profile: MyWaveItemProfile;
  difficulty: MyWaveDifficulty;
  similarity: MyWaveSimilarity;
  affection: MyWaveAffection;
  decision?: PracticeDecision;
}

const FEATURE_KEYS = [
  'tempo_pressure',
  'subdivision_density',
  'limb_independence_load',
  'kick_snare_hat_interplay',
  'fill_density',
  'syncopation',
  'hand_stroke_density',
  'dynamic_range',
  'section_novelty',
] as const;
const FEATURE_WEIGHTS: Readonly<Record<(typeof FEATURE_KEYS)[number], number>> =
  {
    tempo_pressure: 0.16,
    subdivision_density: 0.16,
    limb_independence_load: 0.2,
    kick_snare_hat_interplay: 0.13,
    fill_density: 0.1,
    syncopation: 0.13,
    hand_stroke_density: 0.05,
    dynamic_range: 0.04,
    section_novelty: 0.03,
  };
const STEP_PLAN: readonly MyWaveStep[] = [
  'step_up',
  'consolidate',
  'step_up',
  'stretch',
  'step_up',
];

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}

function positive_number(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function score_my_wave_affection({
  liked,
  replay_count,
  max_replay_count,
}: {
  liked?: boolean;
  replay_count?: number;
  max_replay_count?: number;
}): MyWaveAffection {
  const replayCount = Math.floor(positive_number(replay_count, 0));
  const maxReplayCount = Math.floor(positive_number(max_replay_count, 0));
  const replayShare =
    maxReplayCount > 0
      ? clamp01(Math.log1p(replayCount) / Math.log1p(maxReplayCount))
      : 0;

  return {
    value: round((liked ? 0.68 : 0) + replayShare * 0.32),
    favourite: liked === true,
    replay_count: replayCount,
    replay_share: round(replayShare),
  };
}

function lane_for_note(
  type: number,
  flags: number,
  is_five_lane: boolean,
): DrumLane | undefined {
  if (type === noteTypes.kick) {
    return 'kick';
  }

  if (type === noteTypes.redDrum) {
    return 'snare';
  }

  if (type === noteTypes.yellowDrum) {
    return is_five_lane || (flags & noteFlags.cymbal) !== 0 ? 'hihat' : 'tom';
  }

  if (type === noteTypes.blueDrum) {
    return (flags & noteFlags.cymbal) !== 0 ? 'ride' : 'tom';
  }

  if (type === noteTypes.greenDrum) {
    return (flags & noteFlags.cymbal) !== 0 ? 'crash' : 'tom';
  }

  return undefined;
}

function positive_modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function close_to(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function chart_bars(
  chart: ParsedChart,
  last_tick: number,
): readonly ChartBar[] {
  const resolution = positive_number(chart.resolution, 480);
  const signatures = [...chart.timeSignatures]
    .filter(
      ({ tick, numerator, denominator }) =>
        Number.isFinite(tick) &&
        tick >= 0 &&
        Number.isFinite(numerator) &&
        numerator > 0 &&
        Number.isFinite(denominator) &&
        denominator > 0,
    )
    .sort((left, right) => left.tick - right.tick);
  const initial =
    signatures[0]?.tick === 0
      ? signatures
      : [
          {
            tick: 0,
            numerator: 4,
            denominator: 4,
            msTime: 0,
            msLength: 0,
          },
          ...signatures,
        ];
  const bars: ChartBar[] = [];
  let cursor = 0;
  let signature_index = 0;

  while (cursor <= last_tick) {
    while (
      signature_index + 1 < initial.length &&
      initial[signature_index + 1].tick <= cursor
    ) {
      signature_index += 1;
    }

    const signature = initial[signature_index];
    const next_signature = initial[signature_index + 1];
    const bar_ticks =
      resolution * 4 * (signature.numerator / signature.denominator);
    const natural_end = cursor + bar_ticks;
    const end = next_signature
      ? Math.min(natural_end, next_signature.tick)
      : natural_end;

    if (!(end > cursor)) {
      cursor += 1;

      continue;
    }

    bars.push({
      start: cursor,
      end,
      numerator: signature.numerator,
      denominator: signature.denominator,
    });
    cursor = end;
  }

  return bars;
}

function grid_position(
  tick: number,
  bars: readonly ChartBar[],
  resolution: number,
): GridPosition | undefined {
  const bar = bars.find(({ start, end }) => tick >= start && tick < end);

  if (!bar) {
    return undefined;
  }

  const beat_ticks = (resolution * 4) / bar.denominator;

  return {
    beat_ticks,
    offset: positive_modulo(tick - bar.start, beat_ticks),
  };
}

function subdivision_for(
  onsets: readonly ChartOnset[],
  bars: readonly ChartBar[],
  resolution: number,
): Subdivision {
  if (onsets.length === 0) {
    return 'quarter';
  }

  let eighth = 0;
  let triplet = 0;
  let sixteenth = 0;

  onsets.forEach(({ tick }) => {
    const grid = grid_position(tick, bars, resolution);

    if (!grid) {
      return;
    }

    const tolerance = Math.max(1, grid.beat_ticks / 64);
    const at_beat = close_to(grid.offset, 0, tolerance);
    const at_eighth =
      !at_beat && close_to(grid.offset, grid.beat_ticks / 2, tolerance);
    const at_triplet =
      !at_beat &&
      (close_to(grid.offset, grid.beat_ticks / 3, tolerance) ||
        close_to(grid.offset, (grid.beat_ticks * 2) / 3, tolerance));
    const at_sixteenth =
      !at_beat &&
      !at_eighth &&
      (close_to(grid.offset, grid.beat_ticks / 4, tolerance) ||
        close_to(grid.offset, (grid.beat_ticks * 3) / 4, tolerance));

    eighth += Number(at_eighth);
    triplet += Number(at_triplet);
    sixteenth += Number(at_sixteenth);
  });

  const signal = Math.max(1, Math.round(onsets.length * 0.1));

  if (triplet >= signal && triplet > sixteenth) {
    return sixteenth >= signal ? 'mixed' : 'triplet';
  }

  if (sixteenth >= signal) {
    return 'sixteenth';
  }

  if (eighth >= signal) {
    return 'eighth';
  }

  return 'quarter';
}

function active_beats(bars: readonly ChartBar[], resolution: number): number {
  return bars.reduce(
    (total, bar) =>
      total +
      Math.max(
        1,
        Math.round(
          (bar.end - bar.start) / ((resolution * 4) / bar.denominator),
        ),
      ),
    0,
  );
}

function bar_signature(bar: ChartBar, onsets: readonly ChartOnset[]): string {
  const span = Math.max(1, bar.end - bar.start);

  return onsets
    .filter(({ tick }) => tick >= bar.start && tick < bar.end)
    .map(
      ({ tick, lanes }) =>
        `${Math.round(((tick - bar.start) / span) * 48)}:${[...lanes]
          .sort()
          .join('+')}`,
    )
    .join('|');
}

export function extract_drum_chart_features(
  chart: ParsedChart,
): DrumChartFeatures | undefined {
  const resolution = positive_number(chart.resolution, 0);
  const track =
    chart.trackData.find(
      ({ instrument, difficulty }) =>
        instrument === 'drums' && difficulty === 'expert',
    ) ?? chart.trackData.find(({ instrument }) => instrument === 'drums');

  if (!track || resolution <= 0) {
    return undefined;
  }

  const is_five_lane = chart.drumType === 2;
  const onsets = track.noteEventGroups
    .map((group) => {
      const notes = group
        .map((note) => ({
          lane: lane_for_note(note.type, note.flags, is_five_lane),
          flags: note.flags,
          tick: note.tick,
        }))
        .filter(
          (note): note is { lane: DrumLane; flags: number; tick: number } =>
            note.lane !== undefined && Number.isFinite(note.tick),
        );
      const tick = notes[0]?.tick;

      if (tick === undefined || notes.length === 0) {
        return undefined;
      }

      return {
        tick,
        lanes: [...new Set(notes.map(({ lane }) => lane))].sort(),
        note_count: notes.length,
        accent_count: notes.filter(
          ({ flags }) => (flags & noteFlags.accent) !== 0,
        ).length,
        ghost_count: notes.filter(
          ({ flags }) => (flags & noteFlags.ghost) !== 0,
        ).length,
      } satisfies ChartOnset;
    })
    .filter((onset): onset is ChartOnset => onset !== undefined)
    .sort((left, right) => left.tick - right.tick);

  if (onsets.length === 0) {
    return undefined;
  }

  const last_tick = onsets.at(-1)!.tick;
  const bars = chart_bars(chart, last_tick);
  const total_beats = Math.max(1, active_beats(bars, resolution));
  const note_count = onsets.reduce(
    (total, onset) => total + onset.note_count,
    0,
  );
  const active_lanes = [
    ...new Set(onsets.flatMap(({ lanes }) => lanes)),
  ].sort() as DrumLane[];
  const hand_lanes = new Set<DrumLane>([
    'snare',
    'hihat',
    'ride',
    'crash',
    'tom',
  ]);
  const time_lanes = new Set<DrumLane>(['hihat', 'ride', 'crash']);
  let foot_hand = 0;
  let three_way = 0;
  let snare_time = 0;
  let kick_offbeat = 0;
  let syncopated = 0;
  let kick_or_snare = 0;
  let tom_notes = 0;
  let hand_notes = 0;
  let accent_count = 0;
  let ghost_count = 0;
  const fill_bars = new Set<number>();

  onsets.forEach((onset) => {
    const lanes = new Set(onset.lanes);
    const has_kick = lanes.has('kick');
    const has_hand = onset.lanes.some((lane) => hand_lanes.has(lane));
    const has_time = onset.lanes.some((lane) => time_lanes.has(lane));
    const has_snare = lanes.has('snare');
    const grid = grid_position(onset.tick, bars, resolution);
    const tolerance = grid ? Math.max(1, grid.beat_ticks / 64) : 1;
    const on_beat = grid ? close_to(grid.offset, 0, tolerance) : true;
    const on_eighth = grid
      ? close_to(grid.offset, grid.beat_ticks / 2, tolerance)
      : false;
    const has_syncopated_kick_or_snare =
      (has_kick || has_snare) && !on_beat && !on_eighth;

    foot_hand += Number(has_kick && has_hand);
    three_way += Number(has_kick && has_snare && has_time);
    snare_time += Number(has_snare && has_time);
    kick_offbeat += Number(has_kick && !on_beat);
    syncopated += Number(has_syncopated_kick_or_snare);
    kick_or_snare += Number(has_kick || has_snare);
    tom_notes += onset.lanes.filter((lane) => lane === 'tom').length;
    hand_notes += onset.lanes.filter((lane) => hand_lanes.has(lane)).length;
    accent_count += onset.accent_count;
    ghost_count += onset.ghost_count;

    if (lanes.has('tom')) {
      const index = bars.findIndex(
        ({ start, end }) => onset.tick >= start && onset.tick < end,
      );

      if (index >= 0) {
        fill_bars.add(index);
      }
    }
  });

  const repeated =
    bars.length > 1
      ? 1 -
        new Set(bars.map((bar) => bar_signature(bar, onsets))).size /
          bars.length
      : 0;
  const limb_roles = [
    active_lanes.includes('kick'),
    active_lanes.includes('snare'),
    active_lanes.some((lane) => time_lanes.has(lane)),
    active_lanes.includes('tom'),
  ].filter(Boolean).length;
  const tempo_bpm = positive_number(
    [...chart.tempos]
      .filter(
        ({ beatsPerMinute }) =>
          Number.isFinite(beatsPerMinute) && beatsPerMinute > 0,
      )
      .sort((left, right) => left.tick - right.tick)[0]?.beatsPerMinute,
    120,
  );

  return {
    tempo_bpm: round(tempo_bpm, 1),
    tempo_pressure: clamp01((tempo_bpm - 55) / 165),
    subdivision: subdivision_for(onsets, bars, resolution),
    subdivision_density: clamp01(onsets.length / (total_beats * 4)),
    limb_independence_load: clamp01(
      0.55 * (foot_hand / onsets.length) +
        0.25 * (three_way / onsets.length) +
        0.2 * Math.max(0, (limb_roles - 1) / 3),
    ),
    kick_snare_hat_interplay: clamp01(
      (0.5 * foot_hand + 0.35 * snare_time + 0.15 * kick_offbeat) /
        onsets.length,
    ),
    fill_density: clamp01(
      0.65 * (tom_notes / Math.max(1, hand_notes)) +
        0.35 * (fill_bars.size / Math.max(1, bars.length)),
    ),
    syncopation: clamp01(syncopated / Math.max(1, kick_or_snare)),
    hand_stroke_density: clamp01(hand_notes / (total_beats * 4)),
    dynamic_range: clamp01(
      ((accent_count + ghost_count) / Math.max(1, note_count)) * 3,
    ),
    section_repetition: clamp01(repeated),
    meter: bars[0] ? `${bars[0].numerator}/${bars[0].denominator}` : '4/4',
    active_lanes,
    note_count,
    onset_count: onsets.length,
    evidence_confidence: clamp01(onsets.length / 16),
  };
}

function derived_demands(
  features: DrumChartFeatures | undefined,
): readonly SkillDemand[] {
  if (!features) {
    return [];
  }

  const weights = new Map<string, number>();
  const add = (skill_id: string, weight: number) => {
    const node = skillNodeById().get(skill_id);

    if (node && node.evidence_boundary !== 'unsupported' && weight > 0) {
      weights.set(skill_id, (weights.get(skill_id) ?? 0) + weight);
    }
  };
  const pulse =
    features.subdivision === 'sixteenth'
      ? 'pulse.sixteenth'
      : features.subdivision === 'triplet'
      ? 'pulse.triplet'
      : features.subdivision === 'eighth'
      ? 'pulse.eighth'
      : 'pulse.quarter';

  add(pulse, 0.35 + 0.2 * features.subdivision_density);
  add('coord.rock_three_way', features.limb_independence_load * 0.32);
  add('coord.syncopated_kick', features.syncopation * 0.22);
  add('kit.fill_entry', features.fill_density * 0.16);
  add('kit.tom_sweep', features.fill_density * 0.1);
  add('dynamics.accent', features.dynamic_range * 0.08);
  add('hand.singles', features.hand_stroke_density * 0.12);

  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);

  return total > 0
    ? [...weights.entries()]
        .map(([skill_id, weight]) => ({
          skill_id,
          weight: weight / total,
          target_bpm: features.tempo_bpm,
          context: `meter=${features.meter};subdivision=${features.subdivision}`,
        }))
        .sort((left, right) => left.skill_id.localeCompare(right.skill_id))
    : [];
}

export function build_my_wave_item_profile(
  item: MyWaveItem,
): MyWaveItemProfile {
  const features = item.chart
    ? extract_drum_chart_features(item.chart)
    : undefined;
  const demands = item.manifest?.demands ?? derived_demands(features);
  const evidence_level: MyWaveEvidenceLevel =
    features && item.manifest
      ? 'chart_and_manifest'
      : features
      ? 'chart'
      : item.manifest
      ? 'manifest'
      : 'thin';
  const evidence_confidence = clamp01(
    0.6 * (features?.evidence_confidence ?? 0) +
      0.4 * (item.manifest?.assessment_confidence ?? 0),
  );

  return {
    item_id: item.id,
    ...(features ? { features } : {}),
    demands,
    evidence_level,
    evidence_confidence,
  };
}

function feature_value(
  features: DrumChartFeatures,
  key: (typeof FEATURE_KEYS)[number],
): number {
  return key === 'section_novelty'
    ? 1 - features.section_repetition
    : features[key];
}

function feature_difficulty(features: DrumChartFeatures): number {
  return clamp01(
    FEATURE_KEYS.reduce(
      (total, key) =>
        total + FEATURE_WEIGHTS[key] * feature_value(features, key),
      0,
    ),
  );
}

function manifest_difficulty(demands: readonly SkillDemand[]): number {
  if (demands.length === 0) {
    return 0.5;
  }

  const total = demands.reduce((sum, demand) => sum + demand.weight, 0);
  const target_bpm =
    demands.reduce(
      (sum, demand) =>
        sum + demand.weight * positive_number(demand.target_bpm, 100),
      0,
    ) / Math.max(total, 0.0001);
  const diversity = Math.min(1, demands.length / 4);

  return clamp01(
    0.25 + 0.45 * clamp01((target_bpm - 55) / 165) + 0.3 * diversity,
  );
}

function state_map(
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

function readiness_for(
  demands: readonly SkillDemand[],
  states: ReadonlyMap<string, AtomicSkillState>,
): Readiness {
  if (demands.length === 0) {
    return { value: 0.5, confidence: 0 };
  }

  const weighted = demands.filter(({ weight }) => weight > 0);
  const total = weighted.reduce((sum, demand) => sum + demand.weight, 0);

  if (total <= 0) {
    return { value: 0.5, confidence: 0 };
  }

  const denominator = weighted.reduce(
    (sum, demand) =>
      sum +
      demand.weight /
        Math.max(0.05, skillProbability(states.get(demand.skill_id))),
    0,
  );

  return {
    value: clamp01(total / denominator),
    confidence: clamp01(
      weighted.reduce(
        (sum, demand) =>
          sum + demand.weight * skillConfidence(states.get(demand.skill_id)),
        0,
      ) / total,
    ),
  };
}

export function score_my_wave_difficulty({
  profile,
  atomic_states,
  now,
  playback_speed = 1,
}: {
  profile: MyWaveItemProfile;
  atomic_states: readonly AtomicSkillState[];
  now: string;
  playback_speed?: number;
}): MyWaveDifficulty {
  const effective_speed = positive_number(playback_speed, 1);
  const features = profile.features
    ? {
        ...profile.features,
        tempo_bpm: profile.features.tempo_bpm * effective_speed,
        tempo_pressure: clamp01(
          (profile.features.tempo_bpm * effective_speed - 55) / 165,
        ),
      }
    : undefined;
  const readiness = readiness_for(
    profile.demands,
    state_map(atomic_states, now),
  );
  const chart_difficulty = features
    ? feature_difficulty(features)
    : manifest_difficulty(profile.demands);

  return {
    chart_difficulty: round(chart_difficulty),
    learner_relative_difficulty: round(
      clamp01(
        0.45 * chart_difficulty +
          0.45 * (1 - readiness.value) +
          0.1 * (1 - readiness.confidence),
      ),
    ),
    skill_readiness: round(readiness.value),
    learner_confidence: round(readiness.confidence),
    evidence_confidence: round(profile.evidence_confidence),
  };
}

function weighted_cosine(
  left: readonly SkillDemand[],
  right: readonly SkillDemand[],
): { value: number; matched_skills: readonly string[] } | undefined {
  if (left.length === 0 || right.length === 0) {
    return undefined;
  }

  const left_weights = new Map(
    left.map(({ skill_id, weight }) => [skill_id, weight]),
  );
  const right_weights = new Map(
    right.map(({ skill_id, weight }) => [skill_id, weight]),
  );
  const ids = [...new Set([...left_weights.keys(), ...right_weights.keys()])];
  const dot = ids.reduce(
    (sum, id) =>
      sum + (left_weights.get(id) ?? 0) * (right_weights.get(id) ?? 0),
    0,
  );
  const left_norm = Math.sqrt(
    [...left_weights.values()].reduce((sum, weight) => sum + weight ** 2, 0),
  );
  const right_norm = Math.sqrt(
    [...right_weights.values()].reduce((sum, weight) => sum + weight ** 2, 0),
  );
  const matched_skills = ids
    .filter((id) => left_weights.has(id) && right_weights.has(id))
    .sort(
      (left_id, right_id) =>
        Math.min(
          left_weights.get(right_id) ?? 0,
          right_weights.get(right_id) ?? 0,
        ) -
          Math.min(
            left_weights.get(left_id) ?? 0,
            right_weights.get(left_id) ?? 0,
          ) || left_id.localeCompare(right_id),
    );

  return {
    value:
      left_norm > 0 && right_norm > 0
        ? clamp01(dot / (left_norm * right_norm))
        : 0,
    matched_skills,
  };
}

function chart_similarity(
  left: DrumChartFeatures | undefined,
  right: DrumChartFeatures | undefined,
): number | undefined {
  if (!left || !right) {
    return undefined;
  }

  return clamp01(
    1 -
      FEATURE_KEYS.reduce(
        (total, key) =>
          total +
          FEATURE_WEIGHTS[key] *
            Math.abs(feature_value(left, key) - feature_value(right, key)),
        0,
      ),
  );
}

function context_similarity(
  left: DrumChartFeatures | undefined,
  right: DrumChartFeatures | undefined,
): number | undefined {
  if (!left || !right) {
    return undefined;
  }

  const shared_lanes = left.active_lanes.filter((lane) =>
    right.active_lanes.includes(lane),
  ).length;
  const union_lanes = new Set([...left.active_lanes, ...right.active_lanes])
    .size;

  return clamp01(
    0.3 * Number(left.meter === right.meter) +
      0.4 * Number(left.subdivision === right.subdivision) +
      0.3 * (shared_lanes / Math.max(1, union_lanes)),
  );
}

function similarity_for(
  source: MyWaveItemProfile,
  candidate: MyWaveItemProfile,
): MyWaveSimilarity {
  const skills = weighted_cosine(source.demands, candidate.demands);
  const chart = chart_similarity(source.features, candidate.features);
  const context = context_similarity(source.features, candidate.features);
  const known = [skills?.value, chart, context].filter(
    (value): value is number => value !== undefined,
  );
  const total =
    skills && chart !== undefined && context !== undefined
      ? 0.55 * skills.value + 0.35 * chart + 0.1 * context
      : skills
      ? skills.value
      : chart !== undefined && context !== undefined
      ? 0.8 * chart + 0.2 * context
      : chart ?? context ?? 0;

  return {
    total: round(known.length > 0 ? total : 0),
    skill: round(skills?.value ?? 0),
    chart: round(chart ?? 0),
    context: round(context ?? 0),
    matched_skills: skills?.matched_skills ?? [],
  };
}

function zpd_for(
  candidate: MyWaveCandidate,
  states: readonly AtomicSkillState[],
  now: string,
): PracticeDecision | undefined {
  if (!candidate.manifest) {
    return undefined;
  }

  const playback_speed = positive_number(candidate.target_speed, 1);
  const zpd_candidate: ZpdCandidate = {
    item_id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    available: candidate.available && candidate.unlocked !== false,
    liked: candidate.liked,
    sequence: candidate.sequence,
    manifest:
      playback_speed === 1
        ? candidate.manifest
        : {
            ...candidate.manifest,
            demands: candidate.manifest.demands.map((demand) => ({
              ...demand,
              ...(demand.target_bpm
                ? { target_bpm: demand.target_bpm * playback_speed }
                : {}),
            })),
          },
  };

  return scoreZpdCandidate(zpd_candidate, { states, now }).decision;
}

function target_delta(step: MyWaveStep): number {
  if (step === 'consolidate') {
    return -0.06;
  }

  if (step === 'stretch') {
    return 0.16;
  }

  return step === 'diagnostic' ? 0 : 0.08;
}

function target_success(step: MyWaveStep): number {
  if (step === 'consolidate') {
    return 0.84;
  }

  if (step === 'stretch') {
    return 0.58;
  }

  return step === 'diagnostic' ? 0.5 : 0.75;
}

function zpd_fit_for(
  decision: PracticeDecision | undefined,
  step: MyWaveStep,
): number {
  if (!decision) {
    return 0.25;
  }

  if (decision.state === 'goal_preview_only') {
    return Number.NEGATIVE_INFINITY;
  }

  const proximity = clamp01(
    1 - Math.abs(decision.predicted_success - target_success(step)) / 0.32,
  );

  if (step === 'stretch') {
    return decision.state === 'scaffold_first' ? proximity : proximity * 0.55;
  }

  if (step === 'consolidate') {
    return decision.state === 'too_easy' ||
      decision.state === 'productive_consolidation'
      ? proximity
      : proximity * 0.6;
  }

  return decision.state === 'too_easy' ? proximity * 0.2 : proximity;
}

function intent_fit(candidate: MyWaveCandidate, intent: MyWaveIntent): number {
  if (intent === 'songs') {
    return candidate.kind === 'song' ? 1 : 0;
  }

  if (intent === 'learning') {
    return candidate.kind === 'lesson' ? 1 : 0.2;
  }

  return candidate.liked ? 1 : 0.55;
}

function actual_step(
  planned_step: MyWaveStep,
  difficulty_delta: number,
  decision: PracticeDecision | undefined,
): MyWaveStep {
  if (decision?.state === 'assessment') {
    return 'diagnostic';
  }

  if (decision?.state === 'scaffold_first' && difficulty_delta >= 0.06) {
    return 'stretch';
  }

  if (difficulty_delta <= -0.015) {
    return 'consolidate';
  }

  if (difficulty_delta >= 0.015) {
    return difficulty_delta >= 0.13 ? 'stretch' : 'step_up';
  }

  return planned_step === 'stretch' ? 'diagnostic' : planned_step;
}

function skill_label(skill_id: string | undefined): string | undefined {
  return skill_id
    ? skillNodeById().get(skill_id)?.label.toLocaleLowerCase('en-US')
    : undefined;
}

function shared_phrase(
  source: DrumChartFeatures | undefined,
  candidate: DrumChartFeatures | undefined,
  matched_skills: readonly string[],
): string {
  if (
    source?.subdivision === 'sixteenth' &&
    candidate?.subdivision === 'sixteenth' &&
    source.active_lanes.includes('hihat') &&
    candidate.active_lanes.includes('hihat')
  ) {
    return 'same 16th-hat groove';
  }

  if (source?.subdivision === candidate?.subdivision && source?.subdivision) {
    return `same ${source.subdivision} pulse`;
  }

  const label = skill_label(matched_skills[0]);

  return label ? `same ${label}` : 'similar charted coordination';
}

function reason_for({
  source,
  candidate,
  similarity,
  step,
}: {
  source: MyWaveItemProfile;
  candidate: PreparedCandidate;
  similarity: MyWaveSimilarity;
  step: MyWaveStep;
}): string {
  const affinity = candidate.affection.favourite
    ? candidate.affection.replay_count > 0
      ? 'a saved favourite you keep returning to'
      : 'a saved favourite'
    : candidate.affection.replay_count > 0
    ? `a song you keep returning to (${
        candidate.affection.replay_count
      } prior replay${candidate.affection.replay_count === 1 ? '' : 's'})`
    : undefined;

  if (
    source.evidence_level === 'thin' ||
    candidate.profile.evidence_level === 'thin'
  ) {
    const continuation =
      'Playable continuation. Chart and atomic-skill evidence remain thin.';

    return affinity ? `${affinity}. ${continuation}` : continuation;
  }

  const phrase = shared_phrase(
    source.features,
    candidate.profile.features,
    similarity.matched_skills,
  );
  const source_bpm = source.features?.tempo_bpm;
  const candidate_bpm = candidate.profile.features?.tempo_bpm;
  const bpm_delta =
    source_bpm !== undefined && candidate_bpm !== undefined
      ? candidate_bpm - source_bpm
      : 0;

  if (step === 'consolidate') {
    const continuation = `${phrase}, one notch easier to consolidate the pattern.`;

    return affinity ? `${affinity}. ${continuation}` : continuation;
  }

  if (step === 'stretch') {
    const continuation = `${phrase}, a short scaffolded stretch before the next clean pass.`;

    return affinity ? `${affinity}. ${continuation}` : continuation;
  }

  if (step === 'diagnostic') {
    const continuation = `${phrase}, a short probe because the atomic evidence is still sparse.`;

    return affinity ? `${affinity}. ${continuation}` : continuation;
  }

  const continuation =
    bpm_delta >= 4
      ? `${phrase}, one notch faster.`
      : `${phrase}, one notch more demanding.`;

  return affinity ? `${affinity}. ${continuation}` : continuation;
}

function prepared_sort(
  left: { prepared: PreparedCandidate; score: number },
  right: { prepared: PreparedCandidate; score: number },
): number {
  return (
    right.score - left.score ||
    (left.prepared.candidate.sequence ?? Number.MAX_SAFE_INTEGER) -
      (right.prepared.candidate.sequence ?? Number.MAX_SAFE_INTEGER) ||
    left.prepared.candidate.id.localeCompare(right.prepared.candidate.id)
  );
}

function choose_for_step({
  planned_step,
  remaining,
  source_difficulty,
  intent,
}: {
  planned_step: MyWaveStep;
  remaining: readonly PreparedCandidate[];
  source_difficulty: MyWaveDifficulty;
  intent: MyWaveIntent;
}): PreparedCandidate | undefined {
  return remaining
    .map((prepared) => {
      const difficulty_delta =
        prepared.difficulty.learner_relative_difficulty -
        source_difficulty.learner_relative_difficulty;
      const difficulty_fit = clamp01(
        1 - Math.abs(difficulty_delta - target_delta(planned_step)) / 0.16,
      );
      const zpd_fit = zpd_fit_for(prepared.decision, planned_step);
      const joy_fit =
        zpd_fit === Number.NEGATIVE_INFINITY
          ? 0
          : prepared.affection.value * Math.min(difficulty_fit, zpd_fit);
      const score =
        zpd_fit === Number.NEGATIVE_INFINITY
          ? Number.NEGATIVE_INFINITY
          : 0.48 * prepared.similarity.total +
            0.28 * difficulty_fit +
            0.18 * zpd_fit +
            0.06 * intent_fit(prepared.candidate, intent) +
            0.24 * joy_fit;

      return { prepared, score };
    })
    .filter(({ score }) => Number.isFinite(score))
    .sort(prepared_sort)[0]?.prepared;
}

function evidence_level_for(
  source: MyWaveItemProfile,
  candidate: MyWaveItemProfile,
): MyWaveEvidenceLevel {
  if (
    source.evidence_level === 'chart_and_manifest' &&
    candidate.evidence_level === 'chart_and_manifest'
  ) {
    return 'chart_and_manifest';
  }

  if (source.features && candidate.features) {
    return 'chart';
  }

  if (source.demands.length > 0 && candidate.demands.length > 0) {
    return 'manifest';
  }

  return 'thin';
}

function candidates_for_intent(
  candidates: readonly MyWaveCandidate[],
  intent: MyWaveIntent,
): readonly MyWaveCandidate[] {
  const available_candidates = candidates.filter(
    ({ available: candidate_available, unlocked }) =>
      candidate_available && unlocked !== false,
  );
  const songs = available_candidates.filter(({ kind }) => kind === 'song');

  return intent === 'songs' ? songs : available_candidates;
}

export function build_my_wave(input: BuildMyWaveInput): MyWaveResult {
  const source = build_my_wave_item_profile(input.played);
  const source_difficulty = score_my_wave_difficulty({
    profile: source,
    atomic_states: input.atomic_states,
    now: input.now,
    playback_speed: input.played.playback_speed,
  });
  const playable = candidates_for_intent(input.candidates, input.intent);
  const distinct = playable.filter(({ id }) => id !== input.played.id);
  const pool = distinct.length > 0 ? distinct : playable;
  const max_replay_count = Math.max(
    0,
    ...pool.map(({ replay_count }) => positive_number(replay_count, 0)),
  );
  const prepared = pool.map((candidate) => {
    const profile = build_my_wave_item_profile(candidate);

    return {
      candidate,
      profile,
      difficulty: score_my_wave_difficulty({
        profile,
        atomic_states: input.atomic_states,
        now: input.now,
        playback_speed: candidate.target_speed,
      }),
      similarity: similarity_for(source, profile),
      affection: score_my_wave_affection({
        liked: candidate.liked,
        replay_count: candidate.replay_count,
        max_replay_count,
      }),
      decision: zpd_for(candidate, input.atomic_states, input.now),
    } satisfies PreparedCandidate;
  });

  if (prepared.length === 0) {
    return {
      policy_version: MY_WAVE_POLICY_VERSION,
      strategy: 'none_available',
      source,
      recommendations: [],
    };
  }

  const configured_limit = input.limit ?? STEP_PLAN.length;
  const limit = Number.isFinite(configured_limit)
    ? Math.max(1, Math.min(STEP_PLAN.length, Math.trunc(configured_limit)))
    : STEP_PLAN.length;
  const remaining = [...prepared];
  const recommendations: MyWaveRecommendation[] = [];

  STEP_PLAN.slice(0, limit).forEach((planned_step) => {
    const selected = choose_for_step({
      planned_step,
      remaining,
      source_difficulty,
      intent: input.intent,
    });

    if (!selected) {
      return;
    }

    const index = remaining.findIndex(
      ({ candidate }) => candidate.id === selected.candidate.id,
    );

    if (index >= 0) {
      remaining.splice(index, 1);
    }

    const difficulty_delta = round(
      selected.difficulty.learner_relative_difficulty -
        source_difficulty.learner_relative_difficulty,
    );
    const step = actual_step(planned_step, difficulty_delta, selected.decision);
    const reason = reason_for({
      source,
      candidate: selected,
      similarity: selected.similarity,
      step,
    });
    const evidence_level = evidence_level_for(source, selected.profile);
    const receipt: MyWaveReceipt = {
      policy_version: MY_WAVE_POLICY_VERSION,
      source_item_id: input.played.id,
      candidate_item_id: selected.candidate.id,
      intent: input.intent,
      planned_step,
      selected_step: step,
      similarity: selected.similarity,
      source_difficulty,
      candidate_difficulty: selected.difficulty,
      difficulty_delta,
      affection: selected.affection,
      ...(selected.decision
        ? {
            predicted_success: selected.decision.predicted_success,
            zpd_state: selected.decision.state,
            zpd_decision: selected.decision,
          }
        : {}),
      evidence: {
        level: evidence_level,
        ...(input.played.manifest
          ? { source_manifest_revision: input.played.manifest.source_revision }
          : {}),
        ...(selected.candidate.manifest
          ? {
              candidate_manifest_revision:
                selected.candidate.manifest.source_revision,
            }
          : {}),
        ...(input.played.chart_revision
          ? { source_chart_revision: input.played.chart_revision }
          : {}),
        ...(selected.candidate.chart_revision
          ? { candidate_chart_revision: selected.candidate.chart_revision }
          : {}),
        source_playback_speed: positive_number(input.played.playback_speed, 1),
        candidate_playback_speed: positive_number(
          selected.candidate.target_speed,
          1,
        ),
        source_chart_notes: source.features?.note_count ?? 0,
        candidate_chart_notes: selected.profile.features?.note_count ?? 0,
        source_skill_ids: [
          ...new Set(source.demands.map(({ skill_id }) => skill_id)),
        ].sort(),
        candidate_skill_ids: [
          ...new Set(selected.profile.demands.map(({ skill_id }) => skill_id)),
        ].sort(),
        atomic_state_count: input.atomic_states.length,
      },
      reason,
    };

    recommendations.push({
      candidate: selected.candidate,
      step,
      reason,
      similarity: selected.similarity,
      difficulty: selected.difficulty,
      affection: selected.affection,
      receipt,
    });
  });

  const strong_evidence = recommendations.some(
    ({ receipt }) => receipt.evidence.level !== 'thin',
  );

  return {
    policy_version: MY_WAVE_POLICY_VERSION,
    strategy:
      recommendations.length === 0
        ? 'no_zpd_candidate'
        : strong_evidence
        ? 'skill_zpd_wave'
        : 'thin_evidence_wave',
    source,
    recommendations,
  };
}
