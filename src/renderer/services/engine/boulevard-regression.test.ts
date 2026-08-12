import { describe, expect, it } from 'vitest';
import { Stave, StaveNote } from 'vexflow';
import {
  Measure,
  ParsedChart,
  RenderData,
  RenderedNote,
} from '../../../chart-parser/types';
import fixture from './__fixtures__/boulevard-hard-structure.json';
import { GameRenderer } from './game-renderer';
import { keyPrefix } from './helpers';
import '../../styles/sheet-music.css';

const CHART = {
  resolution: fixture.provenance.resolution,
  tempos: [{ tick: 0, beatsPerMinute: 83.4, msTime: 0 }],
} as unknown as ParsedChart;

function svgElement(): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'path');
}

function staveNote(keys: string[]): StaveNote {
  const noteHeads = keys.map(() => {
    const element = svgElement();

    // Reproduce every legacy disappearance mechanism seen in pre-fix builds.
    element.classList.add('vf-note-hidden');
    element.setAttribute('hidden', '');
    element.style.display = 'none';
    element.style.visibility = 'hidden';
    element.style.opacity = '0';

    return { getSVGElement: () => element };
  });
  const group = svgElement();

  group.classList.add('vf-note-hidden');
  group.setAttribute('hidden', '');
  group.style.display = 'none';
  group.style.visibility = 'hidden';
  group.style.opacity = '0';

  return {
    isRest: () => false,
    getKeys: () => keys,
    getAbsoluteX: () => 0,
    getSVGElement: () => group,
    noteHeads,
  } as unknown as StaveNote;
}

function stave(): Stave {
  return {
    getX: () => 0,
    getY: () => 10,
    getWidth: () => 100,
    getHeight: () => 40,
  } as unknown as Stave;
}

function renderedNote(tick: number, note: StaveNote): RenderedNote {
  return { tick, note };
}

function isVisible(note: StaveNote): void {
  const elements = [
    note.getSVGElement?.(),
    ...note.noteHeads.map((head) => head.getSVGElement()),
  ].filter((element): element is SVGElement => Boolean(element));

  elements.forEach((element) => {
    expect(element.classList).not.toContain('vf-note-hidden');
    expect(element.hasAttribute('hidden')).toBe(false);
    expect(element.style.display).toBe('');
    expect(element.style.visibility).toBe('');
    expect(element.style.opacity).toBe('');
  });
}

describe('Boulevard Classic notation regression', () => {
  it('never drops any of the 42 real chart heads across row, pause, and recovery transitions', () => {
    const allNotes: StaveNote[] = [];
    const renderData: RenderData[] = fixture.measures.map((measure, index) => {
      const notes = measure.notes.map(({ tick, keys }) => {
        const note = staveNote(keys);

        allNotes.push(note);

        return renderedNote(tick, note);
      });

      return {
        stave: stave(),
        measure: {
          startTick: measure.startTick,
          endTick: measure.endTick,
        } as unknown as Measure,
        renderedNotes: notes,
        // Classic lays each of these measures on a distinct notation row.
        yOffset: index * 180,
      };
    });
    const hitHeads = new Set<string>();
    const missedHeads = new Set<string>();
    const stateKey = (tick: number, key: string) => `${tick}:${keyPrefix(key)}`;
    const renderer = new GameRenderer(
      (tick, key) => hitHeads.has(stateKey(tick, key)),
      (tick, key) => missedHeads.has(stateKey(tick, key)),
    );
    const expectEveryHeadVisible = () => allNotes.forEach(isVisible);

    expect(allNotes).toHaveLength(24);
    expect(
      allNotes.reduce((count, note) => count + note.noteHeads.length, 0),
    ).toBe(42);

    renderer.setContext({ chart: CHART, renderData });
    renderer.setSettings('Cursor');
    renderer.setRefs({ cursorEl: undefined, highlightEls: [] });
    expectEveryHeadVisible();

    // Playback and reconciliation through the first Classic row.
    hitHeads.add(stateKey(40320, 'f/4'));
    renderer.paintHit({ measureIdx: 0, noteIdx: 0 }, ['f/4']);
    missedHeads.add(stateKey(40320, 'a/5/x2'));
    renderer.render(0, 42000);
    expectEveryHeadVisible();

    // Crossing onto the second row must keep the completed first row intact.
    renderer.render(0, 42240);
    renderer.render(0, 43680);
    expectEveryHeadVisible();

    // A kit pause produces repeated frames at one tick; resume advances from it.
    renderer.render(0, 43680);
    renderer.render(0, 43680);
    expectEveryHeadVisible();
    renderer.render(0, 44160);
    expectEveryHeadVisible();

    // Focused recovery rewinds across both a row and a completed chord.
    hitHeads.clear();
    missedHeads.clear();
    renderer.render(0, 40800, true);
    expectEveryHeadVisible();

    // A same-position seek still reconciles state, then a final reset re-arms it.
    renderer.render(0, 40800, true);
    expectEveryHeadVisible();
    renderer.reset();
    expectEveryHeadVisible();
  });
});
