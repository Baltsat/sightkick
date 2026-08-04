import { StaveNote } from 'vexflow';
import { ParsedChart, RenderData } from '../../../chart-parser/types';
import { InputElement } from '../../../types';
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
  NotePos,
} from './types';
import {
  ACTIVE_CLASS,
  HIDDEN_CLASS,
  HIT_CLASS,
  KEY_TO_ELEMENT,
  KIT_SHORT_LABEL,
  MISS_CLASS,
  MISS_MARKER_CLASS,
  MISS_MARKER_Y_OFFSET,
  MISSED_CLASS,
  POP_CLASS,
  WRONG_HIT_MARKER_CLASS,
} from './constants';
import {
  flashClass,
  forEachNoteHead,
  getScrollParent,
  keyPrefix,
  samePos,
} from './helpers';

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
  private activeEls: SVGElement[] = [];
  private filledEls = new Set<SVGElement>();
  private vanishedNotes = new Map<StaveNote, SVGElement[]>();
  private missMarkers = new Map<string, HTMLElement>();
  private wrongHitMarkers: { tick: number; el: HTMLElement }[] = [];

  constructor(private isHit: IsHit) {}

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

  render(chartTime: number, tick: number): void {
    this.syncMeasure(tick);
    this.syncActiveNote(tick);
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

    const tick = entry.tick;
    const allHit = note
      .getKeys()
      .every((key) => this.isHit(tick, keyPrefix(key)));

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
    marker.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

    const label = record.element ? KIT_SHORT_LABEL[record.element] : undefined;
    const displayName = record.element
      ? KIT_ELEMENTS.get(record.element)?.displayName
      : undefined;

    marker.textContent = label ?? '?';

    if (displayName) {
      marker.title = `Wrong hit: ${displayName}`;
    }

    overlay.appendChild(marker);
    this.wrongHitMarkers.push({ tick: record.tick, el: marker });
  }

  reset(): void {
    this.measureIdx = -1;
    this.activePos = undefined;
    this.coloredPos = undefined;
    this.scrollContainer = undefined;
    this.cursorShown = false;
    this.cursorHeight = -1;
    this.activeEls.forEach((el) => el.classList.remove(ACTIVE_CLASS));
    this.activeEls = [];
    this.filledEls.forEach((el) =>
      el.classList.remove(HIT_CLASS, MISSED_CLASS),
    );
    this.filledEls.clear();
    this.vanishedNotes.forEach((els) =>
      els.forEach((el) => el.classList.remove(HIDDEN_CLASS)),
    );
    this.vanishedNotes.clear();
    this.missMarkers.forEach((marker) => marker.remove());
    this.missMarkers.clear();
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

  private syncActiveNote(tick: number): void {
    const pos = this.locateActiveNote(tick);

    if (samePos(pos, this.activePos)) {
      return;
    }

    this.activePos = pos;

    const target = pos ? this.toActiveNote(pos) : undefined;

    this.applyActive(target);
    this.applyColoring(target, tick);
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
  ): void {
    const clearAll = () => {
      this.filledEls.forEach((el) => {
        el.classList.remove(HIT_CLASS, MISSED_CLASS);
      });
      this.filledEls.clear();
      this.vanishedNotes.forEach((els) =>
        els.forEach((el) => el.classList.remove(HIDDEN_CLASS)),
      );
      this.vanishedNotes.clear();
      this.missMarkers.forEach((marker) => marker.remove());
      this.missMarkers.clear();
    };

    if (!target) {
      clearAll();
      this.coloredPos = undefined;

      return;
    }

    const { measureIdx, noteIdx } = target;
    const curNotes = this.renderData[measureIdx].renderedNotes;
    const prev = this.coloredPos;
    const isBackward =
      prev !== undefined &&
      (measureIdx < prev.measureIdx ||
        (measureIdx === prev.measureIdx && noteIdx < prev.noteIdx));
    const flashMisses = !isBackward;
    const colorNote = (
      el: SVGElement,
      tick: number,
      key: string,
      isRest: boolean,
    ) => {
      const hit = this.isHit(tick, key);

      el.classList.remove(hit ? MISSED_CLASS : HIT_CLASS);
      el.classList.add(hit ? HIT_CLASS : MISSED_CLASS);
      this.filledEls.add(el);

      if (flashMisses && !hit && !isRest) {
        flashClass(el, MISS_CLASS);
      }
    };
    const walkNote = (mIdx: number, note: StaveNote, tick: number) => {
      const isRest = note.isRest();

      forEachNoteHead(note, (el, key) => colorNote(el, tick, key, isRest));
      this.syncNoteState(mIdx, note, tick, isRest);
    };

    if (isBackward) {
      this.pruneWrongHitMarkers(currentTick);
      clearAll();

      for (let m = 0; m < measureIdx; m++) {
        this.renderData[m]?.renderedNotes.forEach(({ note, tick }) =>
          walkNote(m, note, tick),
        );
      }

      for (let i = 0; i < noteIdx; i++) {
        const { note, tick } = curNotes[i];

        walkNote(measureIdx, note, tick);
      }
    } else {
      const fromMeasure = prev?.measureIdx ?? 0;
      const fromNote = prev?.noteIdx ?? 0;

      if (fromMeasure === measureIdx) {
        for (let i = fromNote; i < noteIdx; i++) {
          const { note, tick } = curNotes[i];

          walkNote(measureIdx, note, tick);
        }
      } else {
        const prevMeasureNotes =
          this.renderData[fromMeasure]?.renderedNotes ?? [];

        for (let i = fromNote; i < prevMeasureNotes.length; i++) {
          const { note, tick } = prevMeasureNotes[i];

          walkNote(fromMeasure, note, tick);
        }

        for (let m = fromMeasure + 1; m < measureIdx; m++) {
          this.renderData[m]?.renderedNotes.forEach(({ note, tick }) =>
            walkNote(m, note, tick),
          );
        }

        for (let i = 0; i < noteIdx; i++) {
          const { note, tick } = curNotes[i];

          walkNote(measureIdx, note, tick);
        }
      }
    }

    this.coloredPos = { measureIdx, noteIdx };
  }

  /**
   * Keeps the whole-note vanish state and the persistent miss markers in
   * sync with the Judge's current hit state for a single passed note, in
   * both playback directions. Vanishing here (rather than only from
   * `paintHit`) is what restores a note's visibility when the engine seeks
   * backward past its hit tick (the Judge un-records the hit, so this note
   * exits the "fully hit" state the next time it's walked).
   */
  private syncNoteState(
    measureIdx: number,
    note: StaveNote,
    tick: number,
    isRest: boolean,
  ): void {
    if (isRest) {
      return;
    }

    const keys = note.getKeys();
    const allHit = keys.every((key) => this.isHit(tick, keyPrefix(key)));

    if (allHit) {
      this.vanishNote(note);
    } else {
      this.unvanishNote(note);
    }

    keys.forEach((key) => {
      const prefix = keyPrefix(key);

      if (this.isHit(tick, prefix)) {
        this.clearMissMarker(tick, prefix);
      } else {
        this.showMissMarker(measureIdx, tick, prefix);
      }
    });
  }

  private vanishNote(note: StaveNote): void {
    if (this.vanishedNotes.has(note)) {
      return;
    }

    const els = getNoteGlyphElements(note);

    els.forEach((el) => el.classList.add(HIDDEN_CLASS));
    this.vanishedNotes.set(note, els);
  }

  private unvanishNote(note: StaveNote): void {
    const els = this.vanishedNotes.get(note);

    if (!els) {
      return;
    }

    els.forEach((el) => el.classList.remove(HIDDEN_CLASS));
    this.vanishedNotes.delete(note);
  }

  private missMarkerKey(tick: number, prefix: string): string {
    return `${tick}:${prefix}`;
  }

  private showMissMarker(
    measureIdx: number,
    tick: number,
    prefix: string,
  ): void {
    const key = this.missMarkerKey(tick, prefix);

    if (this.missMarkers.has(key) || !this.overlayEl) {
      return;
    }

    const measureData = this.renderData[measureIdx];

    if (!measureData) {
      return;
    }

    const element = KEY_TO_ELEMENT[prefix] as InputElement | undefined;
    const meta = element ? KIT_ELEMENTS.get(element) : undefined;
    const x = getXForTick(tick, measureData);
    const y =
      measureData.yOffset + measureData.stave.getY() - MISS_MARKER_Y_OFFSET;
    const marker = document.createElement('div');

    marker.className = MISS_MARKER_CLASS;
    marker.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;

    if (meta) {
      marker.style.backgroundColor = meta.color;
      marker.title = `Missed: ${meta.displayName}`;
    }

    marker.textContent = (element && KIT_SHORT_LABEL[element]) ?? '?';

    this.overlayEl.appendChild(marker);
    this.missMarkers.set(key, marker);
  }

  private clearMissMarker(tick: number, prefix: string): void {
    const key = this.missMarkerKey(tick, prefix);
    const marker = this.missMarkers.get(key);

    if (!marker) {
      return;
    }

    marker.remove();
    this.missMarkers.delete(key);
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
