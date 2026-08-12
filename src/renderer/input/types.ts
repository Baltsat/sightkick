export type SourceId = 'midi' | 'keyboard';

export interface InputDevice {
  id: string;
  name: string;
  sourceId: SourceId;
  port?: number;
}

export interface InputEvent {
  controlId: string;
  value: number;
}

export interface RawMidiInputEvent {
  controlId: string;
  type: number;
  note: number;
  velocity: number;
  receivedAt: number;
}

export interface InputSource {
  readonly id: SourceId;
  start(
    emit: (event: InputEvent) => void,
    emitRawMidi?: (event: RawMidiInputEvent) => void,
  ): () => void;
  listDevices(): Promise<InputDevice[]>;
}
