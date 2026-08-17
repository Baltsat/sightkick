import {
  RenderContext,
  Renderer,
  Stave,
  StaveNote,
  TextJustification,
  Formatter,
  Fraction,
  ModifierPosition,
  Beam,
  Dot,
  Barline,
  Tuplet,
  Voice,
  GraceNote,
  GraceNoteGroup,
  Parenthesis,
  Glyph,
  Flow,
} from 'vexflow';
import { ChartParser } from './parser';
import { Measure, Note, RenderData, TempoMark, TimeAnchor } from './types';
import { KEY_TO_ELEMENT } from './constants';
import { ticksToSeconds } from './timing';
import {
  stickingNotesForMeasure,
  type StickingData,
  type StickingLimb,
  type StickingNote,
} from '../renderer/services/sticking';

export interface SheetMusicColors {
  note: string;
  stave: string;
}

export const TARGET_ROW_WIDTH = 1200;

/**
 * Classic notation uses short, readable systems. Flow deliberately keeps all
 * measures on one horizontal system so the live playhead can travel through
 * the chart without changing rows. It is still the exact same VexFlow score
 * and RenderData contract — only the layout geometry changes.
 */
export type SheetMusicLayout = 'classic' | 'flow';

const MAX_MEASURES_PER_ROW = 2;
const MIN_MEASURE_WIDTH = 300;

// A Flow bar has to be readable from behind the kit, not merely fit the
// formatter's minimum. Classic normally gives an ordinary 4/4 bar about
// 600 px (two bars across TARGET_ROW_WIDTH); keeping Flow close to that
// density makes the beat grid and individual drum lanes legible while the
// camera, rather than a compressed score, owns navigation.
export const FLOW_MIN_MEASURE_WIDTH = 540;

const MEASURE_TRAILING_PAD = 20;
const UNCOLORED_NOTE_CLASS = 'vf-note-uncolored';
const UNCOLORED_ACCENT_CLASS = 'vf-accent-uncolored';
const REST_NOTE_CLASS = 'vf-note-rest';
const STEM_DIRECTION = -1;
const REST_KEY = 'b/4';
const ACCENT_SCALE = Flow.NOTATION_FONT_SCALE;
const ACCENT_SCALE_RIGHT = Flow.NOTATION_FONT_SCALE * 0.8;
const STICKING_FONT_SIZE = 18;
const STICKING_FOOT_OFFSET = 20;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const STICKING_LANE_TO_ELEMENT: Record<StickingNote['lane'], string> = {
  K: 'kick',
  S: 'snare',
  H: 'hihat',
  O: 'hihat',
  R: 'ride',
  C: 'crash',
  T1: 'tom1',
  T2: 'tom2',
  T3: 'tom3',
};

export function renderMusic(
  container: HTMLDivElement | undefined,
  song: ChartParser,
  colors: SheetMusicColors,
  showBarNumbers: boolean = true,
  enableColors: boolean = false,
  showTempo: boolean = true,
  layout: SheetMusicLayout = 'classic',
  sticking?: StickingData,
): RenderData[] {
  if (!container) {
    return [];
  }

  container.replaceChildren();

  const isFlow = layout === 'flow';
  const lineHeight = isFlow ? 190 : showBarNumbers ? 180 : 130;
  const renderData: RenderData[] = [];
  const tempoLabels = dedupedTempoLabels(song.measures, showTempo);
  const requiredWidths = song.measures.map((measure, index) =>
    requiredMeasureWidth(measure, tempoLabels[index]),
  );
  const headerOffsets = song.measures.map((measure, index) =>
    measureHeaderOffset(measure, tempoLabels[index]),
  );
  const durations = song.measures.map((measure) =>
    measureDurationSeconds(song, measure),
  );
  const minimumPixelsPerSecond = song.measures.reduce(
    (pixelsPerSecond, measure, index) =>
      Math.max(
        pixelsPerSecond,
        (requiredWidths[index] - headerOffsets[index]) / durations[index],
      ),
    0,
  );
  const widths = isFlow
    ? flowWidths(durations, headerOffsets, minimumPixelsPerSecond)
    : durations.map((duration) => duration * minimumPixelsPerSecond);
  // Flow is intentionally a *single* system. Do not make this a visual
  // approximation with translated rows: GameRenderer receives the VexFlow
  // staves in this exact geometry, so hit/miss/wrong-hit and cursor math keep
  // using their established DOM references.
  const rows = isFlow
    ? [song.measures.map((_, index) => index)]
    : packRows(widths);

  rows.forEach((rowIndices, rowNum) => {
    const yOffset = rowNum * lineHeight;
    const pixelsPerSecond = isFlow
      ? widths[0] / durations[0]
      : rowPixelsPerSecond(
          rowIndices,
          durations,
          requiredWidths,
          headerOffsets,
          minimumPixelsPerSecond,
        );
    const rowWidths = rowIndices.map(
      (index) => headerOffsets[index] + durations[index] * pixelsPerSecond,
    );
    const rowWidth = rowWidths.reduce((sum, width) => sum + width, 0);
    const rowEl = document.createElement('div');

    rowEl.style.position = 'relative';
    rowEl.style.width = `${rowWidth}px`;
    rowEl.style.height = `${lineHeight}px`;
    container.appendChild(rowEl);

    const renderer = new Renderer(rowEl, Renderer.Backends.SVG);
    const context = renderer.getContext();

    context.setFillStyle(colors.note);
    context.setStrokeStyle(colors.note);
    renderer.resize(rowWidth, lineHeight);

    const svgEl = rowEl.querySelector('svg');

    if (svgEl) {
      svgEl.style.overflow = 'visible';
      svgEl.style.display = 'block';
    }

    let x = 0;

    rowIndices.forEach((index, rowIndex) => {
      const measure = song.measures[index];
      const measureWidth = rowWidths[rowIndex];
      const timeAnchors = measureTimeAnchors(
        song,
        measure,
        x + headerOffsets[index],
        pixelsPerSecond,
      );
      const { stave, renderedNotes } = renderMeasure(
        context,
        measure,
        index,
        x,
        0,
        measureWidth,
        index === song.measures.length - 1,
        showBarNumbers,
        enableColors,
        tempoLabels[index],
        colors,
        timeAnchors,
        sticking,
      );

      renderData[index] = {
        measure,
        stave,
        renderedNotes,
        yOffset,
        timeAnchors,
      };

      const nextHeaderOffset = headerOffsets[rowIndices[rowIndex + 1]] ?? 0;

      x += measureWidth - nextHeaderOffset;
    });
  });

  return renderData;
}

export function packRows(widths: number[]): number[][] {
  const rows: number[][] = [];
  let current: number[] = [];
  let accumulated = 0;

  widths.forEach((width, index) => {
    if (
      current.length > 0 &&
      (current.length >= MAX_MEASURES_PER_ROW ||
        accumulated + width > TARGET_ROW_WIDTH)
    ) {
      rows.push(current);
      current = [];
      accumulated = 0;
    }

    current.push(index);
    accumulated += width;
  });

  if (current.length > 0) {
    rows.push(current);
  }

  return rows;
}

/**
 * Decides, in measure order, which measures actually get a printed tempo
 * label: the first tempo the chart carries, and after that only a tempo
 * that has drifted at least `TEMPO_LABEL_MIN_DELTA_BPM` from the last one
 * shown — suppressing the near-duplicate labels an auto-charted tempo map's
 * per-measure micro-fluctuations would otherwise print on nearly every
 * measure. The comparison uses the raw BPM; only the returned label's BPM
 * is rounded, for display. Purely a rendering decision — `measure.tempo`
 * itself (chart data/timing) is never modified.
 */
export function dedupedTempoLabels(
  measures: Measure[],
  showTempo: boolean,
): (TempoMark | undefined)[] {
  if (!showTempo) {
    return measures.map(() => undefined);
  }

  return measures.map((measure) =>
    measure.tempo
      ? { ...measure.tempo, bpm: Math.round(measure.tempo.bpm) }
      : undefined,
  );
}

function measureDurationSeconds(song: ChartParser, measure: Measure): number {
  if (song.tempos?.length && song.resolution > 0) {
    return Math.max(
      Number.EPSILON,
      ticksToSeconds(measure.endTick, song.resolution, song.tempos) -
        ticksToSeconds(measure.startTick, song.resolution, song.tempos),
    );
  }

  const bpm = measure.tempo?.bpm ?? 120;
  const beats = measure.timeSig[0] * (4 / measure.timeSig[1]);

  return Math.max(Number.EPSILON, (beats * 60) / bpm);
}

function flowWidths(
  durations: number[],
  headerOffsets: number[],
  minimumPixelsPerSecond: number,
) {
  const pixelsPerSecond = Math.max(
    minimumPixelsPerSecond,
    ...durations.map(
      (duration, index) =>
        (FLOW_MIN_MEASURE_WIDTH - headerOffsets[index]) / duration,
    ),
  );

  return durations.map((duration) => duration * pixelsPerSecond);
}

function rowPixelsPerSecond(
  rowIndices: number[],
  durations: number[],
  requiredWidths: number[],
  headerOffsets: number[],
  minimumPixelsPerSecond: number,
) {
  const rowDuration = rowIndices.reduce(
    (sum, index) => sum + durations[index],
    0,
  );
  const readablePixelsPerSecond = rowIndices.reduce(
    (pixelsPerSecond, index) =>
      Math.max(
        pixelsPerSecond,
        (requiredWidths[index] - headerOffsets[index]) / durations[index],
      ),
    minimumPixelsPerSecond,
  );

  return Math.max(
    readablePixelsPerSecond,
    (TARGET_ROW_WIDTH - headerOffsets[rowIndices[0]]) / rowDuration,
  );
}

function measureTimeAnchors(
  song: ChartParser,
  measure: Measure,
  startX: number,
  pixelsPerSecond: number,
): TimeAnchor[] {
  const ticks = [measure.startTick];

  (song.tempos ?? []).forEach((tempo) => {
    if (tempo.tick > measure.startTick && tempo.tick < measure.endTick) {
      ticks.push(tempo.tick);
    }
  });

  ticks.push(measure.endTick);

  const startSeconds =
    song.tempos?.length && song.resolution > 0
      ? ticksToSeconds(measure.startTick, song.resolution, song.tempos)
      : 0;
  const duration = measureDurationSeconds(song, measure);

  return ticks.map((tick) => {
    const seconds =
      song.tempos?.length && song.resolution > 0
        ? ticksToSeconds(tick, song.resolution, song.tempos) - startSeconds
        : ((tick - measure.startTick) / (measure.endTick - measure.startTick)) *
          duration;

    return { tick, x: startX + seconds * pixelsPerSecond };
  });
}

function timeXForTick(tick: number, anchors: TimeAnchor[]): number {
  const first = anchors[0];
  const last = anchors.at(-1);

  if (!first || !last) {
    return 0;
  }

  if (tick <= first.tick) {
    return first.x;
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const next = anchors[index];

    if (tick <= next.tick) {
      const progress = (tick - previous.tick) / (next.tick - previous.tick);

      return previous.x + progress * (next.x - previous.x);
    }
  }

  return last.x;
}

function staveHeaderOffset(
  stave: Stave,
  measure: Measure,
  tempoToShow: TempoMark | undefined,
): number {
  if (measure.hasClef) {
    stave.addClef('percussion');
  }

  if (measure.sigChange) {
    stave.addTimeSignature(`${measure.timeSig[0]}/${measure.timeSig[1]}`);
  }

  if (tempoToShow) {
    stave.setTempo(tempoToShow, 0);
  }

  stave.format();

  return stave.getNoteStartX() - stave.getX();
}

function measureHeaderOffset(
  measure: Measure,
  tempoToShow: TempoMark | undefined,
): number {
  return staveHeaderOffset(
    new Stave(0, 0, TARGET_ROW_WIDTH),
    measure,
    tempoToShow,
  );
}

function requiredMeasureWidth(
  measure: Measure,
  tempoToShow: TempoMark | undefined,
): number {
  const headerOffset = measureHeaderOffset(measure, tempoToShow);
  const { voice } = buildVoice(measure);
  const formatter = new Formatter().joinVoices([voice]);
  const minNoteWidth = formatter.preCalculateMinTotalWidth([voice]);
  const content = Number.isFinite(minNoteWidth) ? minNoteWidth : 0;

  return Math.max(
    MIN_MEASURE_WIDTH,
    headerOffset + content + MEASURE_TRAILING_PAD,
  );
}

function buildVoice(measure: Measure) {
  const tupletGroups = new Map<number, StaveNote[]>();
  const staveNotes = measure.notes.map((note) => {
    const isMeasureRest = note.isRest && measure.notes.length === 1;
    const staveNote = new StaveNote({
      keys: note.isRest ? [REST_KEY] : note.notes,
      duration: `${note.duration}${'d'.repeat(note.dots)}${
        note.isRest ? 'r' : ''
      }`,
      align_center: isMeasureRest,
      stem_direction: STEM_DIRECTION,
    });

    if (note.dots > 0) {
      Dot.buildAndAttach([staveNote], {
        all: true,
      });
    }

    if (note.graceNotes?.length) {
      const graceNotes = note.graceNotes.map(
        (keys) =>
          new GraceNote({
            keys,
            duration: '8',
            slash: true,
            stem_direction: STEM_DIRECTION,
          }),
      );
      const graceGroup = new GraceNoteGroup(graceNotes, false);

      if (graceNotes.length > 1) {
        graceGroup.beamNotes();
      }

      staveNote.addModifier(graceGroup, 0);
    }

    if (!note.isRest && note.ghosts?.length) {
      staveNote.keys.forEach((key, keyIndex) => {
        if (note.ghosts?.includes(key)) {
          staveNote.addModifier(
            new Parenthesis(ModifierPosition.LEFT),
            keyIndex,
          );
          staveNote.addModifier(
            new Parenthesis(ModifierPosition.RIGHT),
            keyIndex,
          );
        }
      });
    }

    if (note.tupletId !== undefined) {
      const group = tupletGroups.get(note.tupletId) ?? [];

      group.push(staveNote);
      tupletGroups.set(note.tupletId, group);
    }

    return staveNote;
  });
  const tuplets = measure.tuplets
    .filter((meta) => (tupletGroups.get(meta.id)?.length ?? 0) > 1)
    .map(
      (meta) =>
        new Tuplet(tupletGroups.get(meta.id) as StaveNote[], {
          num_notes: meta.numNotes,
          notes_occupied: meta.notesOccupied,
          ratioed: false,
          location: STEM_DIRECTION,
        }),
    );
  const voice = new Voice({
    num_beats: measure.timeSig[0],
    beat_value: measure.timeSig[1],
  })
    .setStrict(false)
    .addTickables(staveNotes);
  const beams = Beam.generateBeams(staveNotes, {
    flat_beams: true,
    stem_direction: STEM_DIRECTION,
    groups: measure.isCompound
      ? [new Fraction(3, measure.timeSig[1])]
      : undefined,
  });

  return { voice, beams, tuplets, staveNotes };
}

function noteClassFor(key: string, enableColors: boolean): string | undefined {
  const element = KEY_TO_ELEMENT[key];

  if (!element) {
    return undefined;
  }

  return enableColors ? `vf-note-${element}` : UNCOLORED_NOTE_CLASS;
}

function accentClassFor(
  key: string | undefined,
  enableColors: boolean,
): string {
  const element = key ? KEY_TO_ELEMENT[key] : undefined;

  return enableColors && element
    ? `vf-accent-${element}`
    : UNCOLORED_ACCENT_CLASS;
}

function applyNoteClasses(staveNotes: StaveNote[], enableColors: boolean) {
  staveNotes.forEach((staveNote) => {
    if (staveNote.isRest()) {
      staveNote.noteHeads.forEach(
        (noteHead) => noteHead?.getSVGElement()?.classList.add(REST_NOTE_CLASS),
      );

      return;
    }

    staveNote.getKeys().forEach((key, keyIndex) => {
      const noteClass = noteClassFor(key, enableColors);

      if (noteClass) {
        staveNote.noteHeads[keyIndex]
          ?.getSVGElement()
          ?.classList.add(noteClass);
      }
    });
  });
}

function notationKinds(note: Note): string[] {
  const kinds = [note.isRest ? 'rest' : 'colored-head'];

  if (note.dots > 0) {
    kinds.push('dot');
  }

  if (note.duration === '32') {
    kinds.push('triple-beam');
  } else if (note.duration === '8' || note.duration === '16') {
    kinds.push('beam');
  }

  if (note.tupletId !== undefined) {
    kinds.push('tuplet');
  }

  if (note.graceNotes?.length) {
    kinds.push('grace');
  }

  if (note.ghosts?.length) {
    kinds.push('ghost');
  }

  return kinds;
}

function annotateNotation(staveNotes: StaveNote[], measure: Measure) {
  staveNotes.forEach((staveNote, index) => {
    const note = measure.notes[index];
    const kinds = notationKinds(note);

    staveNote
      .getSVGElement()
      ?.setAttribute('data-notation-kinds', kinds.join(' '));
    staveNote.noteHeads.forEach(
      (head) =>
        head
          ?.getSVGElement()
          ?.setAttribute(
            'data-notation-kind',
            note.isRest ? 'rest' : 'colored-head',
          ),
    );
  });
}

function drawAccentGlyph(
  context: RenderContext,
  x: number,
  y: number,
  originX: number,
  originY: number,
  scale: number,
  accentClass: string,
  noteColor: string,
) {
  const glyph = new Glyph('articAccentAbove', scale);

  glyph.setOrigin(originX, originY);

  const group = context.openGroup('accent') as SVGGElement;

  group.classList.add(accentClass);
  group.setAttribute('data-notation-kind', 'accent');
  context.setFillStyle(noteColor);
  context.setStrokeStyle(noteColor);
  glyph.render(context, x, y);
  context.closeGroup();
}

function drawAccents(
  context: RenderContext,
  stave: Stave,
  measure: Measure,
  staveNotes: StaveNote[],
  enableColors: boolean,
  noteColor: string,
) {
  const gap = stave.getSpacingBetweenLines();
  const topLineY = stave.getYForLine(0);

  context.save();

  staveNotes.forEach((staveNote, index) => {
    const note = measure.notes[index];

    if (!note.accents?.length) {
      return;
    }

    const ys = staveNote.getYs();
    const wholeChord = note.notes.every((key) => note.accents?.includes(key));

    if (wholeChord) {
      const { x } = staveNote.getModifierStartXY(ModifierPosition.ABOVE, 0);
      const accentClass = accentClassFor(
        note.notes.length === 1 ? note.notes[0] : undefined,
        enableColors,
      );

      drawAccentGlyph(
        context,
        x,
        Math.min(...ys, topLineY) - gap,
        0.5,
        1,
        ACCENT_SCALE,
        accentClass,
        noteColor,
      );

      return;
    }

    note.accents.forEach((key) => {
      const keyIndex = note.notes.indexOf(key);

      if (keyIndex < 0) {
        return;
      }

      const { x } = staveNote.getModifierStartXY(
        ModifierPosition.RIGHT,
        keyIndex,
      );

      drawAccentGlyph(
        context,
        x + gap / 2,
        ys[keyIndex],
        0.2,
        0.5,
        ACCENT_SCALE_RIGHT,
        accentClassFor(key, enableColors),
        noteColor,
      );
    });
  });

  context.restore();
}

function stickingGlyph(limb: StickingLimb): string {
  switch (limb) {
    case 'right-hand':
      return 'R';

    case 'left-hand':
      return 'L';

    case 'right-foot':
      return 'RF';

    case 'left-foot':
      return 'LF';
  }
}

function drawSticking(
  stave: Stave,
  measure: Measure,
  measureIndex: number,
  staveNotes: StaveNote[],
  sticking: StickingData | undefined,
  noteColor: string,
) {
  if (!sticking) {
    return;
  }

  const positioned = stickingNotesForMeasure(
    sticking,
    measureIndex,
    measure.startTick,
    measure.endTick,
    measure.timeSig,
  );
  const byTick = new Map<number, typeof positioned>();

  positioned.forEach((note) => {
    const notes = byTick.get(note.tick) ?? [];

    notes.push(note);
    byTick.set(note.tick, notes);
  });

  staveNotes.forEach((staveNote, noteIndex) => {
    if (staveNote.isRest()) {
      return;
    }

    const note = measure.notes[noteIndex];
    const elements = new Set(
      staveNote
        .getKeys()
        .map((key) => KEY_TO_ELEMENT[key])
        .filter((element): element is string => Boolean(element)),
    );
    const stickingNotes = (byTick.get(note.tick) ?? []).filter((entry) =>
      elements.has(STICKING_LANE_TO_ELEMENT[entry.lane]),
    );
    const glyphParent =
      staveNote.getSVGElement() ??
      staveNote.getStem()?.getSVGElement() ??
      staveNote.noteHeads[0]?.getSVGElement();

    if (!glyphParent || stickingNotes.length === 0) {
      return;
    }

    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    const x = staveNote.getAbsoluteX();
    const handGlyph = stickingNotes
      .filter((entry) => entry.limb.endsWith('-hand'))
      .sort((left) => (left.limb === 'right-hand' ? -1 : 1))
      .map((entry) => stickingGlyph(entry.limb))
      .join('');
    const footGlyph = stickingNotes
      .filter((entry) => entry.limb.endsWith('-foot'))
      .map((entry) => stickingGlyph(entry.limb))
      .join('');
    const handY = stave.getYForBottomText(2);

    group.classList.add('vf-sticking');
    group.setAttribute('data-notation-kind', 'sticking');
    group.setAttribute(
      'data-sticking-limbs',
      stickingNotes.map((entry) => entry.limb).join(' '),
    );
    group.setAttribute('aria-hidden', 'true');

    [
      { glyph: handGlyph, y: handY },
      { glyph: footGlyph, y: handY + STICKING_FOOT_OFFSET },
    ].forEach(({ glyph, y }) => {
      if (!glyph) {
        return;
      }

      const text = document.createElementNS(SVG_NAMESPACE, 'text');

      text.classList.add('vf-sticking-glyph');
      text.setAttribute('x', `${x}`);
      text.setAttribute('y', `${y}`);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.setAttribute('font-size', `${STICKING_FONT_SIZE}`);
      text.setAttribute('font-weight', '800');
      text.setAttribute('letter-spacing', '0.5');
      text.setAttribute('fill', noteColor);
      text.setAttribute('stroke', 'none');
      text.setAttribute('pointer-events', 'none');
      text.textContent = glyph;
      group.appendChild(text);
    });

    glyphParent.appendChild(group);
  });
}

function renderMeasure(
  context: RenderContext,
  measure: Measure,
  index: number,
  xOffset: number,
  yOffset: number,
  width: number,
  endMeasure: boolean,
  showBarNumbers: boolean,
  enableColors: boolean,
  tempoToShow: TempoMark | undefined,
  colors: SheetMusicColors,
  timeAnchors: TimeAnchor[],
  sticking?: StickingData,
) {
  const stave = new Stave(xOffset, yOffset, width);

  if (endMeasure) {
    stave.setEndBarType(Barline.type.END);
  }

  if (measure.hasClef) {
    stave.addClef('percussion');
  }

  if (measure.sigChange) {
    stave.addTimeSignature(`${measure.timeSig[0]}/${measure.timeSig[1]}`);
  }

  if (tempoToShow) {
    stave.setTempo(tempoToShow, 0);
  }

  if (showBarNumbers) {
    stave.setText(`${index + 1}`, ModifierPosition.ABOVE, {
      justification: TextJustification.LEFT,
    });
  }

  stave
    .setStyle({
      fillStyle: colors.stave,
      strokeStyle: colors.stave,
    })
    .setContext(context)
    .draw();

  const { voice, beams, tuplets, staveNotes } = buildVoice(measure);
  const headerOffset = stave.getNoteStartX() - stave.getX();

  voice.setStave(stave).preFormat();

  new Formatter()
    .joinVoices([voice])
    .format([voice], Math.max(1, width - headerOffset - MEASURE_TRAILING_PAD));

  staveNotes.forEach((staveNote, noteIndex) => {
    const tickContext = staveNote.getTickContext();
    const absoluteOffset = staveNote.getAbsoluteX() - tickContext.getX();

    tickContext.setX(
      timeXForTick(measure.notes[noteIndex].tick, timeAnchors) - absoluteOffset,
    );
  });
  voice.draw(context, stave);
  beams.forEach((beam) => {
    beam.setContext(context).draw();
  });
  tuplets.forEach((tuplet) => {
    tuplet.setContext(context).draw();
  });

  if (index > 0 && tempoToShow) {
    drawTempoSeam(context, stave, colors.note);
  }

  applyNoteClasses(staveNotes, enableColors);
  annotateNotation(staveNotes, measure);
  drawAccents(context, stave, measure, staveNotes, enableColors, colors.note);
  drawSticking(stave, measure, index, staveNotes, sticking, colors.note);

  const renderedNotes = staveNotes.map((staveNote, i) => ({
    tick: measure.notes[i].tick,
    note: staveNote,
    accents: measure.notes[i].accents,
    ghosts: measure.notes[i].ghosts,
  }));

  return { stave, renderedNotes };
}

function drawTempoSeam(context: RenderContext, stave: Stave, color: string) {
  const group = context.openGroup('tempo-seam') as SVGGElement;

  group.classList.add('vf-tempo-seam');
  group.setAttribute('data-notation-kind', 'tempo-seam');
  context.save();
  context.setStrokeStyle(color);
  context.setLineWidth(2);
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(stave.getX(), stave.getY() - 10);
  context.lineTo(stave.getX(), stave.getY() + stave.getHeight() + 10);
  context.stroke();
  context.restore();
  context.closeGroup();
}
