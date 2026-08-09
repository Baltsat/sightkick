import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { Stave } from 'vexflow';
import {
  dedupedTempoLabels,
  packRows,
  renderMusic,
  TARGET_ROW_WIDTH,
} from './renderer';
import { ChartParser } from './parser';
import { Measure, Note, ParsedChart, TempoMark } from './types';

beforeAll(() => {
  (
    globalThis.SVGElement.prototype as unknown as {
      getBBox: () => DOMRect;
    }
  ).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
});

function note(overrides: Partial<Note> = {}): Note {
  return {
    notes: ['c/5'],
    duration: 'q',
    dots: 0,
    isRest: false,
    tick: 0,
    ...overrides,
  };
}

function measure(notes: Note[], overrides: Partial<Measure> = {}): Measure {
  return {
    timeSig: [4, 4],
    sigChange: true,
    hasClef: true,
    isCompound: false,
    startTick: 0,
    endTick: 768,
    notes,
    tuplets: [],
    ...overrides,
  };
}

function song(measures: Measure[]): ChartParser {
  return { measures } as ChartParser;
}

function tempo(bpm: number): TempoMark {
  return { bpm, duration: 'q', dots: 0 };
}

function ref(element: HTMLDivElement | null) {
  return { current: element } as React.RefObject<HTMLDivElement | null>;
}

const COLORS = { note: '#000000', stave: '#888888' };

function render(
  target: React.RefObject<HTMLDivElement | null>,
  chart: ChartParser,
  showBarNumbers?: boolean,
  enableColors?: boolean,
  showTempo?: boolean,
  layout?: 'classic' | 'flow',
) {
  return renderMusic(
    target.current ?? undefined,
    chart,
    COLORS,
    showBarNumbers,
    enableColors,
    showTempo,
    layout,
  );
}

function container() {
  const div = document.createElement('div');

  document.body.appendChild(div);

  return div;
}

const quarters: Note[] = [0, 192, 384, 576].map((tick) =>
  note({ tick, duration: 'q' }),
);

function accentBounds(div: HTMLDivElement) {
  return Array.from(div.querySelectorAll('.vf-accent path')).map((path) => {
    const numbers = (
      path.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g) ?? []
    ).map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);

    return { left: Math.min(...xs), top: Math.min(...ys) };
  });
}

describe('renderMusic', () => {
  it('returns nothing when the element ref is empty', () => {
    expect(render(ref(null), song([measure(quarters)]))).toEqual([]);
  });

  it('renders an SVG into the element', () => {
    const div = container();

    render(ref(div), song([measure(quarters)]));

    expect(div.querySelector('svg')).not.toBeNull();
  });

  it('returns one render entry per measure', () => {
    const div = container();
    const measures = [
      measure(quarters),
      measure([note({ notes: ['b/4'], duration: 'w', isRest: true })], {
        hasClef: false,
        sigChange: false,
      }),
    ];
    const data = render(ref(div), song(measures));

    expect(data).toHaveLength(2);
    expect(data[0].measure).toBe(measures[0]);
    expect(data[1].measure).toBe(measures[1]);
    expect(data[0].stave).toBeInstanceOf(Stave);
  });

  it('emits a rendered note for every note in a measure, ticks preserved', () => {
    const div = container();
    const notes = [
      note({ tick: 0 }),
      note({ tick: 96, duration: '8' }),
      note({ notes: ['b/4'], duration: 'q', isRest: true, tick: 288 }),
      note({ tick: 384, notes: ['f/4', 'c/5'] }),
    ];
    const data = render(ref(div), song([measure(notes)]));

    expect(data[0].renderedNotes).toHaveLength(notes.length);
    expect(data[0].renderedNotes.map((rn) => rn.tick)).toEqual([
      0, 96, 288, 384,
    ]);
  });

  it('lays staves out two per row', () => {
    const div = container();
    const measures = [
      measure(quarters),
      measure(quarters, { hasClef: false, sigChange: false }),
      measure(quarters, { hasClef: false, sigChange: false }),
    ];
    const data = render(ref(div), song(measures));
    const ys = data.map((d) => d.stave.getYForLine(0));

    expect(data[0].stave.getX()).toBe(0);
    expect(data[1].stave.getX()).toBe(
      data[0].stave.getX() + data[0].stave.getWidth(),
    );
    expect(data[2].stave.getX()).toBe(0);
    expect(ys[0]).toBe(ys[1]);
    expect(data[0].yOffset).toBe(data[1].yOffset);
    expect(data[2].yOffset).toBeGreaterThan(data[0].yOffset);
  });

  it('justifies a row to the full width, splitting evenly between identical measures', () => {
    const div = container();
    const measures = [
      measure(quarters),
      measure(quarters, { hasClef: false, sigChange: false }),
    ];
    const data = render(ref(div), song(measures));

    expect(data[0].stave.getWidth()).toBe(data[1].stave.getWidth());
    expect(data[1].stave.getX() + data[1].stave.getWidth()).toBe(
      TARGET_ROW_WIDTH,
    );
  });

  it('wraps to a new row after two measures', () => {
    const div = container();
    const measures = Array.from({ length: 4 }, (_, i) =>
      measure(quarters, { hasClef: i === 0, sigChange: i === 0 }),
    );
    const data = render(ref(div), song(measures));

    expect(data[0].yOffset).toBe(data[1].yOffset);
    expect(data[2].yOffset).toBeGreaterThan(data[1].yOffset);
    expect(data[2].yOffset).toBe(data[3].yOffset);
    expect(data[2].stave.getX()).toBe(0);
  });

  it('lays every measure on one continuous system in Flow layout', () => {
    const div = container();
    const measures = Array.from({ length: 4 }, (_, index) =>
      measure(quarters, { hasClef: index === 0, sigChange: index === 0 }),
    );
    const data = render(ref(div), song(measures), true, true, true, 'flow');

    expect(data.map(({ yOffset }) => yOffset)).toEqual([0, 0, 0, 0]);
    expect(data[0].stave.getX()).toBe(0);
    expect(data[3].stave.getX()).toBeGreaterThan(data[2].stave.getX());
    expect(div.children).toHaveLength(1);
  });

  it('colours note heads with the per-drum colour when enabled', () => {
    const div = container();

    render(ref(div), song([measure([note({ notes: ['c/5'] })])]), true, true);

    expect(div.querySelector('.vf-notehead')!.classList).toContain(
      'vf-note-snare',
    );
  });

  it('does not colour note heads when colours are disabled', () => {
    const div = container();

    render(ref(div), song([measure([note({ notes: ['c/5'] })])]), true, false);

    expect(div.querySelector('.vf-notehead')!.classList).toContain(
      'vf-note-uncolored',
    );
  });

  it('classes rests so they are excluded from the note-head outline', () => {
    const div = container();

    render(
      ref(div),
      song([
        measure([note({ notes: ['b/4'], duration: 'w', isRest: true })], {
          timeSig: [4, 4],
        }),
      ]),
      true,
      true,
    );

    const noteHead = div.querySelector('.vf-notehead')!;

    expect(noteHead.classList).toContain('vf-note-rest');
    expect(noteHead.classList).not.toContain('vf-note-uncolored');
  });

  it('renders bar numbers when requested and omits them otherwise', () => {
    const withNumbers = container();
    const withoutNumbers = container();

    render(ref(withNumbers), song([measure(quarters)]), true);
    render(ref(withoutNumbers), song([measure(quarters)]), false);

    const textOf = (div: HTMLDivElement) =>
      Array.from(div.querySelectorAll('svg text')).map((el) => el.textContent);

    expect(textOf(withNumbers)).toContain('1');
    expect(textOf(withoutNumbers)).not.toContain('1');
  });

  it('renders flam grace notes without dropping the main note', () => {
    const div = container();
    const notes = [
      note({ tick: 0, notes: ['c/5'], graceNotes: [['c/5']] }),
      note({ tick: 192, duration: 'q' }),
    ];
    const data = render(ref(div), song([measure(notes)]));

    expect(data[0].renderedNotes).toHaveLength(2);
    expect(div.querySelector('svg')).not.toBeNull();
  });

  it('draws an accent only on an accented note', () => {
    const plain = container();
    const accented = container();

    render(ref(plain), song([measure([note({ notes: ['c/5'] })])]));
    render(
      ref(accented),
      song([measure([note({ notes: ['c/5'], accents: ['c/5'] })])]),
    );

    expect(plain.querySelectorAll('.vf-accent')).toHaveLength(0);
    expect(accented.querySelectorAll('.vf-accent')).toHaveLength(1);
  });

  it('puts the accent of a lone note above the staff', () => {
    const div = container();
    const data = render(
      ref(div),
      song([measure([note({ notes: ['c/5'], accents: ['c/5'] })])]),
    );

    expect(accentBounds(div)[0].top).toBeLessThan(data[0].stave.getYForLine(0));
  });

  it('draws a single accent above a fully accented chord', () => {
    const div = container();
    const data = render(
      ref(div),
      song([
        measure([
          note({ notes: ['c/5', 'g/5/x2'], accents: ['c/5', 'g/5/x2'] }),
        ]),
      ]),
    );
    const accents = accentBounds(div);

    expect(accents).toHaveLength(1);
    expect(accents[0].top).toBeLessThan(data[0].stave.getYForLine(0));
  });

  it('puts a partially accented chord note to the right of its head', () => {
    const div = container();
    const data = render(
      ref(div),
      song([measure([note({ notes: ['c/5', 'g/5/x2'], accents: ['c/5'] })])]),
    );
    const accents = accentBounds(div);
    const [noteHead] = data[0].renderedNotes;

    expect(accents).toHaveLength(1);
    expect(accents[0].top).toBeGreaterThan(data[0].stave.getYForLine(0));
    expect(accents[0].left).toBeGreaterThan(noteHead.note.getAbsoluteX());
  });

  it('classes a single-note accent like the note', () => {
    const div = container();

    render(
      ref(div),
      song([measure([note({ notes: ['c/5'], accents: ['c/5'] })])]),
      true,
      true,
    );

    expect(div.querySelector('.vf-accent')!.classList).toContain(
      'vf-accent-snare',
    );
  });

  it('classes an accent as uncolored when colours are disabled', () => {
    const div = container();

    render(
      ref(div),
      song([measure([note({ notes: ['c/5'], accents: ['c/5'] })])]),
      true,
      false,
    );

    const accent = div.querySelector('.vf-accent')!;

    expect(accent.classList).toContain('vf-accent-uncolored');
    expect(accent.classList).not.toContain('vf-accent-snare');
  });

  it('classes a partial-chord accent like its note', () => {
    const div = container();

    render(
      ref(div),
      song([measure([note({ notes: ['c/5', 'g/5/x2'], accents: ['c/5'] })])]),
      true,
      true,
    );

    expect(div.querySelector('.vf-accent')!.classList).toContain(
      'vf-accent-snare',
    );
  });

  it('classes a fully accented chord accent as uncolored, not a note colour', () => {
    const div = container();

    render(
      ref(div),
      song([
        measure([
          note({ notes: ['c/5', 'g/5/x2'], accents: ['c/5', 'g/5/x2'] }),
        ]),
      ]),
      true,
      true,
    );

    expect(div.querySelector('.vf-accent')!.classList).toContain(
      'vf-accent-uncolored',
    );
  });

  it('parenthesises a ghosted note head', () => {
    const plain = container();
    const ghosted = container();
    const pathCount = (div: HTMLDivElement) =>
      div.querySelectorAll('svg path').length;

    render(ref(plain), song([measure([note({ notes: ['c/5'] })])]));
    render(
      ref(ghosted),
      song([measure([note({ notes: ['c/5'], ghosts: ['c/5'] })])]),
    );

    expect(pathCount(ghosted)).toBeGreaterThan(pathCount(plain));
  });

  it('marks only the flagged head in a chord', () => {
    const div = container();
    const data = render(
      ref(div),
      song([measure([note({ notes: ['f/4', 'c/5'], accents: ['c/5'] })])]),
    );

    expect(data[0].renderedNotes).toHaveLength(1);
    expect(div.querySelector('svg')).not.toBeNull();
  });

  it('renders a tuplet group spanning its notes', () => {
    const div = container();
    const tripletNotes = [0, 64, 128].map((tick) =>
      note({ tick, duration: '8', tupletId: 0 }),
    );
    const measures = [
      measure(tripletNotes, {
        tuplets: [{ id: 0, numNotes: 3, notesOccupied: 2 }],
      }),
    ];
    const data = render(ref(div), song(measures));

    expect(data[0].renderedNotes).toHaveLength(3);
    expect(div.querySelector('svg')).not.toBeNull();
  });

  it('prints a tempo label only for the first tempo and after a >= 2 BPM drift from the last shown one', () => {
    const div = container();
    const measures = [
      measure(quarters, { tempo: tempo(83.03) }),
      measure(quarters, {
        tempo: tempo(83.71),
        hasClef: false,
        sigChange: false,
      }),
      measure(quarters, {
        tempo: tempo(90),
        hasClef: false,
        sigChange: false,
      }),
    ];

    render(ref(div), song(measures), true, false, true);

    const tempoTexts = Array.from(div.querySelectorAll('svg text'))
      .map((el) => el.textContent)
      .filter((text): text is string => Boolean(text?.includes('=')));

    expect(tempoTexts).toEqual([' = 83', ' = 90']);
  });

  it('prints nothing when tempo display is switched off', () => {
    const div = container();
    const measures = [measure(quarters, { tempo: tempo(83.03) })];

    render(ref(div), song(measures), true, false, false);

    const tempoTexts = Array.from(div.querySelectorAll('svg text')).filter(
      (el) => el.textContent?.includes('='),
    );

    expect(tempoTexts).toHaveLength(0);
  });

  it('renders real parser output end to end', () => {
    const div = container();
    const chart = {
      resolution: 192,
      timeSignatures: [],
      trackData: [
        {
          instrument: 'drums',
          difficulty: 'expert',
          noteEventGroups: [0, 96, 192, 384, 576].map((tick) => [
            { tick, type: 14, flags: 0, length: 0 },
          ]),
        },
      ],
    } as unknown as ParsedChart;
    const parser = new ChartParser(chart, false);
    const data = render(ref(div), parser);

    expect(data).toHaveLength(parser.measures.length);
    data.forEach((entry, index) => {
      expect(entry.renderedNotes).toHaveLength(
        parser.measures[index].notes.length,
      );
    });
  });
});

describe('packRows', () => {
  it('packs at most two measures per row', () => {
    expect(packRows([300, 300, 300, 300])).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('starts a new row when the next measure would exceed the target width', () => {
    expect(packRows([700, 700])).toEqual([[0], [1]]);
    expect(packRows([800, 500])).toEqual([[0], [1]]);
  });

  it('keeps a measure wider than the row on its own row', () => {
    expect(packRows([TARGET_ROW_WIDTH + 400])).toEqual([[0]]);
    expect(packRows([TARGET_ROW_WIDTH + 400, 300])).toEqual([[0], [1]]);
  });

  it('breaks on the two-measure cap before the width limit', () => {
    expect(packRows([100, 100, 100])).toEqual([[0, 1], [2]]);
  });
});

describe('dedupedTempoLabels', () => {
  it('shows the first tempo the chart carries', () => {
    const measures = [measure(quarters, { tempo: tempo(100) })];

    expect(dedupedTempoLabels(measures, true)).toEqual([tempo(100)]);
  });

  it('suppresses near-duplicate tempos that drift less than 2 BPM from the last one shown', () => {
    const measures = [
      measure(quarters, { tempo: tempo(83.03) }),
      measure(quarters, { tempo: tempo(83.71) }),
      measure(quarters, { tempo: tempo(83.5) }),
    ];

    expect(dedupedTempoLabels(measures, true)).toEqual([
      tempo(83),
      undefined,
      undefined,
    ]);
  });

  it('shows a tempo again once it drifts at least 2 BPM from the last one shown', () => {
    const measures = [
      measure(quarters, { tempo: tempo(83.03) }),
      measure(quarters, { tempo: tempo(83.71) }),
      measure(quarters, { tempo: tempo(90) }),
    ];

    expect(dedupedTempoLabels(measures, true)).toEqual([
      tempo(83),
      undefined,
      tempo(90),
    ]);
  });

  it('treats the last SHOWN tempo as the comparison baseline, not the last measure', () => {
    const measures = [
      measure(quarters, { tempo: tempo(100) }),
      // Exactly 2 BPM up from the shown baseline (100) - meets the >= 2
      // threshold, so this one shows and becomes the new baseline.
      measure(quarters, { tempo: tempo(102) }),
      // Only 1.9 BPM up from the new baseline (102), even though it is
      // 3.9 up from the very first tempo - stays suppressed.
      measure(quarters, { tempo: tempo(103.9) }),
    ];

    expect(dedupedTempoLabels(measures, true)).toEqual([
      tempo(100),
      tempo(102),
      undefined,
    ]);
  });

  it('rounds the displayed BPM to the nearest integer in both directions', () => {
    const measures = [measure(quarters, { tempo: tempo(119.4) })];

    expect(dedupedTempoLabels(measures, true)[0]?.bpm).toBe(119);

    const measuresUp = [measure(quarters, { tempo: tempo(119.6) })];

    expect(dedupedTempoLabels(measuresUp, true)[0]?.bpm).toBe(120);
  });

  it('leaves a measure with no tempo change as undefined', () => {
    const measures = [
      measure(quarters, { tempo: tempo(100) }),
      measure(quarters),
    ];

    expect(dedupedTempoLabels(measures, true)).toEqual([tempo(100), undefined]);
  });

  it('shows nothing when tempo display is switched off', () => {
    const measures = [
      measure(quarters, { tempo: tempo(100) }),
      measure(quarters, { tempo: tempo(140) }),
    ];

    expect(dedupedTempoLabels(measures, false)).toEqual([undefined, undefined]);
  });

  it('never mutates the chart data it reads from', () => {
    const original = tempo(83.03);
    const measures = [measure(quarters, { tempo: original })];

    dedupedTempoLabels(measures, true);

    expect(original.bpm).toBe(83.03);
    expect(measures[0].tempo).toBe(original);
  });
});
