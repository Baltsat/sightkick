import { useCallback, useState } from 'react';
import '../PracticeEdgeCaption/PracticeEdgeCaption.css';
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
      className="drumroll-practice-edge-caption drumroll-inactivity-pause-veil"
      data-testid="inactivity-pause-veil"
      data-edge-caption="inactivity-paused"
      data-tone="warning"
      role="status"
      aria-live="polite"
    >
      <span className="drumroll-practice-edge-caption__kicker">Paused</span>
      <strong className="drumroll-practice-edge-caption__title">
        Bar {checkpointMeasure + 1} is held
      </strong>
      <p className="drumroll-practice-edge-caption__detail">
        Hit any pad to return with a count-in.
      </p>
    </aside>
  );
}
