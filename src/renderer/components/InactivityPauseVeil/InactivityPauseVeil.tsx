import { useCallback, useState } from 'react';
import './InactivityPauseVeil.css';

export function useInactivityPauseVeil(pauseEpoch: number | undefined) {
  const [dismissedEpoch, setDismissedEpoch] = useState<number>();
  const release = useCallback(() => {
    if (pauseEpoch !== undefined) {
      setDismissedEpoch(pauseEpoch);
    }
  }, [pauseEpoch]);

  return {
    visible: pauseEpoch !== undefined && dismissedEpoch !== pauseEpoch,
    release,
  };
}

export function InactivityPauseVeil({
  visible,
  checkpointMeasure,
}: {
  visible: boolean;
  checkpointMeasure: number;
}) {
  if (!visible) {
    return null;
  }

  return (
    <aside
      className="drumroll-inactivity-pause-veil"
      data-testid="inactivity-pause-veil"
      role="status"
      aria-live="polite"
    >
      <div className="drumroll-inactivity-pause-veil__card">
        <span>practice paused</span>
        <strong>Waiting for kit input</strong>
        <p>
          Drumroll held your place at bar {checkpointMeasure + 1}. Move or click
          to use the screen; hit any pad to return with a count-in.
        </p>
      </div>
    </aside>
  );
}
