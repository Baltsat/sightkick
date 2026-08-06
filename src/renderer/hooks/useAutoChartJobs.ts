import { useEffect, useRef, useState } from 'react';
import { AutoChartStage, IpcAutoChartJob } from '../../types';

const TERMINAL_STAGES: AutoChartStage[] = ['imported', 'failed', 'cancelled'];

export function isTerminalAutoChartStage(stage: AutoChartStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

export function cancelAutoChartJob(id: string): void {
  window.electron.ipcRenderer.sendMessage('cancel-auto-chart', id);
}

// Every 'auto-chart-update' event carries a `jobs` snapshot of every
// still-live (non-terminal) job the main-process AutoChartQueue currently
// knows about — not just the single job the event is about (see
// src/main/ipc/autoChart.ts's AutoChartQueue.notify()). This hook
// centralizes that subscription so any surface that creates auto-chart jobs
// (the Create Chart modal in AutoChart.tsx, My Music's bulk add in
// MyMusic.tsx) reads the identical wire format and sees the *whole* queue,
// instead of each parsing 'auto-chart-update' on its own and only ever
// knowing about the job it personally triggered.
export function useAutoChartJobs(
  onUpdate?: (job: IpcAutoChartJob) => void,
): IpcAutoChartJob[] {
  const [jobs, setJobs] = useState<IpcAutoChartJob[]>([]);
  const onUpdateRef = useRef(onUpdate);

  // Keeps onUpdateRef current after every render without making it a
  // useEffect dependency (which would tear down and resubscribe the IPC
  // listener below every time the caller passes a new callback identity).
  // Assigning during render (rather than in this effect) is disallowed —
  // refs are only safe to write outside of render.
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    return window.electron.ipcRenderer.on<IpcAutoChartJob>(
      'auto-chart-update',
      (nextJob) => {
        setJobs(nextJob.jobs ?? []);
        onUpdateRef.current?.(nextJob);
      },
    );
  }, []);

  return jobs;
}
