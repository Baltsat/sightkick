import type {
  IpcAutoChartJob,
  LibrarySourceTrackProvenance,
} from '../../../types';
import type { AutoImportCandidate } from './identity';

export interface AutoImportYoutubeCandidate {
  videoId: string;
  title: string;
  uploader?: string;
  durationSeconds?: number;
  watchUrl: string;
}

export interface AutoImportRequest {
  youtubeUrl: string;
  autoImport: true;
  youtubeCandidate: AutoImportYoutubeCandidate;
  sourceProvenance?: LibrarySourceTrackProvenance;
}

export type AutoImportPhase =
  | 'idle'
  | 'searching'
  | 'candidates'
  | 'queued'
  | 'resolving'
  | 'fetching'
  | 'charting'
  | 'checking'
  | 'importing'
  | 'playable'
  | 'failed'
  | 'cancelled';

export interface AutoImportState {
  phase: AutoImportPhase;
  candidates: AutoImportCandidate[];
  selected?: AutoImportCandidate;
  jobId?: string;
  message?: string;
  percent?: number;
  error?: string;
  retryJobId?: string;
}

export type AutoImportEvent =
  | { type: 'searching' }
  | { type: 'candidates'; candidates: AutoImportCandidate[] }
  | { type: 'selected'; candidate: AutoImportCandidate }
  | { type: 'job'; job: IpcAutoChartJob }
  | { type: 'retry' }
  | { type: 'reset' };

export const initialAutoImportState: AutoImportState = {
  phase: 'idle',
  candidates: [],
};

function jobPhase(job: IpcAutoChartJob): AutoImportPhase {
  switch (job.stage) {
    case 'queued':
      return 'queued';

    case 'resolving':
      return 'resolving';

    case 'downloading':
      return 'fetching';

    case 'processing':
      return 'charting';

    case 'preview-ready':
      return 'checking';

    case 'importing':
      return 'importing';

    case 'imported':
      return 'playable';

    case 'failed':
      return 'failed';

    case 'cancelled':
      return 'cancelled';
  }
}

function isSelectedJob(state: AutoImportState, job: IpcAutoChartJob): boolean {
  if (state.jobId) {
    return state.jobId === job.id;
  }

  return (
    state.selected !== undefined &&
    job.youtubeUrl !== undefined &&
    state.selected.watchUrl === job.youtubeUrl
  );
}

export function createAutoImportRequest(
  candidate: AutoImportCandidate,
  sourceProvenance?: LibrarySourceTrackProvenance,
): AutoImportRequest {
  return {
    youtubeUrl: candidate.watchUrl,
    autoImport: true,
    youtubeCandidate: {
      videoId: candidate.videoId,
      title: candidate.title,
      uploader: candidate.uploader,
      durationSeconds: candidate.durationSeconds,
      watchUrl: candidate.watchUrl,
    },
    ...(sourceProvenance
      ? {
          sourceProvenance: {
            ...sourceProvenance,
            artists: [...sourceProvenance.artists],
          },
        }
      : {}),
  };
}

export function retryAutoImportRequest(jobId: string): {
  channel: 'retry-auto-chart';
  id: string;
} {
  return { channel: 'retry-auto-chart', id: jobId };
}

export function reduceAutoImport(
  state: AutoImportState,
  event: AutoImportEvent,
): AutoImportState {
  switch (event.type) {
    case 'searching':
      return { ...initialAutoImportState, phase: 'searching' };

    case 'candidates':
      return { phase: 'candidates', candidates: event.candidates };

    case 'selected':
      return {
        phase: 'queued',
        candidates: state.candidates,
        selected: event.candidate,
        message: `Queued "${event.candidate.title}"`,
      };

    case 'job': {
      if (!isSelectedJob(state, event.job)) {
        return state;
      }

      const phase = jobPhase(event.job);

      return {
        ...state,
        phase,
        jobId: event.job.id,
        message: event.job.message,
        percent: event.job.percent,
        error: event.job.error,
        retryJobId:
          phase === 'failed' || phase === 'cancelled'
            ? event.job.id
            : undefined,
      };
    }

    case 'retry':
      if (!state.retryJobId) {
        return state;
      }

      return {
        ...state,
        phase: 'queued',
        jobId: undefined,
        error: undefined,
        retryJobId: undefined,
        message: `Retrying "${state.selected?.title ?? 'song'}"`,
      };

    case 'reset':
      return initialAutoImportState;
  }
}
