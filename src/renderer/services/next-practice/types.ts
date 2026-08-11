import { Difficulty } from 'scan-chart';
import { CoachFinding } from '../coach';
import {
  KitElement,
  LaneAccuracy,
  PersistedCoachFindingEvidence,
  RunSummary,
} from '../practice-stats';
import type {
  DrumLearningProfile,
  DrumSkillAxisId,
  SkillTrendDirection,
} from '../learning-profile';
import type {
  AtomicSkillState,
  ItemSkillManifest,
  PracticeDecision,
  SkillReview,
  SongGoal,
} from '../pedagogy/types';

export type PracticeCandidateKind = 'song' | 'lesson';

export interface CandidateLaneDemand {
  element: KitElement;
  /** Relative demand. Values are normalized across the candidate. */
  weight: number;
}

/**
 * The minimum metadata needed to rank one playable item. The caller owns
 * library/auth checks and must set `available` honestly; the recommender never
 * promotes a metadata-only or locked item into a playable recommendation.
 */
export interface PracticeCandidate {
  id: string;
  title: string;
  kind: PracticeCandidateKind;
  difficulty: Difficulty;
  available: boolean;
  /** Defaults to true. Intended for curriculum prerequisites. */
  unlocked?: boolean;
  liked?: boolean;
  /** Stable curriculum position. Lower values are earlier. */
  sequence?: number;
  /** Curriculum/Coach tags such as `kick-independence` or `triplet-feel`. */
  skills?: readonly string[];
  /** Explicit chart demand. When absent, prior lane evidence is used. */
  targetLanes?: readonly CandidateLaneDemand[];
  /** Stable authored curriculum ID (for example `07.02`) when this is a lesson. */
  curriculumId?: string;
  /** Authored lesson IDs which must be mastered before this lesson is eligible. */
  prerequisiteIds?: readonly string[];
  /** Authored tempo ladder, distinct from a song's playback-speed control. */
  bpmStart?: number;
  bpmTarget?: number;
  /** Concrete authored dose and completion contract shown with the recommendation. */
  doseRule?: string;
  masteryRule?: string;
  /** Author cue and the system's explicit MIDI assessment boundary. */
  cue?: string;
  assessmentBoundary?: string;
  /** Target playback speed, normally 1. */
  targetSpeed?: number;
  /**
   * Optional normalized pedagogical challenge, 0..1. This is important for
   * lessons whose chart track is technically Expert even when the exercise is
   * an early beginner lesson. Regular songs fall back to difficulty.
   */
  challengeLevel?: number;
  /** Existing curriculum/mastery state can override inferred mastery. */
  mastered?: boolean;
  availableDifficulties?: readonly Difficulty[];
  chartTotalNotes?: number;
  itemManifest?: ItemSkillManifest;
}

export interface PracticeHistoryEntry {
  candidateId: string;
  summary: RunSummary;
}

export interface NextPracticeInput {
  candidates: readonly PracticeCandidate[];
  history: readonly PracticeHistoryEntry[];
  /** Evidence-backed Coach findings from any recently analyzed runs. */
  coachFindings?: readonly CoachFinding[];
  /** Compact Coach evidence persisted with newly completed run summaries. */
  coachEvidence?: readonly PersistedCoachFindingEvidence[];
  /** Existing saved lane rollups when Coach detail is not open on this screen. */
  weakLanes?: readonly LaneAccuracy[];
  /** Explicit clock keeps the service pure and tests deterministic. */
  nowMs: number;
  goalDate?: string;
  learningProfile?: DrumLearningProfile;
  pedagogy?: {
    atomicStates: readonly AtomicSkillState[];
    itemManifests?: readonly ItemSkillManifest[];
    activeGoal?: SongGoal;
    dueReviews?: readonly SkillReview[];
  };
  limit?: number;
}

export type RecommendationFactorKey =
  | 'zone-fit'
  | 'weak-skill-match'
  | 'weak-lane-match'
  | 'speed-readiness'
  | 'freshness'
  | 'familiarity'
  | 'difficulty-fit'
  | 'preference'
  | 'curriculum-progress'
  | 'deadline-pacing'
  | 'same-song-fatigue'
  | 'recent-mastery'
  | 'atomic-zpd'
  | 'atomic-prerequisite'
  | 'atomic-retention'
  | 'atomic-transfer'
  | 'atomic-evidence';

export interface RecommendationFactor {
  key: RecommendationFactorKey;
  label: string;
  /** Normalized evidence value. Penalties are negative. */
  value: number;
  /** Relative positive weight, or maximum point penalty. */
  weight: number;
  /** Actual signed contribution to the final 0..100 score. */
  contribution: number;
  detail: string;
}

export interface RecommendationConfidence {
  value: number;
  level: 'low' | 'medium' | 'high';
  evidenceRuns: number;
  detail: string;
}

export interface DirectRemediationRoute {
  findingCount: number;
}

export interface DeadlineWeeklyTarget {
  week: number;
  dueDate: string;
  targetScore: number;
}

export interface DeadlineSkillTarget {
  axisId: DrumSkillAxisId;
  label: string;
  prerequisiteAxisIds: readonly DrumSkillAxisId[];
  currentScore: number;
  deadlineTarget: number;
  weeklyTargets: readonly DeadlineWeeklyTarget[];
  weeklyTarget: number;
  behindBy: number;
  pacingValue: number;
  trend: SkillTrendDirection;
  trendDelta: number;
  evidenceRuns: number;
  detail: string;
}

export interface DeadlinePacingSummary {
  goalDate: string;
  weeksRemaining: number;
  targets: readonly DeadlineSkillTarget[];
}

export interface CandidateDeadlinePacing {
  axisId: DrumSkillAxisId;
  label: string;
  weeklyTarget: number;
  behindBy: number;
  value: number;
  detail: string;
}

export interface RankedPracticeCandidate {
  candidate: PracticeCandidate;
  score: number;
  predictedSuccess: number;
  suggestedSpeed: number;
  mastery: number;
  directRemediation?: DirectRemediationRoute;
  deadlinePacing?: CandidateDeadlinePacing;
  /** The authored lesson metadata rendered by Home/Journey. */
  lessonPlan?: {
    cue: string;
    bpmStart?: number;
    bpmTarget?: number;
    doseRule?: string;
    masteryRule?: string;
    prerequisiteIds: readonly string[];
    assessmentBoundary: string;
  };
  reason: string;
  factors: RecommendationFactor[];
  confidence: RecommendationConfidence;
  decisionReceipt?: PracticeDecision;
}

export interface NextPracticeResult {
  strategy:
    | 'evidence-ranked'
    | 'atomic-evidence-ranked'
    | 'deterministic-fallback'
    | 'none-available';
  recommendation?: RankedPracticeCandidate;
  ranking: RankedPracticeCandidate[];
  deadlinePacing?: DeadlinePacingSummary;
}
