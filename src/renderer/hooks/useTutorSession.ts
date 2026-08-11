import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { ParsedChart, Measure } from '../../chart-parser/types';
import { secondsToTicks } from '../../chart-parser/timing';
import { Engine } from '../services/engine';
import { HIT_TOLERANCE_SECONDS } from '../services/engine/constants';
import {
  buildTutorChartPlan,
  createTutorState,
  DEFAULT_TUTOR_SETTINGS,
  sectionStartsForChart,
  transitionTutor,
  TutorChartPlan,
  TutorCommand,
  TutorEvent,
  TutorSettings,
  TutorState,
} from '../services/tutor';

export type TutorHudTone = 'steady' | 'warning' | 'recovery' | 'success';

export interface TutorHudMessage {
  title: string;
  detail: string;
  tone: TutorHudTone;
}

interface UseTutorSessionParams {
  engine: Engine | undefined;
  /** Changes once per canonical run, resetting all reducer evidence on Retry. */
  runKey: string;
  chart: ParsedChart | null;
  measures: Measure[];
  delaySeconds: number;
  enabled: boolean;
  /** Temporarily stop observing without resetting accumulated tutor evidence. */
  suspended?: boolean;
  targetSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  onTutorTakeover?: () => void;
  /** Synchronous evidence handoff used by SongView's end-of-run callback. */
  onStateChange?: (state: TutorState) => void;
  settings?: Partial<TutorSettings>;
  hitToleranceSeconds?: number;
}

export interface UseTutorSessionResult {
  state: TutorState;
  message: TutorHudMessage;
}

interface TutorSessionSnapshot {
  state: TutorState;
  message: TutorHudMessage;
}

const INITIAL_MESSAGE: TutorHudMessage = {
  title: 'Tutor listening',
  detail: 'Play naturally. One noisy hit will not interrupt the song.',
  tone: 'steady',
};

/**
 * A short visual breath separates diagnosis from transport. The chart-aware
 * audible count-in still follows this preview, so recovery never feels like
 * an instant, unexplained jump back into the phrase.
 */
export const RECOVERY_PREVIEW_MS = 900;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function plural(count: number, noun: string): string {
  if (count === 1) {
    return `${count} ${noun}`;
  }

  return `${count} ${noun}${noun.endsWith('s') ? 'es' : 's'}`;
}

function triggerEvidence(
  command: Extract<TutorCommand, { type: 'material-failure' }>,
): string {
  const { trigger } = command;
  const { stats } = trigger;
  const counts = `${stats.resolved} resolved notes, ${percent(
    stats.accuracy,
  )} accuracy, ${plural(stats.misses, 'miss')}, and ${plural(
    stats.wrong,
    'wrong hit',
  )}`;

  if (trigger.reason === 'repeated-wrong-pad-pair') {
    const pair = trigger.wrongPadPair;

    return `${counts}; ${plural(pair?.count ?? 0, 'matched wrong-pad pair')} (${
      pair?.actualElement ?? 'unknown'
    } → ${pair?.expectedElement ?? 'unknown'}).`;
  }

  if (trigger.reason === 'repeated-same-bar-failure') {
    return `${counts}; bar ${
      stats.endMeasure + 1
    } showed the same weak evidence on ${plural(
      trigger.repeatedBarCount ?? 0,
      'pass',
    )}.`;
  }

  if (trigger.reason === 'timing-spread') {
    return `${counts}; ${stats.timingSampleCount} timed hits span ${Math.round(
      stats.timingSpreadMs,
    )} ms.`;
  }

  return `${counts}; ${plural(
    stats.distinctErrorIds.length,
    'distinct scoreable error',
  )}.`;
}

function qualityPredicate(settings: TutorSettings): string {
  return `${percent(settings.cleanMinimumAccuracy)} or better across ${
    settings.cleanMinimumResolvedEvents
  } resolved notes, no more than ${plural(
    settings.cleanMaximumMisses,
    'miss',
  )}, and no more than ${plural(settings.cleanMaximumWrongHits, 'wrong hit')}`;
}

export function messageForTutorCommand(
  command: TutorCommand,
  settings: TutorSettings,
): TutorHudMessage | undefined {
  if (command.type === 'material-failure') {
    return {
      title: 'Phrase needs one more pass',
      detail: `Bars ${command.trigger.stats.startMeasure + 1}–${
        command.trigger.stats.endMeasure + 1
      }: ${triggerEvidence(command)}${
        settings.livesEnabled
          ? ` ${command.livesRemaining} lives remain.`
          : ' Recovery is based on the phrase, not a life penalty.'
      }`,
      tone: 'warning',
    };
  }

  if (command.type === 'begin-recovery') {
    const failedStart = command.recovery.trigger.stats.startMeasure + 1;
    const failedEnd = command.recovery.trigger.stats.endMeasure + 1;
    const checkpoint = command.recovery.region.startMeasure + 1;
    const leadIn = Math.max(0, failedStart - checkpoint);
    const recoveryEnd = command.recovery.region.endMeasure + 1;
    const checkpointReason =
      leadIn > 0
        ? `Checkpoint bar ${checkpoint} gives ${plural(
            leadIn,
            'lead-in bar',
          )} before failed bars ${failedStart}–${failedEnd}.`
        : `Checkpoint bar ${checkpoint} is the chart start, so no earlier lead-in is available.`;

    return {
      title: 'Smart rewind',
      detail: `${triggerEvidence({
        type: 'material-failure',
        trigger: command.recovery.trigger,
        livesRemaining: 0,
      })} ${checkpointReason} Replay ends at bar ${recoveryEnd}; first pass stays at ${percent(
        command.speed,
      )} to confirm the pattern before any slowdown. Take a breath, then listen for the count-in before playing.`,
      tone: 'recovery',
    };
  }

  if (command.type === 'repeat-recovery') {
    const qualityPass = command.attempt.result === 'clean';
    const previousSpeed = percent(command.attempt.speed);
    const nextSpeed = percent(command.speed);
    const stats = command.attempt.stats;
    const attemptEvidence = `${stats.resolved} resolved notes, ${percent(
      stats.accuracy,
    )} accuracy, ${plural(stats.misses, 'miss')}, and ${plural(
      stats.wrong,
      'wrong hit',
    )}`;
    const retainedProgress = Math.min(
      settings.requiredCleanRepetitions,
      command.recovery.qualityProgress,
    );

    return {
      title: qualityPass ? 'Quality pass saved' : 'Tempo adjusted',
      detail: qualityPass
        ? `${retainedProgress.toFixed(1)} of ${
            settings.requiredCleanRepetitions
          } pattern progress; this pass met ${qualityPredicate(settings)}. ${
            command.speed > command.attempt.speed
              ? `Raise from ${previousSpeed} to ${nextSpeed} for the next controlled step.`
              : `Hold ${nextSpeed}; one useful repetition remains.`
          }`
        : `This pass was close, not erased: ${retainedProgress.toFixed(1)} of ${
            settings.requiredCleanRepetitions
          } progress remains (${attemptEvidence}; a quality pass is ${qualityPredicate(
            settings,
          )}). Lower from ${previousSpeed} to ${nextSpeed} for a playable next lead-in.`,
      tone: 'recovery',
    };
  }

  if (command.type === 'resume-main') {
    if (command.reason === 'maximum-failed-attempts') {
      const failedAttempts = command.failedAttempts ?? 0;
      const maximumFailedAttempts = command.maximumFailedAttempts ?? 0;

      return {
        title: 'Phrase saved for focus work',
        detail: `${failedAttempts} failed recovery ${
          failedAttempts === 1 ? 'attempt reached' : 'attempts reached'
        } the configured ${maximumFailedAttempts}-attempt safety limit. Continuing at ${percent(
          command.speed,
        )} without trapping you here.${
          settings.livesEnabled
            ? ` Checkpoint lives refilled to ${settings.startingLives}.`
            : ''
        }`,
        tone: 'warning',
      };
    }

    return {
      title: 'Pattern ready',
      detail: `${
        settings.requiredCleanRepetitions
      } quality passes met the learning rule (${qualityPredicate(
        settings,
      )}). Continuing from the next musical bar at ${percent(
        command.speed,
      )}; tempo only rises one step after strong evidence.`,
      tone: 'success',
    };
  }

  if (command.type === 'session-complete') {
    return {
      title: 'Session complete',
      detail: 'The full attempt and every recovery pass are ready to review.',
      tone: 'success',
    };
  }

  return undefined;
}

class TutorSessionStore {
  private snapshot: TutorSessionSnapshot;
  private listeners = new Set<() => void>();
  private started = false;

  constructor(
    enabled: boolean,
    settings: Partial<TutorSettings>,
    private chartPlan: TutorChartPlan,
  ) {
    const state = createTutorState({
      ...DEFAULT_TUTOR_SETTINGS,
      ...settings,
      enabled,
    });

    this.snapshot = { state, message: INITIAL_MESSAGE };
  }

  syncTargetSpeed(targetSpeed: number): boolean {
    const state = this.snapshot.state;
    const normalizedTarget =
      Math.round(Math.min(2, Math.max(0.3, targetSpeed)) * 10) / 10;
    const canRetargetUnplayedRun =
      state.phase === 'observing' &&
      state.lastCompletedMeasure < 0 &&
      Object.keys(state.judgementsByMeasure).length === 0 &&
      state.interventions.length === 0 &&
      state.recoveryAttempts.length === 0;

    if (
      this.started &&
      (!canRetargetUnplayedRun || state.targetSpeed === normalizedTarget)
    ) {
      return false;
    }

    this.started = true;
    this.snapshot = {
      ...this.snapshot,
      state: transitionTutor(
        this.snapshot.state,
        { type: 'start', targetSpeed: normalizedTarget },
        this.chartPlan,
      ).state,
    };
    this.listeners.forEach((listener) => listener());

    return true;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): TutorSessionSnapshot => this.snapshot;

  dispatch(event: TutorEvent): TutorCommand[] {
    const transition = transitionTutor(
      this.snapshot.state,
      event,
      this.chartPlan,
    );
    let message = this.snapshot.message;

    transition.commands.forEach((command) => {
      message =
        messageForTutorCommand(command, transition.state.settings) ?? message;
    });
    this.snapshot = { state: transition.state, message };
    this.listeners.forEach((listener) => listener());

    return transition.commands;
  }
}

interface TutorStoreHolder {
  engine: Engine | undefined;
  sessionKey: string;
  chartPlan: TutorChartPlan;
  store: TutorSessionStore;
}

export function useTutorSession({
  engine,
  runKey,
  chart,
  measures,
  delaySeconds,
  enabled,
  suspended = false,
  targetSpeed,
  setPlaybackSpeed,
  onTutorTakeover,
  onStateChange,
  settings = {},
  hitToleranceSeconds = HIT_TOLERANCE_SECONDS,
}: UseTutorSessionParams): UseTutorSessionResult {
  const sectionStarts = useMemo(
    () =>
      sectionStartsForChart(
        measures,
        chart?.sections?.map((section) => section.tick) ?? [],
      ),
    [chart?.sections, measures],
  );
  const chartPlan = useMemo(
    () => buildTutorChartPlan(measures, sectionStarts),
    [measures, sectionStarts],
  );
  const settingsKey = JSON.stringify(settings);
  const sessionKey = `${runKey}:${enabled}:${settingsKey}`;
  const settingsSnapshot = useMemo(
    () => JSON.parse(settingsKey) as Partial<TutorSettings>,
    [settingsKey],
  );
  const activeHolder = useMemo<TutorStoreHolder>(
    () => ({
      engine,
      sessionKey,
      chartPlan,
      store: new TutorSessionStore(enabled, settingsSnapshot, chartPlan),
    }),
    [chartPlan, enabled, engine, sessionKey, settingsSnapshot],
  );
  const snapshot = useSyncExternalStore(
    activeHolder.store.subscribe,
    activeHolder.store.getSnapshot,
  );
  const recoveryTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = undefined;
    },
    [engine, sessionKey],
  );

  useEffect(() => {
    if (!enabled || suspended) {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = undefined;
    }
  }, [enabled, suspended]);

  useEffect(() => {
    if (activeHolder.store.syncTargetSpeed(targetSpeed)) {
      onStateChange?.(activeHolder.store.getSnapshot().state);
    }
  }, [activeHolder.store, onStateChange, targetSpeed]);

  const executeCommand = useCallback(
    (command: TutorCommand) => {
      if (!engine) {
        return;
      }

      if (
        command.type === 'begin-recovery' ||
        command.type === 'repeat-recovery'
      ) {
        onTutorTakeover?.();
        engine.pause();
        engine.setLoopRegion(undefined);
        engine.setPlaybackSpeed(command.speed);
        setPlaybackSpeed(command.speed);
        window.clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = window.setTimeout(() => {
          recoveryTimerRef.current = undefined;
          engine.playFromTick(command.recovery.region.startTick, 'force');
        }, RECOVERY_PREVIEW_MS);

        return;
      }

      if (command.type === 'resume-main') {
        window.clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = undefined;
        engine.pause();
        engine.setLoopRegion(undefined);
        engine.setPlaybackSpeed(command.speed);
        setPlaybackSpeed(command.speed);

        // A recovery that reaches the final bar has nowhere else to resume.
        // The synchronous run-ending handshake will commit Results after the
        // clean/deferred attempt; starting audio at the chart end would only
        // manufacture a second end event.
        if (command.resumeTick !== undefined) {
          engine.playFromTick(command.resumeTick, 'force');
        }
      }
    },
    [engine, onTutorTakeover, setPlaybackSpeed],
  );
  const send = useCallback(
    (event: TutorEvent) => {
      const commands = activeHolder.store.dispatch(event);

      // Transport end listeners and SongView's onEnded callback run in the
      // same synchronous stack. Hand the immutable reducer snapshot to a ref
      // before executing commands so the persisted run can never lag one
      // tutor transition behind the UI.
      onStateChange?.(activeHolder.store.getSnapshot().state);
      commands.forEach(executeCommand);

      return commands;
    },
    [activeHolder.store, executeCommand, onStateChange],
  );

  useEffect(() => {
    onStateChange?.(snapshot.state);
  }, [onStateChange, snapshot.state]);

  useEffect(() => {
    if (!engine || !chart || !enabled || suspended || measures.length === 0) {
      return undefined;
    }

    let lastCompletedMeasure = -1;
    const offJudgement = engine.onJudgement((judgement) =>
      send({ type: 'judgement', judgement }),
    );
    const offRunEnding = engine.onRunEnding(() => {
      const finalMeasure = measures.length - 1;
      const finalCommands: TutorCommand[] = [];

      for (
        let index = lastCompletedMeasure + 1;
        index <= finalMeasure;
        index += 1
      ) {
        lastCompletedMeasure = index;
        finalCommands.push(
          ...send({ type: 'measure-complete', measureIndex: index }),
        );

        const rewind = finalCommands.find(
          (command) =>
            command.type === 'begin-recovery' ||
            command.type === 'repeat-recovery',
        );

        if (
          rewind?.type === 'begin-recovery' ||
          rewind?.type === 'repeat-recovery'
        ) {
          lastCompletedMeasure = rewind.recovery.region.startMeasure - 1;

          return false;
        }

        const resumed = finalCommands.find(
          (command) =>
            command.type === 'resume-main' && command.resumeTick !== undefined,
        );

        if (resumed?.type === 'resume-main') {
          lastCompletedMeasure = (resumed.resumeMeasure ?? 0) - 1;

          return false;
        }
      }

      send({ type: 'song-complete' });

      return true;
    });
    const offTime = engine.timeStore.subscribe(() => {
      if (!engine.getSnapshot().isPlaying) {
        return;
      }

      const observedTime = engine.timeStore.get();
      const resolvedChartTime =
        observedTime - delaySeconds - hitToleranceSeconds;
      const resolvedTick = secondsToTicks(
        resolvedChartTime,
        chart.resolution,
        chart.tempos,
      );
      let completedMeasure = -1;

      for (let index = 0; index < measures.length; index += 1) {
        if (measures[index].endTick <= resolvedTick) {
          completedMeasure = index;
        } else {
          break;
        }
      }

      if (completedMeasure < lastCompletedMeasure) {
        lastCompletedMeasure = completedMeasure;

        return;
      }

      for (
        let index = lastCompletedMeasure + 1;
        index <= completedMeasure;
        index += 1
      ) {
        lastCompletedMeasure = index;

        const commands = send({
          type: 'measure-complete',
          measureIndex: index,
        });
        const rewind = commands.find(
          (command) =>
            command.type === 'begin-recovery' ||
            command.type === 'repeat-recovery',
        );

        if (
          rewind?.type === 'begin-recovery' ||
          rewind?.type === 'repeat-recovery'
        ) {
          lastCompletedMeasure = rewind.recovery.region.startMeasure - 1;

          return;
        }

        const resumed = commands.find(
          (command) =>
            command.type === 'resume-main' && command.resumeTick !== undefined,
        );

        if (resumed?.type === 'resume-main') {
          lastCompletedMeasure = (resumed.resumeMeasure ?? 0) - 1;

          return;
        }

        // Administrative callers may still synchronously move transport.
        // Stop walking the old timeline when that happens.
        if (engine.timeStore.get() !== observedTime) {
          return;
        }
      }
    });

    return () => {
      offJudgement();
      offRunEnding();
      offTime();
    };
  }, [
    chart,
    delaySeconds,
    enabled,
    suspended,
    engine,
    hitToleranceSeconds,
    measures,
    send,
  ]);

  return snapshot;
}
