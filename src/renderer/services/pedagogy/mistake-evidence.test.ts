import { describe, expect, it } from 'vitest';
import type { ResolvedJudgement } from '../engine';
import {
  KIT_ELEMENT_COLOR_VAR,
  KIT_ELEMENT_LABEL,
  describeMistake,
  lastScoreableMistake,
} from './mistake-evidence';

function judgement(overrides: Partial<ResolvedJudgement>): ResolvedJudgement {
  return {
    id: 'note:0:s',
    verdict: 'wrong',
    scoreable: true,
    ...overrides,
  };
}

describe('describeMistake', () => {
  it('returns undefined for a hit — only non-hit outcomes are explained', () => {
    expect(
      describeMistake(judgement({ verdict: 'hit', expectedElement: 'snare' })),
    ).toBeUndefined();
  });

  it('explains a miss with the expected drum and no timing claim', () => {
    const evidence = describeMistake(
      judgement({ verdict: 'miss', expectedElement: 'snare', measureIndex: 3 }),
    );

    expect(evidence?.kind).toBe('missed');
    expect(evidence?.barLabel).toBe('Bar 4');
    expect(evidence?.title).toContain('Snare');
    expect(evidence?.detail).not.toMatch(/ms|early|late/i);
    expect(evidence?.check).toContain('Snare');
  });

  it('returns undefined for a miss with no resolvable expected element', () => {
    expect(
      describeMistake(judgement({ verdict: 'miss', measureIndex: 1 })),
    ).toBeUndefined();
  });

  it('explains a false hit with no expected note as an honest extra hit', () => {
    const evidence = describeMistake(
      judgement({ verdict: 'wrong', actualElement: 'crash', measureIndex: 5 }),
    );

    expect(evidence?.kind).toBe('extra-hit');
    expect(evidence?.title).toContain('Crash');
    expect(evidence?.detail).toContain('Bar 6');
    expect(evidence?.check).toMatch(/no correction needed/i);
  });

  it('returns undefined for a wrong judgement with no actual element at all', () => {
    expect(
      describeMistake(judgement({ verdict: 'wrong', measureIndex: 2 })),
    ).toBeUndefined();
  });

  it('frames a same-element wrong hit as a check, not a diagnosis', () => {
    const evidence = describeMistake(
      judgement({
        verdict: 'wrong',
        expectedElement: 'kick',
        actualElement: 'kick',
        measureIndex: 0,
      }),
    );

    expect(evidence?.kind).toBe('unscored-repeat');
    expect(evidence?.title).toContain('Kick');
    expect(evidence?.detail).not.toMatch(/accent|ghost|dynamic/i);
    expect(evidence?.check).toMatch(/^if /i);
  });

  it('names both drums for a genuine wrong-pad hit', () => {
    const evidence = describeMistake(
      judgement({
        verdict: 'wrong',
        expectedElement: 'snare',
        actualElement: 'ride',
        measureIndex: 7,
      }),
    );

    expect(evidence?.kind).toBe('wrong-drum');
    expect(evidence?.title).toBe('Ride instead of Snare');
    expect(evidence?.detail).toBe(
      'Bar 8 called for Snare; the strike landed on Ride.',
    );
    expect(evidence?.check).toContain('Snare');
  });

  it('covers every kit element with a label and a colour token', () => {
    (
      Object.keys(KIT_ELEMENT_LABEL) as (keyof typeof KIT_ELEMENT_LABEL)[]
    ).forEach((element) => {
      expect(KIT_ELEMENT_LABEL[element]).toBeTruthy();
      expect(KIT_ELEMENT_COLOR_VAR[element]).toMatch(/^var\(--color-/);
    });
  });
});

describe('lastScoreableMistake', () => {
  it('returns undefined when there is no evidence yet', () => {
    expect(lastScoreableMistake({})).toBeUndefined();
  });

  it('returns undefined when every recorded judgement is a hit', () => {
    expect(
      lastScoreableMistake({
        0: [judgement({ verdict: 'hit', measureIndex: 0 })],
      }),
    ).toBeUndefined();
  });

  it('skips a non-scoreable false hit in favour of an earlier real mistake', () => {
    const real = judgement({
      id: 'note:1:s',
      verdict: 'miss',
      expectedElement: 'snare',
      measureIndex: 0,
    });
    const warmUpTap = judgement({
      id: 'wrong:1',
      verdict: 'wrong',
      actualElement: 'crash',
      scoreable: false,
      measureIndex: 0,
    });

    expect(lastScoreableMistake({ 0: [real, warmUpTap] })).toBe(real);
  });

  it('prefers the highest measure with scoreable evidence', () => {
    const earlier = judgement({
      id: 'note:1:s',
      verdict: 'miss',
      expectedElement: 'kick',
      measureIndex: 0,
    });
    const later = judgement({
      id: 'note:2:s',
      verdict: 'wrong',
      expectedElement: 'snare',
      actualElement: 'tom1',
      measureIndex: 4,
    });

    expect(lastScoreableMistake({ 0: [earlier], 4: [later] })).toBe(later);
  });

  it('scans back through a measure past a later hit to find an earlier real miss', () => {
    // Two distinct notes in the same measure: note 9 was missed, note 10 was
    // hit cleanly. The reducer dedupes replacement judgements by id before
    // this function ever sees them (see machine.ts's recordJudgement), so a
    // later 'hit' for a different note must never hide an earlier real miss.
    const earlierMiss = judgement({
      id: 'note:9:s',
      verdict: 'miss',
      expectedElement: 'kick',
      measureIndex: 2,
    });
    const laterHit = judgement({
      id: 'note:10:s',
      verdict: 'hit',
      measureIndex: 2,
    });

    expect(lastScoreableMistake({ 2: [earlierMiss, laterHit] })).toBe(
      earlierMiss,
    );
  });

  it('lets a same-id re-resolution (rewind correction) erase the earlier miss', () => {
    // A genuine rewind replacement keeps the SAME judgement id (see
    // machine.ts's recordJudgement doc comment) and the reducer replaces the
    // stale entry in place, so this function only ever sees the corrected
    // outcome for that note.
    const corrected = judgement({
      id: 'note:9:s',
      verdict: 'hit',
      measureIndex: 2,
    });

    expect(lastScoreableMistake({ 2: [corrected] })).toBeUndefined();
  });
});
