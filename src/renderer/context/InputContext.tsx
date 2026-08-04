import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { App } from 'antd';
import { clamp, mapValues, uniq, without } from 'es-toolkit';
import {
  ControlMapping,
  InputElement,
  InputMapping,
  IpcErrorResponse,
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
  inputMapping: InputMapping;
  controlMapping: ControlMapping;
  kitControlIds: Set<string>;
  assignControl: (element: InputElement, controlId: string) => void;
  removeControl: (element: InputElement, controlId: string) => void;
  inputLatencyMs: number;
  setInputLatencyMs: (ms: number) => void;
}

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

export function InputProvider({ children }: { children: ReactNode }) {
  const [selectedDevice, setSelectedDevice] = usePersisted<InputDevice | null>(
    'settings.selectedDevice',
    null,
  );
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

    return () => inputBus.stop();
  }, []);

  useEffect(() => {
    inputBus.listDevices().then((list) => {
      setSelectedDevice((prev: InputDevice | null) =>
        prev && list.some((d) => d.id === prev.id) ? prev : null,
      );
    });
  }, [setSelectedDevice]);

  useEffect(() => {
    if (selectedDevice?.sourceId !== 'midi') {
      return undefined;
    }

    const unsubscribe = window.electron.ipcRenderer.on<IpcErrorResponse>(
      'midi-error',
      () => {
        notification.error({
          title: "Couldn't connect to your MIDI device",
          description: `"${selectedDevice.name}" isn't responding. Reconnect it, close any other app using it, or pick another device in settings.`,
          placement: 'bottomRight',
        });
      },
    );

    window.electron.ipcRenderer.sendMessage('listen-midi', selectedDevice.port);

    return () => {
      unsubscribe();
      window.electron.ipcRenderer.sendMessage('stop-listen-midi');
    };
  }, [selectedDevice, notification]);

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
