import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import {
  overridePracticeOpening,
  selectPracticeOpening,
} from './opening-state';

function chart(bpm: number) {
  return {
    resolution: 480,
    tempos: [{ tick: 0, beatsPerMinute: bpm, msTime: 0 }],
  } as never;
}

function measures(gapTicks: number, chordSize = 1) {
  return [
    {
      notes: [0, gapTicks, gapTicks * 2, gapTicks * 3].map((tick) => ({
        tick,
        isRest: false,
        notes: Array.from({ length: chordSize }, () => 'c/5'),
      })),
    },
  ] as never;
}

function run({
  completedAt,
  accuracy,
  speed,
  meanMs,
  spreadMs,
  subdivision,
  timingWindowMs,
}: {
  completedAt: string;
  accuracy: number;
  speed: number;
  meanMs: number;
  spreadMs: number;
  subdivision: 'eighth' | 'sixteenth' | 'thirty-second';
  timingWindowMs?: number;
}): RunSummary {
  return {
    completedAt,
    totalHits: 100,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: accuracy,
    laneAccuracy: [],
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs,
      medianMs: meanMs,
      spreadMs,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 100,
      sampleCount: 100,
    },
    playbackSpeed: speed,
    timingWindowMs,
    atomicSkillEvidence: [
      {
        run_id: completedAt,
        chart_revision: 'real-chart',
        manifest_revision: 'real-chart',
        skill_id: `pulse.${subdivision}`,
        item_id: 'real-item',
        context_signature: `subdivision=${subdivision}`,
        evidence_kind: 'acquisition',
        quality: accuracy,
        weight: 1,
        playback_speed: speed,
        completed_at: completedAt,
      },
    ],
  };
}

describe('selectPracticeOpening', () => {
  it('starts the real 16.01 profile at 0.5x with its target 16th-note window', () => {
    const opening = selectPracticeOpening({
      chart: chart(110),
      measures: measures(120),
      runs: [
        run({
          completedAt: '2026-08-17T04:20:56.660Z',
          accuracy: 0.8109756097560976,
          speed: 0.7,
          meanMs: -84.30458153195451,
          spreadMs: 78.96744464421342,
          subdivision: 'sixteenth',
        }),
      ],
      currentRuns: [
        run({
          completedAt: '2026-08-17T04:20:56.660Z',
          accuracy: 0.8109756097560976,
          speed: 0.7,
          meanMs: -84.30458153195451,
          spreadMs: 78.96744464421342,
          subdivision: 'sixteenth',
        }),
      ],
    });

    expect(opening).toMatchObject({
      playbackSpeed: 0.5,
      timingStandard: 'target',
      timingGapMs: 272.7,
      timingWindowMs: 90.9,
      effectiveTempoBpm: 55,
    });
  });

  it('starts Boulevard at 0.5x after its real 2.2% collapse on a 32nd-note grid', () => {
    const opening = selectPracticeOpening({
      chart: chart(83.39854636333689),
      measures: measures(60, 3),
      runs: [
        run({
          completedAt: '2026-08-15T04:29:59.873Z',
          accuracy: 0.022263450834879406,
          speed: 0.7,
          meanMs: 28.955573871523182,
          spreadMs: 93.84447448327333,
          subdivision: 'eighth',
        }),
      ],
      currentRuns: [
        run({
          completedAt: '2026-08-15T04:29:59.873Z',
          accuracy: 0.022263450834879406,
          speed: 0.7,
          meanMs: 28.955573871523182,
          spreadMs: 93.84447448327333,
          subdivision: 'eighth',
        }),
      ],
    });

    expect(opening).toMatchObject({
      playbackSpeed: 0.5,
      timingStandard: 'target',
      timingGapMs: 179.9,
      timingWindowMs: 60,
      effectiveTempoBpm: 41.7,
    });
  });

  it('starts an unplayed 167 BPM song at 0.5x instead of inventing mastery', () => {
    const opening = selectPracticeOpening({
      chart: chart(167),
      measures: measures(240, 2),
      runs: [],
    });

    expect(opening).toMatchObject({
      playbackSpeed: 0.5,
      timingStandard: 'target',
      timingGapMs: 359.3,
      timingWindowMs: 119.8,
      effectiveTempoBpm: 83.5,
    });
  });

  it('keeps the target grid when the learner overrides an accepted opening', () => {
    const opening = selectPracticeOpening({
      chart: chart(110),
      measures: measures(120),
      runs: [],
    });

    expect(overridePracticeOpening(opening!, 0.7)).toMatchObject({
      playbackSpeed: 0.7,
      timingGapMs: 194.8,
      timingWindowMs: 64.9,
      effectiveTempoBpm: 77,
    });
  });

  it('does not call a loose-window percentage readiness for a faster start', () => {
    const prior = run({
      completedAt: '2026-08-17T04:20:56.660Z',
      accuracy: 1,
      speed: 0.7,
      meanMs: 0,
      spreadMs: 5,
      subdivision: 'sixteenth',
      timingWindowMs: 220,
    });
    const opening = selectPracticeOpening({
      chart: chart(110),
      measures: measures(120),
      runs: [prior],
      currentRuns: [prior],
    });

    expect(opening?.playbackSpeed).toBe(0.5);
  });
});
