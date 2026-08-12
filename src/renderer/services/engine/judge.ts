import { Measure, ParsedChart } from '../../../chart-parser/types';
import { InputElement, InputMapping } from '../../../types';
import { InputEvent } from '../../input/types';
import { secondsToTicks, ticksToSeconds } from '../../../chart-parser/timing';
import {
  FalseHitRecord,
  JudgeContext,
  JudgeFalseHitHandler,
  JudgeHitHandler,
  NoteEntry,
  ResolvedJudgement,
  ResolvedJudgementHandler,
} from './types';
import {
  ACCENT_VALUE_THRESHOLD,
  ELEMENT_TO_KEYS,
  GHOST_VALUE_THRESHOLD,
  HIT_TOLERANCE_SECONDS,
  KEY_TO_ELEMENT,
} from './constants';
import { keyPrefix } from './helpers';
import { lowerBound } from '../../helpers';

export class Judge {
  private chart: ParsedChart | undefined;
  private measures: Measure[] = [];
  private noteIndex: NoteEntry[] = [];
  private mapping: InputMapping = {};
  private enabled = false;
  private currentTick: number | undefined;
  private hits = new Map<number, Set<string>>();
  private hitTotal = 0;
  private falseHitTicks: number[] = [];
  private hitListeners = new Set<JudgeHitHandler>();
  private falseHitListeners = new Set<JudgeFalseHitHandler>();
  private judgementListeners = new Set<ResolvedJudgementHandler>();
  private resolvedMisses = new Map<number, Set<string>>();
  private nextResolveIndex = 0;
  private wrongJudgementSequence = 0;
  private latencyMs = 0;
  private hitToleranceSeconds = HIT_TOLERANCE_SECONDS;
  private preferUnhitNotes = false;

  setContext(context: JudgeContext): void {
    const chartChanged = this.chart !== context.chart;
    const measuresChanged = this.measures !== context.measures;

    this.chart = context.chart;
    this.mapping = context.mapping;
    this.measures = context.measures;

    if (context.hitToleranceSeconds !== undefined) {
      this.hitToleranceSeconds = context.hitToleranceSeconds;
    }

    this.preferUnhitNotes = context.preferUnhitNotes ?? false;

    if (measuresChanged) {
      this.buildNoteIndex();
    }

    if (chartChanged) {
      this.reset();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setTick(tick: number | undefined): void {
    this.currentTick = tick;
  }

  setLatencyMs(ms: number): void {
    this.latencyMs = ms;
  }

  rewindTo(tick: number): void {
    for (const [hitTick, prefixes] of this.hits) {
      if (hitTick >= tick) {
        this.hitTotal -= prefixes.size;
        this.hits.delete(hitTick);
      }
    }

    this.falseHitTicks = this.falseHitTicks.filter((t) => t < tick);

    for (const missTick of this.resolvedMisses.keys()) {
      if (missTick >= tick) {
        this.resolvedMisses.delete(missTick);
      }
    }

    this.nextResolveIndex = this.firstNoteAtOrAfter(tick);
    this.currentTick = tick;
  }

  onHit(listener: JudgeHitHandler): () => void {
    this.hitListeners.add(listener);

    return () => {
      this.hitListeners.delete(listener);
    };
  }

  onFalseHit(listener: JudgeFalseHitHandler): () => void {
    this.falseHitListeners.add(listener);

    return () => {
      this.falseHitListeners.delete(listener);
    };
  }

  onJudgement(listener: ResolvedJudgementHandler): () => void {
    this.judgementListeners.add(listener);

    return () => {
      this.judgementListeners.delete(listener);
    };
  }

  isHit(tick: number, prefix: string): boolean {
    return this.hits.get(tick)?.has(prefix) ?? false;
  }

  isMissed(tick: number, prefix: string): boolean {
    return this.resolvedMisses.get(tick)?.has(prefix) ?? false;
  }

  get hitCount(): number {
    return this.hitTotal;
  }

  get falseHitCount(): number {
    return this.falseHitTicks.length;
  }

  reset(): void {
    this.hits.clear();
    this.hitTotal = 0;
    this.falseHitTicks = [];
    this.resolvedMisses.clear();
    this.nextResolveIndex = 0;
    this.wrongJudgementSequence = 0;
  }

  private buildNoteIndex(): void {
    const index: NoteEntry[] = [];

    this.measures.forEach((measure, measureIdx) => {
      measure.notes.forEach((note, noteIdx) => {
        if (!note.isRest) {
          index.push({ tick: note.tick, note, pos: { measureIdx, noteIdx } });
        }
      });
    });

    index.sort((a, b) => a.tick - b.tick);
    this.noteIndex = index;
    this.nextResolveIndex = 0;
  }

  private firstNoteAtOrAfter(tick: number): number {
    return lowerBound(
      this.noteIndex.length,
      (index) => this.noteIndex[index].tick >= tick,
    );
  }

  private recordHit(tick: number, prefix: string): void {
    let prefixes = this.hits.get(tick);

    if (!prefixes) {
      prefixes = new Set();
      this.hits.set(tick, prefixes);
    }

    if (!prefixes.has(prefix)) {
      prefixes.add(prefix);
      this.hitTotal += 1;
    }
  }

  private containingMeasure(tick: number): Measure | undefined {
    const firstAfter = lowerBound(
      this.measures.length,
      (index) => this.measures[index].startTick > tick,
    );
    const candidate = this.measures[firstAfter - 1];

    if (candidate && tick >= candidate.startTick && tick < candidate.endTick) {
      return candidate;
    }

    return undefined;
  }

  private containingMeasureIndex(tick: number): number | undefined {
    const firstAfter = lowerBound(
      this.measures.length,
      (index) => this.measures[index].startTick > tick,
    );
    const index = firstAfter - 1;
    const candidate = this.measures[index];

    if (candidate && tick >= candidate.startTick && tick < candidate.endTick) {
      return index;
    }

    return undefined;
  }

  private emitJudgement(judgement: ResolvedJudgement): void {
    this.judgementListeners.forEach((listener) => listener(judgement));
  }

  private noteJudgementId(tick: number, prefix: string): string {
    return `note:${tick}:${prefix}`;
  }

  /**
   * Resolve expected note heads whose normal late-hit window has closed.
   * Call this only for ordinary playback progress, never an administrative
   * seek. `rawTick` is the uncompensated transport position; latency is
   * applied here in the same direction as it is in handleInput.
   */
  resolveThrough(rawTick: number): void {
    const chart = this.chart;

    if (!chart) {
      return;
    }

    const compensatedTick = this.compensateLatency(rawTick, chart);
    const currentTimeSeconds = ticksToSeconds(
      compensatedTick,
      chart.resolution,
      chart.tempos,
    );
    const cutoffSeconds = currentTimeSeconds - this.hitToleranceSeconds;

    this.resolveUntil(cutoffSeconds, chart);
  }

  /** Resolve the chart tail before the run-complete evidence snapshot. */
  resolveAll(): void {
    if (!this.chart) {
      return;
    }

    this.resolveUntil(Number.POSITIVE_INFINITY, this.chart);
  }

  private resolveUntil(cutoffSeconds: number, chart: ParsedChart): void {
    while (this.nextResolveIndex < this.noteIndex.length) {
      const entry = this.noteIndex[this.nextResolveIndex];
      const expectedTimeSeconds = ticksToSeconds(
        entry.tick,
        chart.resolution,
        chart.tempos,
      );

      if (expectedTimeSeconds > cutoffSeconds) {
        break;
      }

      entry.note.notes.map(keyPrefix).forEach((prefix) => {
        if (
          this.isHit(entry.tick, prefix) ||
          this.resolvedMisses.get(entry.tick)?.has(prefix)
        ) {
          return;
        }

        let prefixes = this.resolvedMisses.get(entry.tick);

        if (!prefixes) {
          prefixes = new Set();
          this.resolvedMisses.set(entry.tick, prefixes);
        }

        prefixes.add(prefix);
        this.emitJudgement({
          id: this.noteJudgementId(entry.tick, prefix),
          verdict: 'miss',
          expectedTick: entry.tick,
          expectedElement: KEY_TO_ELEMENT[prefix],
          measureIndex: entry.pos.measureIdx,
          scoreable: true,
        });
      });

      this.nextResolveIndex += 1;
    }
  }

  private isInSilentRegion(tick: number): boolean {
    const containing = this.containingMeasure(tick);

    if (!containing) {
      return true;
    }

    return containing.notes.every((note) => note.isRest);
  }

  private hasScoreableNoteNear(tick: number, toleranceTicks: number): boolean {
    const entry =
      this.noteIndex[this.firstNoteAtOrAfter(tick - toleranceTicks)];

    return entry !== undefined && entry.tick <= tick + toleranceTicks;
  }

  private resolveElement(controlId: string): InputElement | undefined {
    return (Object.keys(this.mapping) as (keyof InputMapping)[]).find(
      (element) => this.mapping[element]?.includes(controlId),
    );
  }

  private compensateLatency(rawTick: number, chart: ParsedChart): number {
    if (this.latencyMs === 0) {
      return rawTick;
    }

    const rawTimeS = ticksToSeconds(rawTick, chart.resolution, chart.tempos);
    const adjustedTimeS = rawTimeS - this.latencyMs / 1000;

    return secondsToTicks(adjustedTimeS, chart.resolution, chart.tempos);
  }

  private maybeRecordFalseHit(
    tick: number,
    toleranceTicks: number,
    controlId: string,
    timeSeconds: number,
    expected: NoteEntry | undefined,
  ): void {
    // Visual honesty vs. scoring lenience: a wrong hit is shown at the
    // timing it was struck, unqualified — the player sees exactly what
    // they did, silent region or not. Scoring stays lenient: a hit inside
    // a silent (rest-only) region only counts against the score when it
    // lands close enough to a real note to plausibly be a miss-hit, so a
    // warm-up tap in a quiet stretch doesn't tank the score even though it
    // still renders a marker. A hit with no containing measure at all
    // (before the first measure / after the last) has nowhere to anchor a
    // marker, so it's dropped entirely either way.
    const scoreable =
      !this.isInSilentRegion(tick) ||
      this.hasScoreableNoteNear(tick, toleranceTicks);

    if (scoreable) {
      this.falseHitTicks.push(tick);
    }

    if (!scoreable && !this.containingMeasure(tick)) {
      return;
    }

    const actualElement = this.resolveElement(controlId);
    const expectedPrefixes = expected?.note.notes.map(keyPrefix) ?? [];
    const expectedPrefix = expected
      ? expectedPrefixes.find((prefix) => !this.isHit(expected.tick, prefix)) ??
        expectedPrefixes[0]
      : undefined;
    const record: FalseHitRecord = {
      tick,
      controlId,
      element: actualElement,
      timeSeconds,
      expectedTick: expected?.tick,
      actualTick: tick,
      expectedElement: expectedPrefix
        ? KEY_TO_ELEMENT[expectedPrefix]
        : undefined,
      actualElement,
    };

    this.falseHitListeners.forEach((listener) => listener(record));
    this.wrongJudgementSequence += 1;
    this.emitJudgement({
      id: `wrong:${this.wrongJudgementSequence}`,
      verdict: 'wrong',
      expectedTick: record.expectedTick,
      actualTick: record.actualTick,
      expectedElement: record.expectedElement,
      actualElement: record.actualElement,
      measureIndex: this.containingMeasureIndex(tick),
      scoreable,
    });
  }

  handleInput({ controlId, value }: InputEvent): void {
    if (value === 0 || !this.enabled) {
      return;
    }

    const expectedPrefixes = new Set(
      Object.entries(this.mapping).flatMap(([element, controls]) => {
        if (!controls?.includes(controlId)) {
          return [];
        }

        return ELEMENT_TO_KEYS[element] ?? [];
      }),
    );

    if (expectedPrefixes.size === 0) {
      return;
    }

    const rawTick = this.currentTick;
    const chart = this.chart;

    if (rawTick === undefined || chart === undefined) {
      return;
    }

    const tick = this.compensateLatency(rawTick, chart);
    const currentTimeS = ticksToSeconds(tick, chart.resolution, chart.tempos);
    const toleranceTicks =
      secondsToTicks(
        currentTimeS + this.hitToleranceSeconds,
        chart.resolution,
        chart.tempos,
      ) - tick;
    let bestDist = Infinity;
    let nearestEntry: NoteEntry | undefined;
    let nearestDist = Infinity;
    let bestEntry: NoteEntry | undefined;

    for (
      let i = this.firstNoteAtOrAfter(tick - toleranceTicks);
      i < this.noteIndex.length;
      i += 1
    ) {
      const entry = this.noteIndex[i];

      if (entry.tick > tick + toleranceTicks) {
        break;
      }

      const dist = Math.abs(entry.tick - tick);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEntry = entry;
      }

      if (dist >= bestDist) {
        continue;
      }

      const hasMatchingKey = entry.note.notes.some((key) => {
        const prefix = keyPrefix(key);

        return (
          expectedPrefixes.has(prefix) &&
          (!this.preferUnhitNotes || !this.isHit(entry.tick, prefix))
        );
      });

      if (hasMatchingKey) {
        bestDist = dist;
        bestEntry = entry;
      }
    }

    if (!bestEntry) {
      this.maybeRecordFalseHit(
        tick,
        toleranceTicks,
        controlId,
        currentTimeS,
        nearestEntry,
      );

      return;
    }

    const hit = bestEntry.note;
    const pos = bestEntry.pos;
    const accentPrefixes = new Set((hit.accents ?? []).map(keyPrefix));
    const ghostPrefixes = new Set((hit.ghosts ?? []).map(keyPrefix));
    const passesVelocity = (prefix: string) => {
      if (accentPrefixes.has(prefix)) {
        return value > ACCENT_VALUE_THRESHOLD;
      }

      if (ghostPrefixes.has(prefix)) {
        return value < GHOST_VALUE_THRESHOLD;
      }

      return true;
    };
    const newPrefixes = hit.notes
      .map(keyPrefix)
      .filter(
        (p) =>
          expectedPrefixes.has(p) &&
          !this.isHit(hit.tick, p) &&
          passesVelocity(p),
      );

    if (newPrefixes.length === 0) {
      this.maybeRecordFalseHit(
        tick,
        toleranceTicks,
        controlId,
        currentTimeS,
        bestEntry,
      );

      return;
    }

    newPrefixes.forEach((p) => this.recordHit(hit.tick, p));

    const expectedTimeS = ticksToSeconds(
      hit.tick,
      chart.resolution,
      chart.tempos,
    );

    this.hitListeners.forEach((listener) =>
      listener(pos, newPrefixes, {
        tick: hit.tick,
        timeSeconds: currentTimeS,
        deltaMs: (currentTimeS - expectedTimeS) * 1000,
        element: this.resolveElement(controlId),
        velocity: value,
      }),
    );
    newPrefixes.forEach((prefix) => {
      this.emitJudgement({
        id: this.noteJudgementId(hit.tick, prefix),
        verdict: 'hit',
        expectedTick: hit.tick,
        actualTick: tick,
        expectedElement: KEY_TO_ELEMENT[prefix],
        actualElement: this.resolveElement(controlId),
        measureIndex: pos.measureIdx,
        deltaMs: (currentTimeS - expectedTimeS) * 1000,
        velocity: value,
        scoreable: true,
      });
    });
  }
}
