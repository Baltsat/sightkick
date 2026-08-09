import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MidiDevice, MidiMessageType } from '../../types';
import { installIpcMock, IpcMock } from '../hooks/test-support';
import { MIDI_DEVICE_LIST_TIMEOUT_MS, MidiSource } from './midi-source';
import { InputEvent } from './types';

describe('MidiSource', () => {
  let ipc: IpcMock;

  beforeEach(() => {
    ipc = installIpcMock();
  });

  afterEach(() => {
    delete (window as unknown as { electron?: unknown }).electron;
  });

  function listen(): InputEvent[] {
    const events: InputEvent[] = [];

    new MidiSource().start((event) => events.push(event));

    return events;
  }

  it('emits a namespaced control event for a NoteOn message', () => {
    const events = listen();

    ipc.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 100,
    });

    expect(events).toEqual([{ controlId: 'midi:38', value: 100 }]);
  });

  it('ignores NoteOff and zero-velocity (note-off-style) messages', () => {
    const events = listen();

    ipc.emit('listen-midi', {
      type: MidiMessageType.NoteOff,
      note: 38,
      velocity: 100,
    });
    ipc.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 0,
    });

    expect(events).toEqual([]);
  });

  it('requests and maps the device list into namespaced devices', async () => {
    const promise = new MidiSource().listDevices();
    const devices: MidiDevice[] = [
      { name: 'Pad', port: 0 },
      { name: 'Kit', port: 1 },
    ];

    ipc.emit('midi-device-list', devices);

    await expect(promise).resolves.toEqual([
      { id: 'midi:Pad', name: 'Pad', sourceId: 'midi', port: 0 },
      { id: 'midi:Kit', name: 'Kit', sourceId: 'midi', port: 1 },
    ]);
    expect(ipc.sent).toContainEqual({ channel: 'midi-device-list', args: [] });
  });

  it('shares an in-flight enumeration instead of stacking IPC listeners', async () => {
    const source = new MidiSource();
    const first = source.listDevices();
    const second = source.listDevices();

    expect(second).toBe(first);
    expect(ipc.onceCount('midi-device-list')).toBe(1);
    expect(
      ipc.sent.filter((message) => message.channel === 'midi-device-list'),
    ).toHaveLength(1);

    ipc.emit('midi-device-list', [{ name: 'Pad', port: 0 }]);

    await expect(first).resolves.toEqual([
      { id: 'midi:Pad', name: 'Pad', sourceId: 'midi', port: 0 },
    ]);
    expect(ipc.onceCount('midi-device-list')).toBe(0);
  });

  it('releases a pending enumeration when the source stops', async () => {
    const source = new MidiSource();
    const stop = source.start(() => {});
    const devices = source.listDevices();

    expect(ipc.onceCount('midi-device-list')).toBe(1);
    stop();

    await expect(devices).resolves.toEqual([]);
    expect(ipc.onceCount('midi-device-list')).toBe(0);
  });

  it('bounds an unanswered enumeration instead of retaining its listener', async () => {
    vi.useFakeTimers();

    try {
      const source = new MidiSource();
      const devices = source.listDevices();

      expect(ipc.onceCount('midi-device-list')).toBe(1);
      await vi.advanceTimersByTimeAsync(MIDI_DEVICE_LIST_TIMEOUT_MS);

      await expect(devices).resolves.toEqual([]);
      expect(ipc.onceCount('midi-device-list')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
