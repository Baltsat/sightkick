import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { App } from 'antd';
import { TrackConfig } from '../services/audio-player/types';
import { TimeStore } from '../services/time-store';
import { Measure, ParsedChart, RenderData } from '../../chart-parser/types';
import { InputMapping, ScoreData } from '../../types';
import { PlayheadStyle } from '../types';
import { PlayerMode } from '../services/audio-player';
import {
  CountInPolicy,
  Engine,
  PlaybackSnapshot,
  PlaybackState,
} from '../services/engine';
import { inputBus } from '../input';
import { useInput } from '../context/InputContext';
import { HitRecord, RunSummary } from '../services/practice-stats';
import { HIT_TOLERANCE_SECONDS } from '../services/engine/constants';

interface UseEngineParams {
  trackData: TrackConfig[];
  isDev: boolean;
  chart: ParsedChart | null;
  measures: Measure[];
  renderData: RenderData[];
  delaySeconds: number;
  minDurationSeconds: number;
  countInEnabled: boolean;
  playheadStyle: PlayheadStyle;
  mapping: InputMapping;
  hitToleranceSeconds?: number;
  preferUnhitNotes?: boolean;
  player: PlayerMode;
  onEnded: (
    score: ScoreData,
    practiceSummary: RunSummary,
    records: HitRecord[],
  ) => void;
}

interface UseEngineResult {
  engine: Engine | undefined;
  timeStore: TimeStore;
  isReady: boolean;
  state: PlaybackState;
  isPlaying: boolean;
  isCounting: boolean;
  isStarted: boolean;
  isEnded: boolean;
  countInBeat: number | undefined;
  countInBeats: number | undefined;
  countInBeatMs: number | undefined;
  duration: number;
  play: () => void;
  playFromTick: (tick: number, countInPolicy?: CountInPolicy) => void;
  pause: () => void;
  cancel: () => void;
  seekSeconds: (seconds: number) => void;
  setStemVolume: (name: string, gain: number) => void;
  setMasterVolume: (gain: number) => void;
  setPlaybackSpeed: (speed: number) => void;
}

const IDLE_SNAPSHOT: PlaybackSnapshot = {
  state: 'idle',
  isPlaying: false,
  isCounting: false,
  isStarted: false,
  isEnded: false,
  countInBeat: undefined,
  countInBeats: undefined,
  countInBeatMs: undefined,
  isReady: false,
  duration: 0,
};

export function useEngine({
  trackData,
  isDev,
  chart,
  measures,
  renderData,
  delaySeconds,
  minDurationSeconds,
  countInEnabled,
  playheadStyle,
  mapping,
  hitToleranceSeconds = HIT_TOLERANCE_SECONDS,
  preferUnhitNotes = false,
  player,
  onEnded,
}: UseEngineParams): UseEngineResult {
  const { notification } = App.useApp();
  const { inputLatencyMs } = useInput();
  const onEndedRef = useRef(onEnded);
  const isDevRef = useRef(isDev);
  const [fallbackTimeStore] = useState(() => new TimeStore());
  const [engine, setEngine] = useState<Engine | undefined>(undefined);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    isDevRef.current = isDev;
    engine?.setDev(isDev);
  }, [engine, isDev]);

  useEffect(() => {
    const instance = new Engine({
      trackData,
      isDev: isDevRef.current,
      player,
      subscribeInput: inputBus.subscribe,
      onEnded: (score, practiceSummary, records) =>
        onEndedRef.current(score, practiceSummary, records),
      onError: () =>
        notification.error({
          title: 'Audio failed to load',
          description:
            'One or more audio tracks could not be loaded for this song.',
          placement: 'bottomRight',
        }),
    });

    setEngine(instance);

    return () => {
      instance.dispose();
      setEngine(undefined);
    };
  }, [trackData, notification, player]);

  useEffect(() => {
    engine?.setContext({
      chart: chart ?? undefined,
      measures,
      renderData,
      delaySeconds,
      countInEnabled,
      minDurationSeconds,
      mapping,
      hitToleranceSeconds,
      preferUnhitNotes,
    });
  }, [
    engine,
    chart,
    measures,
    renderData,
    delaySeconds,
    minDurationSeconds,
    countInEnabled,
    mapping,
    hitToleranceSeconds,
    preferUnhitNotes,
  ]);

  useEffect(() => {
    engine?.setSettings({ playheadStyle });
  }, [engine, playheadStyle]);

  useEffect(() => {
    engine?.setLatencyMs(inputLatencyMs);
  }, [engine, inputLatencyMs]);

  const subscribe = useCallback(
    (listener: () => void) => engine?.subscribe(listener) ?? (() => {}),
    [engine],
  );
  const getSnapshot = useCallback(
    () => engine?.getSnapshot() ?? IDLE_SNAPSHOT,
    [engine],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const play = useCallback(() => engine?.play(), [engine]);
  const playFromTick = useCallback(
    (tick: number, countInPolicy: CountInPolicy = 'inherit') =>
      engine?.playFromTick(tick, countInPolicy),
    [engine],
  );
  const pause = useCallback(() => engine?.pause(), [engine]);
  const cancel = useCallback(() => engine?.cancel(), [engine]);
  const seekSeconds = useCallback(
    (seconds: number) => engine?.seekSeconds(seconds),
    [engine],
  );
  const setStemVolume = useCallback(
    (name: string, gain: number) => engine?.setStemVolume(name, gain),
    [engine],
  );
  const setMasterVolume = useCallback(
    (gain: number) => engine?.setMasterVolume(gain),
    [engine],
  );
  const setPlaybackSpeed = useCallback(
    (speed: number) => engine?.setPlaybackSpeed(speed),
    [engine],
  );

  return {
    engine,
    timeStore: engine?.timeStore ?? fallbackTimeStore,
    isReady: snapshot.isReady,
    state: snapshot.state,
    isPlaying: snapshot.isPlaying,
    isCounting: snapshot.isCounting,
    isStarted: snapshot.isStarted,
    isEnded: snapshot.isEnded,
    countInBeat: snapshot.countInBeat,
    countInBeats: snapshot.countInBeats,
    countInBeatMs: snapshot.countInBeatMs,
    duration: snapshot.duration,
    play,
    playFromTick,
    pause,
    cancel,
    seekSeconds,
    setStemVolume,
    setMasterVolume,
    setPlaybackSpeed,
  };
}
