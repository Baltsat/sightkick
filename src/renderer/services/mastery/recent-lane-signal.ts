import { KitElement, RunSummary } from '../practice-stats';
import { RECENT_HALF_LIFE_DAYS, RECENT_READINESS_WINDOW_DAYS } from './mastery';

const DAY_MS = 86_400_000;

/** A lane needs this many real scored hits/misses before Home calls it a
 * current signal rather than a low-sample observation. */
export const MIN_RECENT_LANE_SAMPLES = 8;

/** Trend compares the newest half of Home's 28-day evidence window with the
 * preceding half. Each half needs an independent minimum sample count. */
export const RECENT_LANE_TREND_WINDOW_DAYS = RECENT_READINESS_WINDOW_DAYS / 2;

export interface RecentLaneSignal {
  element: KitElement;
  /** Time-decayed hit / (hit + miss), bounded to the explicit recent window. */
  accuracy: number;
  /** Raw scored hit/miss observations in the 28-day window; never decayed. */
  sampleCount: number;
  /** Number of saved scored runs that contributed a real observation. */
  runCount: number;
  /** No weak-lane copy is shown as a confident signal below this threshold. */
  evidenceState: 'measured' | 'insufficient';
  /** Percentage-point change: newest 14 days minus the preceding 14 days.
   * Omitted unless both halves have enough real observations. */
  trendPp?: number;
}

interface WeightedLaneTotals {
  weightedHits: number;
  weightedMisses: number;
  sampleCount: number;
  runCount: number;
}

interface RawLaneTotals {
  hits: number;
  misses: number;
  sampleCount: number;
}

function completedAtMs(run: RunSummary): number | undefined {
  const value = Date.parse(run.completedAt);

  return Number.isFinite(value) ? value : undefined;
}

function usableLaneCounts(lane: RunSummary['laneAccuracy'][number]) {
  const hits = Number.isFinite(lane.hits) ? Math.max(0, lane.hits) : 0;
  const misses = Number.isFinite(lane.misses) ? Math.max(0, lane.misses) : 0;

  return hits + misses > 0 ? { hits, misses } : undefined;
}

function addRawLane(
  totals: Map<KitElement, RawLaneTotals>,
  element: KitElement,
  hits: number,
  misses: number,
) {
  const current = totals.get(element) ?? {
    hits: 0,
    misses: 0,
    sampleCount: 0,
  };

  current.hits += hits;
  current.misses += misses;
  current.sampleCount += hits + misses;
  totals.set(element, current);
}

/**
 * Builds Home's per-drum metric from actual saved lane outcomes. This has a
 * deliberately stricter date contract than broad mastery fallbacks: an
 * undated summary cannot honestly be placed in a visible rolling window, so
 * it is omitted rather than treated as a new observation.
 */
export function computeRecentLaneSignals(
  runs: readonly RunSummary[],
  nowMs = Date.now(),
): RecentLaneSignal[] {
  const current = new Map<KitElement, WeightedLaneTotals>();
  const newestHalf = new Map<KitElement, RawLaneTotals>();
  const precedingHalf = new Map<KitElement, RawLaneTotals>();

  for (const run of runs) {
    const completedAt = completedAtMs(run);

    if (completedAt === undefined) {
      continue;
    }

    const ageDays = Math.max(0, nowMs - completedAt) / DAY_MS;

    if (ageDays > RECENT_READINESS_WINDOW_DAYS) {
      continue;
    }

    const weight = 2 ** (-ageDays / RECENT_HALF_LIFE_DAYS);

    for (const lane of run.laneAccuracy) {
      const counts = usableLaneCounts(lane);

      if (!counts) {
        continue;
      }

      const existing = current.get(lane.element) ?? {
        weightedHits: 0,
        weightedMisses: 0,
        sampleCount: 0,
        runCount: 0,
      };

      existing.weightedHits += counts.hits * weight;
      existing.weightedMisses += counts.misses * weight;
      existing.sampleCount += counts.hits + counts.misses;
      existing.runCount += 1;
      current.set(lane.element, existing);

      if (ageDays <= RECENT_LANE_TREND_WINDOW_DAYS) {
        addRawLane(newestHalf, lane.element, counts.hits, counts.misses);
      } else {
        addRawLane(precedingHalf, lane.element, counts.hits, counts.misses);
      }
    }
  }

  return [...current.entries()]
    .flatMap(([element, totals]) => {
      const weightedTotal = totals.weightedHits + totals.weightedMisses;

      if (weightedTotal <= 0) {
        return [];
      }

      const newest = newestHalf.get(element);
      const preceding = precedingHalf.get(element);
      const evidenceState: RecentLaneSignal['evidenceState'] =
        totals.sampleCount >= MIN_RECENT_LANE_SAMPLES
          ? 'measured'
          : 'insufficient';
      const canTrend =
        (newest?.sampleCount ?? 0) >= MIN_RECENT_LANE_SAMPLES &&
        (preceding?.sampleCount ?? 0) >= MIN_RECENT_LANE_SAMPLES;

      return [
        {
          element,
          accuracy: totals.weightedHits / weightedTotal,
          sampleCount: totals.sampleCount,
          runCount: totals.runCount,
          evidenceState,
          ...(canTrend
            ? {
                trendPp:
                  (newest!.hits / (newest!.hits + newest!.misses) -
                    preceding!.hits / (preceding!.hits + preceding!.misses)) *
                  100,
              }
            : {}),
        },
      ];
    })
    .sort((a, b) => a.element.localeCompare(b.element));
}
