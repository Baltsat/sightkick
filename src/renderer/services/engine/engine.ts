import { Measure, ParsedChart } from '../../../chart-parser/types';
import { InputElement, InputMapping, ScoreData } from '../../../types';
import { secondsToTicks, ticksToSeconds } from '../../../chart-parser/timing';
import { TimeStore } from '../time-store';
import { AudioPlayer } from '../audio-player/types';
import { playerFactoryForMode } from '../audio-player/factories';
import {
  HitRecord,
  KitElement,
  RunSummary,
  summarizeRun,
} from '../practice-stats';
import { Transport } from './transport';
import { Judge } from './judge';
import { GameRenderer } from './game-renderer';
import { ELEMENT_TO_KEYS, KEY_TO_ELEMENT } from './constants';
import { keyPrefix } from './helpers';
import {
  EngineContext,
  EngineOptions,
  GameRendererRefs,
  EngineSettings,
  LoopRegion,
  PlaybackSnapshot,
} from './types';

const KIT_ELEMENT_NAMES = new Set<string>(Object.keys(ELEMENT_TO_KEYS));

/**
 * Narrows the app-wide `InputElement` (which also covers non-kit controls
 * like `up`/`pause`) down to a drum-kit lane — the only thing practice-stats
 * `HitRecord`s ever attribute a hit to.
 */
function isKitElement(
  element: InputElement | undefined,
): element is KitElement {
  return element !== undefined && KIT_ELEMENT_NAMES.has(element);
}

export class Engine {
  private transport: Transport;
  private player: AudioPlayer | undefined;
  private judge = new Judge();
  private renderer = new GameRenderer((tick, key) =>
    this.judge.isHit(tick, key),
  );
  private onEndedCb: (
    score: ScoreData,
    practiceSummary: RunSummary,
    records: HitRecord[],
  ) => void;
  private chart: ParsedChart | undefined;
  private measures: Measure[] = [];
  private delaySeconds = 0;
  private mapping: InputMapping = {};
  private timeUnsub: () => void;
  private transportUnsub: () => void;
  private inputUnsub: () => void;
  private hitUnsub: () => void;
  private falseHitUnsub: () => void;
  private runRecords: HitRecord[] = [];

  constructor(options: EngineOptions) {
    this.onEndedCb = options.onEnded;

    const createPlayer = playerFactoryForMode(options.player);

    this.transport = new Transport({
      trackData: options.trackData,
      isDev: options.isDev,
      createPlayer: (trackConfigs, onEnded, getMinDurationSeconds) => {
        this.player = createPlayer(
          trackConfigs,
          onEnded,
          getMinDurationSeconds,
        );

        return this.player;
      },
      onEnded: () => this.handleEnded(),
      onError: options.onError,
      onSeek: (tick) => {
        this.judge.rewindTo(tick);
        // Mirror Judge.rewindTo's own cutoff: a looped practice-range replay
        // shouldn't double-count a bar's hits into one growing run every
        // pass, so drop the tail of runRecords at/after the rewound tick too.
        this.runRecords = this.runRecords.filter(
          (record) => record.tick < tick,
        );
        // Transport updates its position (which synchronously drives a
        // plain renderFrame() through the timeStore subscription) before
        // invoking this callback, so that first pass can run against
        // pre-rewind Judge state. Render again, forced, now that the
        // Judge's hit state actually reflects the seek destination — the
        // renderer needs this even when the seek lands on the same active
        // note, since its vanished/missed/wrong-hit state may still be
        // stale. Both passes happen synchronously within this call, before
        // anything is painted, so nothing stale is ever visible.
        this.renderFrame(true);
      },
    });
    this.timeUnsub = this.transport.timeStore.subscribe(this.handleFrame);
    this.transportUnsub = this.transport.subscribe(this.handleTransportChange);
    this.inputUnsub = options.subscribeInput((event) =>
      this.judge.handleInput(event),
    );
    this.hitUnsub = this.judge.onHit((pos, prefixes, meta) => {
      this.renderer.paintHit(pos, prefixes);

      if (!isKitElement(meta.element)) {
        return;
      }

      const element = meta.element;

      prefixes.forEach(() => {
        this.runRecords.push({
          tick: meta.tick,
          timeSeconds: meta.timeSeconds,
          deltaMs: meta.deltaMs,
          element,
          verdict: 'hit',
          velocity: meta.velocity,
        });
      });
    });
    this.falseHitUnsub = this.judge.onFalseHit((record) => {
      this.renderer.paintWrongHit(record);

      if (!isKitElement(record.element)) {
        return;
      }

      this.runRecords.push({
        tick: record.tick,
        timeSeconds: record.timeSeconds,
        deltaMs: 0,
        element: record.element,
        verdict: 'wrong',
      });
    });
  }

  get timeStore(): TimeStore {
    return this.transport.timeStore;
  }

  subscribe = (listener: () => void): (() => void) =>
    this.transport.subscribe(listener);

  getSnapshot = (): PlaybackSnapshot => this.transport.getSnapshot();

  setContext(context: EngineContext): void {
    this.chart = context.chart;
    this.measures = context.measures;
    this.delaySeconds = context.delaySeconds;
    this.mapping = context.mapping;
    this.renderer.setContext({
      chart: context.chart,
      renderData: context.renderData,
    });
    this.transport.setContext({
      chart: context.chart,
      measures: context.measures,
      delaySeconds: context.delaySeconds,
      countInEnabled: context.countInEnabled,
      minDurationSeconds: context.minDurationSeconds,
    });
    this.judge.setContext({
      chart: context.chart,
      measures: context.measures,
      mapping: context.mapping,
    });

    this.renderFrame();
  }

  setSettings(settings: EngineSettings): void {
    this.renderer.setSettings(settings.playheadStyle);
    this.renderFrame();
  }

  setClickSettings(volume: number, tone: number): void {
    this.transport.setClickSettings(volume, tone);
  }

  setLatencyMs(ms: number): void {
    this.judge.setLatencyMs(ms);
  }

  setMapping(mapping: InputMapping): void {
    this.mapping = mapping;
    this.judge.setContext({
      chart: this.chart,
      measures: this.measures,
      mapping,
    });
  }

  setRendererRefs(rendererRefs: GameRendererRefs): void {
    this.renderer.setRefs(rendererRefs);
    this.renderFrame();
  }

  setDev(isDev: boolean): void {
    this.transport.setDev(isDev);
  }

  setLoopRegion(region: LoopRegion | undefined): void {
    this.transport.setLoopRegion(region);
  }

  play(): void {
    this.transport.play();
  }

  playFromTick(tick: number): void {
    this.transport.playFromTick(tick);
  }

  pause(): void {
    this.transport.pause();
  }

  cancel(): void {
    this.transport.cancel();
  }

  seekSeconds(seconds: number): void {
    this.transport.seekSeconds(seconds);
  }

  setStemVolume(name: string, gain: number): void {
    this.transport.setStemVolume(name, gain);
  }

  setMasterVolume(gain: number): void {
    this.transport.setMasterVolume(gain);
  }

  setPlaybackSpeed(speed: number): void {
    this.transport.setPlaybackSpeed(speed);
  }

  renderFrame(isSeek = false): void {
    if (!this.chart) {
      return;
    }

    const chartTime = this.transport.timeStore.get() - this.delaySeconds;
    const tick = secondsToTicks(
      chartTime,
      this.chart.resolution,
      this.chart.tempos,
    );

    this.judge.setTick(tick);
    this.renderer.render(chartTime, tick, isSeek);
  }

  dispose(): void {
    this.timeUnsub();
    this.transportUnsub();
    this.inputUnsub();
    this.hitUnsub();
    this.falseHitUnsub();
    this.transport.dispose();
  }

  private handleFrame = (): void => {
    this.renderFrame();
  };

  private handleTransportChange = (): void => {
    this.judge.setEnabled(this.transport.getSnapshot().isPlaying);
  };

  private handleEnded(): void {
    // Transport.handleEnded() never calls onEndedCb while a loop region is
    // active — it restarts the loop instead (see transport.ts) — so this
    // only runs once playback reaches the *true* end of the song (loop off,
    // or no region set). That means runRecords here reflects a genuine
    // full pass, not a partial loop iteration.
    //
    // Within that pass, a looped section replayed multiple times before
    // looping was turned off (or before this final run) doesn't
    // double-count: every loop-back is a seek, and the onSeek handler above
    // prunes runRecords at/after the rewound tick the same way
    // Judge.rewindTo() prunes its own hit state. So a bar played 3 times in
    // a loop only ever contributes its *last* pass's hits/misses to the
    // summary below — honest evidence of the most recent attempt, not a
    // growing tally that rewards repetition over accuracy.
    const records = [...this.runRecords, ...this.deriveMisses()];
    const practiceSummary = summarizeRun(records, new Date().toISOString());

    this.runRecords = [];

    this.onEndedCb(
      {
        hitNotes: this.judge.hitCount,
        falseHits: this.judge.falseHitCount,
        totalNotes: this.totalNotes(),
      },
      practiceSummary,
      records,
    );
  }

  private totalNotes(): number {
    return this.measures
      .flatMap((measure) => measure.notes)
      .filter((note) => !note.isRest)
      .reduce((sum, note) => sum + note.notes.length, 0);
  }

  /**
   * A note-key is a miss iff it's a real (non-rest) chart note whose prefix
   * was never marked hit by the time the run ends. The lane comes from
   * `KEY_TO_ELEMENT` (the fixed VexFlow-key <-> element table used to draw
   * the chart), not `this.mapping` (the player's controller mapping) —
   * those answer different questions and only one tells us what a given
   * notated key means.
   */
  private deriveMisses(): HitRecord[] {
    if (!this.chart) {
      return [];
    }

    const chart = this.chart;
    const misses: HitRecord[] = [];

    for (const measure of this.measures) {
      for (const note of measure.notes) {
        if (note.isRest) {
          continue;
        }

        for (const key of note.notes) {
          const prefix = keyPrefix(key);

          if (this.judge.isHit(note.tick, prefix)) {
            continue;
          }

          const element = KEY_TO_ELEMENT[prefix];

          if (!isKitElement(element)) {
            continue;
          }

          misses.push({
            tick: note.tick,
            timeSeconds: ticksToSeconds(
              note.tick,
              chart.resolution,
              chart.tempos,
            ),
            deltaMs: 0,
            element,
            verdict: 'miss',
          });
        }
      }
    }

    return misses;
  }
}
