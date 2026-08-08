import {
  HitRecord,
  KitElement,
  LaneAccuracy,
  LaneBias,
  RunSummary,
  RunTrendPoint,
  TimingBiasStats,
  WrongHitCount,
} from './types';

// Canonical display/sort order for kit lanes, independent of the order hits
// happened to arrive in. Keeps output arrays deterministic and lets the UI
// render a stable, comparable layout run over run.
const KIT_ELEMENT_ORDER: KitElement[] = [
  'kick',
  'snare',
  'hihat',
  'tom1',
  'tom2',
  'tom3',
  'ride',
  'crash',
];

function sortByKitOrder<T extends { element: KitElement }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      KIT_ELEMENT_ORDER.indexOf(a.element) -
      KIT_ELEMENT_ORDER.indexOf(b.element),
  );
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function populationStdDev(values: number[], avg: number): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

/** Per-lane hit/(hit+miss) accuracy. 'wrong' records don't affect this. */
export function computeLaneAccuracy(records: HitRecord[]): LaneAccuracy[] {
  const byLane = new Map<KitElement, { hits: number; misses: number }>();

  for (const record of records) {
    if (record.verdict !== 'hit' && record.verdict !== 'miss') {
      continue;
    }

    const entry = byLane.get(record.element) ?? { hits: 0, misses: 0 };

    if (record.verdict === 'hit') {
      entry.hits += 1;
    } else {
      entry.misses += 1;
    }

    byLane.set(record.element, entry);
  }

  const entries = [...byLane.entries()].map(([element, { hits, misses }]) => ({
    element,
    hits,
    misses,
    accuracy: hits / (hits + misses),
  }));

  return sortByKitOrder(entries);
}

/**
 * Mean/median signed timing bias and spread across the run, in ms. Only
 * 'hit' records carry a real actual-vs-expected offset, so misses and wrong
 * hits are excluded regardless of what their deltaMs field holds.
 */
export function computeTimingBias(records: HitRecord[]): TimingBiasStats {
  const deltas = records
    .filter((record) => record.verdict === 'hit')
    .map((record) => record.deltaMs);
  const meanMs = mean(deltas);

  return {
    meanMs,
    medianMs: median(deltas),
    spreadMs: populationStdDev(deltas, meanMs),
    earlyCount: deltas.filter((delta) => delta < 0).length,
    lateCount: deltas.filter((delta) => delta > 0).length,
    onTimeCount: deltas.filter((delta) => delta === 0).length,
    sampleCount: deltas.length,
  };
}

/** Per-lane mean signed timing bias, for naming the worst-offender lane. */
export function computeLaneBias(records: HitRecord[]): LaneBias[] {
  const byLane = new Map<KitElement, number[]>();

  for (const record of records) {
    if (record.verdict !== 'hit') {
      continue;
    }

    const deltas = byLane.get(record.element) ?? [];

    deltas.push(record.deltaMs);
    byLane.set(record.element, deltas);
  }

  const entries = [...byLane.entries()].map(([element, deltas]) => ({
    element,
    meanMs: mean(deltas),
    sampleCount: deltas.length,
  }));

  return sortByKitOrder(entries);
}

/** Wrong-hit count per lane struck. Lanes with zero wrong hits are omitted. */
export function computeWrongHitCounts(records: HitRecord[]): WrongHitCount[] {
  const byLane = new Map<KitElement, number>();

  for (const record of records) {
    if (record.verdict !== 'wrong') {
      continue;
    }

    byLane.set(record.element, (byLane.get(record.element) ?? 0) + 1);
  }

  const entries = [...byLane.entries()].map(([element, count]) => ({
    element,
    count,
  }));

  return sortByKitOrder(entries);
}

/**
 * Builds the full summary object for one completed run. `completedAt` is
 * caller-supplied (this module never calls Date.now) so the result is a
 * pure function of its inputs.
 */
export function summarizeRun(
  records: HitRecord[],
  completedAt: string,
): RunSummary {
  const totalHits = records.filter((record) => record.verdict === 'hit').length;
  const totalMisses = records.filter(
    (record) => record.verdict === 'miss',
  ).length;
  const totalWrong = records.filter(
    (record) => record.verdict === 'wrong',
  ).length;
  const overallAccuracy =
    totalHits + totalMisses === 0 ? 0 : totalHits / (totalHits + totalMisses);

  return {
    completedAt,
    totalHits,
    totalMisses,
    totalWrong,
    overallAccuracy,
    laneAccuracy: computeLaneAccuracy(records),
    laneBias: computeLaneBias(records),
    timingBias: computeTimingBias(records),
    wrongHitCounts: computeWrongHitCounts(records),
  };
}

/**
 * Last-`limit` runs in chronological order (oldest first), by `completedAt`
 * rather than array order, so callers can pass summaries in any order.
 */
export function computeRunsTrend(
  summaries: RunSummary[],
  limit = 10,
): RunTrendPoint[] {
  if (limit <= 0) {
    return [];
  }

  return [...summaries]
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    .slice(-limit)
    .map((summary) => ({
      completedAt: summary.completedAt,
      accuracy: summary.overallAccuracy,
      biasMeanMs: summary.timingBias.meanMs,
    }));
}

/**
 * Sums hits/misses per lane across many runs (e.g. every stored run in the
 * library, for the gamification stats panel's "per-drum accuracy" view),
 * recomputing accuracy from the totals rather than averaging each run's
 * already-rounded per-run accuracy — a lane struck twice as often in one
 * run correctly counts twice as much toward the aggregate.
 */
export function aggregateLaneAccuracy(summaries: RunSummary[]): LaneAccuracy[] {
  const byLane = new Map<KitElement, { hits: number; misses: number }>();

  for (const summary of summaries) {
    for (const lane of summary.laneAccuracy) {
      const entry = byLane.get(lane.element) ?? { hits: 0, misses: 0 };

      entry.hits += lane.hits;
      entry.misses += lane.misses;
      byLane.set(lane.element, entry);
    }
  }

  const entries = [...byLane.entries()].map(([element, { hits, misses }]) => ({
    element,
    hits,
    misses,
    accuracy: hits / (hits + misses),
  }));

  return sortByKitOrder(entries);
}
