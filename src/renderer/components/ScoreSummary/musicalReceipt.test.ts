import { describe, expect, it } from 'vitest';
import {
  emptyRunFixture,
  multiLaneRunFixture,
} from '../PracticeStats/test-fixtures';
import { musicalReceipt } from './musicalReceipt';

/** An all-miss run: real attempts on two lanes, zero hits anywhere -
 * mirrors the exact shape the finish-visual capture harness produces when
 * the "keyboard" device has no mapped keys (see
 * docs/design-qa/2026-08-13-finish/capture-finish.mjs). */
function allMissRunFixture() {
  return {
    ...multiLaneRunFixture(),
    totalHits: 0,
    totalMisses: 132,
    totalWrong: 0,
    overallAccuracy: 0,
    laneAccuracy: [
      { element: 'hihat' as const, hits: 0, misses: 4, accuracy: 0 },
      { element: 'snare' as const, hits: 0, misses: 128, accuracy: 0 },
    ],
  };
}

describe('musicalReceipt', () => {
  it('never congratulates a run with no attempts at all', () => {
    expect(musicalReceipt(emptyRunFixture(), undefined)).toMatchObject({
      headline: 'No hits recorded this pass',
      action: 'replay',
      changed: false,
    });
  });

  it('calls out a run that fell apart instead of staying neutral', () => {
    expect(musicalReceipt(allMissRunFixture(), undefined)).toMatchObject({
      headline: 'No chart notes landed at this tempo',
      action: 'replay',
      changed: false,
    });
  });

  it('names a catastrophic chart mismatch and carries the slower replay in the action', () => {
    const summary = {
      ...multiLaneRunFixture(),
      totalHits: 24,
      totalMisses: 1054,
      totalWrong: 0,
      overallAccuracy: 24 / 1078,
      playbackSpeed: 0.7,
    };

    expect(musicalReceipt(summary, undefined)).toMatchObject({
      headline: 'This chart is far above your current tempo ceiling',
      meaning:
        '24 of 1,078 notes landed at 70% tempo. Drumroll will replay at 60% to find a playable floor.',
      action: 'replay',
      actionLabel: 'Replay at 60% tempo',
      replaySpeed: 0.6,
      changed: false,
    });
  });

  it('uses attempted-section evidence instead of misreading late entry as a tempo ceiling', () => {
    const summary = {
      ...multiLaneRunFixture(),
      totalHits: 24,
      totalMisses: 1054,
      totalWrong: 36,
      overallAccuracy: 24 / 1078,
      playbackSpeed: 0.7,
      sectionEvidence: [
        {
          barStart: 34,
          barEnd: 37,
          startTick: 167040,
          endTick: 175440,
          startTimeSeconds: 210,
          endTimeSeconds: 224,
          expectedNotes: 60,
          hits: 24,
          misses: 36,
          wrongHits: 36,
          patternSignature: 'pattern:late-entry',
          attempted: true,
        },
      ],
    };

    expect(
      musicalReceipt(summary, undefined, {
        label: 'Bars 34–37',
        barStart: 34,
        barEnd: 37,
        tempoMultiplier: 0.5,
        passCriteria: 'Land 60 notes at 82%+ for 3 clean passes.',
        novel: false,
      }),
    ).toMatchObject({
      headline: 'This was a section attempt, not a full-song pass',
      actionLabel: 'Replay bars 34–37 at 50%',
      replaySpeed: 0.5,
    });
  });

  it('never praises an all-miss run just because it also saved a loop target - the exact recapture scenario', () => {
    // This is the composite that produced the "Nice reps" over 0% defect:
    // an all-miss run that ALSO carries coachEvidence with a bar range, so
    // loopTarget() would otherwise win and headline "ready for a loop"
    // directly above 0% accuracy cells.
    const summary = {
      ...allMissRunFixture(),
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
      headline: 'No chart notes landed at this tempo',
      // The concrete next step (replay the saved loop target) is still the
      // right action even though the headline no longer claims readiness.
      action: 'replay',
      actionLabel: 'Replay this loop',
      changed: false,
    });
  });

  it('still leads with a genuine per-drum improvement even on an otherwise weak run', () => {
    // A real, data-backed improvement outranks the fell-apart framing - it
    // contradicts nothing on screen and is the "one clear improvement"
    // case the receipt exists to surface.
    const previous = {
      ...allMissRunFixture(),
      laneAccuracy: [
        { element: 'kick' as const, hits: 1, misses: 9, accuracy: 0.1 },
      ],
    };
    const summary = {
      ...previous,
      totalHits: 8,
      totalMisses: 92,
      overallAccuracy: 0.08,
      laneAccuracy: [
        { element: 'kick' as const, hits: 8, misses: 2, accuracy: 0.8 },
      ],
    };

    expect(musicalReceipt(summary, previous)).toMatchObject({
      headline: 'Kick rose 70 points',
      action: 'continue',
      changed: true,
    });
  });

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
      headline: 'This tempo is playable',
      changed: false,
    });
  });

  it('never claims a per-drum improvement when the pass also got slower - a slower pass lands more notes on its own', () => {
    const previous = {
      ...multiLaneRunFixture(),
      playbackSpeed: 1,
      laneAccuracy: [
        { element: 'kick' as const, hits: 6, misses: 4, accuracy: 0.6 },
      ],
    };
    const summary = {
      ...previous,
      playbackSpeed: 0.7,
      laneAccuracy: [
        { element: 'kick' as const, hits: 8, misses: 2, accuracy: 0.8 },
      ],
    };

    expect(musicalReceipt(summary, previous)).toMatchObject({
      headline: 'This tempo is playable',
      changed: false,
    });
  });

  it('never claims a tightened timing bias when the pass also got slower', () => {
    const previous = {
      ...multiLaneRunFixture(),
      playbackSpeed: 1,
      timingBias: {
        meanMs: 40,
        medianMs: 40,
        spreadMs: 10,
        earlyCount: 0,
        lateCount: 20,
        onTimeCount: 0,
        sampleCount: 20,
      },
    };
    const summary = {
      ...previous,
      playbackSpeed: 0.7,
      timingBias: { ...previous.timingBias, meanMs: 5, medianMs: 5 },
    };

    expect(musicalReceipt(summary, previous)).toMatchObject({
      headline: 'This tempo is playable',
      changed: false,
    });
  });

  it('still credits a per-drum improvement reached at an equal or faster speed', () => {
    const previous = {
      ...multiLaneRunFixture(),
      playbackSpeed: 0.7,
      laneAccuracy: [
        { element: 'kick' as const, hits: 6, misses: 4, accuracy: 0.6 },
      ],
    };
    const summary = {
      ...previous,
      playbackSpeed: 1,
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
});
