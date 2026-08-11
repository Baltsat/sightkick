import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import {
  deriveAdaptiveTimingWindow,
  LESSON_STARTING_WINDOW_MS,
  MAX_TIMING_WINDOW_MS,
  MIN_TIMING_WINDOW_MS,
  SONG_STARTING_WINDOW_MS,
} from './adaptive-timing';

let sequence = 0;

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  sequence += 1;

  return {
    completedAt: `2026-08-${String(sequence).padStart(2, '0')}T12:00:00.000Z`,
    totalHits: 92,
    totalMisses: 8,
    totalWrong: 0,
    overallAccuracy: 0.92,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 55,
      earlyCount: 40,
      lateCount: 40,
      onTimeCount: 12,
      sampleCount: 92,
    },
    wrongHitCounts: [],
    mode: 'practice',
    playbackSpeed: 1,
    ...overrides,
  };
}

function strongRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return run({
    totalHits: 97,
    totalMisses: 3,
    overallAccuracy: 0.97,
    timingBias: {
      meanMs: 1,
      medianMs: 0,
      spreadMs: 28,
      earlyCount: 44,
      lateCount: 43,
      onTimeCount: 10,
      sampleCount: 97,
    },
    ...overrides,
  });
}

describe('deriveAdaptiveTimingWindow', () => {
  it('starts lessons and songs with distinct learner-friendly defaults', () => {
    const lesson = deriveAdaptiveTimingWindow({ kind: 'lesson', runs: [] });
    const song = deriveAdaptiveTimingWindow({ kind: 'song', runs: [] });

    expect(lesson).toMatchObject({
      timingWindowMs: LESSON_STARTING_WINDOW_MS,
      confidence: 'none',
      phase: 'starting',
    });
    expect(song).toMatchObject({
      timingWindowMs: SONG_STARTING_WINDOW_MS,
      confidence: 'none',
      phase: 'starting',
    });
    expect(lesson.reason).toContain('lesson starting window');
    expect(song.reason).toContain('song starting window');
  });

  it('widens toward 230ms for developing evidence', () => {
    const weak = run({
      overallAccuracy: 0.48,
      timingBias: {
        meanMs: 45,
        medianMs: 40,
        spreadMs: 180,
        earlyCount: 20,
        lateCount: 28,
        onTimeCount: 0,
        sampleCount: 48,
      },
    });
    const lesson = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      runs: [weak],
    });
    const song = deriveAdaptiveTimingWindow({ kind: 'song', runs: [weak] });

    expect(lesson.timingWindowMs).toBe(MAX_TIMING_WINDOW_MS);
    expect(song.timingWindowMs).toBe(MAX_TIMING_WINDOW_MS);
    expect(song.phase).toBe('developing');
    expect(song.reason).toContain('more forgiving');
  });

  it('does not tighten after one or two strong runs', () => {
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'song',
      runs: [strongRun(), strongRun()],
    });

    expect(recommendation.timingWindowMs).toBe(SONG_STARTING_WINDOW_MS);
    expect(recommendation.phase).toBe('calibrating');
    expect(recommendation.evidence.highQualityRuns).toBe(2);
    expect(recommendation.reason).toContain('three consistent runs');
  });

  it('tightens gradually only after repeated high-accuracy, low-spread evidence', () => {
    const threeStrongRuns = [strongRun(), strongRun(), strongRun()];
    const song = deriveAdaptiveTimingWindow({
      kind: 'song',
      runs: threeStrongRuns,
    });
    const lesson = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      runs: threeStrongRuns,
    });

    expect(song.timingWindowMs).toBe(185);
    expect(lesson.timingWindowMs).toBe(200);
    expect(song.phase).toBe('tightening');
    expect(song.confidence).toBe('medium');
  });

  it('approaches 140ms after six confirming performances', () => {
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'song',
      runs: Array.from({ length: 6 }, () => strongRun()),
    });

    expect(recommendation.timingWindowMs).toBe(140);
    expect(recommendation.confidence).toBe('high');
    expect(recommendation.evidence.highQualityRuns).toBe(6);
  });

  it('does not treat perfect slow practice as evidence for tightening', () => {
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'lesson',
      runs: Array.from({ length: 6 }, () => strongRun({ playbackSpeed: 0.5 })),
    });

    expect(recommendation.timingWindowMs).toBe(LESSON_STARTING_WINDOW_MS);
    expect(recommendation.evidence.highQualityRuns).toBe(0);
    expect(recommendation.phase).toBe('calibrating');
  });

  it('uses timestamps to limit evidence to the most recent runs', () => {
    const oldWeakRun = run({
      completedAt: '2020-01-01T00:00:00.000Z',
      overallAccuracy: 0.2,
    });
    const recentStrongRuns = Array.from({ length: 6 }, (_, index) =>
      strongRun({
        completedAt: `2026-08-${String(index + 1).padStart(
          2,
          '0',
        )}T00:00:00.000Z`,
      }),
    );
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'song',
      runs: [...recentStrongRuns, oldWeakRun],
    });

    expect(recommendation.timingWindowMs).toBe(140);
    expect(recommendation.evidence.usableRuns).toBe(6);
  });

  it('ignores malformed values and never mistakes zero samples for perfect timing', () => {
    const malformedRuns: unknown[] = [
      null,
      'not-a-run',
      { overallAccuracy: Number.NaN },
      { overallAccuracy: 73, timingBias: { spreadMs: -1 } },
      {
        completedAt: 'invalid',
        overallAccuracy: 0.99,
        totalHits: 100,
        mode: 'practice',
        playbackSpeed: 1,
        timingBias: { spreadMs: 0, sampleCount: 0 },
      },
    ];
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'song',
      runs: malformedRuns,
      recentRunLimit: Number.NaN,
    });

    expect(recommendation.timingWindowMs).toBe(SONG_STARTING_WINDOW_MS);
    expect(recommendation.evidence).toMatchObject({
      usableRuns: 1,
      timedRuns: 0,
      highQualityRuns: 0,
    });
    expect(recommendation.timingWindowMs).toBeGreaterThanOrEqual(
      MIN_TIMING_WINDOW_MS,
    );
    expect(recommendation.timingWindowMs).toBeLessThanOrEqual(
      MAX_TIMING_WINDOW_MS,
    );
  });

  it('keeps legacy Perform timing evidence usable without a stored speed', () => {
    const legacyRuns = Array.from({ length: 3 }, () =>
      strongRun({ mode: 'perform', playbackSpeed: undefined }),
    );
    const recommendation = deriveAdaptiveTimingWindow({
      kind: 'song',
      runs: legacyRuns,
    });

    expect(recommendation.phase).toBe('tightening');
    expect(recommendation.evidence.highQualityRuns).toBe(3);
  });
});
