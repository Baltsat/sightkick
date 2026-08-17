import type { RunSummary } from '../practice-stats';
import type { StoredHitRecord } from '../practice-stats';
import type { SkillEvidenceEvent } from '../pedagogy';
import type { ParsedChart } from '../../../chart-parser/types';

export type PatternSubdivision =
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'triplet'
  | 'mixed';

export type PatternGroove =
  | 'quarter-pulse'
  | 'eighth-groove'
  | 'sixteenth-groove'
  | 'triplet-groove'
  | 'shuffle'
  | 'rock-backbeat'
  | 'linear'
  | 'fill'
  | 'mixed';

export type PatternDynamics = 'even' | 'accented' | 'ghosted' | 'mixed';

export type PatternIndependence =
  | 'single-limb'
  | 'two-way'
  | 'three-way'
  | 'linear';

export type PatternLimb =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'ride'
  | 'crash'
  | 'tom1'
  | 'tom2'
  | 'tom3';

export interface PatternOnset {
  position: number;
  limbs: readonly PatternLimb[];
  accented: boolean;
  ghosted: boolean;
}

export interface PatternSkillWeight {
  skill_id: string;
  weight: number;
}

export interface PatternExemplar {
  dsl: string;
  rhythmic_signature: string;
}

export interface AtomicPatternFigure {
  figure_id: string;
  source_item_id: string;
  measure_index: number;
  meter: string;
  subdivision: PatternSubdivision;
  groove: PatternGroove;
  dynamics: PatternDynamics;
  independence: PatternIndependence;
  contains_rests: boolean;
  rest_ratio: number;
  limb_combinations: readonly string[];
  onsets: readonly PatternOnset[];
  rhythmic_signature: string;
  skill_weights: readonly PatternSkillWeight[];
  exemplar: PatternExemplar;
}

export interface PatternFamily {
  family_id: string;
  label: string;
  subdivision: PatternSubdivision;
  groove: PatternGroove;
  dynamics?: PatternDynamics;
  independence?: PatternIndependence;
  contains_rests: boolean;
  rest_ratio: number;
  limb_combinations: readonly string[];
  rhythmic_signature: string;
  skill_weights: readonly PatternSkillWeight[];
  lesson_ids: readonly string[];
  occurrence_count: number;
  source_item_ids: readonly string[];
  exemplar: PatternExemplar;
}

export interface PatternChartModel {
  item_id: string;
  figures: readonly AtomicPatternFigure[];
  families: readonly PatternFamily[];
  demand_skill_ids: readonly string[];
}

export interface DecomposePatternChartOptions {
  item_id?: string;
  title?: string;
  kind?: 'song' | 'lesson';
  similarity_threshold?: number;
}

export interface PatternPracticeHistory {
  runs: readonly RunSummary[];
  archived_events?: readonly SkillEvidenceEvent[];
}

export type PatternCoverage = 'played' | 'never_played';

export type PatternTrend = 'improving' | 'stable' | 'declining' | 'unknown';

export interface PatternFamilyProfile {
  family: PatternFamily;
  coverage: PatternCoverage;
  strength: number;
  trend: PatternTrend;
  trend_delta: number;
  evidence_event_count: number;
  played_run_count: number;
  last_played_at?: string;
}

export interface PatternPlayerProfile {
  families: readonly PatternFamilyProfile[];
  played_family_count: number;
  total_family_count: number;
  evidence_event_count: number;
  computed_through?: string;
}

export type PatternFragmentKind = 'bar' | 'phrase';

export interface PatternFragmentMember {
  start_measure_index: number;
  end_measure_index: number;
  start_tick: number;
  end_tick: number;
  similarity: number;
}

export interface PatternFragment {
  fragment_id: string;
  kind: PatternFragmentKind;
  measure_count: number;
  label: string;
  members: readonly PatternFragmentMember[];
  occurrence_count: number;
  note_count: number;
  song_note_share: number;
  skill_weights: readonly PatternSkillWeight[];
}

export interface PatternFragmentMap {
  item_id: string;
  total_note_count: number;
  fragments: readonly PatternFragment[];
}

export type FragmentEvidenceState = 'measured' | 'thin-evidence';

export interface FragmentDifficulty {
  state: FragmentEvidenceState;
  expected_notes: number;
  miss_density?: number;
  wrong_density?: number;
  timing_spread_ms?: number;
  score?: number;
}

export interface FragmentPracticeValue {
  fragment: PatternFragment;
  difficulty: FragmentDifficulty;
  skill_weakness: number;
  skill_evidence_state: 'measured' | 'unknown';
  score?: number;
}

export interface FragmentLoopProposal {
  fragment: PatternFragment;
  bar_start: number;
  bar_end: number;
  opening_speed: number;
  opening_window_ms: number;
  opening_window_standard: 'target' | 'better' | 'ceiling';
  reason: string;
  practice_value: FragmentPracticeValue;
}

export interface RankFragmentPracticeOptions {
  chart: ParsedChart;
  fragments: readonly PatternFragment[];
  records: readonly StoredHitRecord[];
  runs?: readonly RunSummary[];
  profile?: PatternPlayerProfile;
  playback_speed?: number;
  minimum_expected_notes?: number;
}
