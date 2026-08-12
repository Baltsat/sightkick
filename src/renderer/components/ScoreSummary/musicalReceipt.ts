import type { KitElement, RunSummary } from '../../services/practice-stats';

export type MusicalReceiptAction = 'replay' | 'continue';

export interface MusicalReceipt {
  headline: string;
  meaning: string;
  action: MusicalReceiptAction;
  actionLabel: string;
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
): MusicalReceipt | undefined {
  if (!summary) {
    return undefined;
  }

  if (previous) {
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
    return {
      headline: `${target[0].toUpperCase()}${target.slice(
        1,
      )} is ready for a loop`,
      meaning:
        'This run saved a specific target; no musical change is claimed yet.',
      action: 'replay',
      actionLabel: 'Replay this loop',
      changed: false,
    };
  }

  return {
    headline: 'This run is saved for comparison',
    meaning:
      'No musical change is claimed until another comparable pass exists.',
    action: 'continue',
    actionLabel: 'Continue current plan',
    changed: false,
  };
}
