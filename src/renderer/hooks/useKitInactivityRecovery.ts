import { useEffect, useMemo, useRef, useState } from 'react';
import { Measure, ParsedChart } from '../../chart-parser/types';
import { secondsToTicks } from '../../chart-parser/timing';
import { InputMapping } from '../../types';
import { inputBus } from '../input';
import { Engine } from '../services/engine';
import { TimeStore } from '../services/time-store';

export const INACTIVITY_MIN_SECONDS = 2.25;

export const INACTIVITY_MIN_EXPECTED_HEADS = 3;

export interface InactivityCheckpoint {
  phase: 'parked';
  checkpointMeasure: number;
  checkpointTick: number;
  abandonedExpectedHeads: number;
  pauseEpoch?: number;
}

export type KitInactivityState = { phase: 'listening' } | InactivityCheckpoint;

interface InactivityStateSnapshot {
  enabled: boolean;
  state: KitInactivityState;
}

interface UseKitInactivityRecoveryParams {
  enabled: boolean;
  engine?: Engine;
  isPlaying: boolean;
  chart: ParsedChart | null;
  measures: Measure[];
  delaySeconds: number;
  mapping: InputMapping;
  timeStore: TimeStore;
  onPark: (checkpoint: InactivityCheckpoint) => void;
  onResume: (checkpoint: InactivityCheckpoint) => void;
  /**
   * `timeStore` reports song time, which advances at `playbackSpeed` times
   * real wall-clock time (see SpeedAudioPlayer.currentTime). Scaling the
   * threshold by the same factor is what makes the "real time" the doc
   * comment above promises actually real: at a beginner's 0.7x, waiting for
   * 2.25s of *song* time to elapse takes ~3.2 real seconds, doubling the
   * pause-by-stopping response exactly in the practice-speed range this app
   * steers beginners toward. Defaults to 1 (unscaled) for existing callers.
   */
  playbackSpeed?: number;
}

export function expectedHeadsBetween(
  measures: Measure[],
  startTick: number,
  endTick: number,
): number {
  if (endTick <= startTick) {
    return 0;
  }

  return measures.reduce(
    (total, measure) =>
      total +
      measure.notes.reduce((measureTotal, note) => {
        if (note.isRest || note.tick <= startTick || note.tick >= endTick) {
          return measureTotal;
        }

        return measureTotal + note.notes.length;
      }, 0),
    0,
  );
}

export function checkpointForInactivity(
  measures: Measure[],
  lastActiveTick: number,
  currentTick: number,
): InactivityCheckpoint | undefined {
  if (measures.length === 0) {
    return undefined;
  }

  const activeMeasure = Math.max(
    0,
    measures.findIndex(
      (measure) =>
        lastActiveTick >= measure.startTick && lastActiveTick < measure.endTick,
    ),
  );
  const checkpointMeasure = Math.max(0, activeMeasure - 1);

  return {
    phase: 'parked',
    checkpointMeasure,
    checkpointTick: measures[checkpointMeasure].startTick,
    abandonedExpectedHeads: expectedHeadsBetween(
      measures,
      lastActiveTick,
      currentTick,
    ),
  };
}

/**
 * Parks a run only when silence spans both real time and authored noteheads.
 * Long rests therefore remain musical rests. A mapped kit hit while parked is
 * consumed as intent and resumes from a one-bar lead-in checkpoint.
 */
export function useKitInactivityRecovery({
  enabled,
  engine,
  isPlaying,
  chart,
  measures,
  delaySeconds,
  mapping,
  timeStore,
  onPark,
  onResume,
  playbackSpeed = 1,
}: UseKitInactivityRecoveryParams): KitInactivityState {
  const listening = { phase: 'listening' } as const;
  const [stateSnapshot, setStateSnapshot] = useState<InactivityStateSnapshot>(
    () => ({ enabled, state: listening }),
  );
  const state =
    stateSnapshot.enabled === enabled ? stateSnapshot.state : listening;
  const stateRef = useRef<KitInactivityState>(state);
  const isPlayingRef = useRef(isPlaying);
  const playbackSpeedRef = useRef(playbackSpeed);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const lastActivitySecondsRef = useRef(0);
  const lastActivityTickRef = useRef(0);
  const parkedEpochRef = useRef(0);
  const administrativeSeekRef = useRef(false);
  const mappedControls = useMemo(
    () => new Set(Object.values(mapping).flatMap((ids) => ids ?? [])),
    [mapping],
  );

  if (stateSnapshot.enabled !== enabled) {
    setStateSnapshot({ enabled, state: listening });
  }

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!enabled || !engine || !chart) {
      administrativeSeekRef.current = false;

      return undefined;
    }

    const offSeekStart = engine.onSeekStart(() => {
      administrativeSeekRef.current = true;
    });
    const offHit = engine.onHit((_position, _prefixes, meta) => {
      if (!isPlayingRef.current || stateRef.current.phase === 'parked') {
        return;
      }

      lastActivitySecondsRef.current = timeStore.get();
      lastActivityTickRef.current = meta.tick;
    });
    const offReset = engine.onReset(() => {
      const seconds = timeStore.get();

      lastActivitySecondsRef.current = seconds;
      lastActivityTickRef.current = secondsToTicks(
        seconds - delaySeconds,
        chart.resolution,
        chart.tempos,
      );
      administrativeSeekRef.current = false;
    });

    return () => {
      offSeekStart();
      offHit();
      offReset();
      administrativeSeekRef.current = false;
    };
  }, [chart, delaySeconds, enabled, engine, timeStore]);

  useEffect(() => {
    if (!enabled || !chart || mappedControls.size === 0) {
      return undefined;
    }

    return inputBus.subscribe((event) => {
      if (event.value === 0 || !mappedControls.has(event.controlId)) {
        return;
      }

      const parked = stateRef.current;

      if (parked.phase === 'parked') {
        const nextState = { phase: 'listening' } as const;

        stateRef.current = nextState;
        setStateSnapshot({ enabled, state: nextState });
        onResume(parked);

        return;
      }

      if (!isPlayingRef.current) {
        return;
      }

      const seconds = timeStore.get();

      lastActivitySecondsRef.current = seconds;
      // Engine resolves an early-but-correct strike against the authored
      // head before this raw InputBus listener runs. Never let the physical
      // transport tick move that accepted authored boundary backwards: doing
      // so would count the note we just hit as newly abandoned and park one
      // head too early.
      lastActivityTickRef.current = Math.max(
        lastActivityTickRef.current,
        secondsToTicks(seconds - delaySeconds, chart.resolution, chart.tempos),
      );
    });
  }, [chart, delaySeconds, enabled, mappedControls, onResume, timeStore]);

  useEffect(() => {
    if (!enabled || !chart || !isPlaying || measures.length === 0) {
      return undefined;
    }

    const startedAtSeconds = timeStore.get();
    const startedAtTick = secondsToTicks(
      startedAtSeconds - delaySeconds,
      chart.resolution,
      chart.tempos,
    );

    lastActivitySecondsRef.current = startedAtSeconds;
    lastActivityTickRef.current = startedAtTick;

    return timeStore.subscribe(() => {
      if (stateRef.current.phase === 'parked') {
        return;
      }

      if (administrativeSeekRef.current) {
        return;
      }

      const currentSeconds = timeStore.get();
      const currentTick = secondsToTicks(
        currentSeconds - delaySeconds,
        chart.resolution,
        chart.tempos,
      );

      if (currentTick < lastActivityTickRef.current) {
        lastActivitySecondsRef.current = currentSeconds;
        lastActivityTickRef.current = currentTick;

        return;
      }

      // currentSeconds/lastActivitySecondsRef are song time (speed-scaled);
      // scale the real-time threshold by the same factor so the gate fires
      // after INACTIVITY_MIN_SECONDS of actual wall-clock silence at any
      // practice speed, not just at 1x.
      if (
        currentSeconds - lastActivitySecondsRef.current <
        INACTIVITY_MIN_SECONDS * playbackSpeedRef.current
      ) {
        return;
      }

      const abandonedExpectedHeads = expectedHeadsBetween(
        measures,
        lastActivityTickRef.current,
        currentTick,
      );

      if (abandonedExpectedHeads < INACTIVITY_MIN_EXPECTED_HEADS) {
        return;
      }

      const checkpoint = checkpointForInactivity(
        measures,
        lastActivityTickRef.current,
        currentTick,
      );

      if (!checkpoint) {
        return;
      }

      const parked = {
        ...checkpoint,
        abandonedExpectedHeads,
        pauseEpoch: ++parkedEpochRef.current,
      };

      stateRef.current = parked;
      setStateSnapshot({ enabled, state: parked });
      onPark(parked);
    });
  }, [chart, delaySeconds, enabled, isPlaying, measures, onPark, timeStore]);

  return state;
}
