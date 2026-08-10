import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { App } from 'antd';
import { clamp, mapValues, uniq, without } from 'es-toolkit';
import {
  ControlMapping,
  InputElement,
  InputMapping,
  IpcErrorResponse,
  MidiReadyResponse,
} from '../../types';
import {
  controlLabel,
  controlSource,
  inputBus,
  InputDevice,
  isTypingTarget,
  makeControlId,
} from '../input';
import { usePersisted } from '../hooks/usePersisted';
import {
  CATEGORY_CONFLICTS,
  CONTROL_CATEGORIES,
  MAX_LATENCY_MS,
  MIN_LATENCY_MS,
} from '../constants';

interface InputContextValue {
  selectedDevice: InputDevice | null;
  setSelectedDevice: (d: InputDevice | null) => void;
  /**
   * MIDI is only "connected" after the remembered device is present in a
   * fresh enumeration and its current port has been opened. A remembered kit
   * that is unplugged remains selected, but reports "reconnecting" rather
   * than pretending that the keyboard was chosen instead.
   */
  inputReadiness: InputReadiness;
  inputMapping: InputMapping;
  controlMapping: ControlMapping;
  kitControlIds: Set<string>;
  assignControl: (element: InputElement, controlId: string) => void;
  removeControl: (element: InputElement, controlId: string) => void;
  inputLatencyMs: number;
  setInputLatencyMs: (ms: number) => void;
}

export type InputReadiness = 'connected' | 'reconnecting' | 'needs-selection';

const EMPTY_INPUT_MAPPING: Record<keyof InputMapping, string[]> = {
  hihat: [],
  ride: [],
  crash: [],
  kick: [],
  snare: [],
  tom1: [],
  tom2: [],
  tom3: [],
};
// A freshly-connected MIDI e-kit sends General MIDI / Yamaha DTX drum notes.
// Seeding these as the default (for MIDI devices only) means a kit works the
// moment it's selected, instead of doing nothing until every lane is
// manually "Learned". A lane only falls back to this default while it has
// never been configured for this device — see `inputMapping` below, which
// distinguishes an absent key (never configured) from a stored empty array
// (explicitly cleared by the user).
const DEFAULT_MIDI_INPUT_MAPPING: Record<keyof InputMapping, string[]> = {
  kick: [35, 36].map((note) => makeControlId('midi', note)),
  snare: [38, 40, 37].map((note) => makeControlId('midi', note)),
  hihat: [42, 44, 46, 22, 26].map((note) => makeControlId('midi', note)),
  tom1: [48, 50].map((note) => makeControlId('midi', note)),
  tom2: [45, 47].map((note) => makeControlId('midi', note)),
  tom3: [41, 43].map((note) => makeControlId('midi', note)),
  ride: [51, 53, 59].map((note) => makeControlId('midi', note)),
  crash: [49, 57, 52, 55].map((note) => makeControlId('midi', note)),
};
const EMPTY_CONTROL_MAPPING: Record<keyof ControlMapping, string[]> = {
  up: [],
  down: [],
  left: [],
  right: [],
  confirm: [],
  back: [],
  difficulty: [],
  library: [],
  sort: [],
  pause: [],
  faster: [],
  slower: [],
};
const CONTROL_KEYS = Object.keys(
  EMPTY_CONTROL_MAPPING,
) as (keyof ControlMapping)[];

function isControlElement(
  element: InputElement,
): element is keyof ControlMapping {
  return (CONTROL_KEYS as string[]).includes(element);
}

// Only touches the assigned element and any *other* elements that already
// have a stored entry (to dedupe the controlId across lanes). Elements that
// have never been configured for this device are deliberately left absent
// from the result, rather than seeded with an empty array — otherwise a
// single "Learn" on one lane would mark every other, untouched lane as
// "explicitly configured to empty" and silently blank out its DTX default.
function assignInto(
  current: Partial<Record<keyof InputMapping, string[]>> | undefined,
  element: keyof InputMapping,
  controlId: string,
): Partial<Record<keyof InputMapping, string[]>> {
  const deduped = mapValues(current ?? {}, (list) =>
    list ? without(list, controlId) : list,
  );

  return {
    ...deduped,
    [element]: uniq([...(deduped[element] ?? []), controlId]),
  };
}

function assignControlInto(
  current: Partial<Record<keyof ControlMapping, string[]>> | undefined,
  element: keyof ControlMapping,
  controlId: string,
): Record<keyof ControlMapping, string[]> {
  const conflicting = CATEGORY_CONFLICTS[CONTROL_CATEGORIES.get(element)!];

  return mapValues({ ...EMPTY_CONTROL_MAPPING, ...current }, (list, key) => {
    if (key === element) {
      return uniq([...list, controlId]);
    }

    return conflicting.includes(CONTROL_CATEGORIES.get(key)!)
      ? without(list, controlId)
      : list;
  });
}

const InputContext = createContext<InputContextValue | null>(null);
const SELECTED_DEVICE_KEY = 'settings.selectedDevice';

export const MIDI_RECONNECT_DELAY_MS = 1_000;

// A missing kit is expected to stay missing while the player plugs in USB,
// turns on the module, or returns from a break. Keep probing for the whole
// session, but back off so an unplugged kit does not create a hot IPC loop.
export const MAX_MIDI_RECONNECT_DELAY_MS = 15_000;

export function midiReconnectDelayMs(attempt: number): number {
  return Math.min(
    MIDI_RECONNECT_DELAY_MS * 2 ** Math.min(Math.max(0, attempt), 4),
    MAX_MIDI_RECONNECT_DELAY_MS,
  );
}

// A low-frequency probe catches physical USB disconnects that the native MIDI
// driver does not always surface as an error event. It is deliberately a
// single timeout, not an accumulating interval, and every query itself has a
// timeout in MidiSource.
export const MIDI_HEALTH_CHECK_DELAY_MS = 5_000;

export const MIDI_OPEN_ACK_TIMEOUT_MS = 2_500;

export function InputProvider({ children }: { children: ReactNode }) {
  // Captured once, synchronously, during the first render — before
  // `usePersisted`'s own write-back effect below has a chance to run and
  // persist its default. This is the only reliable way to tell "this
  // profile has never recorded a device preference" apart from "the
  // preference is currently null" (a stored explicit "- None -" choice, or
  // a previously-selected device that later disappeared, both also read
  // back as null). Only a genuinely never-stored profile is eligible for
  // auto-selecting a lone MIDI device below.
  const [hadStoredDevice] = useState(
    () => localStorage.getItem(SELECTED_DEVICE_KEY) !== null,
  );
  const [selectedDevice, setPersistedSelectedDevice] =
    usePersisted<InputDevice | null>(SELECTED_DEVICE_KEY, null);
  // A fresh profile may accept the one unambiguous hardware choice. As soon
  // as a person picks a device (including explicit None), automatic choice is
  // disabled for the rest of the session as well as on later launches.
  const [canAutoSelectMidi, setCanAutoSelectMidi] = useState(
    () => !hadStoredDevice,
  );
  const [inputReadiness, setInputReadiness] = useState<InputReadiness>(() => {
    if (!selectedDevice) {
      return 'needs-selection';
    }

    return selectedDevice.sourceId === 'midi' ? 'reconnecting' : 'connected';
  });
  const [midiReconnectEpoch, setMidiReconnectEpoch] = useState(0);
  const [midiOpenEpoch, setMidiOpenEpoch] = useState(0);
  const [confirmedMidiPort, setConfirmedMidiPort] = useState<
    number | undefined
  >(undefined);
  const reconnectAttempts = useRef(0);
  const midiRetryTimer = useRef<number | undefined>(undefined);
  const [inputMappings, setInputMappings] = usePersisted<
    Record<string, InputMapping>
  >('settings.inputMappings', {});
  const [controlMappings, setControlMappings] = usePersisted<
    Record<string, ControlMapping>
  >('settings.controlMappings', {});
  const [inputLatencyMsRaw, setInputLatencyMsRaw] = usePersisted<number>(
    'settings.inputLatencyMs',
    0,
  );
  const { notification } = App.useApp();
  const clearMidiRetry = useCallback(() => {
    if (midiRetryTimer.current !== undefined) {
      window.clearTimeout(midiRetryTimer.current);
      midiRetryTimer.current = undefined;
    }
  }, []);
  const scheduleMidiRetry = useCallback(() => {
    if (midiRetryTimer.current !== undefined) {
      return;
    }

    const delay = midiReconnectDelayMs(reconnectAttempts.current);

    reconnectAttempts.current += 1;
    midiRetryTimer.current = window.setTimeout(() => {
      midiRetryTimer.current = undefined;
      setMidiOpenEpoch((epoch) => epoch + 1);
    }, delay);
  }, []);
  const setSelectedDevice = useCallback(
    (device: InputDevice | null) => {
      // This is an explicit choice, including a conscious "- None -". Keep
      // it distinct from a profile that has never stored a preference.
      setCanAutoSelectMidi(false);
      clearMidiRetry();
      reconnectAttempts.current = 0;
      setConfirmedMidiPort(undefined);
      setPersistedSelectedDevice(device);
      setInputReadiness(
        device?.sourceId === 'midi'
          ? 'reconnecting'
          : device
          ? 'connected'
          : 'needs-selection',
      );
      setMidiReconnectEpoch((epoch) => epoch + 1);
      setMidiOpenEpoch((epoch) => epoch + 1);
    },
    [clearMidiRetry, setPersistedSelectedDevice],
  );
  const inputMapping = useMemo(() => {
    const stored = selectedDevice
      ? inputMappings[selectedDevice.id]
      : undefined;
    const useDefaults = selectedDevice?.sourceId === 'midi';

    return mapValues(EMPTY_INPUT_MAPPING, (fallback, key) => {
      const storedList = stored?.[key];

      if (storedList !== undefined) {
        return storedList;
      }

      return useDefaults ? DEFAULT_MIDI_INPUT_MAPPING[key] : fallback;
    });
  }, [selectedDevice, inputMappings]);
  const controlMapping = useMemo(
    () => ({
      ...EMPTY_CONTROL_MAPPING,
      ...(selectedDevice ? controlMappings[selectedDevice.id] : undefined),
    }),
    [selectedDevice, controlMappings],
  );
  const kitControlIds = useMemo(
    () => new Set(Object.values(inputMapping).flat()),
    [inputMapping],
  );
  const assignControl = useCallback(
    (element: InputElement, controlId: string) => {
      if (!selectedDevice) {
        return;
      }

      if (isControlElement(element)) {
        setControlMappings((prev) => ({
          ...prev,
          [selectedDevice.id]: assignControlInto(
            prev[selectedDevice.id],
            element,
            controlId,
          ),
        }));

        return;
      }

      setInputMappings((prev) => ({
        ...prev,
        [selectedDevice.id]: assignInto(
          prev[selectedDevice.id],
          element,
          controlId,
        ),
      }));
    },
    [selectedDevice, setControlMappings, setInputMappings],
  );
  const removeControl = useCallback(
    (element: InputElement, controlId: string) => {
      if (!selectedDevice) {
        return;
      }

      if (isControlElement(element)) {
        setControlMappings((prev) => ({
          ...prev,
          [selectedDevice.id]: {
            ...prev[selectedDevice.id],
            [element]: without(
              prev[selectedDevice.id]?.[element] ?? [],
              controlId,
            ),
          },
        }));

        return;
      }

      setInputMappings((prev) => ({
        ...prev,
        [selectedDevice.id]: {
          ...prev[selectedDevice.id],
          [element]: without(
            prev[selectedDevice.id]?.[element] ?? [],
            controlId,
          ),
        },
      }));
    },
    [selectedDevice, setControlMappings, setInputMappings],
  );
  const setInputLatencyMs = useCallback(
    (ms: number) => {
      setInputLatencyMsRaw(clamp(ms, MIN_LATENCY_MS, MAX_LATENCY_MS));
    },
    [setInputLatencyMsRaw],
  );

  useEffect(() => {
    inputBus.start();

    return () => {
      clearMidiRetry();
      inputBus.stop();
    };
  }, [clearMidiRetry]);

  useEffect(() => {
    let cancelled = false;
    let healthCheckTimer: number | undefined;
    const scheduleHealthCheck = () => {
      healthCheckTimer = window.setTimeout(() => {
        setMidiReconnectEpoch((epoch) => epoch + 1);
      }, MIDI_HEALTH_CHECK_DELAY_MS);
    };

    inputBus.listDevices().then((list) => {
      if (cancelled) {
        return;
      }

      const midiDevices = list.filter((d) => d.sourceId === 'midi');

      if (!selectedDevice) {
        setConfirmedMidiPort(undefined);
        // Keyboard is synthetic and must not turn an empty hardware setup
        // into a false positive. Only a never-configured profile is allowed
        // to accept the sole real MIDI input.

        if (canAutoSelectMidi && midiDevices.length === 1) {
          setConfirmedMidiPort(midiDevices[0].port);
          setPersistedSelectedDevice(midiDevices[0]);
          setInputReadiness('reconnecting');
        } else {
          setInputReadiness('needs-selection');
        }

        return;
      }

      if (selectedDevice.sourceId !== 'midi') {
        setConfirmedMidiPort(undefined);
        setInputReadiness('connected');

        return;
      }

      // The port index is intentionally treated as ephemeral. Device IDs are
      // name-based, so a Yamaha DTX or generic GM kit returns to the same
      // mapping even when macOS reorders its ports after a reconnect.
      const liveDevice = midiDevices.find(
        (device) => device.id === selectedDevice.id,
      );

      if (liveDevice) {
        setConfirmedMidiPort(liveDevice.port);

        const portChanged =
          liveDevice.port !== selectedDevice.port ||
          liveDevice.name !== selectedDevice.name;

        if (portChanged) {
          clearMidiRetry();
          setPersistedSelectedDevice(liveDevice);
          setInputReadiness('reconnecting');
        }

        scheduleHealthCheck();

        return;
      }

      // Keep the persisted identity and all of its mappings while the kit is
      // unplugged. Retrying stays background-only for the whole session and
      // uses a bounded backoff, so the player never has to reopen settings
      // merely because the module appeared after launch.
      setConfirmedMidiPort(undefined);
      setInputReadiness('reconnecting');
      scheduleMidiRetry();
    });

    return () => {
      cancelled = true;

      if (healthCheckTimer !== undefined) {
        window.clearTimeout(healthCheckTimer);
      }
    };
  }, [
    selectedDevice,
    canAutoSelectMidi,
    clearMidiRetry,
    midiOpenEpoch,
    midiReconnectEpoch,
    scheduleMidiRetry,
    setPersistedSelectedDevice,
  ]);

  useEffect(() => {
    if (
      selectedDevice?.sourceId !== 'midi' ||
      confirmedMidiPort !== selectedDevice.port
    ) {
      return undefined;
    }

    let failureHandled = false;
    const settleFailure = (description: string) => {
      if (failureHandled) {
        return;
      }

      failureHandled = true;
      setConfirmedMidiPort(undefined);
      setInputReadiness('reconnecting');
      scheduleMidiRetry();

      notification.error({
        key: 'drumroll-midi-reconnect',
        title: "Couldn't connect to your MIDI device",
        description,
        placement: 'bottomRight',
      });
    };
    const unsubscribeReady = window.electron.ipcRenderer.on<MidiReadyResponse>(
      'midi-ready',
      ({ port }) => {
        if (port !== selectedDevice.port || failureHandled) {
          return;
        }

        if (acknowledgementTimer !== undefined) {
          window.clearTimeout(acknowledgementTimer);
        }

        clearMidiRetry();
        reconnectAttempts.current = 0;
        setInputReadiness('connected');
      },
    );
    const unsubscribeError = window.electron.ipcRenderer.on<IpcErrorResponse>(
      'midi-error',
      () =>
        settleFailure(
          `"${selectedDevice.name}" isn't responding. Reconnect it, close any other app using it, or pick another device in settings.`,
        ),
    );
    const acknowledgementTimer = window.setTimeout(
      () =>
        settleFailure(
          `"${selectedDevice.name}" did not confirm a MIDI connection. Drumroll will keep trying in the background.`,
        ),
      MIDI_OPEN_ACK_TIMEOUT_MS,
    );

    window.electron.ipcRenderer.sendMessage('listen-midi', selectedDevice.port);

    return () => {
      window.clearTimeout(acknowledgementTimer);
      unsubscribeReady();
      unsubscribeError();
      window.electron.ipcRenderer.sendMessage('stop-listen-midi');
    };
  }, [
    clearMidiRetry,
    confirmedMidiPort,
    midiOpenEpoch,
    notification,
    scheduleMidiRetry,
    selectedDevice,
  ]);

  useEffect(() => {
    if (selectedDevice?.sourceId !== 'keyboard') {
      return undefined;
    }

    const boundCodes = new Set(
      [
        ...Object.values(inputMappings[selectedDevice.id] ?? {}),
        ...Object.values(controlMappings[selectedDevice.id] ?? {}),
      ]
        .flat()
        .filter((controlId) => controlSource(controlId) === 'keyboard')
        .map((controlId) => controlLabel(controlId)),
    );

    if (boundCodes.size === 0) {
      return undefined;
    }

    const suppressDefault = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (boundCodes.has(event.code)) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', suppressDefault);

    return () => {
      window.removeEventListener('keydown', suppressDefault);
    };
  }, [selectedDevice, inputMappings, controlMappings]);

  const value = useMemo(
    () => ({
      selectedDevice,
      setSelectedDevice,
      inputReadiness,
      inputMapping,
      controlMapping,
      kitControlIds,
      assignControl,
      removeControl,
      inputLatencyMs: inputLatencyMsRaw,
      setInputLatencyMs,
    }),
    [
      selectedDevice,
      setSelectedDevice,
      inputReadiness,
      inputMapping,
      controlMapping,
      kitControlIds,
      assignControl,
      removeControl,
      inputLatencyMsRaw,
      setInputLatencyMs,
    ],
  );

  return (
    <InputContext.Provider value={value}>{children}</InputContext.Provider>
  );
}

export function useInput(): InputContextValue {
  const ctx = useContext(InputContext);

  if (!ctx) {
    throw new Error('useInput must be used within InputProvider');
  }

  return ctx;
}
