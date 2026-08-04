import { clamp } from 'es-toolkit';
import { StaveNote } from 'vexflow';
import { ParsedChart, RenderData } from '../../../chart-parser/types';
import { secondsToTicks } from '../../../chart-parser/timing';

/**
 * Interpolates the horizontal position of an arbitrary tick within a measure,
 * following the same note-to-note (or, for rest-only measures, start-to-end)
 * interpolation `getCursorX` uses for "now". Exported so callers that need the
 * X position of a tick that isn't the current playhead (e.g. a wrong-hit
 * marker) can reuse the exact same geometry.
 */
export function getXForTick(tick: number, measureData: RenderData): number {
  const { measure, stave, renderedNotes } = measureData;

  if (renderedNotes.every((note) => note.note.isRest())) {
    const normalizedTick =
      (tick - measure.startTick) / (measure.endTick - measure.startTick);
    const progress = clamp(normalizedTick, 0, 1);

    return stave.getX() + progress * stave.getWidth();
  } else {
    let currentNoteIdx = -1;

    for (let i = 0; i < renderedNotes.length; i++) {
      if (renderedNotes[i].tick <= tick) {
        currentNoteIdx = i;
      } else {
        break;
      }
    }

    if (currentNoteIdx === -1) {
      return renderedNotes[0].note.getAbsoluteX();
    } else {
      const currentNote = renderedNotes[currentNoteIdx];
      const nextNote = renderedNotes[currentNoteIdx + 1];
      const currentNoteX = currentNote.note.getAbsoluteX();

      if (!nextNote) {
        const ticksLeft = measure.endTick - currentNote.tick;
        const staveRight = stave.getX() + stave.getWidth();

        if (ticksLeft <= 0) {
          return currentNoteX;
        }

        const progress = clamp((tick - currentNote.tick) / ticksLeft, 0, 1);

        return currentNoteX + progress * (staveRight - currentNoteX);
      } else {
        return (
          currentNoteX +
          ((tick - currentNote.tick) / (nextNote.tick - currentNote.tick)) *
            (nextNote.note.getAbsoluteX() - currentNoteX)
        );
      }
    }
  }
}

export function getCursorX(
  currentTime: number,
  chart: ParsedChart,
  measureData: RenderData,
) {
  const currentTick = secondsToTicks(
    currentTime,
    chart.resolution,
    chart.tempos,
  );

  return getXForTick(currentTick, measureData);
}

export function getNoteSvg(note: StaveNote) {
  return note.noteHeads
    .map((nh) => nh.getSVGElement())
    .filter((el): el is SVGElement => el !== null && el !== undefined);
}

/**
 * Resolves the SVG element(s) that make up a note's full glyph, for hiding it
 * entirely (notehead + stem + flag), not just the notehead fill.
 *
 * Prefers the note's own group element (VexFlow's `StaveNote.draw()` wraps
 * ledger lines, stem, noteheads and flag in a single `ctx.openGroup('stavenote', ...)`
 * group, and `getSVGElement()` — inherited from VexFlow's `Element` base class —
 * resolves it by id). Beams are drawn as separate elements outside this group,
 * so hiding it never touches a beam shared with neighbouring notes.
 *
 * Falls back to the individual notehead + stem elements when the group isn't
 * available (e.g. defensively-typed test doubles), since VexFlow's `flag` is
 * a protected property with no public accessor.
 */
export function getNoteGlyphElements(note: StaveNote): SVGElement[] {
  const group = note.getSVGElement?.();

  if (group) {
    return [group];
  }

  const stemEl = note.getStem?.()?.getSVGElement?.();

  return stemEl ? [...getNoteSvg(note), stemEl] : getNoteSvg(note);
}
