import { MidiDevice, MidiMessage, MidiMessageType } from '../../types';

export function toMidiMessage(data: Uint8Array): MidiMessage | undefined {
  const [status = 0, note = 0, velocity = 0] = data;
  const type = status & 0xf0;

  if (type !== MidiMessageType.NoteOn && type !== MidiMessageType.NoteOff) {
    return undefined;
  }

  return {
    type,
    note,
    velocity,
    channel: status & 0x0f,
  };
}

export class WebMidiBridge {
  private access?: MIDIAccess;
  private selected?: MIDIInput;

  private async getAccess(): Promise<MIDIAccess> {
    if (this.access) {
      return this.access;
    }

    const request = navigator.requestMIDIAccess;

    if (!request) {
      throw new Error(
        'Web MIDI is unavailable. Use Chrome on HTTPS or localhost.',
      );
    }

    this.access = await request.call(navigator);

    return this.access;
  }

  async listDevices(): Promise<MidiDevice[]> {
    const access = await this.getAccess();

    return [...access.inputs.values()].map((input, port) => ({
      port,
      name: input.name || `MIDI input ${port + 1}`,
    }));
  }

  async listen(
    port: number,
    emit: (message: MidiMessage) => void,
  ): Promise<void> {
    const access = await this.getAccess();
    const input = [...access.inputs.values()][port];

    if (!input) {
      throw new Error('The selected MIDI input is no longer available.');
    }

    this.stop();
    this.selected = input;
    input.onmidimessage = (event) => {
      if (!event.data) {
        return;
      }

      const message = toMidiMessage(event.data);

      if (message) {
        emit(message);
      }
    };
  }

  stop(): void {
    if (this.selected) {
      this.selected.onmidimessage = null;
      this.selected = undefined;
    }
  }
}
