import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitTextToWidth } from './useWordBoundaryTruncate';

// A deterministic stand-in for canvas measurement: each character is worth
// exactly CHAR_WIDTH px, independent of the glyph, so the assertions below
// can reason about exact pixel budgets instead of real font metrics.
const CHAR_WIDTH = 10;

function installFakeMeasurement() {
  const context = {
    font: '',
    measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fitTextToWidth', () => {
  it('returns the text untouched when it already fits', () => {
    installFakeMeasurement();

    expect(fitTextToWidth('Practice', 'inherit', 200)).toBe('Practice');
  });

  it('backs off to the last whole word instead of cutting mid-word', () => {
    installFakeMeasurement();

    // "My Wave · Play a short phrase so your next lesson has a clear
    // starting point." - the exact defect from the design critique: CSS
    // ellipsis alone lands inside "lesson" ("...next les…").
    const text =
      'My Wave · Play a short phrase so your next lesson has a clear starting point.';
    // Budget wide enough for "My Wave · Play a short phrase so your next"
    // (41 chars) plus the ellipsis, but not "lesson" too.
    const result = fitTextToWidth(text, 'inherit', 43 * CHAR_WIDTH);

    expect(result).toBe('My Wave · Play a short phrase so your next…');
    expect(result.endsWith('…')).toBe(true);
    // No truncated fragment of the next word ever survives.
    expect(result).not.toContain('les…');
  });

  it('truncates a long single word to a hard character clip rather than rendering nothing', () => {
    installFakeMeasurement();

    const result = fitTextToWidth(
      'Supercalifragilisticexpialidocious',
      'inherit',
      5 * CHAR_WIDTH,
    );

    expect(result.length).toBeGreaterThan(1);
    expect(result.endsWith('…')).toBe(true);
    expect(result).toBe('Supe…');
  });

  it('leaves text untouched when the width is not yet measurable', () => {
    installFakeMeasurement();

    expect(fitTextToWidth('Alternating Singles Warm-Up', 'inherit', 0)).toBe(
      'Alternating Singles Warm-Up',
    );
  });
});
