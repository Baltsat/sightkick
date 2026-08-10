import { ReactNode } from 'react';
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App as AntdApp, ConfigProvider } from 'antd';
import {
  installIpcMock,
  installLocalStorage,
  IpcMock,
} from '../hooks/test-support';
import { antdTheme } from '../antdTheme';
import { InputDevice } from '../input';
import {
  InputProvider,
  MIDI_HEALTH_CHECK_DELAY_MS,
  MIDI_RECONNECT_DELAY_MS,
  midiReconnectDelayMs,
  useInput,
} from './InputContext';

let ipc: IpcMock;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={antdTheme}>
      <AntdApp>
        <InputProvider>{children}</InputProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

function listenPorts() {
  return ipc.sent
    .filter((s) => s.channel === 'listen-midi')
    .map((s) => s.args[0]);
}

function stopCount() {
  return ipc.sent.filter((s) => s.channel === 'stop-listen-midi').length;
}

function acknowledgeMidi(port: number) {
  act(() => ipc.emit('midi-ready', { port }));
}

// inputBus.listDevices() chains through InputBus -> MidiSource's IPC
// round-trip -> InputContext's own .then(); a single microtask tick isn't
// enough to drain it, and a real device list only ever arrives async, so
// wait a macrotask (draining every pending microtask first) rather than
// pin an exact hop count.
async function respondWithMidiDevices(
  devices: { name: string; port: number }[],
) {
  await act(async () => {
    ipc.emit('midi-device-list', devices);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function flushMidiResponse(devices: { name: string; port: number }[]) {
  await act(async () => {
    ipc.emit('midi-device-list', devices);

    // InputBus -> MidiSource -> InputContext is a short promise chain. Keep
    // this helper timer-free so reconnect tests can use fake clocks.
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  installLocalStorage();
  ipc = installIpcMock();
});

const DEVICE_A: InputDevice = {
  id: 'midi:Pad A',
  name: 'Pad A',
  sourceId: 'midi',
  port: 2,
};
const DEVICE_B: InputDevice = {
  id: 'midi:Pad B',
  name: 'Pad B',
  sourceId: 'midi',
  port: 5,
};

describe('InputContext midi stream ownership', () => {
  it('does not listen when no device is selected', () => {
    renderHook(() => useInput(), { wrapper });

    expect(listenPorts()).toEqual([]);
  });

  it('starts listening only after the selected device is present', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    expect(listenPorts()).toEqual([]);
    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);

    expect(listenPorts()).toEqual([2]);
  });

  it('restarts on the new port when the device changes', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);
    act(() => result.current.setSelectedDevice(DEVICE_B));
    await respondWithMidiDevices([{ name: 'Pad B', port: 5 }]);

    expect(listenPorts()).toEqual([2, 5]);
    expect(stopCount()).toBe(1);
  });

  it('stops listening when the device is cleared', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);
    act(() => result.current.setSelectedDevice(null));

    expect(stopCount()).toBe(1);
  });

  it('stops listening on unmount', async () => {
    const { result, unmount } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);
    unmount();

    expect(stopCount()).toBe(1);
  });

  it('notifies when the selected device fails to connect', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);
    act(() => ipc.emit('midi-error', { error: 'device unavailable' }));

    expect(
      await screen.findByText("Couldn't connect to your MIDI device"),
    ).toBeInTheDocument();
  });

  it('stops listening for connect errors once the device is cleared', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);

    expect(ipc.onCount('midi-error')).toBe(1);

    act(() => result.current.setSelectedDevice(null));

    expect(ipc.onCount('midi-error')).toBe(0);
  });
});

describe('InputContext input mapping', () => {
  it('ignores control assignment when no device is selected', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.assignControl('snare', 'midi:38'));

    expect(result.current.inputMapping.snare).toEqual([]);
  });

  it('assigns a control to the selected device element', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:38'));

    expect(result.current.inputMapping.snare).toEqual(['midi:38']);
  });

  it('does not duplicate a control already bound to the element', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:38'));
    act(() => result.current.assignControl('snare', 'midi:38'));

    expect(result.current.inputMapping.snare).toEqual(['midi:38']);
  });

  it('moves a control off other elements when reassigned', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:38'));
    act(() => result.current.assignControl('kick', 'midi:38'));

    expect(result.current.inputMapping.snare).toEqual([]);
    expect(result.current.inputMapping.kick).toEqual(['midi:38']);
  });

  it('removes a bound control from an element', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:38'));
    act(() => result.current.removeControl('snare', 'midi:38'));

    expect(result.current.inputMapping.snare).toEqual([]);
  });

  it('keeps mappings separate per device', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:38'));

    expect(result.current.inputMapping.snare).toEqual(['midi:38']);

    act(() => result.current.setSelectedDevice(DEVICE_B));

    // DEVICE_B was never configured, so it falls back to its own DTX
    // default rather than inheriting DEVICE_A's manual override.
    expect(result.current.inputMapping.snare).toEqual([
      'midi:38',
      'midi:40',
      'midi:37',
    ]);
  });
});

describe('InputContext control mapping', () => {
  it('assigns a control to an app-control element', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('up', 'midi:50'));

    expect(result.current.controlMapping.up).toEqual(['midi:50']);
    expect(result.current.inputMapping).not.toHaveProperty('up');
  });

  it('checks uniqueness per category, so a control can map a kit element and an app control at once', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:38'));
    act(() => result.current.assignControl('confirm', 'midi:38'));

    expect(result.current.inputMapping.snare).toEqual(['midi:38']);
    expect(result.current.controlMapping.confirm).toEqual(['midi:38']);
  });

  it('moves a control off other app controls when reassigned, leaving the kit alone', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:38'));
    act(() => result.current.assignControl('up', 'midi:38'));
    act(() => result.current.assignControl('down', 'midi:38'));

    expect(result.current.controlMapping.up).toEqual([]);
    expect(result.current.controlMapping.down).toEqual(['midi:38']);
    expect(result.current.inputMapping.snare).toEqual(['midi:38']);
  });

  it('removes a bound control from an app-control element', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('pause', 'midi:39'));
    act(() => result.current.removeControl('pause', 'midi:39'));

    expect(result.current.controlMapping.pause).toEqual([]);
  });
});

describe('InputContext control category uniqueness', () => {
  it('lets one control bind a library element and a game element at once', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('sort', 'midi:40'));
    act(() => result.current.assignControl('pause', 'midi:40'));

    expect(result.current.controlMapping.sort).toEqual(['midi:40']);
    expect(result.current.controlMapping.pause).toEqual(['midi:40']);
  });

  it('moves a control within the library group but leaves a game binding alone', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('pause', 'midi:41'));
    act(() => result.current.assignControl('sort', 'midi:41'));
    act(() => result.current.assignControl('difficulty', 'midi:41'));

    expect(result.current.controlMapping.sort).toEqual([]);
    expect(result.current.controlMapping.difficulty).toEqual(['midi:41']);
    expect(result.current.controlMapping.pause).toEqual(['midi:41']);
  });

  it('moves a control within the game group but leaves a library binding alone', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('sort', 'midi:42'));
    act(() => result.current.assignControl('pause', 'midi:42'));
    act(() => result.current.assignControl('left', 'midi:42'));

    expect(result.current.controlMapping.pause).toEqual([]);
    expect(result.current.controlMapping.left).toEqual(['midi:42']);
    expect(result.current.controlMapping.sort).toEqual(['midi:42']);
  });

  it('clears a shared control off both the library and game groups', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('sort', 'midi:43'));
    act(() => result.current.assignControl('pause', 'midi:43'));
    act(() => result.current.assignControl('confirm', 'midi:43'));

    expect(result.current.controlMapping.sort).toEqual([]);
    expect(result.current.controlMapping.pause).toEqual([]);
    expect(result.current.controlMapping.confirm).toEqual(['midi:43']);
  });

  it('clears a shared binding when the control is reassigned to a game element', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('confirm', 'midi:44'));
    act(() => result.current.assignControl('pause', 'midi:44'));

    expect(result.current.controlMapping.confirm).toEqual([]);
    expect(result.current.controlMapping.pause).toEqual(['midi:44']);
  });
});

const KEYBOARD: InputDevice = {
  id: 'keyboard',
  name: 'Keyboard',
  sourceId: 'keyboard',
};

describe('InputContext keyboard default suppression', () => {
  function dispatchKey(code: string, target?: EventTarget) {
    const event = new KeyboardEvent('keydown', {
      code,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      if (target) {
        target.dispatchEvent(event);
      } else {
        window.dispatchEvent(event);
      }
    });

    return event;
  }

  function bindSpaceOnKeyboard() {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(KEYBOARD));
    act(() => result.current.assignControl('kick', 'keyboard:Space'));

    return result;
  }

  it('suppresses the default action for a bound key', () => {
    bindSpaceOnKeyboard();

    expect(dispatchKey('Space').defaultPrevented).toBe(true);
  });

  it('leaves unbound keys alone', () => {
    bindSpaceOnKeyboard();

    expect(dispatchKey('KeyZ').defaultPrevented).toBe(false);
  });

  it('does not suppress while typing in an input', () => {
    bindSpaceOnKeyboard();

    const input = document.createElement('input');

    document.body.append(input);

    expect(dispatchKey('Space', input).defaultPrevented).toBe(false);

    input.remove();
  });

  it('does not suppress when a non-keyboard device is selected', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));

    expect(dispatchKey('Space').defaultPrevented).toBe(false);
  });
});

describe('InputContext DTX default mapping', () => {
  it('seeds a freshly-selected MIDI device with the DTX/General-MIDI default map', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));

    expect(result.current.inputMapping.snare).toEqual([
      'midi:38',
      'midi:40',
      'midi:37',
    ]);
    expect(result.current.inputMapping.kick).toEqual(['midi:35', 'midi:36']);
  });

  it('does not seed defaults for a keyboard device', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(KEYBOARD));

    expect(result.current.inputMapping.snare).toEqual([]);
  });

  it('lets a manual assignment override the default for just that lane, leaving other lanes on their default', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.assignControl('snare', 'midi:99'));

    expect(result.current.inputMapping.snare).toEqual(['midi:99']);
    expect(result.current.inputMapping.kick).toEqual(['midi:35', 'midi:36']);
    expect(result.current.inputMapping.hihat).toEqual([
      'midi:42',
      'midi:44',
      'midi:46',
      'midi:22',
      'midi:26',
    ]);
  });

  it('keeps an explicitly-cleared lane empty instead of refilling it with the default', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    act(() => result.current.removeControl('snare', 'midi:38'));
    act(() => result.current.removeControl('snare', 'midi:40'));
    act(() => result.current.removeControl('snare', 'midi:37'));

    expect(result.current.inputMapping.snare).toEqual([]);
    expect(result.current.inputMapping.kick).toEqual(['midi:35', 'midi:36']);
  });

  it('scores a hit on the default snare note with no manual configuration', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));

    expect(result.current.inputMapping.snare).toContain('midi:38');
    expect(result.current.kitControlIds.has('midi:38')).toBe(true);
  });
});

describe('InputContext input latency', () => {
  it('defaults input latency to zero', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    expect(result.current.inputLatencyMs).toBe(0);
  });

  it('persists an updated input latency', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setInputLatencyMs(45));

    expect(result.current.inputLatencyMs).toBe(45);
  });

  it('clamps input latency to the -200..200ms range', () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setInputLatencyMs(9999));
    expect(result.current.inputLatencyMs).toBe(200);

    act(() => result.current.setInputLatencyMs(-9999));
    expect(result.current.inputLatencyMs).toBe(-200);
  });
});

describe('InputContext MIDI auto-select', () => {
  it('auto-selects the sole MIDI device found on a fresh profile', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);

    expect(result.current.selectedDevice).toEqual(DEVICE_A);
  });

  it('does not auto-select when more than one MIDI device is found', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    await respondWithMidiDevices([
      { name: 'Pad A', port: 2 },
      { name: 'Pad B', port: 5 },
    ]);

    expect(result.current.selectedDevice).toBeNull();
  });

  it('does not count the always-present keyboard entry as a MIDI device', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    // No real MIDI hardware — the device list is just the synthetic
    // keyboard entry every source list includes.
    await respondWithMidiDevices([]);

    expect(result.current.selectedDevice).toBeNull();
  });

  it('respects a previously stored explicit "- None -" choice instead of auto-selecting', async () => {
    // Simulate a returning profile that has already recorded a choice —
    // even though it currently reads back as null, it must not be treated
    // as "never chosen".
    localStorage.setItem('settings.selectedDevice', 'null');

    const { result } = renderHook(() => useInput(), { wrapper });

    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);

    expect(result.current.selectedDevice).toBeNull();
  });

  it('does not override an already-selected device that is still present', async () => {
    const { result } = renderHook(() => useInput(), { wrapper });

    act(() => result.current.setSelectedDevice(DEVICE_A));
    await respondWithMidiDevices([{ name: 'Pad A', port: 2 }]);

    expect(result.current.selectedDevice).toEqual(DEVICE_A);
  });

  it('keeps a remembered kit selected when it is absent at launch, then restores it on its new port', async () => {
    vi.useFakeTimers();
    localStorage.setItem('settings.selectedDevice', JSON.stringify(DEVICE_A));

    try {
      const { result } = renderHook(() => useInput(), { wrapper });

      expect(result.current.inputReadiness).toBe('reconnecting');
      await flushMidiResponse([]);

      // The preference and its DTX/GM mappings survive an unplugged launch;
      // there is no stale-port listener while the device is absent.
      expect(result.current.selectedDevice).toEqual(DEVICE_A);
      expect(result.current.inputReadiness).toBe('reconnecting');
      expect(listenPorts()).toEqual([]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(MIDI_RECONNECT_DELAY_MS);
      });
      await flushMidiResponse([{ name: 'Pad A', port: 7 }]);
      acknowledgeMidi(7);

      expect(result.current.selectedDevice).toEqual({ ...DEVICE_A, port: 7 });
      expect(result.current.inputReadiness).toBe('connected');
      expect(listenPorts()).toEqual([7]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps looking beyond the old three-attempt window and reconnects without manual input', async () => {
    vi.useFakeTimers();
    localStorage.setItem('settings.selectedDevice', JSON.stringify(DEVICE_A));

    try {
      const { result } = renderHook(() => useInput(), { wrapper });

      await flushMidiResponse([]);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(midiReconnectDelayMs(attempt));
        });
        await flushMidiResponse([]);
      }

      expect(result.current.inputReadiness).toBe('reconnecting');
      expect(result.current.selectedDevice).toEqual(DEVICE_A);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(midiReconnectDelayMs(5));
      });
      await flushMidiResponse([{ name: 'Pad A', port: 11 }]);
      acknowledgeMidi(11);

      expect(result.current.selectedDevice).toEqual({ ...DEVICE_A, port: 11 });
      expect(result.current.inputReadiness).toBe('connected');
      expect(listenPorts()).toEqual([11]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('matches a remembered kit by name when macOS changes its port order', async () => {
    localStorage.setItem('settings.selectedDevice', JSON.stringify(DEVICE_A));

    const { result } = renderHook(() => useInput(), { wrapper });

    await respondWithMidiDevices([{ name: 'Pad A', port: 9 }]);
    acknowledgeMidi(9);

    expect(result.current.selectedDevice).toEqual({ ...DEVICE_A, port: 9 });
    expect(result.current.inputReadiness).toBe('connected');
    expect(listenPorts()).toEqual([9]);
  });

  it('detects a later physical disconnect during its background health check', async () => {
    vi.useFakeTimers();
    localStorage.setItem('settings.selectedDevice', JSON.stringify(DEVICE_A));

    try {
      const { result } = renderHook(() => useInput(), { wrapper });

      await flushMidiResponse([{ name: 'Pad A', port: 2 }]);
      acknowledgeMidi(2);
      expect(result.current.inputReadiness).toBe('connected');
      expect(listenPorts()).toEqual([2]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(MIDI_HEALTH_CHECK_DELAY_MS);
      });
      await flushMidiResponse([]);

      expect(result.current.selectedDevice).toEqual(DEVICE_A);
      expect(result.current.inputReadiness).toBe('reconnecting');
      expect(stopCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-enumerates and resumes the same kit after a MIDI error without duplicating its listener', async () => {
    vi.useFakeTimers();

    try {
      const { result, unmount } = renderHook(() => useInput(), { wrapper });

      act(() => result.current.setSelectedDevice(DEVICE_A));
      await flushMidiResponse([{ name: 'Pad A', port: 2 }]);
      acknowledgeMidi(2);
      expect(listenPorts()).toEqual([2]);
      expect(ipc.onCount('midi-error')).toBe(1);

      act(() => ipc.emit('midi-error', { error: 'device unavailable' }));
      await flushMidiResponse([]);

      expect(result.current.selectedDevice).toEqual(DEVICE_A);
      expect(result.current.inputReadiness).toBe('reconnecting');
      expect(stopCount()).toBe(1);
      expect(ipc.onCount('midi-error')).toBe(0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(MIDI_RECONNECT_DELAY_MS);
      });
      await flushMidiResponse([{ name: 'Pad A', port: 6 }]);
      acknowledgeMidi(6);

      expect(result.current.selectedDevice).toEqual({ ...DEVICE_A, port: 6 });
      expect(result.current.inputReadiness).toBe('connected');
      expect(listenPorts()).toEqual([2, 6]);
      expect(ipc.onCount('midi-error')).toBe(1);

      unmount();
      expect(stopCount()).toBe(2);
      expect(ipc.onCount('midi-error')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never reports Ready for an enumerable but locked port and backs off until open acknowledgement', async () => {
    vi.useFakeTimers();
    localStorage.setItem('settings.selectedDevice', JSON.stringify(DEVICE_A));

    try {
      const { result } = renderHook(() => useInput(), { wrapper });

      await flushMidiResponse([{ name: 'Pad A', port: 2 }]);
      expect(result.current.inputReadiness).toBe('reconnecting');
      expect(listenPorts()).toEqual([2]);

      act(() => ipc.emit('midi-error', { error: 'port is already in use' }));
      expect(result.current.inputReadiness).toBe('reconnecting');
      expect(stopCount()).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(midiReconnectDelayMs(0));
      });
      await flushMidiResponse([{ name: 'Pad A', port: 2 }]);
      expect(listenPorts()).toEqual([2, 2]);
      expect(result.current.inputReadiness).toBe('reconnecting');

      acknowledgeMidi(2);
      expect(result.current.inputReadiness).toBe('connected');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useInput', () => {
  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useInput())).toThrow(
      'useInput must be used within InputProvider',
    );
  });
});
