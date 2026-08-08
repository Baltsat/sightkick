import { Difficulty } from 'scan-chart';
import {
  aggregateLaneAccuracy,
  LaneAccuracy,
  RunSummary,
} from '../practice-stats';
import {
  LaneWeight,
  MasteryBreakdown,
  MasteryGoal,
  MasteryTerm,
} from './types';

/**
 * mastery(goal) — how close a player is to their stated goal: play one
 * song, at one difficulty, at full (1.0x) speed, cleanly.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ mastery = 0.35·accuracy + 0.20·consistency + 0.15·speedFactor        │
 * │         + 0.15·coverage + 0.15·subReadiness                          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * All five terms are 0..1 before weighting; the sum of weights is 1, so
 * `mastery` lands in 0..100 once scaled. Each term is returned individually
 * (`MasteryBreakdown`) so the UI can show *why* the number is what it is,
 * and so `worstMasteryTerm` can name the single highest-leverage thing to
 * practice next.
 *
 * — accuracy (dominant, 0.35): best `overallAccuracy` among the goal
 *   song's runs *at 1.0x speed* (see `isFullSpeedRun` below for what
 *   counts as "1.0x" given optional/legacy fields). This is the term that
 *   actually answers "can you play it, for real, at speed" — everything
 *   else is supporting signal, which is why it carries the largest single
 *   weight.
 *
 * — consistency (0.20): median accuracy of the last 5 scoped runs
 *   (regardless of speed — reliability of recent attempts matters even
 *   before you're full-speed). A single lucky perfect run isn't mastery;
 *   a middling-but-steady run of 5 is closer to it than one 100% buried in
 *   a string of 40%s.
 *
 * — speedFactor (0.15): best clean-run speed / 1.0, clamped to [0, 1]. A
 *   "clean" run is one at or above `CLEAN_RUN_ACCURACY_THRESHOLD` — this
 *   term rewards *approaching* 1.0x accurately, not just fast-and-sloppy
 *   runs, and caps at 1 because playing faster than the goal's target
 *   speed isn't "more mastery" for this goal.
 *
 * — coverage (0.15): the largest count of notes attempted (hits+misses) in
 *   any one scoped run, divided by the chart's total note count at this
 *   difficulty. Approximates "have you gotten through the whole song, not
 *   just a favorite 8 bars on repeat" without needing bar-level telemetry
 *   `RunSummary` doesn't carry. When the chart's real total note count
 *   isn't known (no scored Perform run yet at this difficulty — Practice
 *   grinding alone never populates `scoreData`), falls back to the largest
 *   attempted count seen so far as its own denominator, i.e. "fully
 *   covered relative to what you've attempted" rather than defaulting to
 *   100% — a missing denominator must never look like full coverage.
 *
 * — subReadiness (0.15): the player's *global*, cross-song per-lane
 *   accuracy (every song, every run — `aggregateLaneAccuracy`), weighted
 *   by how much this goal song's own runs lean on each lane. A goal song
 *   that's 40% kick hits cares far more about your all-time kick accuracy
 *   than your crash accuracy. No chart parsing involved — lane demand is
 *   read straight off the goal song's own `laneAccuracy` records, and
 *   global accuracy off every stored run in the library.
 *
 * Every helper here is a pure function of its inputs (no clock, no I/O) —
 * the only place "now" or storage enters is the IPC/hook layer that feeds
 * this module `RunSummary[]`.
 */

export const ACCURACY_WEIGHT = 0.35;

export const CONSISTENCY_WEIGHT = 0.2;

export const SPEED_WEIGHT = 0.15;

export const COVERAGE_WEIGHT = 0.15;

export const SUB_READINESS_WEIGHT = 0.15;

/** A run counts as "clean" for the speed-factor term at or above this
 * accuracy. Below it, going faster is just missing notes faster. */
export const CLEAN_RUN_ACCURACY_THRESHOLD = 0.9;

/** How many of the most recent scoped runs feed the consistency term. */
export const CONSISTENCY_WINDOW = 5;

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

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function byCompletedAtAsc(a: RunSummary, b: RunSummary): number {
  return a.completedAt.localeCompare(b.completedAt);
}

/**
 * Whether `run` counts as played "at 1.0x" for the accuracy/coverage
 * terms. Perform mode is defined to always lock speed at 1x (per
 * `RunSummary.playbackSpeed`'s doc comment) regardless of whether the
 * (optional, backfilled-later) `playbackSpeed` field itself is present, so
 * a Perform run with no stamped speed still safely counts. A Practice run
 * with no stamped speed is genuinely unknown — it predates the field —
 * and is excluded rather than guessed at.
 */
export function isFullSpeedRun(run: RunSummary): boolean {
  if (run.playbackSpeed !== undefined) {
    return run.playbackSpeed === 1;
  }

  return run.mode === 'perform' || run.mode === undefined;
}

/**
 * Narrows `songRuns` (every stored run for one song, any difficulty) down
 * to the ones usable for scoring `difficulty`. A run tagged with a
 * *different* difficulty is always excluded. An untagged run (recorded
 * before `RunSummary.difficulty` existed) is included only when
 * `songDifficulties` shows the song never had more than one charted
 * difficulty to begin with — in that case there's no ambiguity about what
 * an untagged run was played at. Otherwise untagged runs are dropped
 * rather than guessed at, matching `isFullSpeedRun`'s stance on missing
 * data.
 */
export function scopeRunsToDifficulty(
  songRuns: RunSummary[],
  difficulty: Difficulty,
  songDifficulties?: Difficulty[],
): RunSummary[] {
  const singleDifficultySong = (songDifficulties?.length ?? 0) <= 1;

  return songRuns
    .filter((run) => {
      if (run.difficulty !== undefined) {
        return run.difficulty === difficulty;
      }

      return singleDifficultySong;
    })
    .sort(byCompletedAtAsc);
}

/** Best `overallAccuracy` among full-speed scoped runs, 0 when none. */
export function computeAccuracyValue(scopedRuns: RunSummary[]): number {
  const fullSpeedAccuracies = scopedRuns
    .filter(isFullSpeedRun)
    .map((run) => run.overallAccuracy);

  return fullSpeedAccuracies.length === 0
    ? 0
    : Math.max(...fullSpeedAccuracies);
}

/** Median accuracy of the last `CONSISTENCY_WINDOW` scoped runs (any
 * speed), 0 when there are none. */
export function computeConsistencyValue(scopedRuns: RunSummary[]): number {
  const lastFew = scopedRuns.slice(-CONSISTENCY_WINDOW);

  return median(lastFew.map((run) => run.overallAccuracy));
}

/** Best playbackSpeed among "clean" (>= `CLEAN_RUN_ACCURACY_THRESHOLD`
 * accuracy) scoped runs, divided by 1.0 and clamped to [0, 1]. A clean
 * Perform run with no stamped speed counts as speed 1 (Perform is always
 * 1x); a clean Practice run with no stamped speed is unknown and skipped,
 * same reasoning as `isFullSpeedRun`. */
export function computeSpeedFactorValue(scopedRuns: RunSummary[]): number {
  const cleanSpeeds = scopedRuns
    .filter((run) => run.overallAccuracy >= CLEAN_RUN_ACCURACY_THRESHOLD)
    .map((run) => {
      if (run.playbackSpeed !== undefined) {
        return run.playbackSpeed;
      }

      return run.mode === 'perform' ? 1 : undefined;
    })
    .filter((speed): speed is number => speed !== undefined);

  if (cleanSpeeds.length === 0) {
    return 0;
  }

  return clamp01(Math.max(...cleanSpeeds) / 1);
}

/**
 * Largest notes-attempted (hits+misses) count seen in one scoped run,
 * divided by the chart's known total note count at this difficulty. Falls
 * back to the largest attempted count itself as the denominator when the
 * real total isn't known yet (see the module docstring's coverage
 * section) — never defaults to 1, which would silently claim full
 * coverage for songs the player hasn't necessarily finished.
 */
export function computeCoverageValue(
  scopedRuns: RunSummary[],
  chartTotalNotes?: number,
): number {
  const attemptedCounts = scopedRuns.map(
    (run) => run.totalHits + run.totalMisses,
  );

  if (attemptedCounts.length === 0) {
    return 0;
  }

  const bestAttempted = Math.max(...attemptedCounts);
  const denominator =
    chartTotalNotes && chartTotalNotes > 0 ? chartTotalNotes : bestAttempted;

  if (denominator <= 0) {
    return 0;
  }

  return clamp01(bestAttempted / denominator);
}

/** Per-lane hit+miss share for one song's runs — "how much does this song
 * lean on each drum". Lanes the song never touches don't appear. */
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

/**
 * Demand-weighted global lane accuracy: for each lane the goal song
 * leans on, look up the player's all-time accuracy in that lane (from
 * `globalLaneAccuracy`, e.g. `aggregateLaneAccuracy` over every stored
 * run) and weight it by how much the goal song uses that lane. A lane the
 * song needs but the player has never played anywhere yields 0 for that
 * lane's contribution (untested, not assumed fine).
 */
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

function makeTerm(
  key: MasteryTerm['key'],
  label: string,
  value: number,
  weight: number,
): MasteryTerm {
  const clamped = clamp01(value);

  return { key, label, value: clamped, weight, contribution: clamped * weight };
}

export interface ComputeMasteryInput {
  goal: MasteryGoal;
  /** Every stored run for the goal's song, any difficulty — this function
   * does the difficulty scoping itself via `scopeRunsToDifficulty`. */
  songRuns: RunSummary[];
  /** Every stored run across the whole library, for the sub-readiness
   * term's global lane accuracy. Pass `songRuns`' own superset here if a
   * separate library-wide fetch isn't available yet. */
  allRuns: RunSummary[];
  /** Every difficulty this song has ever had charted, for the
   * single-difficulty legacy-run fallback in `scopeRunsToDifficulty`. */
  songDifficulties?: Difficulty[];
  /** `song.scoreData[goal.difficulty]?.totalNotes`, when known. */
  chartTotalNotes?: number;
  /** Pre-aggregated cross-song lane accuracy
   * (`aggregateLaneAccuracy(allRuns)`), so callers that already computed
   * it (e.g. `useGamification`) don't pay for it twice. Computed from
   * `allRuns` when omitted. */
  globalLaneAccuracy?: LaneAccuracy[];
}

export function computeMastery({
  goal,
  songRuns,
  allRuns,
  songDifficulties,
  chartTotalNotes,
  globalLaneAccuracy,
}: ComputeMasteryInput): MasteryBreakdown {
  const scopedRuns = scopeRunsToDifficulty(
    songRuns,
    goal.difficulty,
    songDifficulties,
  );
  const laneWeights = computeLaneWeights(scopedRuns);
  const resolvedGlobalLaneAccuracy =
    globalLaneAccuracy ?? aggregateLaneAccuracy(allRuns);
  const accuracy = makeTerm(
    'accuracy',
    'Accuracy at full speed',
    computeAccuracyValue(scopedRuns),
    ACCURACY_WEIGHT,
  );
  const consistency = makeTerm(
    'consistency',
    'Consistency (last 5 runs)',
    computeConsistencyValue(scopedRuns),
    CONSISTENCY_WEIGHT,
  );
  const speedFactor = makeTerm(
    'speedFactor',
    'Speed toward 1.0x',
    computeSpeedFactorValue(scopedRuns),
    SPEED_WEIGHT,
  );
  const coverage = makeTerm(
    'coverage',
    'Section coverage',
    computeCoverageValue(scopedRuns, chartTotalNotes),
    COVERAGE_WEIGHT,
  );
  const subReadiness = makeTerm(
    'subReadiness',
    'Related-skill readiness',
    computeSubReadinessValue(laneWeights, resolvedGlobalLaneAccuracy),
    SUB_READINESS_WEIGHT,
  );
  const mastery = Math.round(
    (accuracy.contribution +
      consistency.contribution +
      speedFactor.contribution +
      coverage.contribution +
      subReadiness.contribution) *
      100,
  );

  return {
    mastery,
    accuracy,
    consistency,
    speedFactor,
    coverage,
    subReadiness,
    runsConsidered: scopedRuns.length,
  };
}

/** The single lowest-scoring term in a breakdown — the highest-leverage
 * thing to practice next. Ties break toward the higher-weight term first
 * (moving the dominant term is worth more even at an equal raw score). */
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
