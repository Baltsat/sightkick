import { Difficulty } from 'scan-chart';
import { KitElement, RunSummary } from '../practice-stats';

/** A user-declared target: play `songId` at `difficulty`, optionally by
 * `targetDate`. Mirrors the shape persisted by `src/main/ipc/goals.ts` —
 * this module never touches storage, it only scores whatever goal/run
 * history it's handed. */
export interface MasteryGoal {
  songId: string;
  difficulty: Difficulty;
  targetDate?: string;
}

/** One named term in the mastery breakdown. `value` and `weight` are both
 * 0..1; `contribution` is `value * weight`, pre-multiplied so callers (the
 * "what moves the needle next" line, the UI breakdown list) don't have to
 * redo the math to compare terms fairly. */
export interface MasteryTerm {
  key: 'accuracy' | 'consistency' | 'speedFactor' | 'coverage' | 'subReadiness';
  label: string;
  /** 0..1 */
  value: number;
  /** 0..1, sums to 1 across all terms. */
  weight: number;
  /** value * weight, 0..1. */
  contribution: number;
  /** Whether this value is measured from a meaningful denominator. */
  evidenceState?: 'measured' | 'insufficient';
}

export interface MasteryEvidenceWindow {
  windowDays: number;
  sampleCount: number;
  /** Age of the newest/oldest usable sample relative to the supplied clock. */
  newestSampleAgeDays?: number;
  oldestSampleAgeDays?: number;
}

export interface MasteryEvidence {
  /** The injected evaluation clock, so all scores are reproducible. */
  evaluatedAtMs: number;
  recent: MasteryEvidenceWindow;
  retention: MasteryEvidenceWindow;
  /** Unknown means the chart denominator has not been supplied. */
  coverage: 'measured' | 'unknown' | 'insufficient';
}

export interface MasteryBreakdown {
  /** 0..100 long-term mastery, discounted when retention evidence is thin. */
  mastery: number;
  /** 0..100 current readiness from the short, time-decayed evidence window. */
  recentReadiness: number;
  /** 0..100 retained mastery from the longer time-decayed evidence window. */
  longTermMastery: number;
  accuracy: MasteryTerm;
  consistency: MasteryTerm;
  speedFactor: MasteryTerm;
  coverage: MasteryTerm;
  subReadiness: MasteryTerm;
  /** How many of the goal song's runs were actually usable for this score
   * (matched the goal difficulty, or — for a song with only one charted
   * difficulty ever — untagged legacy runs safely assumed to match). Lets
   * the UI say "based on N runs" honestly instead of implying certainty
   * the input data doesn't have. */
  runsConsidered: number;
  evidence: MasteryEvidence;
}

/** Per-lane hit/miss share, used both to describe a song's own lane
 * "demands" (which drums it leans on) and a player's cross-song lane
 * accuracy (`practice-stats`' `aggregateLaneAccuracy` already computes the
 * latter). */
export interface LaneWeight {
  element: KitElement;
  /** 0..1 share of this song's total scored hits+misses this lane
   * accounts for. Sums to 1 across all lanes that appear at all. */
  weight: number;
}

export interface MasteryTimelinePoint {
  completedAt: string;
  /** 0..100 — the mastery score *as it would have read* using only runs up
   * to and including this one, i.e. the point-in-time value, not a
   * lookback from today. This is what makes the graph a convergence curve
   * rather than a flat replay of the current score. */
  mastery: number;
  /** 0..100 — this run's own accuracy term contribution, surfaced
   * separately so the graph can plot it as its own series. */
  accuracy: number;
  /** 0..1 — the speed-factor term at this point in time. */
  speedFactor: number;
  runIndex: number;
}

export interface MasteryTrendProjection {
  /** Mastery points gained per day, from a linear fit over the timeline's
   * recent points. Zero or negative when there isn't a rising trend
   * (flat/declining history, or fewer than 2 points to fit). */
  slopePerDay: number;
  /** ISO date the linear trend crosses 100% mastery, or `null` when the
   * trend is flat/declining (crossing is undefined) or mastery is already
   * at/above 100. */
  projectedMasteryDate: string | null;
  /** Projected mastery (0..100, not clamped past what the fit predicts) at
   * the goal's `targetDate`, or `undefined` when the goal has no target
   * date or there's no history to fit. */
  projectedMasteryAtTargetDate?: number;
}

export type { RunSummary };
