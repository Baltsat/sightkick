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
  CountInPolicy,
  EngineOptions,
  GameRendererRefs,
  EngineSettings,
  JudgeFalseHitHandler,
  JudgeHitHandler,
  LoopRegion,
  LoopRestartHandler,
  MissHandler,
  PlaybackSnapshot,
  ResolvedJudgementHandler,
  SeekStartHandler,
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
  private renderer = new GameRenderer(
    (tick, key) => this.judge.isHit(tick, key),
    (tick, key) => this.judge.isMissed(tick, key),
  );
  // Additive event surface for final Judge misses and administrative resets.
  private missListeners = new Set<MissHandler>();
  private resetListeners = new Set<() => void>();
  private loopRestartListeners = new Set<LoopRestartHandler>();
  private seekStartListeners = new Set<SeekStartHandler>();
  private runEndingListeners = new Set<() => boolean>();
  private judgementListeners = new Set<ResolvedJudgementHandler>();
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
  private judgementUnsub: () => void;
  private runRecords: HitRecord[] = [];
  /**
   * Append-only evidence for the entire open attempt. Unlike `runRecords`,
   * this journal is never pruned by a seek or Tutor rewind, so an interrupted
   * checkpoint retains every resolved pass through a troublesome phrase.
   */
  private attemptRecords: HitRecord[] = [];
  private controlGestureCapture:
    | {
        attemptRecordCount: number;
        runRecordCount: number;
        startedAtSeconds: number;
        startedAtTick?: number;
        judgements: Parameters<ResolvedJudgementHandler>[0][];
      }
    | undefined;
  private suppressJudgementResolution = false;

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
      onLoopRestart: () => {
        this.loopRestartListeners.forEach((listener) => listener());
      },
      onSeekStart: () => {
        this.seekStartListeners.forEach((listener) => listener());
      },
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
        // Notify after the rewind is fully applied and repainted, same as
        // the runRecords prune above - a listener reacting to this (e.g.
        // the streak feature resetting its own count) should see state
        // that already reflects the seek destination.
        this.resetListeners.forEach((listener) => listener());
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
        const record: HitRecord = {
          tick: meta.tick,
          timeSeconds: meta.timeSeconds,
          deltaMs: meta.deltaMs,
          element,
          verdict: 'hit',
          velocity: meta.velocity,
        };

        this.runRecords.push(record);
        this.attemptRecords.push({ ...record });
      });
    });
    this.falseHitUnsub = this.judge.onFalseHit((record) => {
      this.renderer.paintWrongHit(record);

      if (!isKitElement(record.element)) {
        return;
      }

      const resolvedRecord: HitRecord = {
        tick: record.tick,
        timeSeconds: record.timeSeconds,
        deltaMs: 0,
        element: record.element,
        verdict: 'wrong',
      };

      this.runRecords.push(resolvedRecord);
      this.attemptRecords.push({ ...resolvedRecord });
    });
    this.judgementUnsub = this.judge.onJudgement((judgement) => {
      if (
        judgement.verdict !== 'miss' ||
        judgement.expectedTick === undefined ||
        !isKitElement(judgement.expectedElement)
      ) {
        // Hits and wrong-pad outcomes have already been stored by their
        // dedicated Judge channels above. They still share the same buffered
        // external judgement path below.
      } else {
        this.missListeners.forEach((listener) =>
          listener(judgement.expectedTick as number),
        );

        const record: HitRecord = {
          tick: judgement.expectedTick,
          timeSeconds: this.timeSecondsForTick(judgement.expectedTick),
          deltaMs: 0,
          element: judgement.expectedElement,
          verdict: 'miss',
        };

        this.runRecords.push(record);
        this.attemptRecords.push({ ...record });
      }

      if (this.controlGestureCapture) {
        this.controlGestureCapture.judgements.push({ ...judgement });
      } else {
        this.judgementListeners.forEach((listener) => listener(judgement));
      }
    });
  }

  get timeStore(): TimeStore {
    return this.transport.timeStore;
  }

  subscribe = (listener: () => void): (() => void) =>
    this.transport.subscribe(listener);

  /**
   * The same live judge events the renderer itself paints from - a
   * pass-through onto `Judge.onHit`/`Judge.onFalseHit`, additive to the
   * internal subscription this constructor already sets up above. Judge
   * already supports multiple independent listeners (a `Set`), so nothing
   * about the existing wiring changes.
   */
  onHit(listener: JudgeHitHandler): () => void {
    return this.judge.onHit(listener);
  }

  onFalseHit(listener: JudgeFalseHitHandler): () => void {
    return this.judge.onFalseHit(listener);
  }

  /** Final Judge outcomes for adaptive practice and evidence capture. */
  onJudgement(listener: ResolvedJudgementHandler): () => void {
    this.judgementListeners.add(listener);

    return () => {
      this.judgementListeners.delete(listener);
    };
  }

  /** See `MissHandler`'s doc comment in types.ts. */
  onMiss(listener: MissHandler): () => void {
    this.missListeners.add(listener);

    return () => {
      this.missListeners.delete(listener);
    };
  }

  /** Fires whenever this engine resets Judge/GameRenderer state for a seek
   * or restart (see the `onSeek` Transport option above). Does NOT fire
   * for a miss or wrong hit - those are `onMiss`/`onFalseHit`, not a
   * reset. */
  onReset(listener: () => void): () => void {
    this.resetListeners.add(listener);

    return () => {
      this.resetListeners.delete(listener);
    };
  }

  /** Fires only for a natural authored loop wrap, before the rewind reset. */
  onLoopRestart(listener: LoopRestartHandler): () => void {
    this.loopRestartListeners.add(listener);

    return () => {
      this.loopRestartListeners.delete(listener);
    };
  }

  /** Fires before an administrative or natural rewind moves TimeStore. */
  onSeekStart(listener: SeekStartHandler): () => void {
    this.seekStartListeners.add(listener);

    return () => {
      this.seekStartListeners.delete(listener);
    };
  }

  /**
   * Synchronous pre-commit handshake after every chart head has a final
   * Judge outcome. Return false when an adaptive recovery restarted the
   * transport; Engine then preserves the run and does not open Results.
   */
  onRunEnding(listener: () => boolean): () => void {
    this.runEndingListeners.add(listener);

    return () => {
      this.runEndingListeners.delete(listener);
    };
  }

  getSnapshot = (): PlaybackSnapshot => this.transport.getSnapshot();

  /**
   * Returns a defensive snapshot of the evidence accumulated for the current
   * unfinished pass. It intentionally contains only real Judge outcomes; the
   * caller may persist it as a crash-recovery draft, but must not present it
   * as a completed RunSummary.
   */
  getRunRecords(): HitRecord[] {
    return this.runRecords.map((record) => ({ ...record }));
  }

  /**
   * Returns every Judge-resolved outcome observed since this attempt began,
   * including superseded passes before manual seeks and adaptive rewinds.
   * It is recovery/audit evidence only; completed scoring still uses the
   * canonical `runRecords` snapshot above.
   */
  getAttemptRecords(): HitRecord[] {
    const records = this.controlGestureCapture
      ? this.attemptRecords.slice(
          0,
          this.controlGestureCapture.attemptRecordCount,
        )
      : this.attemptRecords;

    return records.map((record) => ({ ...record }));
  }

  /**
   * Open a tiny evidence transaction before a possible multi-hit kit command
   * reaches Judge. Canonical scoring continues normally so a failed pattern
   * can remain real drumming; only Tutor delivery and the interruption journal
   * wait for the recognizer's decision.
   */
  beginControlGestureCapture(): void {
    if (this.controlGestureCapture) {
      return;
    }

    this.controlGestureCapture = {
      attemptRecordCount: this.attemptRecords.length,
      runRecordCount: this.runRecords.length,
      startedAtSeconds: this.transport.timeStore.get(),
      startedAtTick: this.chart
        ? Math.max(
            0,
            secondsToTicks(
              this.transport.timeStore.get() - this.delaySeconds,
              this.chart.resolution,
              this.chart.tempos,
            ),
          )
        : undefined,
      judgements: [],
    };
  }

  /** A diverged/timed-out pattern was musical input; release it to Tutor. */
  cancelControlGestureCapture(): void {
    const capture = this.controlGestureCapture;

    if (!capture) {
      return;
    }

    this.controlGestureCapture = undefined;
    capture.judgements.forEach((judgement) => {
      this.judgementListeners.forEach((listener) => listener(judgement));
    });
  }

  /**
   * A recognized command is UI control, not learning evidence.
   *
   * Returns the exact transport boundary that the caller must seek to when
   * the command interrupted active playback. That boundary is derived from
   * the capture start and every Judge record produced during the candidate,
   * so it remains correct at every playback speed and also covers a command
   * strike that happened to match a slightly earlier authored note.
   */
  completeControlGestureCapture(): number | undefined {
    const capture = this.controlGestureCapture;

    if (!capture) {
      return undefined;
    }

    const capturedRunRecords = this.runRecords.slice(capture.runRecordCount);
    const capturedTicks = capturedRunRecords.map((record) => record.tick);
    const rewindTick =
      capture.startedAtTick === undefined
        ? undefined
        : Math.min(capture.startedAtTick, ...capturedTicks);

    this.runRecords = this.runRecords.slice(0, capture.runRecordCount);
    this.attemptRecords = this.attemptRecords.slice(
      0,
      capture.attemptRecordCount,
    );
    this.controlGestureCapture = undefined;

    return this.chart && rewindTick !== undefined
      ? Math.max(
          0,
          ticksToSeconds(rewindTick, this.chart.resolution, this.chart.tempos) +
            this.delaySeconds,
        )
      : capture.startedAtSeconds;
  }

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
      hitToleranceSeconds: context.hitToleranceSeconds,
      preferUnhitNotes: context.preferUnhitNotes,
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
    this.withAdministrativeSeek(() => this.transport.setLoopRegion(region));
  }

  play(): void {
    this.withAdministrativeSeek(() => this.transport.play());
  }

  playFromTick(tick: number, countInPolicy: CountInPolicy = 'inherit'): void {
    this.withAdministrativeSeek(() =>
      this.transport.playFromTick(tick, countInPolicy),
    );
  }

  pause(): void {
    this.transport.pause();
  }

  cancel(): void {
    this.transport.cancel();
  }

  seekSeconds(seconds: number): void {
    this.withAdministrativeSeek(() => this.transport.seekSeconds(seconds));
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

    if (
      !isSeek &&
      !this.suppressJudgementResolution &&
      this.transport.getSnapshot().isPlaying
    ) {
      this.judge.resolveThrough(tick);
    }

    this.renderer.render(chartTime, tick, isSeek);
  }

  dispose(): void {
    this.timeUnsub();
    this.transportUnsub();
    this.inputUnsub();
    this.hitUnsub();
    this.falseHitUnsub();
    this.judgementUnsub();
    this.controlGestureCapture = undefined;
    this.judgementListeners.clear();
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
    // An unfinished candidate is ordinary playing. Release its delayed Tutor
    // outcomes before the terminal resolution handshake.
    this.cancelControlGestureCapture();
    this.judge.resolveAll();

    if ([...this.runEndingListeners].some((listener) => !listener())) {
      return;
    }

    const liveMisses = new Set(
      this.runRecords
        .filter((record) => record.verdict === 'miss')
        .map((record) => `${record.tick}:${record.element}`),
    );
    const unresolvedMisses = this.deriveMisses().filter(
      (record) => !liveMisses.has(`${record.tick}:${record.element}`),
    );
    const records = [...this.runRecords, ...unresolvedMisses];
    const practiceSummary = summarizeRun(records, new Date().toISOString());

    this.runRecords = [];
    this.attemptRecords = [];

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

  private withAdministrativeSeek(action: () => void): void {
    const previous = this.suppressJudgementResolution;

    this.suppressJudgementResolution = true;

    try {
      action();
    } finally {
      this.suppressJudgementResolution = previous;
    }
  }

  private timeSecondsForTick(tick: number): number {
    return this.chart
      ? ticksToSeconds(tick, this.chart.resolution, this.chart.tempos)
      : 0;
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
