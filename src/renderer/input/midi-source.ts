import { MidiDevice, MidiMessage, MidiMessageType } from '../../types';
import { InputDevice, InputEvent, InputSource } from './types';
import { makeControlId } from './helpers';

// Enumeration is deliberately short-lived. A renderer can be torn down while
// a native MIDI query is in flight (or a device driver can fail to answer), so
// never leave an IPC listener hanging around indefinitely. Calls made while a
// query is running share that query; this also keeps refresh/reconnect paths
// from stacking listeners for the same reply channel.
export const MIDI_DEVICE_LIST_TIMEOUT_MS = 2_000;

interface PendingDeviceList {
  promise: Promise<InputDevice[]>;
  finish: (devices: MidiDevice[]) => void;
  unsubscribe: () => void;
  timeout: number;
}

export class MidiSource implements InputSource {
  readonly id = 'midi' as const;
  private pendingDeviceList?: PendingDeviceList;

  start(emit: (event: InputEvent) => void): () => void {
    const unsubscribe = window.electron.ipcRenderer.on<MidiMessage>(
      'listen-midi',
      ({ type, note, velocity }) => {
        if (type !== MidiMessageType.NoteOn || velocity === 0) {
          return;
        }

        emit({ controlId: makeControlId('midi', note), value: velocity });
      },
    );

    return () => {
      unsubscribe();
      this.finishDeviceList([]);
    };
  }

  listDevices(): Promise<InputDevice[]> {
    if (this.pendingDeviceList) {
      return this.pendingDeviceList.promise;
    }

    let resolvePromise: (devices: InputDevice[]) => void = () => {};
    const pending: PendingDeviceList = {
      promise: new Promise<InputDevice[]>((resolve) => {
        resolvePromise = resolve;
      }),
      finish: () => {},
      unsubscribe: () => {},
      timeout: 0,
    };
    const finish = (list: MidiDevice[]) => {
      if (this.pendingDeviceList !== pending) {
        return;
      }

      this.pendingDeviceList = undefined;
      pending.unsubscribe();
      window.clearTimeout(pending.timeout);
      resolvePromise(
        list.map((device) => ({
          id: makeControlId('midi', device.name),
          name: device.name,
          sourceId: 'midi' as const,
          port: device.port,
        })),
      );
    };

    pending.finish = finish;
    pending.unsubscribe = window.electron.ipcRenderer.once<MidiDevice[]>(
      'midi-device-list',
      finish,
    );
    pending.timeout = window.setTimeout(
      () => finish([]),
      MIDI_DEVICE_LIST_TIMEOUT_MS,
    );
    this.pendingDeviceList = pending;
    window.electron.ipcRenderer.sendMessage('midi-device-list');

    return pending.promise;
  }

  private finishDeviceList(list: MidiDevice[]): void {
    this.pendingDeviceList?.finish(list);
  }
}
