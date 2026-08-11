import type {
  AdaptivePracticeKind,
  AdaptiveTimingEvidence,
  AdaptiveTimingWindowInput,
  AdaptiveTimingWindowRecommendation,
  TimingWindowConfidence,
} from './types';

export const MIN_TIMING_WINDOW_MS = 120;

export const MAX_TIMING_WINDOW_MS = 230;

export const LESSON_STARTING_WINDOW_MS = 220;

export const SONG_STARTING_WINDOW_MS = 200;

export const EXPERIENCED_TARGET_WINDOW_MS = 140;

const DEFAULT_RECENT_RUN_LIMIT = 6;
const MIN_RECENT_RUN_LIMIT = 3;
const MAX_RECENT_RUN_LIMIT = 12;
const MIN_HIGH_QUALITY_TIMING_SAMPLES = 8;

interface UsableRunEvidence {
  accuracy: number;
  spreadMs?: number;
  timingSampleCount: number;
  playbackSpeed?: number;
  completedAtMs?: number;
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
  // A zero-sample `spreadMs: 0` is common in legacy summaries. It means
  // "unknown", not perfect timing. If sampleCount is absent, a positive hit
  // count is a safe legacy fallback that lets a real spread remain usable.
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
  let playbackSpeed: number | undefined;

  if (rawSpeed !== undefined && rawSpeed >= 0.25 && rawSpeed <= 2) {
    playbackSpeed = rawSpeed;
  } else if (run.mode === 'perform' || run.mode === undefined) {
    // Historical Perform summaries did not store playbackSpeed. Perform was
    // fixed at 1x, so that evidence remains interpretable. A legacy Practice
    // run with no speed never qualifies as proof for tightening.
    playbackSpeed = 1;
  }

  return {
    accuracy,
    spreadMs,
    timingSampleCount,
    playbackSpeed,
    completedAtMs: completedAtMs(run.completedAt),
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

  // Archives are written oldest-to-newest, so preserve that useful convention
  // for malformed legacy rows that have no parseable completion timestamp.
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

function startingWindow(kind: AdaptivePracticeKind): number {
  return kind === 'lesson'
    ? LESSON_STARTING_WINDOW_MS
    : SONG_STARTING_WINDOW_MS;
}

function roundAndClampWindow(value: number): number {
  return Math.round(clamp(value, MIN_TIMING_WINDOW_MS, MAX_TIMING_WINDOW_MS));
}

function startingReason(kind: AdaptivePracticeKind): string {
  return `No usable completed-run evidence yet; using the learner-friendly ${kind} starting window.`;
}

/**
 * Derive an explainable hit-tolerance window from recent completed-run
 * evidence. The policy is deliberately conservative: weak evidence can make
 * play more forgiving immediately, while tighter timing requires at least
 * three repeated high-accuracy, low-spread, near-full-speed runs.
 */
export function deriveAdaptiveTimingWindow({
  kind,
  runs,
  recentRunLimit = DEFAULT_RECENT_RUN_LIMIT,
}: AdaptiveTimingWindowInput): AdaptiveTimingWindowRecommendation {
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
  const highQualityRuns = timedRuns.filter(
    ({ run }) =>
      run.accuracy >= 0.94 &&
      run.spreadMs <= 40 &&
      run.timingSampleCount >= MIN_HIGH_QUALITY_TIMING_SAMPLES &&
      (run.playbackSpeed ?? 0) >= 0.85,
  ).length;
  const evidence: AdaptiveTimingEvidence = {
    usableRuns: recentRuns.length,
    timedRuns: timedRuns.length,
    highQualityRuns,
    weightedAccuracy: accuracy,
    weightedSpreadMs: spreadMs,
  };
  const confidence = confidenceFor(evidence);
  const baseWindowMs = startingWindow(kind);

  if (accuracy === undefined) {
    return {
      timingWindowMs: baseWindowMs,
      confidence,
      phase: 'starting',
      reason: startingReason(kind),
      evidence,
    };
  }

  const canTighten =
    highQualityRuns >= 3 &&
    spreadMs !== undefined &&
    accuracy >= 0.94 &&
    spreadMs <= 40;

  if (canTighten) {
    // Three confirming runs begin the progression; six reach the experienced
    // target. This avoids a single lucky performance creating an abrupt,
    // discouraging scoring change.
    const tighteningProgress = clamp((highQualityRuns - 2) / 4, 0, 1);
    const timingWindowMs = roundAndClampWindow(
      baseWindowMs -
        (baseWindowMs - EXPERIENCED_TARGET_WINDOW_MS) * tighteningProgress,
    );

    return {
      timingWindowMs,
      confidence,
      phase: 'tightening',
      reason: `${highQualityRuns} recent high-accuracy, low-spread runs support a gradual move toward the experienced timing window.`,
      evidence,
    };
  }

  const accuracyPressure =
    accuracy < 0.86 ? clamp((0.86 - accuracy) / 0.24, 0, 1) * 24 : 0;
  const spreadPressure =
    spreadMs !== undefined && spreadMs > 65
      ? clamp((spreadMs - 65) / 90, 0, 1) * 12
      : 0;
  const pressure = accuracyPressure + spreadPressure;

  if (pressure > 0.5) {
    const timingWindowMs = roundAndClampWindow(baseWindowMs + pressure);

    return {
      timingWindowMs,
      confidence,
      phase: 'developing',
      reason: `Recent accuracy${
        spreadMs !== undefined ? ' and timing spread' : ''
      } show that a more forgiving window keeps this ${kind} in reach.`,
      evidence,
    };
  }

  return {
    timingWindowMs: baseWindowMs,
    confidence,
    phase: 'calibrating',
    reason:
      highQualityRuns > 0
        ? `${highQualityRuns} strong run${
            highQualityRuns === 1 ? '' : 's'
          } recorded; three consistent runs are required before timing tightens.`
        : `Current evidence supports the standard learner-friendly ${kind} window while calibration continues.`,
    evidence,
  };
}
