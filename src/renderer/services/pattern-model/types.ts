import type { RunSummary } from '../practice-stats';
import type { SkillEvidenceEvent } from '../pedagogy';

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
