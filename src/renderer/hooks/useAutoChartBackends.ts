import { useCallback, useEffect, useState } from 'react';
import { IpcAutoChartBackendsResponse } from '../../types';

export interface UseAutoChartBackendsResult {
  backends: IpcAutoChartBackendsResponse | undefined;
  refresh: () => void;
}

// Both the Create Chart modal (AutoChart.tsx) and My Music's bulk add
// (MyMusic.tsx) need to know which auto-chart backend a freshly created job
// should use — sharing this 'check-auto-chart-backends' /
// 'auto-chart-backends' round trip means both read the exact same detected
// default instead of each asking independently and risking drift between
// the two.
export function useAutoChartBackends(): UseAutoChartBackendsResult {
  const [backends, setBackends] = useState<IpcAutoChartBackendsResponse>();
  const refresh = useCallback(() => {
    window.electron.ipcRenderer.sendMessage('check-auto-chart-backends');
  }, []);

  useEffect(() => {
    refresh();

    return window.electron.ipcRenderer.on<IpcAutoChartBackendsResponse>(
      'auto-chart-backends',
      setBackends,
    );
  }, [refresh]);

  return { backends, refresh };
}
