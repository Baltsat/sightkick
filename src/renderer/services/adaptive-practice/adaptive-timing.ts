import type { Measure, ParsedChart } from '../../../chart-parser/types';
import { ticksToSeconds } from '../../../chart-parser/timing';
import type {
  AdaptiveTimingEvidence,
  AdaptiveTimingWindowInput,
  AdaptiveTimingWindowRecommendation,
  TimingGrid,
  TimingLadderAction,
  TimingRunEvidence,
  TimingRunState,
  TimingWindowConfidence,
  TimingWindowStandard,
} from './types';

export const MIN_TIMING_WINDOW_MS = 35;

/** Used only when the caller has no chart to measure a grid from. */
export const GRIDLESS_FALLBACK_WINDOW_MS = 200;

const DEFAULT_RECENT_RUN_LIMIT = 6;
const MIN_RECENT_RUN_LIMIT = 3;
const MAX_RECENT_RUN_LIMIT = 12;

export const MIN_HIGH_QUALITY_TIMING_SAMPLES = 8;

export const CLEAN_ACCURACY = 0.94;

export const CLEAN_SPREAD_MS = 40;

export const TEMPO_STEP = 0.1;

export const WRONG_RATE_MAX = 0.05;

interface UsableRunEvidence {
  accuracy: number;
  spreadMs?: number;
  timingSampleCount: number;
  totalHits?: number;
  totalMisses?: number;
  totalWrong?: number;
  playbackSpeed?: number;
  completedAtMs?: number;
  timingStandard?: TimingWindowStandard;
  sourceIndex: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function completedAtMs(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function standard(value: unknown): TimingWindowStandard | undefined {
  return value === 'target' || value === 'better' || value === 'ceiling'
    ? value
    : undefined;
}

function sanitizeRun(
  value: unknown,
  sourceIndex: number,
): UsableRunEvidence | undefined {
  const run = record(value);

  if (!run) {
    return undefined;
  }

  const accuracy = finiteNumber(run.overallAccuracy);

  if (accuracy === undefined || accuracy < 0 || accuracy > 1) {
    return undefined;
  }

  const timingBias = record(run.timingBias);
  const rawSpread = finiteNumber(timingBias?.spreadMs);
  const rawSampleCount = finiteNumber(timingBias?.sampleCount);
  const totalHits = finiteNumber(run.totalHits);
  const totalMisses = finiteNumber(run.totalMisses);
  const totalWrong = finiteNumber(run.totalWrong);
  const timingSampleCount =
    rawSampleCount !== undefined && rawSampleCount > 0
      ? Math.floor(rawSampleCount)
      : rawSampleCount === undefined && totalHits !== undefined && totalHits > 0
      ? Math.floor(totalHits)
      : 0;
  const spreadMs =
    rawSpread !== undefined && rawSpread >= 0 && timingSampleCount > 0
      ? rawSpread
      : undefined;
  const rawSpeed = finiteNumber(run.playbackSpeed);
  const playbackSpeed =
    rawSpeed !== undefined && rawSpeed >= 0.25 && rawSpeed <= 2
      ? rawSpeed
      : run.mode === 'perform' || run.mode === undefined
      ? 1
      : undefined;

  return {
    accuracy,
    spreadMs,
    timingSampleCount,
    totalHits,
    totalMisses,
    totalWrong,
    playbackSpeed,
    completedAtMs: completedAtMs(run.completedAt),
    timingStandard: standard(run.timingStandard),
    sourceIndex,
  };
}

function newestFirst(
  left: UsableRunEvidence,
  right: UsableRunEvidence,
): number {
  if (left.completedAtMs !== undefined && right.completedAtMs !== undefined) {
    return right.completedAtMs - left.completedAtMs;
  }

  if (left.completedAtMs !== undefined) {
    return -1;
  }

  if (right.completedAtMs !== undefined) {
    return 1;
  }

  return right.sourceIndex - left.sourceIndex;
}

function weightedMean(
  values: readonly { value: number; recencyIndex: number }[],
): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  let weightedTotal = 0;
  let totalWeight = 0;

  values.forEach(({ value, recencyIndex }) => {
    const weight = 0.82 ** recencyIndex;

    weightedTotal += value * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedTotal / totalWeight : undefined;
}

function confidenceFor(
  evidence: AdaptiveTimingEvidence,
): TimingWindowConfidence {
  if (evidence.usableRuns === 0) {
    return 'none';
  }

  if (evidence.timedRuns >= 5) {
    return 'high';
  }

  if (evidence.timedRuns >= 3) {
    return 'medium';
  }

  return 'low';
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function positiveFinite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function windowFor(
  gapMs: number,
  desiredStandard: TimingWindowStandard,
): Pick<TimingRunState, 'timingWindowMs' | 'timingGapMs' | 'timingStandard'> {
  const fraction =
    desiredStandard === 'target'
      ? 1 / 3
      : desiredStandard === 'better'
      ? 1 / 2
      : 1;
  const timingWindowMs = Math.min(
    gapMs,
    Math.max(MIN_TIMING_WINDOW_MS, gapMs * fraction),
  );

  return {
    timingWindowMs: rounded(timingWindowMs),
    timingGapMs: rounded(gapMs),
    timingStandard: timingWindowStandard(timingWindowMs, gapMs),
  };
}

function cleanRun(run: UsableRunEvidence | undefined): boolean {
  if (!run) {
    return false;
  }

  const attempts =
    (run.totalHits ?? 0) + (run.totalMisses ?? 0) + (run.totalWrong ?? 0);
  const wrongRate = attempts > 0 ? (run.totalWrong ?? 0) / attempts : 0;

  return (
    run.accuracy >= CLEAN_ACCURACY &&
    run.spreadMs !== undefined &&
    run.spreadMs <= CLEAN_SPREAD_MS &&
    run.timingSampleCount >= MIN_HIGH_QUALITY_TIMING_SAMPLES &&
    wrongRate <= WRONG_RATE_MAX
  );
}

function timingState(
  grid: TimingGrid,
  playbackSpeed: number,
  desiredStandard: TimingWindowStandard,
): TimingRunState {
  const gapMs = grid.gapMs;
  const window = windowFor(gapMs, desiredStandard);

  return {
    ...window,
    playbackSpeed,
    ...(positiveFinite(grid.effectiveTempoBpm)
      ? { effectiveTempoBpm: rounded(grid.effectiveTempoBpm) }
      : {}),
  };
}

/**
 * Finds the closest pair of active note onsets in real playback time. Chords
 * share one tick and therefore do not create a smaller rhythmic subdivision.
 */
export function deriveTimingGrid(
  chart: Pick<ParsedChart, 'resolution' | 'tempos'>,
  measures: readonly Measure[],
  playbackSpeed = 1,
): TimingGrid | undefined {
  if (!positiveFinite(chart.resolution) || !positiveFinite(playbackSpeed)) {
    return undefined;
  }

  const ticks = [
    ...new Set(
      measures.flatMap((measure) =>
        measure.notes.filter((note) => !note.isRest).map((note) => note.tick),
      ),
    ),
  ].sort((left, right) => left - right);
  const tempoAt = (tick: number) =>
    chart.tempos.filter((tempo) => tempo.tick <= tick).at(-1) ??
    chart.tempos[0];
  const candidates = ticks.slice(1).map((tick, index) => ({
    seconds:
      (ticksToSeconds(tick, chart.resolution, chart.tempos) -
        ticksToSeconds(ticks[index], chart.resolution, chart.tempos)) /
      playbackSpeed,
    tempo: tempoAt(ticks[index]),
  }));

  candidates.push({
    seconds:
      (ticksToSeconds(chart.resolution, chart.resolution, chart.tempos) -
        ticksToSeconds(0, chart.resolution, chart.tempos)) /
      playbackSpeed,
    tempo: tempoAt(0),
  });

  const closest = candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.seconds) && candidate.seconds > 0,
    )
    .sort((left, right) => left.seconds - right.seconds)[0];

  if (!closest) {
    return undefined;
  }

  return {
    gapMs: closest.seconds * 1000,
    ...(positiveFinite(closest.tempo?.beatsPerMinute)
      ? { effectiveTempoBpm: closest.tempo.beatsPerMinute * playbackSpeed }
      : {}),
  };
}

/** The label is calculated from the recorded numbers, including floor cases. */
export function timingWindowStandard(
  windowMs: number,
  gapMs: number,
): TimingWindowStandard {
  if (windowMs <= gapMs / 3) {
    return 'target';
  }

  if (windowMs <= gapMs / 2) {
    return 'better';
  }

  return 'ceiling';
}

/**
 * Gives old stored runs an honest label. A window without its grid context
 * predates this standard; it must never be inferred from a bare percentage.
 */
export function timingStandardForRun(
  run: TimingRunEvidence,
): TimingWindowStandard | 'pre-grid-standard' {
  const recordedStandard = standard(run.timingStandard);

  if (recordedStandard) {
    return recordedStandard;
  }

  if (positiveFinite(run.timingWindowMs) && positiveFinite(run.timingGapMs)) {
    return timingWindowStandard(run.timingWindowMs, run.timingGapMs);
  }

  return 'pre-grid-standard';
}

/**
 * Derives a grid-bounded practice pair. The policy never widens a failed run:
 * it lowers tempo at the same standard, and promotes tempo only after a clean
 * target or better-band result.
 */
export function deriveAdaptiveTimingWindow({
  grid,
  playbackSpeed = 1,
  runs,
  recentRunLimit = DEFAULT_RECENT_RUN_LIMIT,
}: AdaptiveTimingWindowInput): AdaptiveTimingWindowRecommendation {
  // No chart, no grid, no honest clamp. Inventing a gap here would let the
  // app claim a "target" standard it never measured. Callers that know the
  // music always pass a grid; the rest fall back to the legacy safe window.
  const gridKnown = Boolean(grid && positiveFinite(grid.gapMs));
  const resolvedGrid = gridKnown
    ? (grid as TimingGrid)
    : { gapMs: GRIDLESS_FALLBACK_WINDOW_MS * 3 };
  const normalizedLimit = Math.round(
    clamp(
      Number.isFinite(recentRunLimit)
        ? recentRunLimit
        : DEFAULT_RECENT_RUN_LIMIT,
      MIN_RECENT_RUN_LIMIT,
      MAX_RECENT_RUN_LIMIT,
    ),
  );
  const recentRuns = (Array.isArray(runs) ? runs : [])
    .map(sanitizeRun)
    .filter((run): run is UsableRunEvidence => run !== undefined)
    .sort(newestFirst)
    .slice(0, normalizedLimit);
  const accuracy = weightedMean(
    recentRuns.map((run, recencyIndex) => ({
      value: run.accuracy,
      recencyIndex,
    })),
  );
  const timedRuns = recentRuns
    .map((run, recencyIndex) => ({ run, recencyIndex }))
    .filter(
      (
        item,
      ): item is {
        run: UsableRunEvidence & { spreadMs: number };
        recencyIndex: number;
      } => item.run.spreadMs !== undefined,
    );
  const spreadMs = weightedMean(
    timedRuns.map(({ run, recencyIndex }) => ({
      value: run.spreadMs,
      recencyIndex,
    })),
  );
  const highQualityRuns = timedRuns.filter(({ run }) => cleanRun(run)).length;
  const evidence: AdaptiveTimingEvidence = {
    usableRuns: recentRuns.length,
    timedRuns: timedRuns.length,
    highQualityRuns,
    weightedAccuracy: accuracy,
    weightedSpreadMs: spreadMs,
  };
  const confidence = confidenceFor(evidence);
  const latest = recentRuns[0];
  const priorStandard = latest?.timingStandard ?? 'better';
  const isClean = cleanRun(latest);
  let desiredStandard = priorStandard;
  let nextPlaybackSpeed = rounded(clamp(playbackSpeed, 0.3, 2));
  let ladderAction: TimingLadderAction = 'hold';
  let reason = 'Start at the better timing band before raising tempo.';

  if (latest) {
    if (isClean && priorStandard === 'ceiling') {
      desiredStandard = 'better';
      ladderAction = 'tighten-window';
      reason = 'Clean timing at the ceiling band earns a tighter better band.';
    } else if (isClean && priorStandard === 'better') {
      desiredStandard = 'target';
      ladderAction = 'tighten-window';
      reason = 'Clean timing at the better band earns the target window.';
    } else if (isClean && priorStandard === 'target') {
      nextPlaybackSpeed = rounded(
        clamp(nextPlaybackSpeed + TEMPO_STEP, 0.3, 2),
      );
      ladderAction = 'raise-tempo';
      reason = 'Clean target timing earns one tempo step.';
    } else if (!isClean) {
      nextPlaybackSpeed = rounded(
        clamp(nextPlaybackSpeed - TEMPO_STEP, 0.3, 2),
      );
      ladderAction = 'lower-tempo';
      reason = 'Hold this timing standard and lower tempo for the next run.';
    }
  }

  const currentState = timingState(
    resolvedGrid,
    clamp(playbackSpeed, 0.3, 2),
    desiredStandard,
  );
  const speedRatio = nextPlaybackSpeed / clamp(playbackSpeed, 0.3, 2);
  const nextGrid: TimingGrid = {
    ...resolvedGrid,
    gapMs: resolvedGrid.gapMs / speedRatio,
    ...(positiveFinite(resolvedGrid.effectiveTempoBpm)
      ? { effectiveTempoBpm: resolvedGrid.effectiveTempoBpm * speedRatio }
      : {}),
  };
  const nextRun = timingState(nextGrid, nextPlaybackSpeed, desiredStandard);

  return {
    ...currentState,
    confidence,
    ladderAction,
    nextRun,
    reason,
    evidence,
  };
}
