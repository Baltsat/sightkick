import { InputMapping } from '../../../types';

/**
 * A drum-kit lane a hit record can be attributed to. Deliberately narrower
 * than the app-wide `InputElement` (which also covers non-kit controls like
 * `up`/`pause`) — practice analytics only ever score kit lanes.
 */
export type KitElement = keyof InputMapping;

/** Outcome of a single scored input against the chart. */
export type HitVerdict = 'hit' | 'miss' | 'wrong';

/**
 * One scored event captured during a run.
 *
 * `deltaMs` is the signed actual-vs-expected timing offset in milliseconds
 * (negative = struck early, positive = struck late). It is only meaningful
 * for `verdict: 'hit'` records: a miss never had a strike to time, and a
 * wrong hit isn't matched to an expected note, so neither has a real
 * "expected" instant to compare against. Callers should pass `0` for those
 * two cases — every compute function in this module ignores `deltaMs` on
 * non-`'hit'` records regardless of its value.
 */
export interface HitRecord {
  tick: number;
  timeSeconds: number;
  deltaMs: number;
  element: KitElement;
  verdict: HitVerdict;
  velocity?: number;
}

export interface LaneAccuracy {
  element: KitElement;
  hits: number;
  misses: number;
  /** hits / (hits + misses). Lane only appears when hits + misses > 0. */
  accuracy: number;
}

export interface LaneBias {
  element: KitElement;
  /** Mean signed deltaMs across this lane's 'hit' records. */
  meanMs: number;
  sampleCount: number;
}

export interface WrongHitCount {
  element: KitElement;
  count: number;
}

export interface TimingBiasStats {
  meanMs: number;
  medianMs: number;
  /** Population standard deviation of signed deltaMs across 'hit' records. */
  spreadMs: number;
  earlyCount: number;
  lateCount: number;
  onTimeCount: number;
  sampleCount: number;
}

/**
 * Everything computed for one completed run. `completedAt` is supplied by
 * the caller (an ISO timestamp) — this module never touches the clock, so
 * the same input always produces the same output.
 */
export interface RunSummary {
  completedAt: string;
  totalHits: number;
  totalMisses: number;
  totalWrong: number;
  /** totalHits / (totalHits + totalMisses); 0 when there were no scoreable attempts. */
  overallAccuracy: number;
  laneAccuracy: LaneAccuracy[];
  laneBias: LaneBias[];
  timingBias: TimingBiasStats;
  wrongHitCounts: WrongHitCount[];
}

export interface RunTrendPoint {
  completedAt: string;
  accuracy: number;
  biasMeanMs: number;
}
