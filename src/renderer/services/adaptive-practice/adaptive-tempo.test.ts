import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import { deriveAdaptiveTimingWindow } from './adaptive-timing';
import {
  AUTO_SPEED_CEILING,
  AUTO_SPEED_FLOOR,
  deriveNextAutoSpeed,
  filterRunsForSpeedBand,
  resolvePracticeSpeed,
} from './adaptive-tempo';

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: '2026-08-17T12:00:00.000Z',
    totalHits: 100,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 0.97,
    laneAccuracy: [],
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 20,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 20,
      sampleCount: 20,
    },
    playbackSpeed: 0.7,
    timingWindowMs: 80,
    timingGapMs: 240,
    timingStandard: 'target',
    ...overrides,
  };
}

function timed(
  action: NonNullable<RunSummary['timingLadderAction']>,
  completedAt: string,
  speed = 0.7,
): RunSummary {
  return run({ timingLadderAction: action, completedAt, playbackSpeed: speed });
}

describe('auto practice tempo', () => {
  it('band filter excludes runs outside epsilon', () => {
    expect(
      filterRunsForSpeedBand(
        [timed('raise-tempo', '2026-08-17T12:00:00.000Z', 0.5)],
        0.8,
      ),
    ).toEqual([]);
  });

  it('uses the real 16.01 run at its own tempo instead of a newer clean run at another tempo', () => {
    const lesson1601 = run({
      completedAt: '2026-08-17T04:20:56.660Z',
      totalHits: 133,
      totalMisses: 31,
      totalWrong: 52,
      overallAccuracy: 0.8109756097560976,
      timingBias: {
        meanMs: -84.30458153195451,
        medianMs: -77.27279166666534,
        spreadMs: 78.96744464421342,
        earlyCount: 111,
        lateCount: 21,
        onTimeCount: 1,
        sampleCount: 133,
      },
      playbackSpeed: 0.7,
    });
    const newerCleanAtHalfSpeed = run({
      completedAt: '2026-08-17T05:00:00.000Z',
      playbackSpeed: 0.5,
      timingLadderAction: 'raise-tempo',
    });
    const grid = { gapMs: 240 };
    const unbanded = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      grid,
      playbackSpeed: 0.7,
      runs: [lesson1601, newerCleanAtHalfSpeed],
    });
    const banded = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      grid,
      playbackSpeed: 0.7,
      runs: filterRunsForSpeedBand([lesson1601, newerCleanAtHalfSpeed], 0.7),
    });

    expect(unbanded.ladderAction).toBe('raise-tempo');
    expect(banded.ladderAction).toBe('lower-tempo');
  });

  it('single lower-tempo run demotes by TEMPO_STEP', () => {
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [timed('lower-tempo', '2026-08-17T12:00:00.000Z')],
      }),
    ).toMatchObject({ speed: 0.6, action: 'demote_soft' });
  });

  it('two consecutive lower-tempo runs hard-demote', () => {
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.6,
        runs: [
          timed('lower-tempo', '2026-08-17T12:01:00.000Z', 0.6),
          timed('lower-tempo', '2026-08-17T12:00:00.000Z', 0.7),
        ],
      }),
    ).toMatchObject({ speed: 0.5, action: 'demote_hard' });
  });

  it('one raise-tempo run does not promote', () => {
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [timed('raise-tempo', '2026-08-17T12:00:00.000Z')],
      }),
    ).toMatchObject({
      speed: 0.7,
      action: 'hold',
      reason: '1 of 2 clean runs at 70% before raising tempo.',
    });
  });

  it('two consecutive raise-tempo runs at a fresh band promote', () => {
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [
          timed('raise-tempo', '2026-08-17T12:01:00.000Z'),
          timed('raise-tempo', '2026-08-17T12:00:00.000Z'),
        ],
      }),
    ).toMatchObject({ speed: 0.8, action: 'promote' });
  });

  it('raise-tempo at a band with a prior demote requires three, not two', () => {
    const runs = [
      timed('raise-tempo', '2026-08-17T12:02:00.000Z'),
      timed('raise-tempo', '2026-08-17T12:01:00.000Z'),
      timed('lower-tempo', '2026-08-17T12:00:00.000Z'),
    ];

    expect(
      deriveNextAutoSpeed({ currentAutoSpeed: 0.7, currentBand: 0.7, runs }),
    ).toMatchObject({
      speed: 0.7,
      action: 'hold',
      reason: '2 of 3 clean runs at 70% before raising tempo.',
    });
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [timed('raise-tempo', '2026-08-17T12:03:00.000Z'), ...runs],
      }),
    ).toMatchObject({ speed: 0.8, action: 'promote' });
  });

  it('promotion never exceeds AUTO_SPEED_CEILING', () => {
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: AUTO_SPEED_CEILING,
        currentBand: 1,
        runs: [
          timed('raise-tempo', '2026-08-17T12:01:00.000Z', 1),
          timed('raise-tempo', '2026-08-17T12:00:00.000Z', 1),
        ],
      }).speed,
    ).toBe(AUTO_SPEED_CEILING);
  });

  it('demotion never crosses AUTO_SPEED_FLOOR', () => {
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.4,
        currentBand: 0.4,
        runs: [
          timed('lower-tempo', '2026-08-17T12:01:00.000Z', 0.4),
          timed('lower-tempo', '2026-08-17T12:00:00.000Z', 0.5),
        ],
      }).speed,
    ).toBe(AUTO_SPEED_FLOOR);
  });

  it('pre-grid-standard runs are excluded from every streak', () => {
    const legacy = run({
      completedAt: '2026-08-17T12:00:00.000Z',
      timingWindowMs: undefined,
      timingGapMs: undefined,
      timingStandard: undefined,
      timingLadderAction: 'raise-tempo',
    });

    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [timed('raise-tempo', '2026-08-17T12:01:00.000Z'), legacy],
      }),
    ).toMatchObject({ speed: 0.7, action: 'hold' });
  });

  it('plateau after five runs with no trend holds and flags', () => {
    expect(
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: Array.from({ length: 5 }, (_, index) =>
          timed(
            index % 2 === 0 ? 'hold' : 'tighten-window',
            `2026-08-17T12:0${index}:00.000Z`,
          ),
        ),
      }),
    ).toMatchObject({
      action: 'hold',
      reason: expect.stringContaining('no clear trend'),
    });
  });

  it('manual speed wins for the rest of the session and zpd only seeds an empty auto slot', () => {
    expect(
      resolvePracticeSpeed({
        speedControl: true,
        learnerPlaybackSpeed: 0.8,
        requestedPracticeSpeed: undefined,
        autoPracticeSpeed: 0.6,
        autoTempoEnabled: true,
        autoTempoPausedThisSession: true,
        zpdSeed: 0.5,
      }),
    ).toBe(0.8);
    expect(
      resolvePracticeSpeed({
        speedControl: true,
        learnerPlaybackSpeed: null,
        requestedPracticeSpeed: undefined,
        autoPracticeSpeed: 0.6,
        autoTempoEnabled: true,
        autoTempoPausedThisSession: false,
        zpdSeed: 0.5,
      }),
    ).toBe(0.6);
  });

  it('every auto-speed result carries a reason through hold, promote, and both demotions', () => {
    const results = [
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [],
      }),
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [
          timed('raise-tempo', '2026-08-17T12:01:00.000Z'),
          timed('raise-tempo', '2026-08-17T12:00:00.000Z'),
        ],
      }),
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [timed('lower-tempo', '2026-08-17T12:00:00.000Z')],
      }),
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.6,
        runs: [
          timed('lower-tempo', '2026-08-17T12:01:00.000Z', 0.6),
          timed('lower-tempo', '2026-08-17T12:00:00.000Z', 0.7),
        ],
      }),
    ];

    expect(results.map((result) => result.reason.length > 0)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('does not oscillate across alternating clean and dirty runs', () => {
    const outcomes = [
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [timed('raise-tempo', '2026-08-17T12:00:00.000Z')],
      }),
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.7,
        currentBand: 0.7,
        runs: [
          timed('lower-tempo', '2026-08-17T12:01:00.000Z'),
          timed('raise-tempo', '2026-08-17T12:00:00.000Z'),
        ],
      }),
      deriveNextAutoSpeed({
        currentAutoSpeed: 0.6,
        currentBand: 0.6,
        runs: [
          timed('raise-tempo', '2026-08-17T12:02:00.000Z', 0.6),
          timed('lower-tempo', '2026-08-17T12:01:00.000Z', 0.7),
        ],
      }),
    ];

    expect(outcomes.map((outcome) => outcome.speed)).toEqual([0.7, 0.6, 0.6]);
  });
});
