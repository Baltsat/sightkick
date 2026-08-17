import { StaveNote } from 'vexflow';
import { describe, expect, it } from 'vitest';
import {
  ParsedChart,
  RenderData,
  RenderedNote,
} from '../../../chart-parser/types';
import {
  getCursorX,
  getNoteGlyphElements,
  getNoteSvg,
  getXForTick,
} from './cursor-geometry';

type Tempo = ParsedChart['tempos'][number];

function tempo(tick: number, beatsPerMinute: number, msTime: number): Tempo {
  return { tick, beatsPerMinute, msTime } as Tempo;
}

function fakeNote(absoluteX: number, isRest = false): StaveNote {
  return {
    isRest: () => isRest,
    getAbsoluteX: () => absoluteX,
  } as unknown as StaveNote;
}

function renderedNote(
  tick: number,
  absoluteX: number,
  isRest = false,
): RenderedNote {
  return { tick, note: fakeNote(absoluteX, isRest) } as unknown as RenderedNote;
}

function fakeStave(x: number, width: number) {
  return { getX: () => x, getWidth: () => width };
}

function measureData(
  startTick: number,
  endTick: number,
  notes: RenderedNote[],
  staveX = 0,
  staveWidth = 200,
): RenderData {
  return {
    measure: { startTick, endTick },
    stave: fakeStave(staveX, staveWidth),
    renderedNotes: notes,
  } as unknown as RenderData;
}

function timeProportionalMeasureData(): RenderData {
  return {
    ...measureData(0, 2000, [renderedNote(0, 0)], 0, 150),
    timeAnchors: [
      { tick: 0, x: 0 },
      { tick: 1000, x: 100 },
      { tick: 2000, x: 150 },
    ],
  } as RenderData;
}

describe('getCursorX', () => {
  const CHART = {
    resolution: 1,
    tempos: [tempo(0, 60000, 0)],
  } as unknown as ParsedChart;

  describe('rest-only measure', () => {
    const restMeasure = () =>
      measureData(0, 1000, [renderedNote(0, 0, true)], 0, 200);

    it('positions at the stave left edge at measure start', () => {
      expect(getCursorX(0, CHART, restMeasure())).toBe(0);
    });

    it('positions at the stave midpoint at the halfway tick', () => {
      expect(getCursorX(0.5, CHART, restMeasure())).toBe(100);
    });

    it('reaches the stave right edge exactly at measure end', () => {
      expect(getCursorX(1, CHART, restMeasure())).toBe(200);
    });

    it('clamps at the stave left edge when before measure start', () => {
      const data = measureData(
        500,
        1000,
        [renderedNote(500, 0, true)],
        50,
        200,
      );

      expect(getCursorX(0, CHART, data)).toBe(50);
    });

    it('clamps at the stave right edge when past measure end', () => {
      expect(getCursorX(2, CHART, restMeasure())).toBe(200);
    });
  });

  describe('non-rest notes', () => {
    it('snaps to the first note when the tick precedes it', () => {
      const data = measureData(0, 1000, [renderedNote(500, 100)]);

      expect(getCursorX(0, CHART, data)).toBe(100);
    });

    it('returns the note x when the tick equals the note tick', () => {
      const data = measureData(0, 1000, [
        renderedNote(0, 50),
        renderedNote(500, 150),
      ]);

      expect(getCursorX(0, CHART, data)).toBe(50);
    });

    it('interpolates linearly between two adjacent notes', () => {
      const data = measureData(0, 1000, [
        renderedNote(0, 50),
        renderedNote(500, 150),
      ]);

      expect(getCursorX(0.25, CHART, data)).toBe(100);
    });

    it('interpolates from the last note toward the stave right edge within measure bounds', () => {
      const data = measureData(0, 500, [renderedNote(0, 50)], 0, 200);

      expect(getCursorX(0.25, CHART, data)).toBe(125);
    });

    it('clamps at the stave right edge when past measure end', () => {
      const data = measureData(0, 500, [renderedNote(0, 50)], 0, 200);

      expect(getCursorX(1, CHART, data)).toBe(200);
    });

    it('returns the note x when the note sits exactly at the measure end tick', () => {
      const data = measureData(0, 500, [renderedNote(500, 100)], 0, 200);

      expect(getCursorX(1, CHART, data)).toBe(100);
    });

    it('uses note interpolation when the measure contains a mix of rests and real notes', () => {
      const data = measureData(0, 1000, [
        renderedNote(0, 0, true),
        renderedNote(500, 100),
      ]);

      expect(getCursorX(0.25, CHART, data)).toBe(50);
    });
  });
});

describe('getXForTick', () => {
  it('keeps one measured playhead velocity through mixed note values', () => {
    const chart = {
      resolution: 1000,
      tempos: [tempo(0, 60, 0)],
    } as unknown as ParsedChart;
    const data = {
      ...measureData(0, 1000, [
        renderedNote(0, 0),
        renderedNote(500, 32),
        renderedNote(750, 96),
        renderedNote(875, 144),
      ]),
      timeAnchors: [
        { tick: 0, x: 0 },
        { tick: 1000, x: 200 },
      ],
    } as RenderData;
    const samples = [0, 0.25, 0.5, 0.75, 1];
    const velocities = samples.slice(1).map((seconds, index) => {
      const previousSeconds = samples[index];

      return (
        (getCursorX(seconds, chart, data) -
          getCursorX(previousSeconds, chart, data)) /
        (seconds - previousSeconds)
      );
    });

    velocities.forEach((velocity) => expect(velocity).toBeCloseTo(200, 6));
  });

  it('changes tick spacing only at an authored tempo boundary', () => {
    const chart = {
      resolution: 1000,
      tempos: [tempo(0, 60, 0), tempo(1000, 120, 1000)],
    } as unknown as ParsedChart;
    const data = timeProportionalMeasureData();
    const samples = [0, 0.25, 0.5, 0.75, 1, 1.125, 1.25, 1.375, 1.5];
    const velocities = samples.slice(1).map((seconds, index) => {
      const previousSeconds = samples[index];

      return (
        (getCursorX(seconds, chart, data) -
          getCursorX(previousSeconds, chart, data)) /
        (seconds - previousSeconds)
      );
    });

    velocities.forEach((velocity) => expect(velocity).toBeCloseTo(100, 6));
    expect(getXForTick(500, data)).toBe(50);
    expect(getXForTick(1500, data)).toBe(125);
  });

  describe('rest-only measure', () => {
    const restMeasure = () =>
      measureData(0, 1000, [renderedNote(0, 0, true)], 0, 200);

    it('positions at the stave left edge at the measure start tick', () => {
      expect(getXForTick(0, restMeasure())).toBe(0);
    });

    it('positions at the stave midpoint at the halfway tick', () => {
      expect(getXForTick(500, restMeasure())).toBe(100);
    });

    it('reaches the stave right edge exactly at the measure end tick', () => {
      expect(getXForTick(1000, restMeasure())).toBe(200);
    });

    it('clamps at the stave right edge when past the measure end tick', () => {
      expect(getXForTick(2000, restMeasure())).toBe(200);
    });
  });

  describe('non-rest notes', () => {
    it('snaps to the first note when the tick precedes it', () => {
      const data = measureData(0, 1000, [renderedNote(500, 100)]);

      expect(getXForTick(0, data)).toBe(100);
    });

    it('returns the note x when the tick equals the note tick', () => {
      const data = measureData(0, 1000, [
        renderedNote(0, 50),
        renderedNote(500, 150),
      ]);

      expect(getXForTick(0, data)).toBe(50);
    });

    it('interpolates linearly between two adjacent notes', () => {
      const data = measureData(0, 1000, [
        renderedNote(0, 50),
        renderedNote(500, 150),
      ]);

      expect(getXForTick(250, data)).toBe(100);
    });

    it('interpolates from the last note toward the stave right edge within measure bounds', () => {
      const data = measureData(0, 500, [renderedNote(0, 50)], 0, 200);

      expect(getXForTick(250, data)).toBe(125);
    });

    it('clamps at the stave right edge when past the measure end tick', () => {
      const data = measureData(0, 500, [renderedNote(0, 50)], 0, 200);

      expect(getXForTick(1000, data)).toBe(200);
    });
  });

  it('agrees with getCursorX for the equivalent time, since getCursorX now delegates to it', () => {
    const CHART = {
      resolution: 1,
      tempos: [tempo(0, 60000, 0)],
    } as unknown as ParsedChart;
    const data = measureData(0, 1000, [
      renderedNote(0, 50),
      renderedNote(500, 150),
    ]);

    expect(getXForTick(250, data)).toBe(getCursorX(0.25, CHART, data));
  });
});

describe('getNoteGlyphElements', () => {
  function svgEl(): SVGElement {
    return document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    ) as SVGElement;
  }

  it("returns the note's own group element when available", () => {
    const group = svgEl();
    const headEl = svgEl();
    const note = {
      getSVGElement: () => group,
      noteHeads: [{ getSVGElement: () => headEl }],
    } as unknown as StaveNote;

    expect(getNoteGlyphElements(note)).toEqual([group]);
  });

  it('falls back to noteheads and the stem element when the group is unavailable', () => {
    const headEl = svgEl();
    const stemEl = svgEl();
    const note = {
      noteHeads: [{ getSVGElement: () => headEl }],
      getStem: () => ({ getSVGElement: () => stemEl }),
    } as unknown as StaveNote;

    expect(getNoteGlyphElements(note)).toEqual([headEl, stemEl]);
  });

  it('falls back to just the noteheads when neither the group nor the stem are available', () => {
    const headEl = svgEl();
    const note = {
      noteHeads: [{ getSVGElement: () => headEl }],
    } as unknown as StaveNote;

    expect(getNoteGlyphElements(note)).toEqual([headEl]);
  });
});

describe('getNoteSvg', () => {
  function svgEl(): SVGElement {
    return document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    ) as SVGElement;
  }

  it('returns an SVGElement for each noteHead', () => {
    const el1 = svgEl();
    const el2 = svgEl();
    const note = {
      noteHeads: [{ getSVGElement: () => el1 }, { getSVGElement: () => el2 }],
    } as unknown as StaveNote;

    expect(getNoteSvg(note)).toEqual([el1, el2]);
  });

  it('filters out null noteHeads', () => {
    const el = svgEl();
    const note = {
      noteHeads: [{ getSVGElement: () => null }, { getSVGElement: () => el }],
    } as unknown as StaveNote;

    expect(getNoteSvg(note)).toEqual([el]);
  });

  it('returns an empty array when noteHeads is empty', () => {
    const note = { noteHeads: [] } as unknown as StaveNote;

    expect(getNoteSvg(note)).toEqual([]);
  });
});
