import { describe, expect, it } from 'vitest';
import type { StoredHitRecord } from '../practice-stats';
import {
  measureTimingSteadiness,
  timingSteadinessSkillId,
} from './timing-steadiness';

function realSixteenthFixture(): StoredHitRecord[] {
  const quarters = [
    [-57.09371148989896, 33],
    [-92.59649589646453, 33],
    [-67.28655744949468, 33],
    [-119.18459129901863, 34],
  ] as const;

  return quarters.flatMap(([deltaMs, count], quarter) =>
    Array.from({ length: count }, (_, index) => ({
      tick: (quarter * 40 + index) * 120,
      deltaMs,
      element: 'snare' as const,
      verdict: 'hit' as const,
    })),
  );
}

describe('timing steadiness', () => {
  it('keeps centering, spread, and drift distinct on the real 16.01 drift shape', () => {
    const measurement = measureTimingSteadiness({
      records: realSixteenthFixture(),
      target_bpm: 60,
      playback_speed: 1,
      subdivision: 'sixteenth',
    });

    expect(measurement?.sample_count).toBe(133);
    expect(measurement?.center_offset_ms).toBeCloseTo(-84.30458153195451, 10);
    expect(measurement?.drift_ms).toBeCloseTo(-62.09087980911968, 10);
    expect(measurement?.drift_range_ms).toBeCloseTo(62.09087980911968, 10);
    expect(measurement?.quarter_means_ms).toEqual([
      expect.closeTo(-57.09371148989896, 10),
      expect.closeTo(-92.59649589646453, 10),
      expect.closeTo(-67.28655744949468, 10),
      expect.closeTo(-119.18459129901863, 10),
    ]);
    expect(measurement!.centering).toBeLessThan(measurement!.drift_control);
    expect(measurement!.quality).toBeLessThan(0.5);
  });

  it('keeps the same raw timing evidence independent from hit accuracy inputs', () => {
    const first = measureTimingSteadiness({
      records: realSixteenthFixture(),
      target_bpm: 90,
      subdivision: 'sixteenth',
    });
    const second = measureTimingSteadiness({
      records: realSixteenthFixture(),
      target_bpm: 90,
      subdivision: 'sixteenth',
    });

    expect(first).toEqual(second);
    expect(timingSteadinessSkillId('sixteenth')).toBe(
      'timing.steadiness.sixteenth',
    );
  });
});
