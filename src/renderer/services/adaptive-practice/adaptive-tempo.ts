import type { RunSummary } from '../practice-stats';
import { TEMPO_STEP, timingStandardForRun } from './adaptive-timing';

export const SPEED_BAND_EPSILON = 0.05;

export const AUTO_SPEED_FLOOR = 0.3;

export const AUTO_SPEED_CEILING = 1;

export const HARD_DEMOTE_STEP = 0.2;

export const PROMOTE_STREAK = 2;

export const PROMOTE_STREAK_AFTER_DEMOTE = 3;

export const HARD_DEMOTE_STREAK = 2;

export const PLATEAU_RUNS = 5;

export interface AutoTempoResult {
  speed: number;
  action: 'hold' | 'promote' | 'demote_soft' | 'demote_hard';
  reason: string;
}

export function resolvePracticeSpeed({
  speedControl,
  learnerPlaybackSpeed,
  requestedPracticeSpeed,
  autoPracticeSpeed,
  autoTempoEnabled,
  autoTempoPausedThisSession,
  zpdSeed,
}: {
  speedControl: boolean;
  learnerPlaybackSpeed: number | null;
  requestedPracticeSpeed: number | undefined;
  autoPracticeSpeed: number | null;
  autoTempoEnabled: boolean;
  autoTempoPausedThisSession: boolean;
  zpdSeed: number | undefined;
}): number {
  if (!speedControl) {
    return 1;
  }

  const autoSpeed =
    autoTempoEnabled && !autoTempoPausedThisSession ? autoPracticeSpeed : null;

  return (
    learnerPlaybackSpeed ?? requestedPracticeSpeed ?? autoSpeed ?? zpdSeed ?? 1
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantizedSpeed(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(speed: number): string {
  return `${Math.round(speed * 100)}%`;
}

export function trustworthy(run: RunSummary): boolean {
  return timingStandardForRun(run) !== 'pre-grid-standard';
}

export function filterRunsForSpeedBand(
  runs: readonly RunSummary[] | null | undefined,
  speed: number,
): RunSummary[] {
  return (runs ?? []).filter(
    (run) =>
      run.playbackSpeed !== undefined &&
      Math.abs(run.playbackSpeed - speed) <= SPEED_BAND_EPSILON,
  );
}

function newestFirst(left: RunSummary, right: RunSummary): number {
  return right.completedAt.localeCompare(left.completedAt);
}

export function deriveNextAutoSpeed({
  currentAutoSpeed,
  currentBand,
  runs,
}: {
  currentAutoSpeed: number;
  currentBand: number;
  runs: RunSummary[];
}): AutoTempoResult {
  const bandRuns = filterRunsForSpeedBand(runs, currentBand)
    .filter(trustworthy)
    .sort(newestFirst);
  const latest = bandRuns[0];

  if (!latest) {
    return {
      speed: currentAutoSpeed,
      action: 'hold',
      reason: 'Gathering evidence at this tempo.',
    };
  }

  if (latest.timingLadderAction === 'lower-tempo') {
    const recent = runs
      .filter(trustworthy)
      .sort(newestFirst)
      .slice(0, HARD_DEMOTE_STREAK);
    const hard =
      recent.length === HARD_DEMOTE_STREAK &&
      recent.every((run) => run.timingLadderAction === 'lower-tempo');
    const speed = quantizedSpeed(
      clamp(
        currentAutoSpeed - (hard ? HARD_DEMOTE_STEP : TEMPO_STEP),
        AUTO_SPEED_FLOOR,
        AUTO_SPEED_CEILING,
      ),
    );

    return {
      speed,
      action: hard ? 'demote_hard' : 'demote_soft',
      reason: hard
        ? `2 rough runs in a row. Tempo down to ${pct(
            speed,
          )} to rebuild clean reps.`
        : `Last run needed a slower tempo. Tempo down to ${pct(speed)}.`,
    };
  }

  if (latest.timingLadderAction === 'raise-tempo') {
    let streak = 0;

    for (const run of bandRuns) {
      if (run.timingLadderAction !== 'raise-tempo') {
        break;
      }

      streak += 1;
    }

    const required = bandRuns.some(
      (run) => run.timingLadderAction === 'lower-tempo',
    )
      ? PROMOTE_STREAK_AFTER_DEMOTE
      : PROMOTE_STREAK;

    if (streak >= required) {
      const speed = quantizedSpeed(
        clamp(
          currentAutoSpeed + TEMPO_STEP,
          AUTO_SPEED_FLOOR,
          AUTO_SPEED_CEILING,
        ),
      );

      return {
        speed,
        action: 'promote',
        reason: `${streak} clean runs at ${pct(currentBand)}. Tempo up to ${pct(
          speed,
        )}.`,
      };
    }

    return {
      speed: currentAutoSpeed,
      action: 'hold',
      reason: `${streak} of ${required} clean runs at ${pct(
        currentBand,
      )} before raising tempo.`,
    };
  }

  if (bandRuns.length >= PLATEAU_RUNS) {
    return {
      speed: currentAutoSpeed,
      action: 'hold',
      reason: `${PLATEAU_RUNS}+ runs at ${pct(
        currentBand,
      )}, no clear trend. Tempo held, flagged for review.`,
    };
  }

  return {
    speed: currentAutoSpeed,
    action: 'hold',
    reason: 'Window is still tightening at this tempo.',
  };
}
