import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import {
  kitColorMaturity,
  kitColorPresentation,
  lessonKitColorProperties,
} from '.';

function run(index: number): RunSummary {
  return {
    completedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    totalHits: 100,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 1,
    laneAccuracy: [
      { element: 'kick', hits: 20, misses: 0, accuracy: 1 },
      { element: 'snare', hits: 20, misses: 0, accuracy: 1 },
      { element: 'hihat', hits: 20, misses: 0, accuracy: 1 },
      { element: 'tom1', hits: 20, misses: 0, accuracy: 1 },
      { element: 'ride', hits: 20, misses: 0, accuracy: 1 },
    ],
    laneBias: [
      { element: 'kick', meanMs: 0, sampleCount: 20 },
      { element: 'snare', meanMs: 0, sampleCount: 20 },
      { element: 'hihat', meanMs: 0, sampleCount: 20 },
      { element: 'tom1', meanMs: 0, sampleCount: 20 },
      { element: 'ride', meanMs: 0, sampleCount: 20 },
    ],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 100,
      sampleCount: 100,
    },
    wrongHitCounts: [],
    playbackSpeed: 1,
    bestStreak: 32,
  };
}

describe('kit color maturity', () => {
  it('keeps a player without scored evidence on the full-color baseline', () => {
    expect(kitColorMaturity([])).toBe(0);
    expect(kitColorPresentation(0, 'auto')).toMatchObject({
      fade: 0,
      vividness: 100,
      saturation: 100,
    });
  });

  it('darkens progressively only after skill and evidence grow together', () => {
    const maturity = kitColorMaturity(
      Array.from({ length: 12 }, (_, index) => run(index)),
    );
    const presentation = kitColorPresentation(maturity, 'auto');

    expect(maturity).toBeGreaterThan(0.7);
    expect(presentation.fade).toBeGreaterThan(0.6);
    expect(presentation.vividness).toBeLessThan(45);
  });

  it('honours each manual override ahead of automatic maturity', () => {
    expect(kitColorPresentation(0.9, 'full-color').vividness).toBe(100);
    expect(kitColorPresentation(0.1, 'faded').vividness).toBeLessThan(50);
    expect(kitColorPresentation(0, 'near-black').vividness).toBe(8);
  });

  it('feeds the rendered lesson lane through the maturity custom properties', () => {
    const properties = lessonKitColorProperties(
      'red',
      kitColorPresentation(0, 'near-black'),
    );

    const cssVariables = properties as Record<string, string>;

    expect(cssVariables['--kit-color-vividness']).toBe('8.0%');
    expect(cssVariables['--lesson-lane-color']).toContain(
      'var(--color-red) var(--kit-color-vividness)',
    );
  });
});
