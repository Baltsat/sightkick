import type { ScoreData } from '../../types';
import type { GameMode } from '../types';
import { calculateAccuracy, getStarRating } from '../scoring';

const TARGET_SPEED_EPSILON = 0.001;

/** A clear means ready for the next learning step, not concert mastery. */
export const LESSON_CLEAR_ACCURACY = 0.82;

export const LESSON_CLEAR_MIN_SPEED = 0.7;

export interface LessonProgressionDecision {
  qualifies: boolean;
  fullCoverage: boolean;
  atTargetSpeed: boolean;
  meetsLearningTempo: boolean;
  meetsAccuracyTarget: boolean;
  accuracy: number;
  starsEarned: number;
}

export interface LessonTraversalEvidence {
  /** The run began at the authored start, rather than at a clicked bar. */
  startedAtBeginning: boolean;
  /** Whether the transport stayed linear; retained for richer run evidence. */
  uninterrupted: boolean;
  /** Lowest speed used anywhere in this run, not merely its final speed. */
  minimumPlaybackSpeed: number;
}

export const EMPTY_LESSON_TRAVERSAL: LessonTraversalEvidence = {
  startedAtBeginning: false,
  uninterrupted: false,
  minimumPlaybackSpeed: 0,
};

/**
 * Lessons launch directly in Practice. Progression rewards a complete,
 * good-enough learning pass; authored full-tempo mastery remains the next
 * goal instead of blocking the curriculum. Tutor rewinds do not invalidate a
 * run: they are evidence that teaching happened, while skipped notes still
 * lower scored accuracy. A clicked middle-bar start remains ineligible.
 */
export function decideLessonProgression({
  isLesson,
  gameMode,
  traversal,
  score,
}: {
  isLesson: boolean;
  gameMode: GameMode | undefined;
  traversal: LessonTraversalEvidence;
  score: ScoreData;
}): LessonProgressionDecision {
  const atTargetSpeed =
    traversal.minimumPlaybackSpeed >= 1 - TARGET_SPEED_EPSILON;
  const meetsLearningTempo =
    traversal.minimumPlaybackSpeed >=
    LESSON_CLEAR_MIN_SPEED - TARGET_SPEED_EPSILON;
  const fullCoverage =
    score.totalNotes > 0 &&
    traversal.startedAtBeginning &&
    traversal.uninterrupted;
  const accuracy = calculateAccuracy(score);
  const meetsAccuracyTarget = accuracy >= LESSON_CLEAR_ACCURACY;
  const starsEarned = getStarRating(score);

  return {
    qualifies:
      isLesson &&
      gameMode === 'practice' &&
      meetsLearningTempo &&
      fullCoverage &&
      meetsAccuracyTarget,
    fullCoverage,
    atTargetSpeed,
    meetsLearningTempo,
    meetsAccuracyTarget,
    accuracy,
    starsEarned,
  };
}
