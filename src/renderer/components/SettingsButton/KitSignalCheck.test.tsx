import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiMessageType } from '../../../types';
import { InputProvider } from '../../context/InputContext';
import {
  installIpcMock,
  installLocalStorage,
  IpcMock,
} from '../../hooks/test-support';
import { KitSignalCheck } from './KitSignalCheck';
import { describeKitSignal, resolveKitSignalState } from './kitSignal';

// InputContext -> InputBus -> MidiSource's device list is a short IPC round
// trip through a couple of promise hops. Mirrors InputContext.test.tsx's own
// `flushMidiResponse`: draining plain microtask ticks (not a real timer) so
// this stays compatible with fake-timer tests elsewhere in the suite.
async function connectMidiDevice(
  ipc: IpcMock,
  device: { name: string; port: number },
) {
  await act(async () => {
    ipc.emit('midi-device-list', [device]);

    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
  });
  act(() => ipc.emit('midi-ready', { port: device.port }));
}

describe('resolveKitSignalState', () => {
  const midiDevice = {
    id: 'midi:Yamaha DTX402',
    name: 'Yamaha DTX402',
    sourceId: 'midi' as const,
    port: 4,
  };
  const keyboardDevice = {
    id: 'keyboard',
    name: 'Keyboard',
    sourceId: 'keyboard' as const,
  };

  it('reports no-device when nothing is selected', () => {
    expect(resolveKitSignalState(null, 'waiting', undefined)).toBe('no-device');
  });

  it('reports not-midi when the keyboard is selected', () => {
    expect(resolveKitSignalState(keyboardDevice, 'connected', undefined)).toBe(
      'not-midi',
    );
  });

  it('reports connecting while a MIDI kit has not confirmed a port yet', () => {
    expect(resolveKitSignalState(midiDevice, 'reconnecting', undefined)).toBe(
      'connecting',
    );
    expect(resolveKitSignalState(midiDevice, 'waiting', undefined)).toBe(
      'connecting',
    );
  });

  it('reports connected-silent once connected but nothing has arrived', () => {
    expect(resolveKitSignalState(midiDevice, 'connected', undefined)).toBe(
      'connected-silent',
    );
    expect(
      resolveKitSignalState(midiDevice, 'connected', {
        rawMessageCount: 0,
        selectedPortEpoch: 1,
      }),
    ).toBe('connected-silent');
  });

  it('reports receiving-unmapped for a real message with no mapped lane', () => {
    expect(
      resolveKitSignalState(midiDevice, 'connected', {
        rawMessageCount: 3,
        selectedPortEpoch: 1,
      }),
    ).toBe('receiving-unmapped');
  });

  it('reports receiving-mapped once a message lands on a real lane', () => {
    expect(
      resolveKitSignalState(midiDevice, 'connected', {
        rawMessageCount: 3,
        selectedPortEpoch: 1,
        lastMappedLane: 'snare',
      }),
    ).toBe('receiving-mapped');
  });
});

describe('describeKitSignal', () => {
  it('names the likely cause when nothing is selected', () => {
    const description = describeKitSignal('no-device', { rawMessageCount: 0 });

    expect(description.tone).toBe('alert');
    expect(description.headline).toBe('No kit connected');
    expect(description.action).toBe('setup-input');
  });

  it('names the wrong-source cause with the actual device name', () => {
    const description = describeKitSignal('not-midi', {
      deviceName: 'Keyboard',
      rawMessageCount: 0,
    });

    expect(description.body).toContain('"Keyboard"');
  });

  it('never claims a hit landed when nothing has arrived', () => {
    const description = describeKitSignal('connected-silent', {
      deviceName: 'Yamaha DTX402',
      rawMessageCount: 0,
    });

    expect(description.body).not.toMatch(/\d+ signals?/);
  });

  it('states the true count and lane once a hit is mapped', () => {
    const description = describeKitSignal('receiving-mapped', {
      rawMessageCount: 1,
      lastArrivalLabel: '10:00:00 AM',
      laneLabel: 'Snare',
    });

    expect(description.tone).toBe('ok');
    expect(description.body).toBe(
      '1 signal since this check started, last one at 10:00:00 AM. Latest mapped drum: Snare.',
    );
  });

  it('never pairs the latest arrival time with a lane from an earlier hit', () => {
    // lastArrivalLabel and laneLabel can come from two different messages
    // (an unmapped strike can arrive after the last mapped one) — the two
    // clauses must stay independently true, never merged into one claim.
    const description = describeKitSignal('receiving-mapped', {
      rawMessageCount: 2,
      lastArrivalLabel: '10:00:05 AM',
      laneLabel: 'Kick',
    });

    expect(description.body).toBe(
      '2 signals since this check started, last one at 10:00:05 AM. Latest mapped drum: Kick.',
    );
    expect(description.body).not.toMatch(/last one at .*, mapped to/);
  });

  it('flags an arriving-but-unmapped signal instead of pretending it counts', () => {
    const description = describeKitSignal('receiving-unmapped', {
      rawMessageCount: 2,
      lastArrivalLabel: '10:00:01 AM',
    });

    expect(description.tone).toBe('waiting');
    expect(description.body).toContain("won't count");
    expect(description.action).toBe('setup-input');
  });
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <InputProvider>{children}</InputProvider>;
}

describe('KitSignalCheck', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('tells the player plainly that nothing is reaching the app, with a fix', () => {
    const ipc = installIpcMock();
    const onSetupInput = vi.fn();

    render(<KitSignalCheck onSetupInput={onSetupInput} />, { wrapper });

    act(() => ipc.emit('midi-device-list', []));

    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'no-device',
    );
    expect(screen.getByTestId('kit-signal-headline')).toHaveTextContent(
      'No kit connected',
    );

    fireEvent.click(screen.getByTestId('kit-signal-action'));
    expect(onSetupInput).toHaveBeenCalledOnce();
  });

  it('names the keyboard by name when it is selected instead of the kit', () => {
    window.localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'keyboard',
        name: 'Keyboard',
        sourceId: 'keyboard',
      }),
    );

    const ipc = installIpcMock();

    render(<KitSignalCheck />, { wrapper });

    act(() => ipc.emit('midi-device-list', []));

    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'not-midi',
    );
    expect(screen.getByTestId('kit-signal-body')).toHaveTextContent(
      'Drumroll is set to "Keyboard"',
    );
  });

  it('proves a real strike arrives, shows its mapped lane, and moves the count', async () => {
    window.localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'midi:Yamaha DTX402',
        name: 'Yamaha DTX402',
        sourceId: 'midi',
        port: 4,
      }),
    );

    const ipc = installIpcMock();

    render(<KitSignalCheck />, { wrapper });

    // Selected, but not yet handshaken — the drill's "not connected" state.
    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'connecting',
    );

    await connectMidiDevice(ipc, { name: 'Yamaha DTX402', port: 4 });

    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'connected-silent',
    );

    // Note 38 is the DTX/GM default for snare (see InputContext's
    // DEFAULT_MIDI_INPUT_MAPPING) — a real strike, mapped to a real lane.
    act(() =>
      ipc.emit('listen-midi', {
        type: MidiMessageType.NoteOn,
        note: 38,
        velocity: 100,
      }),
    );

    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'receiving-mapped',
    );
    expect(screen.getByTestId('kit-signal-body')).toHaveTextContent(
      '1 signal since this check started',
    );
    expect(screen.getByTestId('kit-signal-body')).toHaveTextContent(
      'Latest mapped drum: Snare',
    );
    expect(screen.getByTestId('kit-signal-technical')).toHaveTextContent(
      'raw hits 1',
    );

    // A second strike moves the counter further — this is the "watch it
    // move" proof the drill asks for.
    act(() =>
      ipc.emit('listen-midi', {
        type: MidiMessageType.NoteOn,
        note: 38,
        velocity: 90,
      }),
    );

    expect(screen.getByTestId('kit-signal-body')).toHaveTextContent(
      '2 signals since this check started',
    );
  });

  it('flags a strike that arrives unmapped instead of silently ignoring it', async () => {
    window.localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'midi:Yamaha DTX402',
        name: 'Yamaha DTX402',
        sourceId: 'midi',
        port: 4,
      }),
    );

    const ipc = installIpcMock();
    const onSetupInput = vi.fn();

    render(<KitSignalCheck onSetupInput={onSetupInput} />, { wrapper });

    await connectMidiDevice(ipc, { name: 'Yamaha DTX402', port: 4 });

    // Note 100 is not in any DTX/GM default lane list — a real, unmapped
    // signal, the exact case a naive "it works" panel could paper over.
    act(() =>
      ipc.emit('listen-midi', {
        type: MidiMessageType.NoteOn,
        note: 100,
        velocity: 100,
      }),
    );

    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'receiving-unmapped',
    );
    expect(screen.getByTestId('kit-signal-body')).toHaveTextContent(
      "won't count",
    );

    fireEvent.click(screen.getByTestId('kit-signal-action'));
    expect(onSetupInput).toHaveBeenCalledOnce();
  });

  it('lets the player retry the connection when a chosen kit has not answered', async () => {
    window.localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'midi:Yamaha DTX402',
        name: 'Yamaha DTX402',
        sourceId: 'midi',
        port: 4,
      }),
    );

    const ipc = installIpcMock();

    render(<KitSignalCheck />, { wrapper });

    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'connecting',
    );

    // Resolve the automatic startup probe as "kit not found yet" so it is
    // no longer in flight — otherwise a deliberate retry would just share
    // that same still-pending request (MidiSource.listDevices dedupes).
    await act(async () => {
      ipc.emit('midi-device-list', []);

      for (let i = 0; i < 8; i += 1) {
        await Promise.resolve();
      }
    });

    const beforeRetry = ipc.sent.filter(
      (s) => s.channel === 'midi-device-list',
    ).length;

    fireEvent.click(screen.getByTestId('kit-signal-action'));

    // A retry issues its own fresh device-list request the kit must answer
    // before Drumroll reopens the MIDI port.
    expect(
      ipc.sent.filter((s) => s.channel === 'midi-device-list').length,
    ).toBeGreaterThan(beforeRetry);

    await connectMidiDevice(ipc, { name: 'Yamaha DTX402', port: 4 });

    expect(screen.getByTestId('kit-signal-status')).toHaveAttribute(
      'data-signal-state',
      'connected-silent',
    );
  });
});
