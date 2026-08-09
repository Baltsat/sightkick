import { ScoreData } from '../../../types';
import { HitRecord, TutorRunEvidence } from './types';

export interface RunEvidenceDecision {
  /** Store the run for Coach/history, even when it earns no reward. */
  persistEligible: boolean;
  /** Mint XP/streak/stars/high score only after a correct judged hit. */
  rewardEligible: boolean;
  hasIntent: boolean;
}

/**
 * Separate learning evidence from rewards.
 *
 * Engine derives misses for every untouched chart at natural end, so misses
 * alone never prove that a person attempted the run. A hit or wrong-pad
 * strike does. A safe ready-state kit command also does because Judge is
 * intentionally disabled while that command is recognized.
 */
export function decideRunEvidence({
  score,
  records,
  guidedReady,
  tutor,
}: {
  score: ScoreData;
  records: HitRecord[];
  guidedReady: boolean;
  tutor?: TutorRunEvidence;
}): RunEvidenceDecision {
  const hasActiveInput = records.some(
    (record) => record.verdict === 'hit' || record.verdict === 'wrong',
  );
  const hasTutorEvidence = Boolean(
    tutor &&
      (tutor.interventions.length > 0 || tutor.recoveryAttempts.length > 0),
  );
  const hasArchivedTutorInput = Boolean(
    tutor &&
      (tutor.interventions.some(
        (intervention) =>
          intervention.triggerJudgements?.some(
            (judgement) =>
              judgement.verdict === 'hit' || judgement.verdict === 'wrong',
          ),
      ) ||
        tutor.recoveryAttempts.some(
          (attempt) => attempt.stats.hits > 0 || attempt.stats.wrong > 0,
        )),
  );
  const hasIntent = guidedReady || hasActiveInput || hasArchivedTutorInput;

  return {
    hasIntent,
    persistEligible: hasIntent && (records.length > 0 || hasTutorEvidence),
    rewardEligible: (score.hitNotes ?? 0) > 0,
  };
}
