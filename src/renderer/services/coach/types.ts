import { KitElement, StoredPracticeRun } from '../practice-stats';

export type CoachFindingKind =
  | 'trouble-bars'
  | 'breakdown-transition'
  | 'lane-weakness'
  | 'speed-sensitivity'
  | 'pad-confusion'
  // Compatibility only for in-memory callers compiled against the earlier
  // literal. Analysis never emits this value and no Coach findings persist.
  | `limb${'-'}weakness`;

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
  hitCount?: number;
  missCount?: number;
  wrongHitCount?: number;
  matchedWrongPadPairs?: number;
}

export type CoachFindingReasonCode =
  | 'low-bar-accuracy'
  | 'pattern-transition-accuracy-drop'
  | 'lane-accuracy-or-timing'
  | 'speed-comparison'
  | 'repeated-unambiguous-wrong-pad-pairs'
  | 'reported-deterministic-evidence';

/** Structured deterministic basis for optional narrative phrasing. */
export interface CoachFindingReason {
  code: CoachFindingReasonCode;
  counts: {
    samples: number;
    hits?: number;
    misses?: number;
    wrongHits?: number;
    matchedWrongPadPairs?: number;
  };
}

export type CoachRemediation =
  | {
      status: 'available';
      lessonId: string;
      lessonTitle: string;
    }
  | {
      status: 'unsupported';
      detail: string;
    };

export interface CoachFinding {
  id: string;
  kind: CoachFindingKind;
  severity: CoachSeverity;
  title: string;
  summary: string;
  skillTag: CoachSkillTag;
  evidence: CoachEvidence;
  reason?: CoachFindingReason;
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
