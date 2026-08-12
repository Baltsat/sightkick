import {
  InputDevice,
  InputEvent,
  InputSource,
  RawMidiInputEvent,
} from './types';

export class InputBus {
  private priorityListeners = new Set<(event: InputEvent) => void>();
  private listeners = new Set<(event: InputEvent) => void>();
  private rawMidiListeners = new Set<(event: RawMidiInputEvent) => void>();
  private stops: (() => void)[] = [];
  private captureListener?: (event: InputEvent) => void;

  constructor(private sources: InputSource[]) {}

  start(): void {
    if (this.stops.length > 0) {
      return;
    }

    const emit = (event: InputEvent) => {
      if (this.captureListener) {
        this.captureListener(event);

        return;
      }

      // Gesture candidates observe first so Engine can open a short evidence
      // transaction before the same physical strike reaches Judge. Normal
      // listeners still receive the exact event synchronously afterward.
      this.priorityListeners.forEach((listener) => listener(event));
      this.listeners.forEach((listener) => listener(event));
    };
    const emitRawMidi = (event: RawMidiInputEvent) => {
      this.rawMidiListeners.forEach((listener) => listener(event));
    };

    this.stops = this.sources.map((source) => source.start(emit, emitRawMidi));
  }

  stop(): void {
    this.stops.forEach((stop) => stop());
    this.stops = [];
  }

  subscribe = (listener: (event: InputEvent) => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribePriority = (listener: (event: InputEvent) => void): (() => void) => {
    this.priorityListeners.add(listener);

    return () => {
      this.priorityListeners.delete(listener);
    };
  };

  subscribeRawMidi = (
    listener: (event: RawMidiInputEvent) => void,
  ): (() => void) => {
    this.rawMidiListeners.add(listener);

    return () => {
      this.rawMidiListeners.delete(listener);
    };
  };

  capture = (listener: (event: InputEvent) => void): (() => void) => {
    this.captureListener = listener;

    return () => {
      if (this.captureListener === listener) {
        this.captureListener = undefined;
      }
    };
  };

  async listDevices(): Promise<InputDevice[]> {
    const lists = await Promise.all(
      this.sources.map((source) => source.listDevices()),
    );

    return lists.flat();
  }
}
