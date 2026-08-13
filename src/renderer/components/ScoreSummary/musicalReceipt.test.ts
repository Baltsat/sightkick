import { describe, expect, it } from 'vitest';
import { multiLaneRunFixture } from '../PracticeStats/test-fixtures';
import { musicalReceipt } from './musicalReceipt';

describe('musicalReceipt', () => {
  it('reports a comparable per-drum improvement before supporting rewards', () => {
    const previous = {
      ...multiLaneRunFixture(),
      laneAccuracy: [
        { element: 'kick' as const, hits: 6, misses: 4, accuracy: 0.6 },
      ],
    };
    const summary = {
      ...previous,
      laneAccuracy: [
        { element: 'kick' as const, hits: 8, misses: 2, accuracy: 0.8 },
      ],
    };

    expect(musicalReceipt(summary, previous)).toMatchObject({
      headline: 'Kick rose 20 points',
      action: 'continue',
      changed: true,
    });
  });

  it('uses saved bar evidence for a focused loop without inventing a delta', () => {
    const summary = {
      ...multiLaneRunFixture(),
      coachEvidence: [
        {
          id: 'bar-4',
          kind: 'timing',
          severity: 'medium' as const,
          skillTag: 'timing',
          sampleCount: 12,
          barStart: 4,
          barEnd: 4,
        },
      ],
    };

    expect(musicalReceipt(summary, undefined)).toMatchObject({
      headline: 'Bar 4 is ready for a loop',
      action: 'replay',
      changed: false,
    });
  });

  it('agrees the verb with a multi-bar loop target', () => {
    const summary = {
      ...multiLaneRunFixture(),
      coachEvidence: [
        {
          id: 'bars-1-17',
          kind: 'timing',
          severity: 'medium' as const,
          skillTag: 'timing',
          sampleCount: 12,
          barStart: 1,
          barEnd: 17,
        },
      ],
    };

    expect(musicalReceipt(summary, undefined)).toMatchObject({
      headline: 'Bars 1–17 are ready for a loop',
      action: 'replay',
      changed: false,
    });
  });

  it('keeps an older or first run honest when no comparison exists', () => {
    expect(musicalReceipt(multiLaneRunFixture(), undefined)).toMatchObject({
      headline: 'This run is saved for comparison',
      changed: false,
    });
  });
});
