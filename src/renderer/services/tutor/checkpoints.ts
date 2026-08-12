import { TutorChartPlan, TutorRecoveryRegion, TutorSettings } from './types';

function clampMeasure(index: number, length: number): number {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

/**
 * Select a musical recovery window without inspecting renderer geometry.
 * Author-supplied section boundaries win when they are close enough;
 * otherwise the fallback gives the player at least one complete lead-in bar.
 */
export function planRecoveryRegion(
  chart: TutorChartPlan,
  failedStartMeasure: number,
  failedEndMeasure: number,
  settings: TutorSettings,
): TutorRecoveryRegion | undefined {
  const { measures } = chart;

  if (measures.length === 0) {
    return undefined;
  }

  const failedStart = clampMeasure(failedStartMeasure, measures.length);
  const failedEnd = clampMeasure(failedEndMeasure, measures.length);
  const earliestAllowed = Math.max(
    0,
    failedStart - settings.maximumCheckpointBars,
  );
  let startMeasure = Math.max(0, failedStart - settings.leadInBars);

  for (let index = failedStart; index >= earliestAllowed; index -= 1) {
    if (measures[index]?.sectionStart) {
      startMeasure = index;

      break;
    }
  }

  // Except at the beginning of a chart, never begin on the first failed bar.
  // A complete lead-in is what makes a rewind feel musical rather than abrupt.
  if (failedStart > 0 && startMeasure >= failedStart) {
    startMeasure = Math.max(earliestAllowed, failedStart - 1);
  }

  const endMeasure = Math.min(
    measures.length - 1,
    failedEnd + settings.contextBarsAfterFailure,
  );
  const resumeMeasure =
    endMeasure + 1 < measures.length ? endMeasure + 1 : undefined;

  return {
    startMeasure,
    endMeasure,
    startTick: measures[startMeasure].startTick,
    endTick: measures[endMeasure].endTick,
    resumeMeasure,
    resumeTick:
      resumeMeasure === undefined
        ? undefined
        : measures[resumeMeasure].startTick,
  };
}
