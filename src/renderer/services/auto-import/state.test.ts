import { describe, expect, it } from 'vitest';
import type { IpcAutoChartJob } from '../../../types';
import type { AutoImportCandidate } from './identity';
import {
  createAutoImportRequest,
  initialAutoImportState,
  reduceAutoImport,
  retryAutoImportRequest,
} from './state';

const candidate: AutoImportCandidate = {
  videoId: 'abcdefghijk',
  title: 'The real recording',
  uploader: 'Official artist',
  durationSeconds: 210,
  thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
  watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  score: 145,
};

function job(
  stage: IpcAutoChartJob['stage'],
  overrides: Partial<IpcAutoChartJob> = {},
): IpcAutoChartJob {
  return {
    id: 'job-1',
    attempt: 1,
    stage,
    message: stage,
    backend: 'sightkick',
    youtubeUrl: candidate.watchUrl,
    autoImport: true,
    ...overrides,
  };
}

describe('auto-import state', () => {
  it('walks one selected result from search to a playable library song', () => {
    let state = reduceAutoImport(initialAutoImportState, { type: 'searching' });

    expect(state.phase).toBe('searching');

    state = reduceAutoImport(state, {
      type: 'candidates',
      candidates: [candidate],
    });
    state = reduceAutoImport(state, { type: 'selected', candidate });

    expect(createAutoImportRequest(candidate)).toEqual({
      youtubeUrl: candidate.watchUrl,
      autoImport: true,
      youtubeCandidate: {
        videoId: candidate.videoId,
        title: candidate.title,
        uploader: candidate.uploader,
        durationSeconds: candidate.durationSeconds,
        watchUrl: candidate.watchUrl,
      },
    });
    expect(state.phase).toBe('queued');

    for (const [stage, phase] of [
      ['queued', 'queued'],
      ['resolving', 'resolving'],
      ['downloading', 'fetching'],
      ['processing', 'charting'],
      ['preview-ready', 'checking'],
      ['importing', 'importing'],
      ['imported', 'playable'],
    ] as const) {
      state = reduceAutoImport(state, { type: 'job', job: job(stage) });
      expect(state.phase).toBe(phase);
    }

    expect(state.jobId).toBe('job-1');
  });

  it("keeps a failed job retryable and ignores another song's job update", () => {
    let state = reduceAutoImport(initialAutoImportState, {
      type: 'candidates',
      candidates: [candidate],
    });

    state = reduceAutoImport(state, { type: 'selected', candidate });

    const unrelated = reduceAutoImport(state, {
      type: 'job',
      job: job('processing', {
        id: 'other-job',
        youtubeUrl: 'https://www.youtube.com/watch?v=othervideo1',
      }),
    });

    expect(unrelated).toEqual(state);

    state = reduceAutoImport(state, {
      type: 'job',
      job: job('failed', { error: 'yt-dlp could not fetch this recording' }),
    });

    expect(state).toMatchObject({
      phase: 'failed',
      retryJobId: 'job-1',
      error: 'yt-dlp could not fetch this recording',
    });
    expect(retryAutoImportRequest(state.retryJobId!)).toEqual({
      channel: 'retry-auto-chart',
      id: 'job-1',
    });

    state = reduceAutoImport(state, { type: 'retry' });

    expect(state).toMatchObject({
      phase: 'queued',
      jobId: undefined,
      retryJobId: undefined,
      error: undefined,
    });
  });
});
