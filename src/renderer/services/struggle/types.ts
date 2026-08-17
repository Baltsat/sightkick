import type {
  KitElement,
  RunSectionEvidence,
  StoredHitRecord,
  StoredPracticeRun,
} from '../practice-stats';

export interface StruggleChartNote {
  tick: number;
  element: KitElement;
}

export interface StruggleChartMeasure {
  index: number;
  startTick: number;
  endTick: number;
  notes: readonly StruggleChartNote[];
}

export interface StruggleChartTempo {
  tick: number;
  bpm: number;
}

export interface StruggleChart {
  resolution: number;
  tempos: readonly StruggleChartTempo[];
  measures: readonly StruggleChartMeasure[];
}

export interface StruggleSectionDefinition {
  barStart: number;
  barEnd: number;
  startTick: number;
  endTick: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  patternSignature: string;
}

export interface BuildRunSectionEvidenceInput {
  records: readonly StoredHitRecord[];
  sections: readonly StruggleSectionDefinition[];
  attemptedRange?: {
    startTick: number;
    endTick: number;
  };
}

export type PatternHistoryState = 'complete' | 'partial';

export interface StruggleHistory {
  runs: readonly StoredPracticeRun[];
  archivedPatternCounts?: Readonly<Record<string, number>>;
  patternHistoryState?: PatternHistoryState;
}

export interface SlowLoopPassCriteria {
  minimumResolvedNotes: number;
  minimumAccuracy: number;
  maximumMisses: number;
  maximumWrongHits: number;
  requiredConsecutiveCleanPasses: number;
}

export interface SlowLoopDrillProposal {
  barStart: number;
  barEnd: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  tempoMultiplier: number;
  targetTempoMultiplier: number;
  maximumAttempts: number;
  terminalOutcomes: readonly ['mastered', 'deferred'];
  passCriteria: SlowLoopPassCriteria;
}

export type PatternNovelty = 'new' | 'seen-before' | 'history-unavailable';

export interface CollapseSection {
  barStart: number;
  barEnd: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  expectedNotes: number;
  hits: number;
  misses: number;
  wrongHits: number;
  hitRate: number;
  patternSignatures: readonly string[];
  novelPatternSignatures: readonly string[];
  novelty: PatternNovelty;
  isNovel: boolean;
  drill: SlowLoopDrillProposal;
}

export type StruggleReport =
  | {
      status: 'available';
      analyzedSections: number;
      collapseSections: readonly CollapseSection[];
    }
  | {
      status: 'insufficient-section-evidence';
      analyzedSections: 0;
      collapseSections: readonly [];
    };

export interface AnalyzeStruggleInput {
  run: StoredPracticeRun;
  history: StruggleHistory;
}

export type PersistedStruggleSectionEvidence = RunSectionEvidence;
