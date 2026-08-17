import { describe, expect, it } from 'vitest';
import { Stave, StaveNote } from 'vexflow';
import {
  Measure,
  ParsedChart,
  RenderData,
  RenderedNote,
} from '../../../chart-parser/types';
import { GameRenderer } from './game-renderer';
import '../../styles/sheet-music.css';

const CHART = {
  resolution: 480,
  tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
} as unknown as ParsedChart;

function svgEl(): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  el.style.fill = '';

  return el as SVGElement;
}

function staveNote(
  keys: string[],
  {
    isRest = false,
    heads = keys.length,
  }: { isRest?: boolean; heads?: number } = {},
): StaveNote {
  const noteHeads = Array.from({ length: heads }, () => {
    const el = svgEl();

    return { getSVGElement: () => el };
  });
  const group = svgEl();

  return {
    isRest: () => isRest,
    getKeys: () => keys,
    getAbsoluteX: () => 0,
    getSVGElement: () => group,
    noteHeads,
  } as unknown as StaveNote;
}

function fakeStave(): Stave {
  return {
    getX: () => 0,
    getY: () => 10,
    getWidth: () => 100,
    getHeight: () => 40,
  } as unknown as Stave;
}

function rendered(tick: number, note: StaveNote): RenderedNote {
  return { tick, note };
}

function measureData(
  startTick: number,
  endTick: number,
  notes: RenderedNote[],
): RenderData {
  return {
    stave: fakeStave(),
    measure: { startTick, endTick } as unknown as Measure,
    renderedNotes: notes,
    yOffset: 0,
  };
}

function div(): HTMLElement {
  return document.createElement('div');
}

function hasClass(note: StaveNote, cls: string, head = 0): boolean {
  return (
    note.noteHeads[head].getSVGElement() as SVGElement
  ).classList.contains(cls);
}

function uncolored(note: StaveNote, head = 0): boolean {
  return (
    !hasClass(note, 'vf-note-hit', head) &&
    !hasClass(note, 'vf-note-missed', head)
  );
}

interface SetupOptions {
  playheadStyle?: 'Cursor' | 'Measure';
  isHit?: (tick: number, prefix: string) => boolean;
  isMissed?: (tick: number, prefix: string) => boolean;
  cursorEl?: HTMLElement;
  highlightEls?: (HTMLElement | undefined)[];
  overlayEl?: HTMLElement;
}

function setup(
  renderData: RenderData[],
  options: SetupOptions = {},
): GameRenderer {
  const {
    playheadStyle = 'Cursor',
    isHit = () => false,
    isMissed = (tick, prefix) => !isHit(tick, prefix),
    cursorEl,
    highlightEls = [],
    overlayEl,
  } = options;
  const view = new GameRenderer(isHit, isMissed);

  view.setContext({ chart: CHART, renderData });
  view.setSettings(playheadStyle);
  view.setRefs({ cursorEl, highlightEls, overlayEl });

  return view;
}

describe('GameRenderer', () => {
  it('moves the measure highlight forward as the tick crosses measures', () => {
    const a = div();
    const b = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
        measureData(1920, 3840, [
          rendered(1920, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { playheadStyle: 'Measure', highlightEls: [a, b] },
    );

    view.render(0, 480);

    expect(a.style.border).toContain('var(--color-accent-bright)');
    expect(b.style.border).toBe('');

    view.render(0, 2016);

    expect(b.style.border).toContain('var(--color-accent-bright)');
    expect(a.style.backgroundColor).toBe('');
  });

  it('updates the cursor position every frame within a measure', () => {
    const cursor = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { cursorEl: cursor },
    );

    view.render(0.5, 480);
    expect(cursor.style.transform).toBe(
      'translate3d(25px, 10px, 0) translateX(-50%)',
    );

    view.render(1, 960);
    expect(cursor.style.transform).toBe(
      'translate3d(50px, 10px, 0) translateX(-50%)',
    );
  });

  it('marks the active note and clears the previous one on a crossing', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const view = setup([
      measureData(0, 1920, [rendered(0, n0), rendered(480, n1)]),
    ]);

    view.render(0, 0);
    expect(hasClass(n0, 'vf-note-active')).toBe(true);
    expect(hasClass(n1, 'vf-note-active')).toBe(false);

    view.render(0, 480);
    expect(hasClass(n1, 'vf-note-active')).toBe(true);
    expect(hasClass(n0, 'vf-note-active')).toBe(false);
  });

  it('flashes a hit class on the struck note head only for the matching prefix', () => {
    const note = staveNote(['c/5', 'g/5']);
    const view = setup([measureData(0, 1920, [rendered(0, note)])]);

    view.paintHit({ measureIdx: 0, noteIdx: 0 }, ['c/5']);

    expect(hasClass(note, 'vf-note-pop', 0)).toBe(true);
    expect(hasClass(note, 'vf-note-pop', 1)).toBe(false);
  });

  it('flashes a miss class on a passed un-hit note', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const view = setup([
      measureData(0, 1920, [rendered(0, n0), rendered(480, n1)]),
    ]);

    view.render(0, 0);
    expect(hasClass(n0, 'vf-note-miss')).toBe(false);

    view.render(0, 480);
    expect(hasClass(n0, 'vf-note-miss')).toBe(true);
  });

  it('waits for Judge to resolve a miss before showing miss feedback', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    let resolved = false;
    const view = setup(
      [measureData(0, 1920, [rendered(0, n0), rendered(480, n1)])],
      { isMissed: (tick) => resolved && tick === 0 },
    );

    view.render(0, 0);
    view.render(0, 480);
    expect(hasClass(n0, 'vf-note-miss')).toBe(false);
    expect(uncolored(n0)).toBe(true);

    resolved = true;
    view.render(0, 480, true);
    expect(hasClass(n0, 'vf-note-missed')).toBe(true);
  });

  it('renders resolved misses without a separate callback', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const view = setup([
      measureData(0, 1920, [rendered(0, n0), rendered(480, n1)]),
    ]);

    expect(() => {
      view.render(0, 0);
      view.render(0, 480);
    }).not.toThrow();
    expect(hasClass(n0, 'vf-note-miss')).toBe(true);
  });

  it('does not flash a miss on a note that was hit', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const isHit = (tick: number, prefix: string) =>
      tick === 0 && prefix === 'c/5';
    const view = setup(
      [measureData(0, 1920, [rendered(0, n0), rendered(240, n1)])],
      { isHit },
    );

    view.render(0, 0);
    view.render(0, 240);

    expect(hasClass(n0, 'vf-note-miss')).toBe(false);
    expect(hasClass(n0, 'vf-note-hit')).toBe(true);
  });

  it('progress-colours notes before the active note', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    const view = setup([
      measureData(0, 1920, [
        rendered(0, n0),
        rendered(240, n1),
        rendered(480, n2),
      ]),
    ]);

    view.render(0, 480);

    expect(hasClass(n0, 'vf-note-missed')).toBe(true);
    expect(hasClass(n1, 'vf-note-missed')).toBe(true);
    expect(uncolored(n2)).toBe(true);
  });

  it('clears colouring when the playhead is seeked backward', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    const view = setup([
      measureData(0, 1920, [
        rendered(0, n0),
        rendered(240, n1),
        rendered(480, n2),
      ]),
    ]);

    view.render(0, 480);
    expect(hasClass(n0, 'vf-note-missed')).toBe(true);

    view.render(0, 0);
    expect(uncolored(n0)).toBe(true);
    expect(uncolored(n1)).toBe(true);
  });

  it('uses the isHit predicate to colour passed notes hit or missed', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const isHit = (tick: number, prefix: string) =>
      tick === 0 && prefix === 'c/5';
    const view = setup(
      [measureData(0, 1920, [rendered(0, n0), rendered(240, n1)])],
      { isHit },
    );

    view.render(0, 240);

    expect(hasClass(n0, 'vf-note-hit')).toBe(true);
  });

  it('paints a struck note head only for the matching prefix', () => {
    const note = staveNote(['c/5', 'g/5']);
    const view = setup([measureData(0, 1920, [rendered(0, note)])], {});

    view.paintHit({ measureIdx: 0, noteIdx: 0 }, ['c/5']);

    expect(hasClass(note, 'vf-note-hit', 0)).toBe(true);
    expect(uncolored(note, 1)).toBe(true);
  });

  it('clears colouring while the playhead sits on a note-head-less rest', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const rest = staveNote(['e/5'], { heads: 0 });
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, n0),
          rendered(240, n1),
          rendered(480, rest),
        ]),
      ],
      {},
    );

    view.render(0, 240);
    expect(hasClass(n0, 'vf-note-missed')).toBe(true);

    view.render(0, 480);
    expect(uncolored(n0)).toBe(true);
  });
});

describe('GameRenderer completed-note feedback', () => {
  it('keeps the notehead visible while the pop-flash animation is still playing', () => {
    const note = staveNote(['c/5']);
    const isHit = (tick: number, prefix: string) =>
      tick === 0 && prefix === 'c/5';
    const view = setup([measureData(0, 1920, [rendered(0, note)])], {
      isHit,
    });

    view.paintHit({ measureIdx: 0, noteIdx: 0 }, ['c/5']);

    expect(hasClass(note, 'vf-note-hit', 0)).toBe(true);
    expect(hasClass(note, 'vf-note-hidden', 0)).toBe(false);
  });

  it('vanishes the whole note after the pop-flash animation finishes', () => {
    const note = staveNote(['c/5']);
    const isHit = (tick: number, prefix: string) =>
      tick === 0 && prefix === 'c/5';
    const view = setup([measureData(0, 1920, [rendered(0, note)])], {
      isHit,
    });

    view.paintHit({ measureIdx: 0, noteIdx: 0 }, ['c/5']);
    note.noteHeads[0].getSVGElement()!.dispatchEvent(new Event('animationend'));

    expect(note.getSVGElement()?.classList).toContain('vf-note-hidden');
  });

  it('keeps a partially completed chord visible', () => {
    const note = staveNote(['c/5', 'g/5']);
    const isHit = (tick: number, prefix: string) =>
      tick === 0 && prefix === 'c/5';
    const view = setup([measureData(0, 1920, [rendered(0, note)])], {
      isHit,
    });

    view.paintHit({ measureIdx: 0, noteIdx: 0 }, ['c/5']);
    note.noteHeads[0].getSVGElement()!.dispatchEvent(new Event('animationend'));

    expect(hasClass(note, 'vf-note-hidden', 0)).toBe(false);
  });

  it('keeps a completed note vanished across a small backward seek', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    const isHit = (tick: number, prefix: string) =>
      tick === 0 && prefix === 'c/5';
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, n0),
          rendered(240, n1),
          rendered(480, n2),
        ]),
      ],
      { isHit },
    );

    view.render(0, 480);
    expect(n0.getSVGElement()?.classList).toContain('vf-note-hidden');

    view.render(0, 240);
    expect(n0.getSVGElement()?.classList).toContain('vf-note-hidden');
  });

  it('clears hit treatment on rewind once Judge no longer reports it', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    let hit = true;
    const isHit = (tick: number, prefix: string) =>
      hit && tick === 0 && prefix === 'c/5';
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, n0),
          rendered(240, n1),
          rendered(480, n2),
        ]),
      ],
      { isHit },
    );

    view.render(0, 480);
    expect(hasClass(n0, 'vf-note-hit')).toBe(true);
    expect(n0.getSVGElement()?.classList).toContain('vf-note-hidden');

    hit = false;
    view.render(0, 240);
    expect(hasClass(n0, 'vf-note-hit')).toBe(false);
    expect(hasClass(n0, 'vf-note-hidden')).toBe(false);
  });

  it('reconciles hit treatment on a seek that lands on the same active note', () => {
    // Unlike the test above, the active note itself (n2) stays the same
    // NotePos across both render calls — only an earlier, already-walked
    // note's hit state changes. Without the `isSeek` flag forcing
    // reconciliation, syncActiveNote would short-circuit on the unchanged
    // NotePos and never re-walk n1, leaving it incorrectly vanished.
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    const n3 = staveNote(['f/5']);
    let n1Hit = true;
    const isHit = (tick: number, prefix: string) =>
      n1Hit && tick === 240 && prefix === 'd/5';
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, n0),
          rendered(240, n1),
          rendered(480, n2),
          rendered(960, n3),
        ]),
      ],
      { isHit },
    );

    view.render(0, 700);
    expect(hasClass(n1, 'vf-note-hit')).toBe(true);
    expect(n1.getSVGElement()?.classList).toContain('vf-note-hidden');

    n1Hit = false;
    view.render(0, 500, true);

    expect(hasClass(n1, 'vf-note-hit')).toBe(false);
    expect(hasClass(n1, 'vf-note-hidden')).toBe(false);
  });

  it('clears hidden-note state during reset', () => {
    const note = staveNote(['c/5']);
    const isHit = () => true;
    const view = setup([measureData(0, 1920, [rendered(0, note)])], {
      isHit,
    });

    view.render(0, 480);

    view.reset();

    expect(hasClass(note, 'vf-note-hidden', 0)).toBe(false);
    expect(note.getSVGElement()?.classList).not.toContain('vf-note-hidden');
  });
});

describe('GameRenderer missed note treatment', () => {
  // The pinned above-line chip badges (vf-miss-marker) are gone: a missed
  // note now stays in the notation with a persistent in-staff colour
  // (vf-note-missed, see sheet-music.css) instead of spawning a separate
  // overlay element. These tests assert that treatment and, in several
  // cases, that no overlay chip is created at all any more.

  it('colours a passed un-hit note with the persistent missed class, and creates no overlay chip', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const overlay = div();
    const view = setup(
      [measureData(0, 1920, [rendered(0, n0), rendered(480, n1)])],
      { overlayEl: overlay },
    );

    view.render(0, 480);

    expect(hasClass(n0, 'vf-note-missed')).toBe(true);
    expect(overlay.children.length).toBe(0);
  });

  it('does not mark a hit note as missed', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const overlay = div();
    const isHit = (tick: number, prefix: string) =>
      tick === 0 && prefix === 'c/5';
    const view = setup(
      [measureData(0, 1920, [rendered(0, n0), rendered(480, n1)])],
      { overlayEl: overlay, isHit },
    );

    view.render(0, 480);

    expect(hasClass(n0, 'vf-note-missed')).toBe(false);
    expect(hasClass(n0, 'vf-note-hit')).toBe(true);
    expect(overlay.children.length).toBe(0);
  });

  it('clears the missed class on reset so it does not leak across songs', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const view = setup([
      measureData(0, 1920, [rendered(0, n0), rendered(480, n1)]),
    ]);

    view.render(0, 480);
    expect(hasClass(n0, 'vf-note-missed')).toBe(true);

    view.reset();

    expect(hasClass(n0, 'vf-note-missed')).toBe(false);
  });

  it('clears the missed class on backward seek', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const n2 = staveNote(['e/5']);
    const view = setup([
      measureData(0, 1920, [
        rendered(0, n0),
        rendered(240, n1),
        rendered(480, n2),
      ]),
    ]);

    view.render(0, 480);
    expect(hasClass(n0, 'vf-note-missed')).toBe(true);

    view.render(0, 0);

    expect(hasClass(n0, 'vf-note-missed')).toBe(false);
  });

  it('marks the final note of a chart as missed once playback reaches the end, with no overlay chip', () => {
    // A single-note chart: there is no "next" note whose activation would
    // normally walk and resolve this one, so it needs the chart-ended
    // path to ever receive its persistent miss treatment.
    const n0 = staveNote(['c/5']);
    const overlay = div();
    const view = setup([measureData(0, 480, [rendered(0, n0)])], {
      overlayEl: overlay,
    });

    view.render(0, 0);
    expect(hasClass(n0, 'vf-note-missed')).toBe(false);

    view.render(0, 480);

    expect(hasClass(n0, 'vf-note-missed')).toBe(true);
    expect(overlay.children.length).toBe(0);
  });
});

describe('GameRenderer paintWrongHit', () => {
  it('creates an × marker in the overlay at the tick position, with no text content', () => {
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    view.paintWrongHit({
      tick: 480,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 0.5,
      scoreable: true,
    });

    const marker = overlay.querySelector('.vf-wronghit-marker');

    // The × itself is drawn with CSS (::before/::after crossed bars, see
    // sheet-music.css) rather than a character, so there is no glyph or
    // drum-abbreviation letter (e.g. the old "CR"/"HH") in the DOM text.
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toBe('');
  });

  it('is visually distinct from the persistent missed-note treatment', () => {
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    view.paintWrongHit({
      tick: 480,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 0.5,
      scoreable: true,
    });

    const marker = overlay.querySelector('.vf-wronghit-marker');

    // The wrong-hit marker is its own overlay element (it marks a struck
    // tick with no notehead of its own) - it never carries the missed
    // note's in-staff colouring class.
    expect(marker?.classList.contains('vf-note-missed')).toBe(false);
  });

  it('does nothing when the tick falls outside any known measure', () => {
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    view.paintWrongHit({
      tick: 5000,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 5,
      scoreable: true,
    });

    expect(overlay.children.length).toBe(0);
  });

  it('clears wrong-hit markers on reset', () => {
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    view.paintWrongHit({
      tick: 480,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 0.5,
      scoreable: true,
    });
    expect(overlay.children.length).toBe(1);

    view.reset();

    expect(overlay.children.length).toBe(0);
  });

  it.each([
    ['Flow', 0],
    ['Classic', 180],
  ])(
    'keeps a wrong hit in its %s score position while it fades to a readable state',
    (_layout, yOffset) => {
      const overlay = div();
      const data = measureData(0, 1920, [
        rendered(0, staveNote(['c/5'], { isRest: true })),
      ]);

      data.yOffset = yOffset;

      const view = setup([data], { overlayEl: overlay });

      view.paintWrongHit({
        tick: 480,
        controlId: 'midi:49',
        element: 'crash',
        timeSeconds: 0.5,
        scoreable: true,
      });

      const marker = overlay.querySelector<HTMLElement>('.vf-wronghit-marker');

      expect(marker).not.toBeNull();
      expect(markerY(marker as HTMLElement)).toBe(yOffset + 30);

      view.render(0.5, 480);
      expect(Number(marker?.style.opacity)).toBe(1);

      view.render(2.6, 960);
      expect(Number(marker?.style.opacity)).toBeCloseTo(0.74);

      view.render(4.1, 1600);
      expect(marker?.parentElement).toBe(overlay);
      expect(Number(marker?.style.opacity)).toBeCloseTo(0.48);
    },
  );

  it('never adds a marker for the hi-hat pedal', () => {
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    view.paintWrongHit({
      tick: 480,
      controlId: 'midi:44',
      element: 'hihat',
      timeSeconds: 0.5,
      scoreable: true,
    });

    expect(overlay.querySelector('.vf-wronghit-marker')).toBeNull();
  });

  it('prunes wrong-hit markers at or after the tick on a backward seek', () => {
    const n0 = staveNote(['c/5']);
    const n1 = staveNote(['d/5']);
    const overlay = div();
    const view = setup(
      [measureData(0, 1920, [rendered(0, n0), rendered(480, n1)])],
      { overlayEl: overlay },
    );

    view.render(0, 480);
    view.paintWrongHit({
      tick: 600,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 0.6,
      scoreable: true,
    });
    expect(overlay.querySelectorAll('.vf-wronghit-marker').length).toBe(1);

    view.render(0, 0);

    expect(overlay.querySelectorAll('.vf-wronghit-marker').length).toBe(0);
  });

  function markerY(el: Element): number {
    const match = /translate3d\([^,]+,\s*([\d.-]+)px/.exec(
      (el as HTMLElement).style.transform,
    );

    return match ? Number(match[1]) : NaN;
  }

  it('stacks × markers vertically instead of merging when they land close together', () => {
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    // Two wrong hits a few ticks apart land at (almost) the same x - the
    // scenario that used to render as a single merged "THH"-style blob.
    view.paintWrongHit({
      tick: 480,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 0.5,
      scoreable: true,
    });
    view.paintWrongHit({
      tick: 500,
      controlId: 'midi:38',
      element: 'snare',
      timeSeconds: 0.52,
      scoreable: true,
    });

    const markers = Array.from(overlay.querySelectorAll('.vf-wronghit-marker'));

    expect(markers.length).toBe(2);
    // Each marker is still its own separate element (no merged text node)
    // and the second is pushed to a different y than the first.
    expect(markers[0].textContent).toBe('');
    expect(markers[1].textContent).toBe('');
    expect(markerY(markers[1])).not.toBe(markerY(markers[0]));
  });

  it('does not offset × markers that land far apart on the x axis', () => {
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, staveNote(['c/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    view.paintWrongHit({
      tick: 0,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 0,
      scoreable: true,
    });
    view.paintWrongHit({
      tick: 1900,
      controlId: 'midi:38',
      element: 'snare',
      timeSeconds: 4,
      scoreable: true,
    });

    const markers = Array.from(overlay.querySelectorAll('.vf-wronghit-marker'));

    expect(markerY(markers[0])).toBe(markerY(markers[1]));
  });

  it('never renders letter text in the overlay, for wrong hits or missed notes', () => {
    const n0 = staveNote(['c/5']);
    const overlay = div();
    const view = setup(
      [
        measureData(0, 1920, [
          rendered(0, n0),
          rendered(480, staveNote(['d/5'], { isRest: true })),
        ]),
      ],
      { overlayEl: overlay },
    );

    view.render(0, 480); // n0 passes un-hit -> persistent missed colouring, no chip
    view.paintWrongHit({
      tick: 480,
      controlId: 'midi:49',
      element: 'crash',
      timeSeconds: 0.5,
      scoreable: true,
    });
    view.paintWrongHit({
      tick: 490,
      controlId: 'midi:38',
      element: 'snare',
      timeSeconds: 0.51,
      scoreable: true,
    });

    expect(overlay.textContent).toBe('');
  });
});
