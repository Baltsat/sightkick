import type { ScoreData } from '../../types';
import type { GameMode } from '../types';
import { calculateAccuracy, getStarRating } from '../scoring';

const TARGET_SPEED_EPSILON = 0.001;

export const LESSON_CLEAR_ACCURACY = 0.9;

export interface LessonProgressionDecision {
  qualifies: boolean;
  fullCoverage: boolean;
  atTargetSpeed: boolean;
  meetsAccuracyTarget: boolean;
  accuracy: number;
  starsEarned: number;
}

export interface LessonTraversalEvidence {
  /** The run began at the authored start, rather than at a clicked bar. */
  startedAtBeginning: boolean;
  /** No scrub, recovery rewind, loop wrap, or resume restarted transport. */
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
 * Lessons launch directly in Practice, so their one honest progression path
 * is a complete target-speed pass. Aggregate hit/miss counts cannot prove
 * coverage because Engine resolves skipped notes at the true end; the caller
 * must supply run-wide traversal evidence instead. Ordinary song Practice
 * remains analytics-only.
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
      atTargetSpeed &&
      fullCoverage &&
      meetsAccuracyTarget,
    fullCoverage,
    atTargetSpeed,
    meetsAccuracyTarget,
    accuracy,
    starsEarned,
  };
}
