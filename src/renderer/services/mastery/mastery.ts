import { Difficulty } from 'scan-chart';
import { LaneAccuracy, RunSummary } from '../practice-stats';
import {
  LaneWeight,
  MasteryBreakdown,
  MasteryGoal,
  MasteryTerm,
} from './types';

/** The five transparent terms still sum to one; no hidden lifetime best. */
export const ACCURACY_WEIGHT = 0.35;

export const CONSISTENCY_WEIGHT = 0.2;

export const SPEED_WEIGHT = 0.15;

export const COVERAGE_WEIGHT = 0.15;

export const SUB_READINESS_WEIGHT = 0.15;

export const CLEAN_RUN_ACCURACY_THRESHOLD = 0.9;

export const CONSISTENCY_WINDOW = 5;

export const RECENT_READINESS_WINDOW_DAYS = 28;

export const RETENTION_WINDOW_DAYS = 120;

export const RECENT_HALF_LIFE_DAYS = 7;

export const RETENTION_HALF_LIFE_DAYS = 28;

export const MIN_RECENT_RUNS_FOR_FULL_READINESS = 3;

export const MIN_RETENTION_RUNS_FOR_FULL_MASTERY = 5;

const DAY_MS = 86_400_000;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

function byCompletedAtAsc(a: RunSummary, b: RunSummary): number {
  return a.completedAt.localeCompare(b.completedAt);
}

function timestamp(run: RunSummary): number | undefined {
  const value = Date.parse(run.completedAt);

  return Number.isFinite(value) ? value : undefined;
}

function resolveNowMs(
  runs: readonly RunSummary[],
  configuredNowMs?: number,
): number {
  if (configuredNowMs !== undefined && Number.isFinite(configuredNowMs)) {
    return configuredNowMs;
  }

  const latest = Math.max(
    0,
    ...runs.flatMap((run) => {
      const value = timestamp(run);

      return value === undefined ? [] : [value];
    }),
  );

  return latest;
}

function ageDays(run: RunSummary, nowMs: number): number {
  const completedAt = timestamp(run);

  // Undated legacy summaries remain usable but do not receive a fabricated
  // historical timestamp. Treat them as current evidence for a finite,
  // deterministic fallback rather than silently dropping the whole run.
  return completedAt === undefined
    ? 0
    : Math.max(0, nowMs - completedAt) / DAY_MS;
}

function inWindow(
  runs: readonly RunSummary[],
  nowMs: number,
  windowDays: number,
): RunSummary[] {
  return runs.filter((run) => {
    return ageDays(run, nowMs) <= windowDays;
  });
}

function timeDecayedMean(
  runs: readonly RunSummary[],
  nowMs: number,
  halfLifeDays: number,
  valueFor: (run: RunSummary) => number | undefined,
): number {
  let weighted = 0;
  let weights = 0;

  for (const run of runs) {
    const age = ageDays(run, nowMs);
    const value = valueFor(run);

    if (value === undefined || !Number.isFinite(value)) {
      continue;
    }

    const weight = 2 ** (-age / halfLifeDays);

    weighted += clamp01(value) * weight;
    weights += weight;
  }

  return weights === 0 ? 0 : weighted / weights;
}

function confidence(count: number, sufficientCount: number): number {
  return clamp01(count / sufficientCount);
}

function evidenceWindow(
  runs: readonly RunSummary[],
  nowMs: number,
  windowDays: number,
) {
  const ages = runs.map((run) => ageDays(run, nowMs)).filter(Number.isFinite);

  return {
    windowDays,
    sampleCount: runs.length,
    ...(ages.length > 0 ? { newestSampleAgeDays: Math.min(...ages) } : {}),
    ...(ages.length > 0 ? { oldestSampleAgeDays: Math.max(...ages) } : {}),
  };
}

/** See `RunSummary.playbackSpeed`: legacy Perform runs safely imply 1x. */
export function isFullSpeedRun(run: RunSummary): boolean {
  if (run.playbackSpeed !== undefined) {
    return run.playbackSpeed === 1;
  }

  return run.mode === 'perform' || run.mode === undefined;
}

export function scopeRunsToDifficulty(
  songRuns: RunSummary[],
  difficulty: Difficulty,
  songDifficulties?: Difficulty[],
): RunSummary[] {
  const singleDifficultySong = (songDifficulties?.length ?? 0) <= 1;

  return songRuns
    .filter((run) =>
      run.difficulty !== undefined
        ? run.difficulty === difficulty
        : singleDifficultySong,
    )
    .sort(byCompletedAtAsc);
}

/**
 * Full-speed accuracy is a time-decayed mean of actual full-speed runs.
 * This intentionally rejects the former lifetime-best behavior: one lucky
 * pass cannot dominate several recent weak passes.
 */
export function computeAccuracyValue(
  scopedRuns: RunSummary[],
  nowMs?: number,
  halfLifeDays = RETENTION_HALF_LIFE_DAYS,
): number {
  const now = resolveNowMs(scopedRuns, nowMs);

  return timeDecayedMean(
    scopedRuns.filter(isFullSpeedRun),
    now,
    halfLifeDays,
    (run) => run.overallAccuracy,
  );
}

/** Weighted recent reliability, rather than a lifetime or single-run best. */
export function computeConsistencyValue(
  scopedRuns: RunSummary[],
  nowMs?: number,
  halfLifeDays = RETENTION_HALF_LIFE_DAYS,
): number {
  const now = resolveNowMs(scopedRuns, nowMs);
  const recent = [...scopedRuns]
    .sort(byCompletedAtAsc)
    .slice(-CONSISTENCY_WINDOW);

  return timeDecayedMean(
    recent,
    now,
    halfLifeDays,
    (run) => run.overallAccuracy,
  );
}

export function computeSpeedFactorValue(
  scopedRuns: RunSummary[],
  nowMs?: number,
  halfLifeDays = RETENTION_HALF_LIFE_DAYS,
): number {
  const now = resolveNowMs(scopedRuns, nowMs);

  return timeDecayedMean(
    scopedRuns.filter(
      (run) => run.overallAccuracy >= CLEAN_RUN_ACCURACY_THRESHOLD,
    ),
    now,
    halfLifeDays,
    (run) => {
      if (run.playbackSpeed !== undefined) {
        return run.playbackSpeed;
      }

      return run.mode === 'perform' ? 1 : undefined;
    },
  );
}

/**
 * Coverage needs a chart denominator. Without it, the honest value is zero
 * with `evidence.coverage === 'unknown'`; a looped partial run must never
 * become a fabricated 100%-coverage claim.
 */
export function computeCoverageValue(
  scopedRuns: RunSummary[],
  chartTotalNotes?: number,
  nowMs?: number,
  halfLifeDays = RETENTION_HALF_LIFE_DAYS,
): number {
  if (!chartTotalNotes || chartTotalNotes <= 0) {
    return 0;
  }

  const now = resolveNowMs(scopedRuns, nowMs);

  return timeDecayedMean(
    scopedRuns,
    now,
    halfLifeDays,
    (run) => (run.totalHits + run.totalMisses) / chartTotalNotes,
  );
}

export function computeLaneWeights(songRuns: RunSummary[]): LaneWeight[] {
  const totals = new Map<string, number>();
  let grandTotal = 0;

  for (const run of songRuns) {
    for (const lane of run.laneAccuracy) {
      const count = lane.hits + lane.misses;

      totals.set(lane.element, (totals.get(lane.element) ?? 0) + count);
      grandTotal += count;
    }
  }

  if (grandTotal === 0) {
    return [];
  }

  return [...totals.entries()].map(([element, count]) => ({
    element: element as LaneWeight['element'],
    weight: count / grandTotal,
  }));
}

export function computeSubReadinessValue(
  laneWeights: LaneWeight[],
  globalLaneAccuracy: LaneAccuracy[],
): number {
  if (laneWeights.length === 0) {
    return 0;
  }

  const accuracyByLane = new Map(
    globalLaneAccuracy.map((lane) => [lane.element, lane.accuracy]),
  );

  return laneWeights.reduce(
    (sum, { element, weight }) =>
      sum + weight * (accuracyByLane.get(element) ?? 0),
    0,
  );
}

function timeDecayedLaneAccuracy(
  allRuns: readonly RunSummary[],
  nowMs: number,
  windowDays: number,
  halfLifeDays: number,
): LaneAccuracy[] {
  const totals = new Map<string, { hits: number; misses: number }>();

  for (const run of inWindow(allRuns, nowMs, windowDays)) {
    const age = ageDays(run, nowMs);
    const weight = 2 ** (-age / halfLifeDays);

    for (const lane of run.laneAccuracy) {
      const current = totals.get(lane.element) ?? { hits: 0, misses: 0 };

      current.hits += lane.hits * weight;
      current.misses += lane.misses * weight;
      totals.set(lane.element, current);
    }
  }

  return [...totals.entries()].flatMap(([element, stats]) => {
    const total = stats.hits + stats.misses;

    return total > 0
      ? [
          {
            element: element as LaneAccuracy['element'],
            hits: stats.hits,
            misses: stats.misses,
            accuracy: stats.hits / total,
          },
        ]
      : [];
  });
}

function makeTerm(
  key: MasteryTerm['key'],
  label: string,
  value: number,
  weight: number,
  evidenceState: MasteryTerm['evidenceState'] = 'measured',
): MasteryTerm {
  const clamped = clamp01(value);

  return {
    key,
    label,
    value: clamped,
    weight,
    contribution: clamped * weight,
    evidenceState,
  };
}

export interface ComputeMasteryInput {
  goal: MasteryGoal;
  songRuns: RunSummary[];
  allRuns: RunSummary[];
  songDifficulties?: Difficulty[];
  chartTotalNotes?: number;
  globalLaneAccuracy?: LaneAccuracy[];
  /** Explicit clock makes decay and sample ages reproducible in tests/UI. */
  nowMs?: number;
}

interface ScoredWindow {
  score: number;
  terms: Pick<
    MasteryBreakdown,
    'accuracy' | 'consistency' | 'speedFactor' | 'coverage' | 'subReadiness'
  >;
}

function scoreWindow({
  runs,
  allRuns,
  chartTotalNotes,
  nowMs,
  windowDays,
  halfLifeDays,
  globalLaneAccuracy,
}: {
  runs: RunSummary[];
  allRuns: RunSummary[];
  chartTotalNotes?: number;
  nowMs: number;
  windowDays: number;
  halfLifeDays: number;
  globalLaneAccuracy?: LaneAccuracy[];
}): ScoredWindow {
  const windowRuns = inWindow(runs, nowMs, windowDays);
  const laneWeights = computeLaneWeights(windowRuns);
  const lanes =
    globalLaneAccuracy ??
    timeDecayedLaneAccuracy(allRuns, nowMs, windowDays, halfLifeDays);
  const coverageState: MasteryTerm['evidenceState'] =
    !chartTotalNotes || chartTotalNotes <= 0 || windowRuns.length === 0
      ? 'insufficient'
      : 'measured';
  const accuracy = makeTerm(
    'accuracy',
    'Full-speed accuracy (time-decayed)',
    computeAccuracyValue(windowRuns, nowMs, halfLifeDays),
    ACCURACY_WEIGHT,
  );
  const consistency = makeTerm(
    'consistency',
    'Recent consistency (time-decayed)',
    computeConsistencyValue(windowRuns, nowMs, halfLifeDays),
    CONSISTENCY_WEIGHT,
  );
  const speedFactor = makeTerm(
    'speedFactor',
    'Clean-speed readiness (time-decayed)',
    computeSpeedFactorValue(windowRuns, nowMs, halfLifeDays),
    SPEED_WEIGHT,
  );
  const coverage = makeTerm(
    'coverage',
    chartTotalNotes && chartTotalNotes > 0
      ? 'Chart coverage (time-decayed)'
      : 'Chart coverage (unknown total)',
    computeCoverageValue(windowRuns, chartTotalNotes, nowMs, halfLifeDays),
    COVERAGE_WEIGHT,
    coverageState,
  );
  const subReadiness = makeTerm(
    'subReadiness',
    'Related-lane readiness (time-decayed)',
    computeSubReadinessValue(laneWeights, lanes),
    SUB_READINESS_WEIGHT,
  );
  const score =
    accuracy.contribution +
    consistency.contribution +
    speedFactor.contribution +
    coverage.contribution +
    subReadiness.contribution;

  return {
    score,
    terms: { accuracy, consistency, speedFactor, coverage, subReadiness },
  };
}

export function computeMastery({
  goal,
  songRuns,
  allRuns,
  songDifficulties,
  chartTotalNotes,
  globalLaneAccuracy,
  nowMs,
}: ComputeMasteryInput): MasteryBreakdown {
  const scopedRuns = scopeRunsToDifficulty(
    songRuns,
    goal.difficulty,
    songDifficulties,
  );
  const now = resolveNowMs([...scopedRuns, ...allRuns], nowMs);
  const recentRuns = inWindow(scopedRuns, now, RECENT_READINESS_WINDOW_DAYS);
  const retentionRuns = inWindow(scopedRuns, now, RETENTION_WINDOW_DAYS);
  const recent = scoreWindow({
    runs: scopedRuns,
    allRuns,
    chartTotalNotes,
    nowMs: now,
    windowDays: RECENT_READINESS_WINDOW_DAYS,
    halfLifeDays: RECENT_HALF_LIFE_DAYS,
  });
  const retention = scoreWindow({
    runs: scopedRuns,
    allRuns,
    chartTotalNotes,
    nowMs: now,
    windowDays: RETENTION_WINDOW_DAYS,
    halfLifeDays: RETENTION_HALF_LIFE_DAYS,
    globalLaneAccuracy,
  });
  const recentReadiness = Math.round(
    recent.score *
      confidence(recentRuns.length, MIN_RECENT_RUNS_FOR_FULL_READINESS) *
      100,
  );
  const longTermMastery = Math.round(
    retention.score *
      confidence(retentionRuns.length, MIN_RETENTION_RUNS_FOR_FULL_MASTERY) *
      100,
  );
  const coverage =
    !chartTotalNotes || chartTotalNotes <= 0
      ? 'unknown'
      : retentionRuns.length === 0
      ? 'insufficient'
      : 'measured';

  return {
    mastery: longTermMastery,
    recentReadiness,
    longTermMastery,
    ...retention.terms,
    runsConsidered: scopedRuns.length,
    evidence: {
      evaluatedAtMs: now,
      recent: evidenceWindow(recentRuns, now, RECENT_READINESS_WINDOW_DAYS),
      retention: evidenceWindow(retentionRuns, now, RETENTION_WINDOW_DAYS),
      coverage,
    },
  };
}

export function worstMasteryTerm(breakdown: MasteryBreakdown): MasteryTerm {
  const terms = [
    breakdown.accuracy,
    breakdown.consistency,
    breakdown.speedFactor,
    breakdown.coverage,
    breakdown.subReadiness,
  ];

  return terms.reduce((worst, term) => {
    if (term.value < worst.value) {
      return term;
    }

    if (term.value === worst.value && term.weight > worst.weight) {
      return term;
    }

    return worst;
  });
}
