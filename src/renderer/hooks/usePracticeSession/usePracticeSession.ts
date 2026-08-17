import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { clamp } from 'es-toolkit';
import { ParsedChart, RenderData } from '../../../chart-parser/types';
import { PracticeRange } from '../../types';
import { ModePolicy } from '../../modes';
import { Engine } from '../../services/engine';
import { secondsToTicks } from '../../../chart-parser/timing';
import { InputControlHandlers } from '../useInputControls';
import {
  PracticeNavDirection,
  measureIndexAtTick,
  neighborIndex,
} from './helpers';

export const MIN_SPEED = 0.3;

export const MAX_SPEED = 2;

const SPEED_STEP = 0.1;

interface UsePracticeSessionParams {
  engine: Engine | undefined;
  policy: ModePolicy;
  chart: ParsedChart | null;
  renderData: RenderData[];
  delaySeconds: number;
  isEnded: boolean;
  onExit: () => void;
  initialPlaybackSpeed?: number;
  onPlay?: () => void;
  onPlayFromTick?: (tick: number) => void;
  /**
   * Fired only for a genuine learner-driven speed change (the speed control
   * or the faster/slower shortcut) - never for a programmatic pre-fill or
   * recommendation apply. The caller uses this to persist "his" speed, per
   * the learner-owned-tempo rule: it stays until *he* changes it.
   */
  onExplicitSpeedChange?: (speed: number) => void;
}

interface UsePracticeSessionResult {
  focusIndex: number | undefined;
  controlHandlers: InputControlHandlers;
  practiceRange: PracticeRange | undefined;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  stepSpeed: (direction: 1 | -1) => void;
  isLooping: boolean;
  setIsLooping: Dispatch<SetStateAction<boolean>>;
  onPracticeRangeChange: (range?: PracticeRange) => void;
  clearSelection: () => void;
}

export function usePracticeSession({
  engine,
  policy,
  chart,
  renderData,
  delaySeconds,
  isEnded,
  onExit,
  initialPlaybackSpeed = 1,
  onPlay,
  onPlayFromTick,
  onExplicitSpeedChange,
}: UsePracticeSessionParams): UsePracticeSessionResult {
  const [focusIndex, setFocusIndex] = useState<number>();
  const [loopAnchor, setLoopAnchor] = useState<number>();
  const [practiceRange, setPracticeRange] = useState<PracticeRange>();
  const initialSpeed = clamp(initialPlaybackSpeed, MIN_SPEED, MAX_SPEED);
  const [playbackSpeedState, setPlaybackSpeedState] = useState(() => ({
    initialSpeed,
    value: initialSpeed,
  }));

  if (playbackSpeedState.initialSpeed !== initialSpeed) {
    setPlaybackSpeedState({ initialSpeed, value: initialSpeed });
  }

  const playbackSpeed =
    playbackSpeedState.initialSpeed === initialSpeed
      ? playbackSpeedState.value
      : initialSpeed;
  const playbackSpeedRef = useRef(playbackSpeed);

  useLayoutEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const setSelectedPlaybackSpeed = useCallback(
    (speed: number) => {
      const next = clamp(speed, MIN_SPEED, MAX_SPEED);

      playbackSpeedRef.current = next;
      setPlaybackSpeedState({ initialSpeed, value: next });
    },
    [initialSpeed],
  );
  // Looping used to default to on, which (combined with no practice range
  // selected looping the whole song) meant a practice run's onEnded never
  // fired - no ScoreSummary, no saved analytics, just a silent infinite
  // loop. Looping is opt-in now. This is plain useState, not usePersisted -
  // there is no localStorage key backing it anywhere in the app, so there
  // is no stale stored `true` from before this fix to migrate away from.
  const [isLooping, setIsLooping] = useState(false);

  useEffect(() => {
    if (!policy.speedControl) {
      return;
    }

    engine?.setPlaybackSpeed(playbackSpeed);
  }, [engine, policy.speedControl, playbackSpeed]);

  useEffect(() => {
    if (policy.parkAtStartOnEnd && isEnded) {
      engine?.seekSeconds(delaySeconds);
    }
  }, [engine, policy.parkAtStartOnEnd, isEnded, delaySeconds]);

  useEffect(() => {
    if (!policy.looping || !isLooping || renderData.length === 0) {
      engine?.setLoopRegion(undefined);

      return;
    }

    const startMeasure =
      (practiceRange && renderData[practiceRange.start]?.measure) ??
      renderData[0].measure;
    const endMeasure =
      (practiceRange && renderData[practiceRange.end]?.measure) ??
      renderData[renderData.length - 1].measure;

    engine?.setLoopRegion({
      startTick: startMeasure.startTick,
      endTick: endMeasure.endTick,
    });
  }, [engine, policy.looping, isLooping, practiceRange, renderData]);

  const clearSelection = useCallback(() => {
    setFocusIndex(undefined);
    setLoopAnchor(undefined);
  }, []);
  const measureAtPlayhead = () => {
    if (!engine || !chart) {
      return 0;
    }

    const tick = secondsToTicks(
      engine.timeStore.get() - delaySeconds,
      chart.resolution,
      chart.tempos,
    );

    return measureIndexAtTick(renderData, tick);
  };
  const startPlayback = (tick?: number) => {
    if (policy.speedControl) {
      engine?.setPlaybackSpeed(playbackSpeedRef.current);
    }

    if (tick === undefined) {
      if (onPlay) {
        onPlay();
      } else {
        engine?.play();
      }

      return;
    }

    if (onPlayFromTick) {
      onPlayFromTick(tick);
    } else {
      engine?.playFromTick(tick);
    }
  };
  const moveFocus = (direction: PracticeNavDirection) => {
    if (focusIndex === undefined) {
      setFocusIndex(measureAtPlayhead());

      if (isLooping) {
        setPracticeRange(undefined);
      }

      return;
    }

    const next = neighborIndex(renderData, focusIndex, direction);

    setFocusIndex(next);

    if (isLooping && loopAnchor !== undefined) {
      setPracticeRange({
        start: Math.min(loopAnchor, next),
        end: Math.max(loopAnchor, next),
      });
    }
  };
  const confirm = () => {
    if (focusIndex === undefined) {
      startPlayback();

      return;
    }

    if (isLooping && loopAnchor !== undefined) {
      startPlayback();

      clearSelection();

      return;
    }

    if (!isLooping) {
      const measure = renderData[focusIndex]?.measure;

      if (measure) {
        startPlayback(measure.startTick);
      }

      return;
    }

    setLoopAnchor(focusIndex);
    setPracticeRange({ start: focusIndex, end: focusIndex });
  };
  const back = () => {
    if (!isLooping) {
      if (focusIndex !== undefined) {
        setFocusIndex(undefined);
      } else {
        onExit();
      }

      return;
    }

    if (
      focusIndex !== undefined ||
      loopAnchor !== undefined ||
      practiceRange !== undefined
    ) {
      clearSelection();
      setPracticeRange(undefined);

      return;
    }

    onExit();
  };
  const togglePause = () => {
    const snapshot = engine?.getSnapshot();

    if (snapshot?.isCounting) {
      engine?.cancel();
    } else if (snapshot?.isPlaying) {
      engine?.pause();
    }
  };
  const stepSpeed = useCallback(
    (direction: 1 | -1) => {
      const next = clamp(
        Math.round((playbackSpeedRef.current + direction * SPEED_STEP) * 10) /
          10,
        MIN_SPEED,
        MAX_SPEED,
      );

      setSelectedPlaybackSpeed(next);
      onExplicitSpeedChange?.(next);
    },
    [onExplicitSpeedChange, setSelectedPlaybackSpeed],
  );
  const controlHandlers: InputControlHandlers = {
    up: () => moveFocus('up'),
    down: () => moveFocus('down'),
    left: () => moveFocus('left'),
    right: () => moveFocus('right'),
    confirm,
    back,
    pause: togglePause,
    faster: () => stepSpeed(1),
    slower: () => stepSpeed(-1),
  };
  const onPracticeRangeChange = useCallback((range?: PracticeRange) => {
    setPracticeRange(range);
    setFocusIndex(undefined);
    setLoopAnchor(undefined);
  }, []);

  return {
    focusIndex,
    controlHandlers,
    practiceRange,
    playbackSpeed,
    setPlaybackSpeed: setSelectedPlaybackSpeed,
    stepSpeed,
    isLooping,
    setIsLooping,
    onPracticeRangeChange,
    clearSelection,
  };
}
