import { Difficulty } from 'scan-chart';
import { aggregateLaneAccuracy, RunSummary } from '../practice-stats';
import { computeMastery, scopeRunsToDifficulty } from './mastery';
import {
  MasteryGoal,
  MasteryTimelinePoint,
  MasteryTrendProjection,
} from './types';

/**
 * One point per scoped run, each computed as if `computeMastery` had been
 * asked "what was mastery *at that moment*" — both the goal song's own run
 * history and the library-wide run history (for the sub-readiness term)
 * are truncated to runs completed at or before that point. This is what
 * turns the Profile graph into an actual convergence curve rather than a
 * flat line at today's score repeated backwards: early points reflect how
 * little was known/practiced back then, later points climb toward
 * whatever `mastery` reads today (the last point in this array always
 * equals `computeMastery(...).mastery` for the same inputs).
 *
 * O(n²) in the scoped run count, deliberately — `MAX_STORED_RUNS_PER_SONG`
 * (see `src/main/ipc/practiceStats.ts`) caps that at 50, so the worst case
 * is a few thousand cheap arithmetic ops, not a performance concern.
 */
export function masteryTimeline({
  goal,
  songRuns,
  allRuns,
  songDifficulties,
  chartTotalNotes,
}: {
  goal: MasteryGoal;
  songRuns: RunSummary[];
  allRuns: RunSummary[];
  songDifficulties?: Difficulty[];
  chartTotalNotes?: number;
}): MasteryTimelinePoint[] {
  const scopedRuns = scopeRunsToDifficulty(
    songRuns,
    goal.difficulty,
    songDifficulties,
  );

  return scopedRuns.map((run, index) => {
    const runsSoFar = scopedRuns.slice(0, index + 1);
    const allRunsSoFar = allRuns.filter(
      (candidate) => candidate.completedAt <= run.completedAt,
    );
    const breakdown = computeMastery({
      goal,
      songRuns: runsSoFar,
      allRuns: allRunsSoFar,
      songDifficulties,
      chartTotalNotes,
      globalLaneAccuracy: aggregateLaneAccuracy(allRunsSoFar),
      // A timeline point answers "what did the evidence say on this date?";
      // pinning decay to the point avoids replaying old points through
      // today's clock.
      nowMs: Date.parse(run.completedAt),
    });

    return {
      completedAt: run.completedAt,
      mastery: breakdown.mastery,
      accuracy: Math.round(breakdown.accuracy.value * 100),
      speedFactor: breakdown.speedFactor.value,
      runIndex: index,
    };
  });
}

/** Minimum timeline points a linear trend fit needs to mean anything —
 * one point has no slope, and two collinear points technically "fit" but
 * are too noise-prone to project a target date from. */
export const MIN_POINTS_FOR_PROJECTION = 3;

/**
 * Ordinary-least-squares fit of mastery (0..100) against time (days since
 * the first point), over the *whole* timeline — recent-only windows would
 * make the projection jump around run to run on a feature meant to read
 * as a steady trend line. Returns a flat/zero-slope projection (no
 * `projectedMasteryDate`) when there's too little history to fit, matching
 * "no runs yet" reading as "no evidence of a trend" rather than an error.
 */
export function projectMasteryTrend(
  timeline: MasteryTimelinePoint[],
  targetDate?: string,
): MasteryTrendProjection {
  if (timeline.length < MIN_POINTS_FOR_PROJECTION) {
    return { slopePerDay: 0, projectedMasteryDate: null };
  }

  // Evidence confidence naturally rises during the first few runs. That is
  // useful to display, but it is not proof the player is improving. A flat
  // underlying accuracy series therefore has no performance trend to
  // project, even if retention confidence made the visible mastery ring rise.
  const accuracyRange =
    Math.max(...timeline.map((point) => point.accuracy)) -
    Math.min(...timeline.map((point) => point.accuracy));

  if (accuracyRange === 0) {
    return { slopePerDay: 0, projectedMasteryDate: null };
  }

  const firstMs = new Date(timeline[0].completedAt).getTime();
  const points = timeline.map((point) => ({
    days: (new Date(point.completedAt).getTime() - firstMs) / 86_400_000,
    mastery: point.mastery,
  }));
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.days, 0);
  const sumY = points.reduce((sum, p) => sum + p.mastery, 0);
  const sumXY = points.reduce((sum, p) => sum + p.days * p.mastery, 0);
  const sumXX = points.reduce((sum, p) => sum + p.days * p.days, 0);
  const denominator = n * sumXX - sumX * sumX;

  // All runs on the same day (denominator 0) — no time axis to fit a
  // slope against.
  if (denominator === 0) {
    return { slopePerDay: 0, projectedMasteryDate: null };
  }

  const slopePerDay = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slopePerDay * sumX) / n;
  const latestMastery = timeline[timeline.length - 1].mastery;
  let projectedMasteryDate: string | null = null;

  if (slopePerDay > 0 && latestMastery < 100) {
    const daysToTarget = (100 - intercept) / slopePerDay;
    const latestDays = points[points.length - 1].days;

    // Only project forward — a fit whose 100%-crossing already sits in
    // the past (a curve that spiked early and has since been flat/falling
    // relative to the line) isn't a real "you'll get there by" answer.
    if (daysToTarget >= latestDays) {
      const projectedDate = new Date(firstMs + daysToTarget * 86_400_000);

      projectedMasteryDate = projectedDate.toISOString().slice(0, 10);
    }
  }

  const result: MasteryTrendProjection = { slopePerDay, projectedMasteryDate };

  if (targetDate) {
    const targetDays = (new Date(targetDate).getTime() - firstMs) / 86_400_000;

    result.projectedMasteryAtTargetDate = intercept + slopePerDay * targetDays;
  }

  return result;
}
