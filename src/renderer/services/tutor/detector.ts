import { ResolvedJudgement } from '../engine';
import {
  TutorBarFailureHistory,
  TutorChartPlan,
  TutorSettings,
  TutorTrigger,
  TutorWindowStats,
  TutorWrongPadPair,
} from './types';

/**
 * The Practice judge accepts a strike inside a 160 ms window. Tutor chart
 * plans deliberately retain only musical ticks (not tempo maps), so this is
 * the conservative 480 PPQ lower-tempo equivalent of that authoritative
 * window: 120 ticks is 160 ms at 93.75 BPM and covers the recorded 82–85 BPM
 * practice passages (~105–109 ticks). Keep the match inside the actual bar
 * below; this widens real pad-confusion evidence without inventing a
 * cross-bar transition.
 */
const PRACTICE_WRONG_PAD_PAIR_TOLERANCE_TICKS = 120;

function uniqueExpectedOutcomes(
  judgements: ResolvedJudgement[],
): ResolvedJudgement[] {
  const byId = new Map<string, ResolvedJudgement>();

  judgements.forEach((judgement) => {
    if (
      judgement.scoreable &&
      (judgement.verdict === 'hit' || judgement.verdict === 'miss')
    ) {
      byId.set(judgement.id, judgement);
    }
  });

  return [...byId.values()];
}

function uniqueScoreableWrongOutcomes(
  judgements: ResolvedJudgement[],
): ResolvedJudgement[] {
  const byId = new Map<string, ResolvedJudgement>();

  judgements.forEach((judgement) => {
    if (judgement.scoreable && judgement.verdict === 'wrong') {
      byId.set(judgement.id, judgement);
    }
  });

  return [...byId.values()];
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;

  return Math.sqrt(variance);
}

function wrongPadPairs(
  chart: TutorChartPlan,
  misses: ResolvedJudgement[],
  wrongs: ResolvedJudgement[],
): TutorWrongPadPair[] {
  const matchedMissIds = new Set<string>();
  const counts = new Map<string, TutorWrongPadPair>();

  wrongs.forEach((wrong) => {
    if (
      wrong.measureIndex === undefined ||
      wrong.actualTick === undefined ||
      !wrong.actualElement
    ) {
      return;
    }

    const measure = chart.measures[wrong.measureIndex];

    if (!measure) {
      return;
    }

    // One wrong can only explain one uniquely close expected note in its own
    // completed bar. The old half-grid threshold was narrower than the
    // authoritative Practice judge window on dense 16th-note bars, which
    // discarded the observed 80–110 tick pad confusions.
    const toleranceTicks = Math.max(
      PRACTICE_WRONG_PAD_PAIR_TOLERANCE_TICKS,
      Math.floor(
        (measure.endTick - measure.startTick) /
          Math.max(2, measure.expectedKeys * 2),
      ),
    );
    const candidates = misses.filter(
      (miss) =>
        miss.id !== wrong.id &&
        !matchedMissIds.has(miss.id) &&
        miss.measureIndex === wrong.measureIndex &&
        miss.expectedTick !== undefined &&
        miss.expectedElement !== undefined &&
        miss.expectedElement !== wrong.actualElement &&
        Math.abs(miss.expectedTick - wrong.actualTick!) <= toleranceTicks,
    );
    const nearestDistance = Math.min(
      ...candidates.map((miss) =>
        Math.abs(miss.expectedTick! - wrong.actualTick!),
      ),
    );
    const nearest = candidates.filter(
      (miss) =>
        Math.abs(miss.expectedTick! - wrong.actualTick!) === nearestDistance,
    );

    if (nearest.length !== 1) {
      return;
    }

    const miss = nearest[0];
    const key = `${wrong.actualElement}:${miss.expectedElement}`;
    const pair = counts.get(key) ?? {
      actualElement: wrong.actualElement,
      expectedElement: miss.expectedElement!,
      count: 0,
    };

    pair.count += 1;
    matchedMissIds.add(miss.id);
    counts.set(key, pair);
  });

  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.actualElement.localeCompare(b.actualElement) ||
      a.expectedElement.localeCompare(b.expectedElement),
  );
}

export function summarizeTutorWindow(
  chart: TutorChartPlan,
  judgementsByMeasure: Record<number, ResolvedJudgement[]>,
  startMeasure: number,
  endMeasure: number,
): TutorWindowStats {
  const judgements = Array.from(
    { length: Math.max(0, endMeasure - startMeasure + 1) },
    (_, offset) => judgementsByMeasure[startMeasure + offset] ?? [],
  ).flat();
  const expectedOutcomes = uniqueExpectedOutcomes(judgements);
  const hits = expectedOutcomes.filter(
    (judgement) => judgement.verdict === 'hit',
  ).length;
  const misses = expectedOutcomes.filter(
    (judgement) => judgement.verdict === 'miss',
  );
  const wrongs = uniqueScoreableWrongOutcomes(judgements);
  const timingDeltas = expectedOutcomes.flatMap((judgement) =>
    judgement.verdict === 'hit' && Number.isFinite(judgement.deltaMs)
      ? [judgement.deltaMs!]
      : [],
  );
  const timingSpreadMs = standardDeviation(timingDeltas);
  const timingOutlierCount = timingDeltas.filter(
    // A single outlying hit can raise a standard deviation substantially.
    // Count only values at least one spread away from zero so it cannot alone
    // satisfy the sustained-timing branch.
    (deltaMs) => Math.abs(deltaMs) >= timingSpreadMs,
  ).length;
  const expected = chart.measures
    .slice(startMeasure, endMeasure + 1)
    .reduce((sum, measure) => sum + measure.expectedKeys, 0);
  const resolved = hits + misses.length;

  return {
    startMeasure,
    endMeasure,
    expected,
    resolved,
    hits,
    misses: misses.length,
    wrong: wrongs.length,
    distinctErrorIds: [...misses, ...wrongs].map((judgement) => judgement.id),
    timingSampleCount: timingDeltas.length,
    timingSpreadMs,
    timingOutlierCount,
    wrongPadPairs: wrongPadPairs(chart, misses, wrongs),
    accuracy: resolved === 0 ? 0 : hits / resolved,
    distinctMissIds: misses.map((judgement) => judgement.id),
  };
}

function hasSufficientResolvedEvidence(
  stats: TutorWindowStats,
  settings: TutorSettings,
): boolean {
  return stats.resolved >= settings.minimumResolvedEvents;
}

/** A lower threshold that only becomes actionable after the same bar repeats. */
export function isRepeatableBarFailure(
  stats: TutorWindowStats,
  settings: TutorSettings,
): boolean {
  return (
    hasSufficientResolvedEvidence(stats, settings) &&
    stats.accuracy < settings.triggerAccuracy &&
    stats.distinctErrorIds.length >= settings.minimumRepeatedBarErrors
  );
}

/**
 * Material failure is intentionally bounded and conservative. It requires a
 * sufficient number of resolved chart events and then one repeated pattern:
 * a repeated actual-pad -> expected-pad pair, three distinct errors, a
 * repeated weak bar in this session, or sustained timing spread. Warm-up taps
 * and a single isolated miss never meet a trigger condition.
 */
export function detectTutorTrigger(
  chart: TutorChartPlan,
  judgementsByMeasure: Record<number, ResolvedJudgement[]>,
  completedMeasure: number,
  settings: TutorSettings,
  id: string,
  barFailureHistory: TutorBarFailureHistory = {},
): TutorTrigger | undefined {
  const endMeasure = Math.min(completedMeasure, chart.measures.length - 1);
  const startMeasure = Math.max(0, endMeasure - 1);
  const stats = summarizeTutorWindow(
    chart,
    judgementsByMeasure,
    startMeasure,
    endMeasure,
  );

  if (!hasSufficientResolvedEvidence(stats, settings)) {
    return undefined;
  }

  const pair = stats.wrongPadPairs.find(
    (candidate) => candidate.count >= settings.minimumRepeatedWrongPadPairs,
  );

  if (pair) {
    return {
      id,
      reason: 'repeated-wrong-pad-pair',
      stats,
      wrongPadPair: pair,
    };
  }

  if (
    stats.accuracy < settings.triggerAccuracy &&
    stats.distinctErrorIds.length >= settings.minimumDistinctErrors
  ) {
    return { id, reason: 'three-distinct-errors', stats };
  }

  const repeatedBarCount = barFailureHistory[endMeasure] ?? 0;

  if (
    isRepeatableBarFailure(
      summarizeTutorWindow(chart, judgementsByMeasure, endMeasure, endMeasure),
      settings,
    ) &&
    repeatedBarCount >= settings.minimumRepeatedBarFailures
  ) {
    return {
      id,
      reason: 'repeated-same-bar-failure',
      stats,
      repeatedBarCount,
    };
  }

  if (
    stats.accuracy < settings.triggerAccuracy &&
    stats.timingSampleCount >= settings.minimumTimingSamples &&
    stats.timingSpreadMs >= settings.timingSpreadThresholdMs &&
    stats.timingOutlierCount >= settings.minimumTimingOutliers
  ) {
    return { id, reason: 'timing-spread', stats };
  }

  return undefined;
}

export function isCleanRecovery(
  stats: TutorWindowStats,
  settings: TutorSettings,
) {
  return (
    stats.resolved >= settings.cleanMinimumResolvedEvents &&
    stats.accuracy >= settings.cleanMinimumAccuracy &&
    stats.misses <= settings.cleanMaximumMisses &&
    stats.wrong <= settings.cleanMaximumWrongHits
  );
}

/**
 * A continuous, explainable phrase-quality signal for the recovery runway.
 * Accuracy owns most of the score; authored coverage prevents a partial loop
 * from looking successful, and timing stability contributes without turning
 * every developing hit into a binary failure.
 */
export function recoveryQualityScore(
  stats: TutorWindowStats,
  settings: TutorSettings,
): number {
  const coverage = Math.min(
    1,
    stats.resolved / Math.max(1, settings.cleanMinimumResolvedEvents),
  );
  const timing =
    stats.timingSampleCount < Math.max(2, settings.minimumTimingSamples / 2)
      ? 1
      : Math.max(
          0,
          1 -
            stats.timingSpreadMs /
              Math.max(1, settings.timingSpreadThresholdMs * 1.5),
        );

  return Math.min(
    1,
    Math.max(0, stats.accuracy * 0.8 + coverage * 0.15 + timing * 0.05),
  );
}
