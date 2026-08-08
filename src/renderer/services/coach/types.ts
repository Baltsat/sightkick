import { KitElement, StoredPracticeRun } from '../practice-stats';

export type CoachFindingKind =
  | 'trouble-bars'
  | 'breakdown-transition'
  | 'limb-weakness'
  | 'speed-sensitivity'
  | 'pad-confusion';

export type CoachSeverity = 'high' | 'medium' | 'low';

export type CoachSkillTag =
  | 'fills'
  | 'sixteenth-hihat'
  | 'dynamics'
  | 'triplets'
  | 'shuffle'
  | 'kick-independence'
  | 'timing'
  | 'pad-accuracy';

export interface CoachMeasureNote {
  tick: number;
  element: KitElement;
}

export interface CoachMeasure {
  index: number;
  startTick: number;
  endTick: number;
  isCompound: boolean;
  tupletCount: number;
  notes: CoachMeasureNote[];
}

export interface CoachTempo {
  tick: number;
  bpm: number;
}

export interface CoachChart {
  resolution: number;
  tempos: CoachTempo[];
  measures: CoachMeasure[];
}

export interface CoachEvidence {
  barStart?: number;
  barEnd?: number;
  accuracy?: number;
  previousAccuracy?: number;
  sampleCount: number;
  lane?: KitElement;
  meanMs?: number;
  bpm?: number;
  slowSpeed?: number;
  slowAccuracy?: number;
  fastSpeed?: number;
  fastAccuracy?: number;
  actualElement?: KitElement;
  expectedElement?: KitElement;
}

export interface CoachFinding {
  id: string;
  kind: CoachFindingKind;
  severity: CoachSeverity;
  title: string;
  summary: string;
  skillTag: CoachSkillTag;
  evidence: CoachEvidence;
}

export interface CoachFindings {
  analyzedRuns: number;
  findings: CoachFinding[];
}

export interface AnalyzeCoachInput {
  runs: StoredPracticeRun[];
  chart: CoachChart;
}

export interface CoachSongMetadata {
  name: string;
  artist: string;
  difficulty: string;
}
