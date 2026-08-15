import { useCallback, useState } from 'react';
import { KitCommandVeil } from '../KitCommandPrompt';

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
    <KitCommandVeil
      kicker="Paused"
      title="Hit any pad to return"
      model={{ label: 'Return to the score', steps: ['any'] }}
      detail={`Bar ${
        checkpointMeasure + 1
      } is held · a fresh count-in resumes from here.`}
      tone="warning"
      testId="inactivity-pause-veil"
      state="inactivity-paused"
    />
  );
}
