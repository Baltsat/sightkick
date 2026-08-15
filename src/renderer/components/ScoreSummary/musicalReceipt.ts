import type { KitElement, RunSummary } from '../../services/practice-stats';
import {
  hasSectionCoverageMismatch,
  recommendedReplaySpeed,
  type FocusSectionInsight,
} from '../../services/run-insights';

export type MusicalReceiptAction = 'replay' | 'continue';

export interface MusicalReceipt {
  headline: string;
  meaning: string;
  action: MusicalReceiptAction;
  actionLabel: string;
  replaySpeed?: number;
  changed: boolean;
}

function laneLabel(element: KitElement): string {
  const labels: Record<KitElement, string> = {
    kick: 'Kick',
    snare: 'Snare',
    hihat: 'Hi-hat',
    tom1: 'Tom 1',
    tom2: 'Tom 2',
    tom3: 'Tom 3',
    ride: 'Ride',
    crash: 'Crash',
  };

  return labels[element];
}

/**
 * A slower pass naturally lands more notes and tightens timing on its own,
 * independent of any real skill change - comparing accuracy or timing
 * across two different playback speeds is not a comparable musical fact,
 * even when the numbers moved. Equal speed, a faster current pass, or an
 * unknown speed on either side (older runs stored before this field
 * existed) all stay eligible; only a confirmed slowdown blocks the claim.
 */
function speedIsComparable(summary: RunSummary, previous: RunSummary): boolean {
  const currentSpeed = summary.playbackSpeed;
  const previousSpeed = previous.playbackSpeed;

  if (currentSpeed === undefined || previousSpeed === undefined) {
    return true;
  }

  return currentSpeed >= previousSpeed;
}

function laneDelta(
  summary: RunSummary,
  previous: RunSummary,
): { element: KitElement; points: number } | undefined {
  return summary.laneAccuracy
    .flatMap((lane) => {
      const prior = previous.laneAccuracy.find(
        ({ element }) => element === lane.element,
      );
      const attempts = lane.hits + lane.misses;
      const priorAttempts = (prior?.hits ?? 0) + (prior?.misses ?? 0);
      const points = Math.round(
        (lane.accuracy - (prior?.accuracy ?? lane.accuracy)) * 100,
      );

      return prior && attempts >= 4 && priorAttempts >= 4 && points >= 4
        ? [{ element: lane.element, points }]
        : [];
    })
    .sort((left, right) => right.points - left.points)[0];
}

function timingImprovement(
  summary: RunSummary,
  previous: RunSummary,
): number | undefined {
  if (
    summary.timingBias.sampleCount < 10 ||
    previous.timingBias.sampleCount < 10
  ) {
    return undefined;
  }

  const improvement = Math.round(
    Math.abs(previous.timingBias.meanMs) - Math.abs(summary.timingBias.meanMs),
  );

  return improvement >= 8 ? improvement : undefined;
}

/** Sample floor before an accuracy signal is trusted as meaningful rather
 * than noise from a handful of strikes. */
const FELL_APART_MIN_ATTEMPTS = 4;
/** At or below this overall accuracy, a run has not merely underperformed
 * - it did not connect. Below the threshold the headline must say so
 * plainly instead of reaching for a neutral/positive frame. */
const FELL_APART_MAX_ACCURACY = 0.15;
const FAR_ABOVE_TEMPO_CEILING_MIN_ATTEMPTS = 256;

function attemptedCount(summary: RunSummary): number {
  return summary.totalHits + summary.totalMisses;
}

/** True when the kit received input but essentially nothing landed - the
 * "run that fell apart" case the receipt must never dress up as neutral. */
function fellApart(summary: RunSummary): boolean {
  return (
    attemptedCount(summary) >= FELL_APART_MIN_ATTEMPTS &&
    summary.overallAccuracy <= FELL_APART_MAX_ACCURACY
  );
}

function farAboveTempoCeiling(summary: RunSummary): boolean {
  return (
    attemptedCount(summary) >= FAR_ABOVE_TEMPO_CEILING_MIN_ATTEMPTS &&
    summary.overallAccuracy <= FELL_APART_MAX_ACCURACY
  );
}

function percentTempo(speed: number): number {
  return Math.round(speed * 100);
}

function replayReceipt(summary: RunSummary, headline: string): MusicalReceipt {
  const attempted = attemptedCount(summary);
  const replaySpeed = recommendedReplaySpeed(summary);
  const currentTempo =
    summary.playbackSpeed === undefined
      ? ''
      : ` at ${percentTempo(summary.playbackSpeed)}% tempo`;
  const next = replaySpeed
    ? ` Drumroll will replay at ${percentTempo(
        replaySpeed,
      )}% to find a playable floor.`
    : ' Drumroll will replay the loop to find a playable floor.';

  return {
    headline,
    meaning: `${summary.totalHits} of ${attempted.toLocaleString(
      'en-US',
    )} notes landed${currentTempo}.${next}`,
    action: 'replay',
    actionLabel: replaySpeed
      ? `Replay at ${percentTempo(replaySpeed)}% tempo`
      : 'Replay this loop',
    ...(replaySpeed ? { replaySpeed } : {}),
    changed: false,
  };
}

function sectionAttemptReceipt(focus: FocusSectionInsight): MusicalReceipt {
  const tempo = percentTempo(focus.tempoMultiplier);

  return {
    headline: 'This was a section attempt, not a full-song pass',
    meaning: `${focus.label} carries the real input; the full-song total includes notes outside that attempt. Drumroll will replay this section at ${tempo}%.`,
    action: 'replay',
    actionLabel: `Replay ${focus.label.toLowerCase()} at ${tempo}%`,
    replaySpeed: focus.tempoMultiplier,
    changed: false,
  };
}

/** True when nothing was scored at all - the player started and stopped, or
 * the run captured no hits, misses, or wrong hits of any kind. Distinct from
 * `noMusicalInput` (the kit never reached the app): here the practice
 * pipeline worked, there is simply nothing to report. */
function noAttempts(summary: RunSummary): boolean {
  return (
    summary.totalHits === 0 &&
    summary.totalMisses === 0 &&
    summary.totalWrong === 0
  );
}

function cleanRecovery(summary: RunSummary): string | undefined {
  const bars = Object.entries(summary.learningEvidence?.bars ?? {}).find(
    ([, evidence]) => (evidence.recoveryCleanCount ?? 0) > 0,
  );

  return bars?.[0];
}

function loopTarget(summary: RunSummary): string | undefined {
  const finding = summary.coachEvidence?.find(
    ({ barStart, barEnd }) => barStart !== undefined && barEnd !== undefined,
  );

  if (finding?.barStart === undefined || finding.barEnd === undefined) {
    return undefined;
  }

  return finding.barStart === finding.barEnd
    ? `bar ${finding.barStart}`
    : `bars ${finding.barStart}–${finding.barEnd}`;
}

export function musicalReceipt(
  summary: RunSummary | undefined,
  previous: RunSummary | undefined,
  focus?: FocusSectionInsight,
): MusicalReceipt | undefined {
  if (!summary) {
    return undefined;
  }

  if (noAttempts(summary)) {
    return {
      headline: 'No hits recorded this pass',
      meaning:
        'Nothing was played during this run. Start the loop again when you are ready.',
      action: 'replay',
      actionLabel: 'Replay this loop',
      changed: false,
    };
  }

  if (focus && hasSectionCoverageMismatch(summary, focus)) {
    return sectionAttemptReceipt(focus);
  }

  if (farAboveTempoCeiling(summary)) {
    return replayReceipt(
      summary,
      'This chart is far above your current tempo ceiling',
    );
  }

  if (previous && speedIsComparable(summary, previous)) {
    const lane = laneDelta(summary, previous);

    if (lane) {
      return {
        headline: `${laneLabel(lane.element)} rose ${lane.points} points`,
        meaning: `Your ${laneLabel(
          lane.element,
        ).toLowerCase()} is holding more of the groove on this comparable pass.`,
        action: 'continue',
        actionLabel: 'Continue current plan',
        changed: true,
      };
    }

    const timing = timingImprovement(summary, previous);

    if (timing) {
      return {
        headline: `Timing bias tightened by ${timing} ms`,
        meaning: 'Your hits landed closer to the beat on this comparable pass.',
        action: 'continue',
        actionLabel: 'Continue current plan',
        changed: true,
      };
    }
  }

  // Checked ahead of both saved-recovery and loop-target evidence: neither
  // of those is false when a run also fell apart overall, but leading with
  // "recovered cleanly" or "ready for a loop" over near-zero accuracy reads
  // as praise the numbers directly contradict. The run's overall honesty
  // outranks a narrower, more flattering fact about it.
  if (fellApart(summary)) {
    return replayReceipt(
      summary,
      summary.totalHits === 0
        ? 'No chart notes landed at this tempo'
        : 'This tempo is above your current ceiling',
    );
  }

  const recoveredBar = cleanRecovery(summary);

  if (recoveredBar) {
    return {
      headline: `Bar ${recoveredBar} recovered cleanly`,
      meaning:
        'The saved recovery gives the next pass a concrete musical anchor.',
      action: 'replay',
      actionLabel: 'Replay this loop',
      changed: true,
    };
  }

  const target = loopTarget(summary);

  if (target) {
    // loopTarget returns "bar N" for one bar and "bars N–M" for a range -
    // the verb has to agree with whichever it picked.
    const verb = target.startsWith('bars ') ? 'are' : 'is';

    return {
      headline: `${target[0].toUpperCase()}${target.slice(
        1,
      )} ${verb} ready for a loop`,
      meaning:
        'This run saved a specific target; no musical change is claimed yet.',
      action: 'replay',
      actionLabel: 'Replay this loop',
      changed: false,
    };
  }

  if (summary.overallAccuracy >= 0.9) {
    return {
      headline: 'This tempo is under control',
      meaning: `${summary.totalHits} of ${attemptedCount(
        summary,
      ).toLocaleString('en-US')} notes landed on this pass.`,
      action: 'continue',
      actionLabel: 'Continue current plan',
      changed: false,
    };
  }

  if (summary.overallAccuracy >= 0.7) {
    return {
      headline: 'This tempo is playable',
      meaning: `${summary.totalHits} of ${attemptedCount(
        summary,
      ).toLocaleString(
        'en-US',
      )} notes landed; this is a real baseline for the song.`,
      action: 'continue',
      actionLabel: 'Continue current plan',
      changed: false,
    };
  }

  return {
    headline: 'This tempo needs another pass',
    meaning: `${summary.totalHits} of ${attemptedCount(summary).toLocaleString(
      'en-US',
    )} notes landed. Drumroll will keep the next pass on this loop.`,
    action: 'replay',
    actionLabel: 'Replay this loop',
    changed: false,
  };
}
