import {
  Measure,
  Note,
  ParsedChart,
  RenderData,
} from '../../../chart-parser/types';
import { InputElement, InputMapping, ScoreData } from '../../../types';
import { PlayheadStyle } from '../../types';
import { InputEvent } from '../../input/types';
import { AudioPlayerFactory, PlayerMode, TrackConfig } from '../audio-player';
import { HitRecord, RunSummary } from '../practice-stats';

export interface EngineOptions {
  trackData: TrackConfig[];
  isDev: boolean;
  player: PlayerMode;
  subscribeInput: (listener: (event: InputEvent) => void) => () => void;
  onEnded: (
    score: ScoreData,
    practiceSummary: RunSummary,
    records: HitRecord[],
  ) => void;
  onError: () => void;
}

export interface EngineContext {
  chart: ParsedChart | undefined;
  measures: Measure[];
  renderData: RenderData[];
  delaySeconds: number;
  countInEnabled: boolean;
  minDurationSeconds: number;
  mapping: InputMapping;
}

export interface EngineSettings {
  playheadStyle: PlayheadStyle;
}

/**
 * Per-hit-event context handed to `JudgeHitHandler` alongside the painted
 * position: enough for a caller to build a practice-stats `HitRecord`
 * without duplicating Judge's own tick/time/velocity bookkeeping. Computed
 * once per `handleInput` call (not once per prefix) — every prefix in a
 * single emission comes from the same struck pad, so they share one
 * `element`/`timeSeconds`/`deltaMs`.
 */
export interface HitEventMeta {
  /** The note's expected tick (`hit.tick`). */
  tick: number;
  /** When it was actually struck (`currentTimeS`). */
  timeSeconds: number;
  /** Signed actual-vs-expected offset in ms (negative = early). */
  deltaMs: number;
  /**
   * Always defined in practice — `handleInput` only reaches the hit
   * emission after confirming `controlId` maps to some element in
   * `this.mapping` — but kept optional so callers drop the record
   * defensively instead of crashing or coercing it.
   */
  element: InputElement | undefined;
  /** The InputEvent's `value` (strike velocity). */
  velocity: number;
}

export type JudgeHitHandler = (
  pos: NotePos,
  prefixes: string[],
  meta: HitEventMeta,
) => void;

export interface FalseHitRecord {
  tick: number;
  controlId: string;
  element: InputElement | undefined;
  timeSeconds: number;
}

export type JudgeFalseHitHandler = (record: FalseHitRecord) => void;

export interface JudgeContext {
  chart: ParsedChart | undefined;
  measures: Measure[];
  mapping: InputMapping;
}

export type IsHit = (tick: number, prefix: string) => boolean;

export interface GameRendererContext {
  chart: ParsedChart | undefined;
  renderData: RenderData[];
}

export interface GameRendererRefs {
  cursorEl: HTMLElement | undefined;
  highlightEls: (HTMLElement | undefined)[];
  overlayEl?: HTMLElement;
}

export interface NotePos {
  measureIdx: number;
  noteIdx: number;
}

export interface NoteEntry {
  tick: number;
  note: Note;
  pos: NotePos;
}

export interface ActiveNote extends NotePos {
  noteHeadEls: SVGElement[];
}

export type PlaybackState =
  | 'idle'
  | 'parked'
  | 'counting-in'
  | 'playing'
  | 'ended';

export interface LoopRegion {
  startTick: number;
  endTick: number;
}

export interface TransportContext {
  chart: ParsedChart | undefined;
  measures: Measure[];
  delaySeconds: number;
  countInEnabled: boolean;
  minDurationSeconds: number;
}

export interface PlaybackSnapshot {
  state: PlaybackState;
  isPlaying: boolean;
  isCounting: boolean;
  isStarted: boolean;
  isEnded: boolean;
  countInBeat: number | undefined;
  countInBeatMs: number | undefined;
  isReady: boolean;
  duration: number;
}

export interface TransportOptions {
  trackData: TrackConfig[];
  isDev: boolean;
  createPlayer: AudioPlayerFactory;
  onEnded: () => void;
  onError: () => void;
  onSeek?: (tick: number) => void;
}
