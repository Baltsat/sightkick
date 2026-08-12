import { InputBus } from '../../renderer/input/input-bus';
import { MidiSource } from '../../renderer/input/midi-source';
import { installWebPlatform } from '.';
import { MidiMessageType } from '../../types';
import { toMidiMessage } from './web-midi';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('web MIDI adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps browser status bytes to the renderer MIDI message contract', () => {
    expect(toMidiMessage(new Uint8Array([0x92, 38, 111]))).toEqual({
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 111,
      channel: 2,
    });
    expect(toMidiMessage(new Uint8Array([0xb0, 4, 127]))).toBeUndefined();
  });

  it('feeds a Web MIDI hit through the existing MidiSource and InputBus shape', async () => {
    const input = { id: 'kit', name: 'DTX', onmidimessage: null } as {
      id: string;
      name: string;
      onmidimessage: ((event: { data: Uint8Array }) => void) | null;
    };

    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn().mockResolvedValue({
        inputs: new Map([['kit', input]]),
      }),
    });
    installWebPlatform();

    const bus = new InputBus([new MidiSource()]);
    const events: unknown[] = [];

    bus.subscribe((event) => events.push(event));
    bus.start();

    const devices = await bus.listDevices();

    expect(devices).toEqual([
      { id: 'midi:DTX', name: 'DTX', sourceId: 'midi', port: 0 },
    ]);

    const ready = new Promise<{ port: number }>((resolve) => {
      window.electron.ipcRenderer.once('midi-ready', resolve);
    });

    window.electron.ipcRenderer.sendMessage('listen-midi', 0);
    await expect(ready).resolves.toEqual({ port: 0 });
    await vi.waitFor(() => expect(input.onmidimessage).toBeTypeOf('function'));
    input.onmidimessage?.({ data: new Uint8Array([0x90, 38, 111]) });
    await vi.waitFor(() =>
      expect(events).toEqual([{ controlId: 'midi:38', value: 111 }]),
    );
    bus.stop();
  });
});
