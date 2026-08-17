import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import {
  CLEAN_ACCURACY,
  deriveAdaptiveTimingWindow,
  deriveTimingGrid,
  MIN_TIMING_WINDOW_MS,
  timingStandardForRun,
  timingWindowStandard,
} from './adaptive-timing';

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: '2026-08-17T12:00:00.000Z',
    totalHits: 100,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 0.97,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 28,
      earlyCount: 44,
      lateCount: 43,
      onTimeCount: 13,
      sampleCount: 100,
    },
    wrongHitCounts: [],
    mode: 'practice',
    playbackSpeed: 0.7,
    ...overrides,
  };
}

function grid(gapMs: number, effectiveTempoBpm = 90) {
  return { gapMs, effectiveTempoBpm };
}

const lesson1601HitDeltasMs = [
  56.818229, -64.772781, -52.272771, -64.772781, -55.681865, 63.636417,
  26.136385, -19.318198, 57.954594, -64.772781, -52.272771, -81.81825,
  -69.31824, -55.681865, 39.77276, 30.681844, 44.318219, 35.227302, 19.318198,
  -96.59099, -147.727396, -112.500094, -163.6365, -129.545562, -137.500115,
  -47.727312, -77.272792, -85.227344, -72.727333, -122.727375, -131.818292,
  -182.954698, -169.318323, -220.454729, -164.772865, -130.681927, -181.818333,
  -189.772885, -113.636458, -143.181937, -172.727417, -202.272896, -189.772885,
  -127.272833, -93.181896, -186.363792, -88.636437, -139.772844, -126.136469,
  -220.454729, -36.363667, -69.31824, -35.227302, -43.181854, -30.681844,
  -17.045469, -4.545458, -12.50001, -21.590927, -7.954552, -37.500031,
  -25.000021, -76.136427, 35.227302, 48.863677, -31.818208, -19.318198,
  -27.27275, 28.409115, -1.136365, -71.590969, -170.454688, -179.545604,
  -144.318302, -153.409219, -139.772844, -105.681906, -135.227385, -79.545521,
  -109.091, -181.818333, -169.318323, -104.545542, -5.681823, -35.227302,
  20.454562, -9.090917, -103.409177, -89.772802, -120.454646, -43.181854,
  -115.909188, -17.045469, -25.000021, 9.090917, 0, 13.636375, 4.545458,
  60.227323, 52.272771, -20.454562, -50.000042, 25.000021, 38.636396,
  -63.636417, -51.136406, -37.500031, -46.590948, 6.818188, -22.727292,
  -117.045552, -146.591031, -154.545583, -142.045573, -171.591052, -137.500115,
  -188.636521, -154.545583, -205.68199, -170.454687, -212.500177, -67.04551,
  -75.000062, -169.318323, -220.454729, -206.818354, -194.318344, -202.272896,
  -189.772885, -219.318365, -185.227427, -214.772906, -137.500115,
];

describe('grid-bounded timing windows', () => {
  it.each([
    [60, 4, 1],
    [90, 4, 0.7],
    [120, 3, 1],
    [180, 8, 1],
  ])(
    'never exceeds the grid at %d BPM, 1/%d notes, %dx',
    (bpm, division, speed) => {
      const gapMs = 60000 / (bpm * division * speed);
      const recommendation = deriveAdaptiveTimingWindow({
        kind: 'lesson',
        grid: grid(gapMs, bpm * speed),
        playbackSpeed: speed,
        runs: [],
      });

      expect(recommendation.timingWindowMs).toBeLessThanOrEqual(gapMs);
      expect(recommendation.timingGapMs).toBeCloseTo(gapMs, 1);
    },
  );

  it('derives target, better, and ceiling bands from the active gap', () => {
    const gapMs = 60000 / (90 * 4 * 0.7);

    expect(timingWindowStandard(gapMs / 3, gapMs)).toBe('target');
    expect(timingWindowStandard(gapMs / 2, gapMs)).toBe('better');
    expect(timingWindowStandard(gapMs, gapMs)).toBe('ceiling');
    expect(
      deriveAdaptiveTimingWindow({
        kind: 'lesson',
        grid: grid(gapMs, 63),
        playbackSpeed: 0.7,
        runs: [],
      }),
    ).toMatchObject({
      timingWindowMs: 119,
      timingStandard: 'better',
      timingGapMs: 238.1,
    });
  });

  it('keeps a 35 ms hardware-safe floor without breaking the gap ceiling', () => {
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'song',
      grid: grid(80, 375),
      playbackSpeed: 1,
      runs: [run({ timingStandard: 'better' } as Partial<RunSummary>)],
    });

    expect(MIN_TIMING_WINDOW_MS).toBe(35);
    expect(recommendation.timingWindowMs).toBe(35);
    expect(recommendation.timingWindowMs).toBeLessThanOrEqual(80);
    expect(recommendation.timingStandard).toBe('better');
  });

  it('tightens before raising tempo, then lowers tempo instead of widening', () => {
    const gapMs = 240;
    const better = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      grid: grid(gapMs),
      playbackSpeed: 0.7,
      runs: [run({ timingStandard: 'better' } as Partial<RunSummary>)],
    });
    const target = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      grid: grid(gapMs),
      playbackSpeed: 0.7,
      runs: [run({ timingStandard: 'target' } as Partial<RunSummary>)],
    });
    const failed = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      grid: grid(gapMs),
      playbackSpeed: 0.7,
      runs: [
        run({
          overallAccuracy: 0.6,
          timingStandard: 'target',
          timingBias: {
            meanMs: -90,
            medianMs: -90,
            spreadMs: 90,
            earlyCount: 70,
            lateCount: 20,
            onTimeCount: 10,
            sampleCount: 100,
          },
        } as Partial<RunSummary>),
      ],
    });

    expect(better).toMatchObject({
      ladderAction: 'tighten-window',
      playbackSpeed: 0.7,
      timingStandard: 'target',
    });
    expect(target).toMatchObject({
      ladderAction: 'raise-tempo',
      playbackSpeed: 0.7,
      timingStandard: 'target',
    });
    expect(failed).toMatchObject({
      ladderAction: 'lower-tempo',
      playbackSpeed: 0.7,
      timingStandard: 'target',
    });
    expect(target.nextRun).toMatchObject({
      playbackSpeed: 0.8,
      timingStandard: 'target',
    });
    expect(failed.nextRun).toMatchObject({
      playbackSpeed: 0.6,
      timingStandard: 'target',
    });
    expect(failed.timingWindowMs).toBe(80);
    expect(failed.timingWindowMs).toBeLessThanOrEqual(failed.timingGapMs);
  });

  it('re-scores the actual 16.01 hit record at 40.9%, not its loose 81%', () => {
    const gapMs = 60000 / (90 * 4 * 0.7);
    const targetMs = gapMs / 3;
    const targetHits = lesson1601HitDeltasMs.filter(
      (deltaMs) => Math.abs(deltaMs) <= targetMs,
    ).length;
    const targetMisses = 31 + lesson1601HitDeltasMs.length - targetHits;
    const targetAccuracy = targetHits / (targetHits + targetMisses);

    expect(targetMs).toBeCloseTo(79.365, 3);
    expect(targetMs).toBeLessThan(220);
    expect(targetHits).toBe(67);
    expect(targetAccuracy).toBeCloseTo(0.4085, 3);
    expect(targetAccuracy).not.toBeCloseTo(0.81, 1);
  });

  it('keeps old runs explicit about missing grid provenance', () => {
    expect(timingStandardForRun({ timingWindowMs: 220 })).toBe(
      'pre-grid-standard',
    );
    expect(timingStandardForRun({ timingWindowMs: 80, timingGapMs: 240 })).toBe(
      'target',
    );
  });

  it('round-trips a stamped grid run through persistence into timing evidence', () => {
    const stamped = run({
      timingWindowMs: 80,
      timingGapMs: 240,
      timingStandard: 'target',
      timingLadderAction: 'raise-tempo',
      effectiveTempoBpm: 63,
      timingNextRun: {
        timingWindowMs: 70,
        timingGapMs: 210,
        timingStandard: 'target',
        playbackSpeed: 0.8,
        effectiveTempoBpm: 72,
      },
    });
    const restored = JSON.parse(JSON.stringify(stamped)) as RunSummary;
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      grid: grid(240),
      playbackSpeed: 0.7,
      runs: [restored],
    });

    expect(restored).toMatchObject({
      timingGapMs: 240,
      timingStandard: 'target',
      timingLadderAction: 'raise-tempo',
      effectiveTempoBpm: 63,
      timingNextRun: { playbackSpeed: 0.8 },
    });
    expect(recommendation.ladderAction).toBe('raise-tempo');
  });

  it('cleanRun rejects a high-wrong-rate run', () => {
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      grid: grid(240),
      playbackSpeed: 0.7,
      runs: [
        run({
          overallAccuracy: CLEAN_ACCURACY + 0.02,
          totalHits: 96,
          totalMisses: 0,
          totalWrong: 8,
          timingStandard: 'target',
          timingGapMs: 240,
          timingWindowMs: 80,
          timingBias: {
            meanMs: 0,
            medianMs: 0,
            spreadMs: 20,
            earlyCount: 0,
            lateCount: 0,
            onTimeCount: 20,
            sampleCount: 20,
          },
        }),
      ],
    });

    expect(recommendation.evidence.highQualityRuns).toBe(0);
    expect(recommendation.ladderAction).toBe('lower-tempo');
  });

  it('derives a chart grid from the closest active note pair at playback speed', () => {
    const chart = {
      resolution: 480,
      tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
    };
    const measures = [
      {
        notes: [
          { tick: 0, isRest: false },
          { tick: 120, isRest: false },
          { tick: 240, isRest: false },
        ],
      },
    ] as never;
    const derived = deriveTimingGrid(chart, measures, 0.5);

    expect(derived?.gapMs).toBeCloseTo(250, 3);
    expect(derived?.effectiveTempoBpm).toBe(60);
  });
});
