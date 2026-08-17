import type { StoredHitRecord } from '../../services/practice-stats';
import type { RunSummary } from '../../services/practice-stats';

export interface TimingQualityReceipt {
  meanMs: number;
  medianMs: number;
  spreadMs: number;
  expectedNotes: number;
  insideThirtyPercent: number;
  scoredWindowMs: number;
  scoredWindowPercent: number;
  targetWindowMs: number;
  targetWindowPercent: number;
}

function rounded(value: number): number {
  return Math.round(value);
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);

  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function percentInside(
  values: readonly number[],
  windowMs: number,
  expectedNotes: number,
): number {
  return rounded(
    (values.filter((value) => Math.abs(value) <= windowMs).length /
      expectedNotes) *
      100,
  );
}

export function timingQualityReceipt(
  summary: RunSummary | undefined,
  records: readonly StoredHitRecord[] | undefined,
): TimingQualityReceipt | undefined {
  if (!summary || !records?.length) {
    return undefined;
  }

  const deltas = records
    .filter(
      (record) => record.verdict === 'hit' && Number.isFinite(record.deltaMs),
    )
    .map((record) => record.deltaMs);
  const expectedNotes = summary.totalHits + summary.totalMisses;
  const targetWindowMs = summary.timingGapMs
    ? summary.timingGapMs / 3
    : summary.opening?.timingGapMs
    ? summary.opening.timingGapMs / 3
    : undefined;
  const scoredWindowMs = summary.timingWindowMs;

  if (
    deltas.length < 4 ||
    expectedNotes <= 0 ||
    !scoredWindowMs ||
    !targetWindowMs
  ) {
    return undefined;
  }

  const meanMs =
    deltas.reduce((total, value) => total + value, 0) / deltas.length;
  const spreadMs = Math.sqrt(
    deltas.reduce((total, value) => total + (value - meanMs) ** 2, 0) /
      deltas.length,
  );

  return {
    meanMs: rounded(meanMs),
    medianMs: rounded(median(deltas)),
    spreadMs: rounded(spreadMs),
    expectedNotes,
    insideThirtyPercent: percentInside(deltas, 30, expectedNotes),
    scoredWindowMs: rounded(scoredWindowMs),
    scoredWindowPercent: percentInside(deltas, scoredWindowMs, expectedNotes),
    targetWindowMs: rounded(targetWindowMs),
    targetWindowPercent: percentInside(deltas, targetWindowMs, expectedNotes),
  };
}
