import type { ResolvedJudgement } from '../engine';
import type { KitElement } from '../practice-stats';
import type { InputElement } from '../../../types';

/**
 * Turns one judged note into the words and kit-colour identity a player can
 * act on. Every field here is read straight off `ResolvedJudgement` (Judge's
 * own output) — nothing is invented. In particular `deltaMs` is deliberately
 * never referenced: `practice-stats/types.ts` documents it as meaningful
 * only for `verdict: 'hit'` records, so a 'miss' or 'wrong' judgement has no
 * real "expected instant" to time against. Saying "early" or "late" here
 * would be a fabricated number, which the product's own acceptance bar
 * forbids ("nothing on screen may contradict the truth").
 */

export const KIT_ELEMENT_LABEL: Record<KitElement, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hihat: 'Hi-hat',
  tom1: 'Tom 1',
  tom2: 'Tom 2',
  tom3: 'Tom 3',
  ride: 'Ride',
  crash: 'Crash',
};

/**
 * Matches the lane colours already painted on the kit (see
 * `HomeCockpit/kit-zone-map.ts`'s `HOME_KIT_ZONE_LANES` and
 * `KitCommandPrompt`'s `STEP_PRESENTATION`) so a correction always points at
 * the same colour the player memorises at the kit — never an invented hue.
 */
export const KIT_ELEMENT_COLOR_VAR: Record<KitElement, string> = {
  kick: 'var(--color-orange)',
  snare: 'var(--color-red)',
  hihat: 'var(--color-yellow)',
  tom1: 'var(--color-yellow)',
  ride: 'var(--color-blue)',
  tom2: 'var(--color-blue)',
  crash: 'var(--color-green)',
  tom3: 'var(--color-green)',
};

export type MistakeKind =
  | 'missed'
  | 'wrong-drum'
  | 'unscored-repeat'
  | 'extra-hit';

export interface MistakeEvidence {
  kind: MistakeKind;
  measureIndex?: number;
  /** "Bar 12" — undefined only when Judge could not place the strike in a measure. */
  barLabel?: string;
  expectedElement?: KitElement;
  actualElement?: KitElement;
  title: string;
  detail: string;
  /** One concrete thing to try. Framed as a check, never a diagnosis the
   * data cannot actually prove (see `unscored-repeat`). */
  check: string;
}

function barLabel(measureIndex: number | undefined): string | undefined {
  return measureIndex !== undefined && measureIndex >= 0
    ? `Bar ${measureIndex + 1}`
    : undefined;
}

/**
 * `ResolvedJudgement.expectedElement`/`.actualElement` are typed as the
 * app-wide `InputElement`, which also covers non-kit transport controls
 * (`up`, `pause`, ...) — see `KitElement`'s own doc comment in
 * `practice-stats/types.ts`. Judge only ever resolves a note judgement's
 * element from the kit-lane key table, so this should always narrow
 * successfully in practice; the guard exists so a future non-kit control
 * reaching here degrades to "no identity" instead of a crash or a
 * fabricated label.
 */
function asKitElement(
  element: InputElement | undefined,
): KitElement | undefined {
  return element !== undefined && element in KIT_ELEMENT_LABEL
    ? (element as KitElement)
    : undefined;
}

/**
 * Explains one non-hit judgement. Returns undefined when Judge's own record
 * doesn't carry enough identity to say anything truthful (for example a
 * 'wrong' strike with neither an expected nor an actual element resolved) —
 * silence is the honest choice there, not a guess.
 */
export function describeMistake(
  judgement: ResolvedJudgement,
): MistakeEvidence | undefined {
  const bar = barLabel(judgement.measureIndex);
  const expected = asKitElement(judgement.expectedElement);
  const actual = asKitElement(judgement.actualElement);

  if (judgement.verdict === 'miss') {
    if (!expected) {
      return undefined;
    }

    const expectedLabel = KIT_ELEMENT_LABEL[expected];

    return {
      kind: 'missed',
      measureIndex: judgement.measureIndex,
      barLabel: bar,
      expectedElement: expected,
      title: `${bar ?? 'This note'}: ${expectedLabel} expected`,
      detail: `No hit landed in the window${bar ? ` at ${bar}` : ''}.`,
      check: `Watch for the ${expectedLabel} note head and get your hand or foot there before the window closes.`,
    };
  }

  if (judgement.verdict !== 'wrong') {
    return undefined;
  }

  if (!actual) {
    return undefined;
  }

  const actualLabel = KIT_ELEMENT_LABEL[actual];

  if (!expected) {
    return {
      kind: 'extra-hit',
      measureIndex: judgement.measureIndex,
      barLabel: bar,
      actualElement: actual,
      title: `Extra hit: ${actualLabel}`,
      detail: `Nothing was scored there${
        bar ? ` in ${bar}` : ' at that moment'
      }.`,
      check:
        'No correction needed — stay with the notation for the next real note.',
    };
  }

  const expectedLabel = KIT_ELEMENT_LABEL[expected];

  if (expected === actual) {
    return {
      kind: 'unscored-repeat',
      measureIndex: judgement.measureIndex,
      barLabel: bar,
      expectedElement: expected,
      actualElement: actual,
      title: `${expectedLabel} didn't score${bar ? ` — ${bar}` : ''}`,
      detail: 'The right drum was struck, but this hit was not counted.',
      check: 'Check the note head. Play accents harder. Play ghosts softer.',
    };
  }

  return {
    kind: 'wrong-drum',
    measureIndex: judgement.measureIndex,
    barLabel: bar,
    expectedElement: expected,
    actualElement: actual,
    title: `${actualLabel} instead of ${expectedLabel}`,
    detail: `${
      bar ?? 'The score'
    } expected ${expectedLabel}. You played ${actualLabel}.`,
    check: `Move to the ${expectedLabel} zone next time.`,
  };
}

/**
 * Picks one non-hit judgement to explain from the tutor's live evidence
 * window. Judgements carry no timestamp and the same id can legitimately
 * re-resolve after a rewind (see `services/tutor/machine.ts`'s
 * `recordJudgement` doc comment), so ordering by measure index and then by
 * array position is a best-effort "most recent", never a provable one. The
 * caller-facing copy must anchor to the bar number, not to "last" or "just
 * now" — see `describeMistake`.
 *
 * Only a `scoreable` outcome is eligible: a false hit in a silent region
 * that Judge itself excludes from scoring must not headline over a real
 * miss or wrong hit.
 */
export function lastScoreableMistake(
  judgementsByMeasure: Record<number, readonly ResolvedJudgement[]>,
): ResolvedJudgement | undefined {
  const measureIndices = Object.keys(judgementsByMeasure)
    .map(Number)
    .filter((index) => Number.isFinite(index))
    .sort((left, right) => left - right);

  for (let i = measureIndices.length - 1; i >= 0; i -= 1) {
    const judgements = judgementsByMeasure[measureIndices[i]] ?? [];

    for (let j = judgements.length - 1; j >= 0; j -= 1) {
      const judgement = judgements[j];

      if (judgement.verdict !== 'hit' && judgement.scoreable) {
        return judgement;
      }
    }
  }

  return undefined;
}
