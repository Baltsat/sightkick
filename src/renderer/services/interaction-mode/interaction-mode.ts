import { inputBus } from '../../input';

export type InteractionMode = 'kit' | 'computer';

export const INTERACTION_MODE_IDLE_MS = 3_000;

/**
 * Both event families, because a trackpad brush reaches the app as pointer
 * events on some surfaces and mouse events on others. Missing the pointer
 * family left a full-screen veil covering the laptop controls he was using.
 */
const COMPUTER_INPUT_EVENTS = [
  'mousemove',
  'mousedown',
  'pointermove',
  'pointerdown',
  'wheel',
  'keydown',
] as const;

interface InteractionModeEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface InteractionModeArbiterOptions {
  eventTarget?: InteractionModeEventTarget;
  idleMs?: number;
  subscribeToDrumStrikes?: (listener: () => void) => () => void;
}

export class InteractionModeArbiter {
  private readonly eventTarget: InteractionModeEventTarget;
  private readonly idleMs: number;
  private readonly subscribeToDrumStrikes: (listener: () => void) => () => void;
  private readonly listeners = new Set<() => void>();
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribeFromDrumStrikes: (() => void) | undefined;
  private started = false;
  private mode: InteractionMode = 'kit';

  constructor({
    eventTarget = window,
    idleMs = INTERACTION_MODE_IDLE_MS,
    subscribeToDrumStrikes = (listener) =>
      inputBus.subscribeRawMidi((event) => {
        if (event.velocity > 0) {
          listener();
        }
      }),
  }: InteractionModeArbiterOptions = {}) {
    this.eventTarget = eventTarget;
    this.idleMs = idleMs;
    this.subscribeToDrumStrikes = subscribeToDrumStrikes;
  }

  start = (): void => {
    if (this.started) {
      return;
    }

    this.started = true;
    COMPUTER_INPUT_EVENTS.forEach((type) => {
      this.eventTarget.addEventListener(type, this.handleComputerInput);
    });
    this.unsubscribeFromDrumStrikes = this.subscribeToDrumStrikes(
      this.enterKitMode,
    );
  };

  stop = (): void => {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.clearIdleTimer();
    COMPUTER_INPUT_EVENTS.forEach((type) => {
      this.eventTarget.removeEventListener(type, this.handleComputerInput);
    });
    this.unsubscribeFromDrumStrikes?.();
    this.unsubscribeFromDrumStrikes = undefined;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): InteractionMode => this.mode;

  enterComputerMode = (): void => {
    this.setMode('computer');
    this.clearIdleTimer();
    this.idleTimer = setTimeout(this.enterKitMode, this.idleMs);
  };

  enterKitMode = (): void => {
    this.clearIdleTimer();
    this.setMode('kit');
  };

  private handleComputerInput = (): void => {
    this.enterComputerMode();
  };

  private clearIdleTimer(): void {
    if (this.idleTimer === undefined) {
      return;
    }

    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private setMode(mode: InteractionMode): void {
    if (this.mode === mode) {
      return;
    }

    this.mode = mode;
    this.listeners.forEach((listener) => listener());
  }
}
