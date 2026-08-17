import { StaveNote } from 'vexflow';
import { ParsedChart, RenderData } from '../../../chart-parser/types';
import { PlayheadStyle } from '../../types';
import { KIT_ELEMENTS } from '../../constants';
import {
  getCursorX,
  getNoteGlyphElements,
  getNoteSvg,
  getXForTick,
} from './cursor-geometry';
import {
  ActiveNote,
  FalseHitRecord,
  GameRendererContext,
  GameRendererRefs,
  IsHit,
  IsMissed,
  NotePos,
} from './types';
import {
  ACTIVE_CLASS,
  HIDDEN_CLASS,
  HIT_CLASS,
  isHihatPedalControl,
  MISS_CLASS,
  MISSED_CLASS,
  POP_CLASS,
  WRONG_HIT_FADE_DELAY_SECONDS,
  WRONG_HIT_FADE_DURATION_SECONDS,
  WRONG_HIT_MARKER_CLASS,
  WRONG_HIT_MIN_OPACITY,
} from './constants';
import {
  flashClass,
  forEachNoteHead,
  getScrollParent,
  keyPrefix,
  samePos,
} from './helpers';

// Wrong-hit markers land close together (e.g. two mis-hits a few ticks
// apart) draw a stack of separate × glyphs rather than letting them
// overlap into an unreadable blob. STACK_THRESHOLD_PX decides when two
// markers count as "close"; STACK_OFFSET_PX is the vertical step used to
// fan them out, alternating above/below the strike line as more land.
const WRONG_HIT_STACK_THRESHOLD_PX = 12;
const WRONG_HIT_STACK_OFFSET_PX = 10;

function restoreGlyph(el: SVGElement): void {
  el.classList.remove(HIDDEN_CLASS);
  el.removeAttribute('hidden');
  el.style.removeProperty('display');
  el.style.removeProperty('visibility');
  el.style.removeProperty('opacity');
}

function restoreNote(note: StaveNote): void {
  const elements = new Set([
    ...getNoteGlyphElements(note),
    ...getNoteSvg(note),
  ]);

  elements.forEach(restoreGlyph);
}

export class GameRenderer {
  private chart: ParsedChart | undefined;
  private renderData: RenderData[] = [];
  private playheadStyle: PlayheadStyle = 'Cursor';
  private cursorEl: HTMLElement | undefined;
  private cursorShown = false;
  private cursorHeight = -1;
  private highlightEls: (HTMLElement | undefined)[] = [];
  private overlayEl: HTMLElement | undefined;
  private scrollContainer: HTMLElement | undefined;
  private measureIdx = -1;
  private activePos: NotePos | undefined;
  private coloredPos: NotePos | undefined;
  private endResolved = false;
  private activeEls: SVGElement[] = [];
  private filledEls = new Set<SVGElement>();
  private vanishedNotes = new Map<StaveNote, SVGElement[]>();
  private wrongHitMarkers: {
    tick: number;
    timeSeconds: number;
    x: number;
    el: HTMLElement;
  }[] = [];

  constructor(
    private isHit: IsHit,
    private isMissed: IsMissed = () => false,
  ) {}

  setContext(context: GameRendererContext): void {
    const renderDataChanged = this.renderData !== context.renderData;

    this.chart = context.chart;
    this.renderData = context.renderData;

    if (renderDataChanged) {
      this.reset();
    }
  }

  setSettings(playheadStyle: PlayheadStyle): void {
    this.playheadStyle = playheadStyle;
    this.activePos = undefined;
    this.coloredPos = undefined;

    if (this.measureIdx >= 0) {
      this.updateHighlight(this.measureIdx);
    }
  }

  setRefs(refs: GameRendererRefs): void {
    this.cursorEl = refs.cursorEl;
    this.highlightEls = refs.highlightEls;
    this.overlayEl = refs.overlayEl;
    this.scrollContainer = undefined;
    this.reset();
  }

  render(chartTime: number, tick: number, isSeek = false): void {
    this.syncMeasure(tick);
    this.syncActiveNote(tick, isSeek);
    this.syncWrongHitMarkerOpacity(chartTime);
    this.updateCursor(chartTime);
  }

  paintHit(pos: NotePos, prefixes: string[]): void {
    const entry = this.renderData[pos.measureIdx]?.renderedNotes[pos.noteIdx];
    const note = entry?.note;

    if (!note) {
      return;
    }

    let lastFlashedEl: SVGElement | undefined;

    note.getKeys().forEach((key, i) => {
      if (!prefixes.includes(keyPrefix(key))) {
        return;
      }

      const el = note.noteHeads[i]?.getSVGElement();

      if (!el) {
        return;
      }

      el.classList.remove(MISSED_CLASS);
      el.classList.add(HIT_CLASS);
      this.filledEls.add(el);
      flashClass(el, POP_CLASS);
      lastFlashedEl = el;
    });

    const allHit = note
      .getKeys()
      .every((key) => this.isHit(entry.tick, keyPrefix(key)));

    if (!allHit) {
      return;
    }

    if (!lastFlashedEl) {
      this.vanishNote(note);

      return;
    }

    lastFlashedEl.addEventListener(
      'animationend',
      () => this.vanishNote(note),
      { once: true },
    );
  }

  paintWrongHit(record: FalseHitRecord): void {
    if (isHihatPedalControl(record.controlId)) {
      return;
    }

    const overlay = this.overlayEl;
    const measureIdx = this.measureIndexForTick(record.tick);
    const measureData =
      measureIdx >= 0 ? this.renderData[measureIdx] : undefined;

    if (!overlay || !measureData) {
      return;
    }

    const x = getXForTick(record.tick, measureData);
    const y =
      measureData.yOffset +
      measureData.stave.getY() +
      measureData.stave.getHeight() / 2;
    const marker = document.createElement('div');

    marker.className = WRONG_HIT_MARKER_CLASS;
    marker.style.opacity = String(
      this.wrongHitMarkerOpacity(record.timeSeconds, record.timeSeconds),
    );

    const stackY = y + this.wrongHitStackOffset(x);

    marker.style.transform = `translate3d(${x}px, ${stackY}px, 0) translate(-50%, -50%)`;

    const displayName = record.element
      ? KIT_ELEMENTS.get(record.element)?.displayName
      : undefined;

    if (displayName) {
      marker.title = `Wrong hit: ${displayName}`;
    }

    overlay.appendChild(marker);
    this.wrongHitMarkers.push({
      tick: record.tick,
      timeSeconds: record.timeSeconds,
      x,
      el: marker,
    });
  }

  /**
   * Vertical offset (in px) for a new wrong-hit × landing at `x`, so that
   * markers struck close together fan out above/below the strike line
   * instead of drawing on top of each other. Markers already at the same
   * x (within WRONG_HIT_STACK_THRESHOLD_PX) push the new one out one more
   * step, alternating sides: 0, +1, -1, +2, -2, ...
   */
  private wrongHitStackOffset(x: number): number {
    const nearby = this.wrongHitMarkers.filter(
      (marker) => Math.abs(marker.x - x) < WRONG_HIT_STACK_THRESHOLD_PX,
    ).length;

    if (nearby === 0) {
      return 0;
    }

    const magnitude = Math.ceil(nearby / 2) * WRONG_HIT_STACK_OFFSET_PX;
    const sign = nearby % 2 === 1 ? 1 : -1;

    return sign * magnitude;
  }

  private syncWrongHitMarkerOpacity(chartTime: number): void {
    this.wrongHitMarkers.forEach(({ timeSeconds, el }) => {
      el.style.opacity = String(
        this.wrongHitMarkerOpacity(chartTime, timeSeconds),
      );
    });
  }

  private wrongHitMarkerOpacity(chartTime: number, markerTime: number): number {
    const progress = Math.min(
      1,
      Math.max(0, chartTime - markerTime - WRONG_HIT_FADE_DELAY_SECONDS) /
        WRONG_HIT_FADE_DURATION_SECONDS,
    );

    return 1 - (1 - WRONG_HIT_MIN_OPACITY) * progress;
  }

  reset(): void {
    this.measureIdx = -1;
    this.activePos = undefined;
    this.coloredPos = undefined;
    this.endResolved = false;
    this.scrollContainer = undefined;
    this.cursorShown = false;
    this.cursorHeight = -1;
    this.activeEls.forEach((el) => el.classList.remove(ACTIVE_CLASS));
    this.activeEls = [];
    this.renderData.forEach(({ renderedNotes }) => {
      renderedNotes.forEach(({ note }) => {
        restoreNote(note);
        forEachNoteHead(note, (el) => {
          el.classList.remove(HIT_CLASS, MISSED_CLASS, POP_CLASS, MISS_CLASS);
        });
      });
    });
    this.filledEls.clear();
    this.vanishedNotes.clear();
    this.wrongHitMarkers.forEach(({ el }) => el.remove());
    this.wrongHitMarkers = [];
  }

  private syncMeasure(tick: number): void {
    const idx = this.seekMeasure(tick);

    if (idx < 0 || idx === this.measureIdx) {
      return;
    }

    this.measureIdx = idx;
    this.updateHighlight(idx);
    this.updateScroll(idx);
  }

  private seekMeasure(tick: number): number {
    const rd = this.renderData;

    if (rd.length === 0) {
      return -1;
    }

    let idx =
      this.measureIdx < 0 ? 0 : Math.min(this.measureIdx, rd.length - 1);

    while (idx + 1 < rd.length && tick >= rd[idx + 1].measure.startTick) {
      idx++;
    }

    while (idx > 0 && tick < rd[idx].measure.startTick) {
      idx--;
    }

    const { measure } = rd[idx];

    return tick >= measure.startTick && tick < measure.endTick ? idx : -1;
  }

  private syncActiveNote(tick: number, isSeek: boolean): void {
    const pos = this.locateActiveNote(tick);
    const atEnd = this.isChartEnded(tick);
    // A seek must reconcile even when it lands on the same NotePos as
    // before (the Judge's hit state may have been rewound underneath us —
    // see engine.ts's onSeek). Reaching/passing the end of the chart needs
    // the same one-time forced pass so the final note gets resolved, since
    // there is no "next" note to trigger it normally; `endResolved` keeps
    // that from re-running on every subsequent frame while parked there.
    const forceSync = isSeek || (atEnd && !this.endResolved);

    this.endResolved = atEnd;

    if (!forceSync && samePos(pos, this.activePos)) {
      return;
    }

    this.activePos = pos;

    const target = pos ? this.toActiveNote(pos) : undefined;

    this.applyActive(target);
    this.applyColoring(target, tick, isSeek, atEnd);
  }

  private isChartEnded(tick: number): boolean {
    const rd = this.renderData;

    return rd.length > 0 && tick >= rd[rd.length - 1].measure.endTick;
  }

  private locateActiveNote(tick: number): NotePos | undefined {
    const mIdx = this.measureIdx;

    if (mIdx < 0) {
      return undefined;
    }

    const notes = this.renderData[mIdx]?.renderedNotes;

    if (!notes) {
      return undefined;
    }

    let nIdx =
      this.activePos?.measureIdx === mIdx ? this.activePos.noteIdx : -1;

    while (nIdx + 1 < notes.length && notes[nIdx + 1].tick <= tick) {
      nIdx++;
    }

    while (nIdx >= 0 && notes[nIdx].tick > tick) {
      nIdx--;
    }

    return nIdx < 0 ? undefined : { measureIdx: mIdx, noteIdx: nIdx };
  }

  private toActiveNote(pos: NotePos): ActiveNote | undefined {
    const note =
      this.renderData[pos.measureIdx].renderedNotes[pos.noteIdx].note;
    const noteHeadEls = getNoteSvg(note);

    return noteHeadEls.length === 0 ? undefined : { ...pos, noteHeadEls };
  }

  private applyActive(target: ActiveNote | undefined): void {
    this.activeEls.forEach((el) => el.classList.remove(ACTIVE_CLASS));
    this.activeEls = target?.noteHeadEls ?? [];
    this.activeEls.forEach((el) => el.classList.add(ACTIVE_CLASS));
  }

  private applyColoring(
    target: ActiveNote | undefined,
    currentTick: number,
    isSeek: boolean,
    atEnd: boolean,
  ): void {
    const clearAll = () => {
      this.filledEls.forEach((el) => {
        el.classList.remove(HIT_CLASS, MISSED_CLASS);
      });
      this.filledEls.clear();
      this.vanishedNotes.forEach((els) => els.forEach(restoreGlyph));
      this.vanishedNotes.clear();
    };

    if (!target) {
      clearAll();
      this.coloredPos = undefined;

      return;
    }

    const { measureIdx, noteIdx } = target;
    const curNotes = this.renderData[measureIdx].renderedNotes;
    const prev = this.coloredPos;
    const isPositionBackward =
      prev !== undefined &&
      (measureIdx < prev.measureIdx ||
        (measureIdx === prev.measureIdx && noteIdx < prev.noteIdx));
    // A seek forces the same full clear-and-replay reconciliation as an
    // actual backward jump in NotePos, even when the active note itself
    // didn't move: the engine may have rewound the Judge's hit state past
    // this point (engine.ts's onSeek -> judge.rewindTo), and that has to
    // be reflected in the notes/markers we already walked.
    const isBackward = isSeek || isPositionBackward;
    const flashMisses = !isBackward;
    // At (or past) the end of the chart there's no "next" note whose
    // activation would normally walk and resolve this one, so fold the
    // active note itself into its own walk range to give it the same
    // persistent miss/vanish treatment as any other passed note.
    const endExclusive = atEnd ? noteIdx + 1 : noteIdx;
    const colorNote = (
      el: SVGElement,
      tick: number,
      key: string,
      isRest: boolean,
    ) => {
      const hit = this.isHit(tick, key);
      const missed = !hit && this.isMissed(tick, key);
      const wasMissed = el.classList.contains(MISSED_CLASS);

      el.classList.toggle(HIT_CLASS, hit);
      el.classList.toggle(MISSED_CLASS, missed);

      if (hit || missed) {
        this.filledEls.add(el);
      } else {
        this.filledEls.delete(el);
      }

      if (flashMisses && missed && !wasMissed && !isRest) {
        flashClass(el, MISS_CLASS);
      }
    };
    const walkNote = (note: StaveNote, tick: number) => {
      const isRest = note.isRest();

      forEachNoteHead(note, (el, key) => colorNote(el, tick, key, isRest));
      this.syncNoteState(note, tick, isRest);
    };

    if (isBackward) {
      this.pruneWrongHitMarkers(currentTick);
      clearAll();

      for (let m = 0; m < measureIdx; m++) {
        this.renderData[m]?.renderedNotes.forEach(({ note, tick }) =>
          walkNote(note, tick),
        );
      }

      for (let i = 0; i < endExclusive; i++) {
        const { note, tick } = curNotes[i];

        walkNote(note, tick);
      }
    } else {
      const fromMeasure = prev?.measureIdx ?? 0;
      const fromNote = prev?.noteIdx ?? 0;

      if (fromMeasure === measureIdx) {
        for (let i = fromNote; i < endExclusive; i++) {
          const { note, tick } = curNotes[i];

          walkNote(note, tick);
        }
      } else {
        const prevMeasureNotes =
          this.renderData[fromMeasure]?.renderedNotes ?? [];

        for (let i = fromNote; i < prevMeasureNotes.length; i++) {
          const { note, tick } = prevMeasureNotes[i];

          walkNote(note, tick);
        }

        for (let m = fromMeasure + 1; m < measureIdx; m++) {
          this.renderData[m]?.renderedNotes.forEach(({ note, tick }) =>
            walkNote(note, tick),
          );
        }

        for (let i = 0; i < endExclusive; i++) {
          const { note, tick } = curNotes[i];

          walkNote(note, tick);
        }
      }
    }

    this.coloredPos = { measureIdx, noteIdx };
  }

  private syncNoteState(note: StaveNote, tick: number, isRest: boolean): void {
    if (isRest) {
      return;
    }

    const allHit = note
      .getKeys()
      .every((key) => this.isHit(tick, keyPrefix(key)));

    if (allHit) {
      this.vanishNote(note);
    } else {
      this.unvanishNote(note);
    }
  }

  private vanishNote(note: StaveNote): void {
    if (this.vanishedNotes.has(note)) {
      return;
    }

    const elements = getNoteGlyphElements(note);

    elements.forEach((el) => el.classList.add(HIDDEN_CLASS));
    this.vanishedNotes.set(note, elements);
  }

  private unvanishNote(note: StaveNote): void {
    const elements = this.vanishedNotes.get(note);

    if (!elements) {
      return;
    }

    elements.forEach(restoreGlyph);
    this.vanishedNotes.delete(note);
  }

  private pruneWrongHitMarkers(currentTick: number): void {
    this.wrongHitMarkers = this.wrongHitMarkers.filter(({ tick, el }) => {
      if (tick >= currentTick) {
        el.remove();

        return false;
      }

      return true;
    });
  }

  private measureIndexForTick(tick: number): number {
    return this.renderData.findIndex(
      ({ measure }) => tick >= measure.startTick && tick < measure.endTick,
    );
  }

  private updateHighlight(index: number): void {
    this.highlightEls.forEach((el, i) => {
      if (!el) {
        return;
      }

      const on = this.playheadStyle === 'Measure' && i === index;

      el.style.backgroundColor = on ? 'var(--color-accent-soft-bg)' : '';
      el.style.border = on ? '2px solid var(--color-accent-bright)' : '';
      el.toggleAttribute('data-current', on);
    });
  }

  private updateCursor(chartTime: number): void {
    const el = this.cursorEl;

    if (!el) {
      return;
    }

    const measureData = this.renderData[this.measureIdx];

    if (this.playheadStyle !== 'Cursor' || !this.chart || !measureData) {
      el.style.display = 'none';
      this.cursorShown = false;

      return;
    }

    const x = getCursorX(chartTime, this.chart, measureData);
    const y = measureData.yOffset + measureData.stave.getY();
    const height = measureData.stave.getHeight() + 30;

    el.style.transform = `translate3d(${x}px, ${y}px, 0) translateX(-50%)`;

    if (height !== this.cursorHeight) {
      el.style.height = `${height}px`;
      this.cursorHeight = height;
    }

    if (!this.cursorShown) {
      el.style.display = '';
      this.cursorShown = true;
    }
  }

  private updateScroll(index: number): void {
    const el = this.highlightEls[index];

    if (!el) {
      return;
    }

    const container =
      this.scrollContainer ?? (this.scrollContainer = getScrollParent(el));

    if (!container) {
      return;
    }

    const elRect = el.getBoundingClientRect();
    const parentRect = container.getBoundingClientRect();
    const margin = parentRect.height * 0.25;
    const outOfView =
      elRect.top < parentRect.top + margin ||
      elRect.bottom > parentRect.bottom - margin;

    if (outOfView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
