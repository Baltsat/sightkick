import type { StoredHitRecord } from '../practice-stats';

export type SteadinessSubdivision =
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'triplet';

export interface TimingSteadinessMeasurement {
  sample_count: number;
  center_offset_ms: number;
  spread_ms: number;
  drift_ms: number;
  drift_range_ms: number;
  quarter_means_ms: readonly number[];
  grid_gap_ms: number;
  target_offset_ms: number;
  centering: number;
  consistency: number;
  drift_control: number;
  quality: number;
}

const SUBDIVISION_DIVISOR: Record<SteadinessSubdivision, number> = {
  quarter: 1,
  eighth: 2,
  sixteenth: 4,
  triplet: 3,
};

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function spread(values: readonly number[], center: number): number {
  return Math.sqrt(
    values.reduce((total, value) => total + (value - center) ** 2, 0) /
      values.length,
  );
}

export function timingSteadinessSkillId(
  subdivision: SteadinessSubdivision,
): string {
  return `timing.steadiness.${subdivision}`;
}

export function steadinessSubdivision(
  context_signature: string,
): SteadinessSubdivision | undefined {
  const value = context_signature.match(
    /(?:^|;)subdivision=(quarter|eighth|sixteenth|triplet)(?:;|$)/,
  )?.[1];

  return value as SteadinessSubdivision | undefined;
}

export function measureTimingSteadiness({
  records,
  target_bpm,
  playback_speed = 1,
  subdivision,
}: {
  records: readonly StoredHitRecord[];
  target_bpm: number;
  playback_speed?: number;
  subdivision: SteadinessSubdivision;
}): TimingSteadinessMeasurement | undefined {
  const deltas = records
    .filter(
      (record) => record.verdict === 'hit' && Number.isFinite(record.deltaMs),
    )
    .map((record) => record.deltaMs);
  const tempo = target_bpm * playback_speed;

  if (deltas.length < 4 || !Number.isFinite(tempo) || tempo <= 0) {
    return undefined;
  }

  const center_offset_ms = mean(deltas);
  const spread_ms = spread(deltas, center_offset_ms);
  const quarter_means_ms = Array.from({ length: 4 }, (_, index) => {
    const start = Math.floor((index * deltas.length) / 4);
    const end = Math.floor(((index + 1) * deltas.length) / 4);

    return mean(deltas.slice(start, end));
  });
  const drift_ms = quarter_means_ms.at(-1)! - quarter_means_ms[0];
  const drift_range_ms =
    Math.max(...quarter_means_ms) - Math.min(...quarter_means_ms);
  const grid_gap_ms = 60_000 / (tempo * SUBDIVISION_DIVISOR[subdivision]);
  const target_offset_ms = grid_gap_ms / 3;
  const centering = clamp01(1 - Math.abs(center_offset_ms) / target_offset_ms);
  const consistency = clamp01(1 - spread_ms / target_offset_ms);
  const drift_control = clamp01(1 - drift_range_ms / target_offset_ms);

  return {
    sample_count: deltas.length,
    center_offset_ms,
    spread_ms,
    drift_ms,
    drift_range_ms,
    quarter_means_ms,
    grid_gap_ms,
    target_offset_ms,
    centering,
    consistency,
    drift_control,
    quality: (centering + consistency + drift_control) / 3,
  };
}
