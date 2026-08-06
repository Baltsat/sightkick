import { useEffect, useRef, useState } from 'react';
import { Engine } from '../services/engine';
import { isTypingTarget, makeControlId } from '../input';
import { ControlMapping } from '../../types';

// Mirrors YouTube's J/L behaviour: the first press seeks this many seconds,
// and a same-direction press that lands within the idle window doubles the
// interval, up to the cap below. Any pause longer than the window, or a
// direction change, resets back to the base interval.
export const SEEK_BASE_SECONDS = 15;

export const SEEK_MAX_SECONDS = 60;

export const SEEK_ACCEL_WINDOW_MS = 1500;

const INDICATOR_MS = 900;

export interface TransportIndicator {
  label: string;
}

interface UseTransportShortcutsParams {
  /** Gate on song-loaded state, same as the ControlMapping-driven handlers. */
  enabled: boolean;
  engine: Engine | undefined;
  duration: number;
  /** Whether the current mode's audio player actually supports a playback
   * rate (Practice mode only - see modes.ts's `speedControl` policy flag). */
  speedControl: boolean;
  onStepSpeed: (direction: 1 | -1) => void;
  /**
   * The currently active e-kit/controller ControlMapping (InputContext).
   * Its configurable up/down/left/right/pause/etc. elements are for e-kit
   * and controller navigation and must keep working - so any physical key
   * the user has explicitly bound there is left alone entirely by these
   * KEYBOARD defaults, rather than double-firing alongside it. A default
   * only ever applies to a key nothing else has claimed.
   */
  controlMapping: ControlMapping;
}

type SeekDirection = 'forward' | 'backward';

/**
 * A target counts as "already handling its own keys" - and this hook backs
 * off entirely - when it's a text/contenteditable input, a focused native
 * control (button/link/select), an ARIA form control (antd Slider/Switch
 * etc. don't render as <input>), or anything inside an open dialog (Ant
 * Design's Modal renders role="dialog").
 */
function isBlockedTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;

  if (!el || typeof el.closest !== 'function') {
    return false;
  }

  if (isTypingTarget(el)) {
    return true;
  }

  return Boolean(
    el.closest(
      [
        '[role="dialog"]',
        '[role="slider"]',
        '[role="spinbutton"]',
        '[role="switch"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="searchbox"]',
        'button',
        'a[href]',
        'select',
      ].join(', '),
    ),
  );
}

/**
 * YouTube-style transport keys for the song view: Space toggles pause/
 * resume, the arrow keys seek +/-15s (accelerating on repeated presses) or
 * step the practice playback speed. This is a fixed, always-on default that
 * works with zero configuration - deliberately separate from the
 * ControlMapping system (InputContext/useInputControls), whose configurable
 * up/down/left/right/pause elements exist for e-kit and controller
 * navigation and keep working exactly as before. A given physical key is
 * only ever handled by one of the two systems at a time: any key the user
 * has explicitly bound in ControlMapping is left alone here entirely, so
 * the default never double-fires alongside (or corrupts the state read by)
 * an explicit e-kit/controller binding on the same key.
 */
export function useTransportShortcuts({
  enabled,
  engine,
  duration,
  speedControl,
  onStepSpeed,
  controlMapping,
}: UseTransportShortcutsParams): TransportIndicator | undefined {
  const [indicator, setIndicator] = useState<TransportIndicator>();
  const indicatorTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSeekAtRef = useRef(0);
  const lastSeekDirectionRef = useRef<SeekDirection>(undefined);
  const seekIntervalRef = useRef(SEEK_BASE_SECONDS);
  // Keydown fires from a single stable listener (mount/unmount only, like
  // the other window-level listeners in this codebase - see SheetMusic's
  // mouseup drag-end handler) - these refs let it always read current
  // values without resubscribing on every render.
  const engineRef = useRef(engine);
  const durationRef = useRef(duration);
  const speedControlRef = useRef(speedControl);
  const onStepSpeedRef = useRef(onStepSpeed);
  const enabledRef = useRef(enabled);
  const controlMappingRef = useRef(controlMapping);

  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    speedControlRef.current = speedControl;
  }, [speedControl]);

  useEffect(() => {
    onStepSpeedRef.current = onStepSpeed;
  }, [onStepSpeed]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    controlMappingRef.current = controlMapping;
  }, [controlMapping]);

  useEffect(() => {
    const isClaimedByControlMapping = (code: string): boolean => {
      const controlId = makeControlId('keyboard', code);

      return Object.values(controlMappingRef.current).some((ids) =>
        ids.includes(controlId),
      );
    };
    const showIndicator = (label: string) => {
      setIndicator({ label });
      clearTimeout(indicatorTimeoutRef.current);
      indicatorTimeoutRef.current = setTimeout(
        () => setIndicator(undefined),
        INDICATOR_MS,
      );
    };
    const handleSpace = (event: KeyboardEvent) => {
      event.preventDefault();

      const snapshot = engineRef.current?.getSnapshot();

      if (!snapshot) {
        return;
      }

      if (snapshot.isCounting) {
        engineRef.current?.cancel();
      } else if (snapshot.isPlaying) {
        engineRef.current?.pause();
      } else if (!snapshot.isEnded) {
        // Resumes from the current position (quantised to the containing
        // measure, same as the header play/pause button) - never a restart
        // from the top of the song.
        engineRef.current?.play();
      }
    };
    const handleSeek = (event: KeyboardEvent) => {
      event.preventDefault();

      const activeEngine = engineRef.current;

      if (!activeEngine) {
        return;
      }

      const direction: SeekDirection =
        event.code === 'ArrowRight' ? 'forward' : 'backward';
      const now = Date.now();
      const withinWindow = now - lastSeekAtRef.current <= SEEK_ACCEL_WINDOW_MS;
      const sameDirection = lastSeekDirectionRef.current === direction;

      seekIntervalRef.current =
        withinWindow && sameDirection
          ? Math.min(seekIntervalRef.current * 2, SEEK_MAX_SECONDS)
          : SEEK_BASE_SECONDS;
      lastSeekAtRef.current = now;
      lastSeekDirectionRef.current = direction;

      const delta =
        direction === 'forward'
          ? seekIntervalRef.current
          : -seekIntervalRef.current;
      const upperBound = durationRef.current > 0 ? durationRef.current : null;
      const target = Math.max(
        0,
        upperBound === null
          ? activeEngine.timeStore.get() + delta
          : Math.min(upperBound, activeEngine.timeStore.get() + delta),
      );

      activeEngine.seekSeconds(target);
      showIndicator(`${delta >= 0 ? '+' : ''}${delta}s`);
    };
    const handleSpeedStep = (event: KeyboardEvent) => {
      event.preventDefault();

      if (!speedControlRef.current) {
        showIndicator('Speed locked in Perform');

        return;
      }

      onStepSpeedRef.current(event.code === 'ArrowUp' ? 1 : -1);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !enabledRef.current ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isBlockedTarget(event.target) ||
        isClaimedByControlMapping(event.code)
      ) {
        return;
      }

      if (event.code === 'Space') {
        handleSpace(event);
      } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        handleSeek(event);
      } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        handleSpeedStep(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(indicatorTimeoutRef.current);
    };
  }, []);

  return indicator;
}
