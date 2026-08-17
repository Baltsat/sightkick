import { CSSProperties } from 'react';
import { Button } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faCircleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { useInput } from '../../context/InputContext';
import { useMidiInputTelemetry } from '../../hooks/useMidiInputTelemetry';
import {
  KIT_ELEMENT_COLOR_VAR,
  KIT_ELEMENT_LABEL,
} from '../../services/pedagogy';
import { SettingLabel } from './SettingLabel';
import {
  KitSignalTone,
  describeKitSignal,
  resolveKitSignalState,
} from './kitSignal';

interface Props {
  onSetupInput?: () => void;
}

// Not tied to any practice run — this diagnostic exists to answer one
// question ("is the app seeing me right now"), so every fresh mount starts
// its own honest count from zero. Opening the panel and striking a pad is
// the whole drill: watch the count leave zero.
const DIAGNOSTIC_SESSION_ID = 'kit-signal-check';
const TONE_TEXT_CLASS: Record<KitSignalTone, string> = {
  ok: 'text-green',
  waiting: 'text-orange',
  alert: 'text-red',
};
const TONE_ICON = {
  ok: faCircleCheck,
  waiting: faCircleExclamation,
  alert: faCircleExclamation,
};

function formatArrival(timestamp: number | undefined): string | undefined {
  if (!timestamp) {
    return undefined;
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * The one thing no automated test can prove: that a real strike on the
 * player's own kit actually reaches Drumroll. This reads the same raw
 * receipt evidence `useMidiInputTelemetry` already collects for saved runs
 * (see `SongView`) — it never invents a count, a lane, or a timestamp.
 */
export function KitSignalCheck({ onSetupInput }: Props) {
  const {
    selectedDevice,
    inputReadiness,
    inputMapping,
    midiPortEpoch,
    reconnectMidi,
  } = useInput();
  const { telemetry } = useMidiInputTelemetry({
    sessionId: DIAGNOSTIC_SESSION_ID,
    selectedDevice,
    inputMapping,
    selectedPortEpoch: midiPortEpoch,
  });
  const state = resolveKitSignalState(
    selectedDevice,
    inputReadiness,
    telemetry,
  );
  const laneLabel = telemetry?.lastMappedLane
    ? KIT_ELEMENT_LABEL[telemetry.lastMappedLane]
    : undefined;
  const description = describeKitSignal(state, {
    deviceName: selectedDevice?.name,
    rawMessageCount: telemetry?.rawMessageCount ?? 0,
    lastArrivalLabel: formatArrival(telemetry?.lastMidiTimestamp),
    laneLabel,
  });
  const handleAction = () => {
    if (description.action === 'reconnect') {
      reconnectMidi();

      return;
    }

    if (description.action === 'setup-input') {
      onSetupInput?.();
    }
  };
  const showAction =
    description.action === 'reconnect' ||
    (description.action === 'setup-input' && Boolean(onSetupInput));

  return (
    <div className="flex flex-col gap-2" data-testid="kit-signal-check">
      <SettingLabel
        label="Kit signal"
        tooltip="Strike 1 pad. Check its mapped drum and arrival time."
      />
      <div
        className="rounded-md border border-border-soft bg-surface-raised p-3 flex flex-col gap-2"
        data-testid="kit-signal-status"
        data-signal-state={state}
      >
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            icon={TONE_ICON[description.tone]}
            className={TONE_TEXT_CLASS[description.tone]}
          />
          {telemetry?.lastMappedLane && (
            <span
              aria-hidden="true"
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={
                {
                  background: KIT_ELEMENT_COLOR_VAR[telemetry.lastMappedLane],
                } as CSSProperties
              }
            />
          )}
          <div
            className={`text-sm font-semibold ${
              TONE_TEXT_CLASS[description.tone]
            }`}
            data-testid="kit-signal-headline"
          >
            {description.headline}
          </div>
        </div>

        <p
          className="text-xs text-text-muted m-0"
          data-testid="kit-signal-body"
        >
          {description.body}
        </p>

        {showAction ? (
          <Button
            size="small"
            className="self-start"
            data-testid="kit-signal-action"
            onClick={handleAction}
          >
            {description.actionLabel}
          </Button>
        ) : null}

        {selectedDevice?.sourceId === 'midi' && (
          <div
            className="text-[11px] text-text-faint font-mono"
            data-testid="kit-signal-technical"
          >
            connection #{midiPortEpoch} · raw hits{' '}
            {telemetry?.rawMessageCount ?? 0} · lane{' '}
            {telemetry?.lastMappedLane ?? 'none'}
          </div>
        )}
      </div>
    </div>
  );
}
