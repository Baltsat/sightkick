import type { InputDevice } from '../../input';
import type { InputReadiness } from '../../context/InputContext';
import type { MidiInputTelemetry } from '../../services/practice-stats';

/**
 * The honest state of "is the app actually seeing this kit right now",
 * derived only from facts the rest of the app already trusts: which device
 * is selected, whether the port handshake completed, and the raw MIDI
 * receipt evidence `useMidiInputTelemetry` collects. Nothing here is
 * invented — every branch reads straight off those three sources, so the
 * panel can never claim a hit landed that Judge itself never saw.
 */
export type KitSignalState =
  | 'no-device'
  | 'not-midi'
  | 'connecting'
  | 'connected-silent'
  | 'receiving-unmapped'
  | 'receiving-mapped';

export function resolveKitSignalState(
  selectedDevice: InputDevice | null,
  inputReadiness: InputReadiness,
  telemetry: MidiInputTelemetry | undefined,
): KitSignalState {
  if (!selectedDevice) {
    return 'no-device';
  }

  if (selectedDevice.sourceId !== 'midi') {
    return 'not-midi';
  }

  if (inputReadiness !== 'connected') {
    return 'connecting';
  }

  if (!telemetry || telemetry.rawMessageCount === 0) {
    return 'connected-silent';
  }

  if (!telemetry.lastMappedLane) {
    return 'receiving-unmapped';
  }

  return 'receiving-mapped';
}

export type KitSignalTone = 'ok' | 'waiting' | 'alert';

export type KitSignalAction = 'setup-input' | 'reconnect';

export interface KitSignalDescription {
  tone: KitSignalTone;
  headline: string;
  body: string;
  action?: KitSignalAction;
  actionLabel?: string;
}

export interface KitSignalContext {
  deviceName?: string;
  rawMessageCount: number;
  lastArrivalLabel?: string;
  laneLabel?: string;
}

export function describeKitSignal(
  state: KitSignalState,
  ctx: KitSignalContext,
): KitSignalDescription {
  const plural = ctx.rawMessageCount === 1 ? 'signal' : 'signals';

  switch (state) {
    case 'no-device':
      return {
        tone: 'alert',
        headline: 'No kit connected',
        body: "Drumroll isn't listening to anything. Nothing you hit can reach the app yet.",
        action: 'setup-input',
        actionLabel: 'Choose your kit',
      };

    case 'not-midi':
      return {
        tone: 'waiting',
        headline: 'Listening to your keyboard, not your kit',
        body: `Drumroll is set to "${
          ctx.deviceName ?? 'your keyboard'
        }". Strikes on your drum kit can't reach the app until you switch to it.`,
        action: 'setup-input',
        actionLabel: 'Switch to your kit',
      };

    case 'connecting':
      return {
        tone: 'alert',
        headline: 'Not connected yet',
        body: `"${
          ctx.deviceName ?? 'Your kit'
        }" is chosen, but Drumroll hasn't connected to it. Check the USB cable and that the module is powered on.`,
        action: 'reconnect',
        actionLabel: 'Try reconnecting',
      };

    case 'connected-silent':
      return {
        tone: 'waiting',
        headline: 'Connected. Waiting for a hit.',
        body: `"${
          ctx.deviceName ?? 'Your kit'
        }" is connected. Hit any pad now — the count below should move.`,
      };

    case 'receiving-unmapped':
      return {
        tone: 'waiting',
        headline: 'Arriving, but not mapped to a drum',
        body: `${ctx.rawMessageCount} ${plural} since this check started, last one at ${ctx.lastArrivalLabel}. None of them are mapped to a drum yet, so it won't count while you play.`,
        action: 'setup-input',
        actionLabel: 'Map this pad',
      };

    case 'receiving-mapped':
      // Two independently-true clauses, deliberately not merged into one:
      // lastArrivalLabel updates on every raw message, lastMappedLane only
      // on a mapped one. A later unmapped strike would make "last one at
      // [time], mapped to [lane]" a false pairing — a claim this panel's
      // only job is to never make.
      return {
        tone: 'ok',
        headline: 'Your kit is coming through',
        body: `${ctx.rawMessageCount} ${plural} since this check started, last one at ${ctx.lastArrivalLabel}. Latest mapped drum: ${ctx.laneLabel}.`,
      };

    default:
      return state;
  }
}
