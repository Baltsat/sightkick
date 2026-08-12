import { act, fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IpcAutoChartBackendsResponse,
  IpcAutoChartJob,
  Song,
} from '../../../types';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { AutoChart } from './AutoChart';

let ipc: IpcMock;

function renderAutoChart(onImported = vi.fn()) {
  render(
    <AntdApp>
      <AutoChart disabled={false} onImported={onImported} />
    </AntdApp>,
  );

  return onImported;
}

function emitJob(job: IpcAutoChartJob) {
  act(() => {
    ipc.emit('auto-chart-update', job);
  });
}

function emitBackends(response: IpcAutoChartBackendsResponse) {
  act(() => {
    ipc.emit('auto-chart-backends', response);
  });
}

function emitRemoteSettings(endpoint = '', tokenConfigured = false) {
  act(() => {
    ipc.emit('auto-chart-remote-settings', { endpoint, tokenConfigured });
  });
}

const preview = {
  sourceDir: '/tmp/prepared-song',
  name: 'Official title',
  artist: 'Official channel',
  album: '',
  charter: '',
  autoChartTool: 'STRUM (OCTAVE AI auto-charter)',
  chartFormat: 'mid' as const,
  audioCount: 2,
  drumDifficulties: ['expert'] as never[],
  thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
  coverSource: 'none' as const,
};
const importedSong: Song = {
  id: 'song-1',
  dir: '/library/Official title',
  name: 'Official title',
  artist: 'Official channel',
  album: '',
  charter: '',
  genre: '',
  year: '',
  fiveLaneDrums: false,
  proDrums: false,
  delaySeconds: 0,
  drumDifficulty: 0,
  format: 'mid',
  audio: [],
};

describe('AutoChart', () => {
  beforeEach(() => {
    ipc = installIpcMock();
  });

  it('asks the main process for available backends on mount', () => {
    renderAutoChart();

    expect(ipc.sent).toContainEqual({
      channel: 'check-auto-chart-backends',
      args: [],
    });
    expect(ipc.sent).toContainEqual({
      channel: 'get-auto-chart-remote-settings',
      args: [],
    });
  });

  it('pastes a YouTube URL and downloads, separates, transcribes and builds a chart automatically end to end', () => {
    const onImported = renderAutoChart();

    emitBackends({
      sightkick: true,
      remote: false,
      octave: false,
      default: 'sightkick',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    expect(screen.getByLabelText('YouTube video URL')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('auto-chart-youtube-url'), {
      target: { value: 'https://youtu.be/abcdefghijk' },
    });

    const goButton = screen.getByTestId('auto-chart-from-youtube');

    expect(goButton).toBeEnabled();
    fireEvent.click(goButton);

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [
        { youtubeUrl: 'https://youtu.be/abcdefghijk', backend: 'sightkick' },
      ],
    });

    emitJob({
      id: 'job-1',
      attempt: 1,
      stage: 'downloading',
      backend: 'sightkick',
      message: 'Downloading audio from YouTube',
      sourceName: 'Official title',
      percent: 10,
    });
    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'Downloading audio',
    );
    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'Drumroll',
    );
    expect(screen.getByTestId('auto-chart-steps')).toHaveTextContent(
      'Download audio',
    );
    expect(screen.getByTestId('auto-chart-steps')).toHaveTextContent(
      'Separate drums',
    );
    expect(screen.getByTestId('auto-chart-steps')).toHaveTextContent(
      'Transcribe notes',
    );
    expect(screen.getByTestId('auto-chart-steps')).toHaveTextContent(
      'Build chart',
    );

    emitJob({
      id: 'job-1',
      attempt: 1,
      stage: 'processing',
      backend: 'sightkick',
      message: 'Separating drums',
      sourceName: 'Official title',
      percent: 55,
    });
    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent('55%');

    emitJob({
      id: 'job-1',
      attempt: 1,
      stage: 'preview-ready',
      backend: 'sightkick',
      message: 'Chart is ready to review before adding it to your library',
      preview,
    });
    expect(
      screen.getByText('Add this song to your library'),
    ).toBeInTheDocument();
    expect(screen.getByText('Official title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));
    expect(ipc.sent).toContainEqual({
      channel: 'import-auto-chart',
      args: ['job-1'],
    });
    expect(onImported).not.toHaveBeenCalled();

    emitJob({
      id: 'job-1',
      attempt: 1,
      stage: 'imported',
      backend: 'sightkick',
      message: 'Added "Official title" to the current library',
      song: importedSong,
    });
    expect(onImported).toHaveBeenCalledWith(importedSong);
  });

  it('keeps choosing a local audio file working as a secondary path', () => {
    renderAutoChart();
    emitBackends({
      sightkick: true,
      remote: false,
      octave: false,
      default: 'sightkick',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    fireEvent.click(screen.getByTestId('auto-chart-local-file'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ localFile: true, backend: 'sightkick' }],
    });
  });

  it('disables the YouTube download action until sightkick is available', () => {
    renderAutoChart();
    emitBackends({
      sightkick: false,
      remote: false,
      octave: true,
      default: 'octave',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    fireEvent.change(screen.getByTestId('auto-chart-youtube-url'), {
      target: { value: 'https://youtu.be/abcdefghijk' },
    });

    expect(screen.getByTestId('auto-chart-from-youtube')).toBeDisabled();
  });

  it('lets the user pick between two available backends and shows which one is used', () => {
    renderAutoChart();
    emitBackends({
      sightkick: true,
      remote: false,
      octave: true,
      default: 'sightkick',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    expect(screen.getByTestId('auto-chart-backend-select')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'OCTAVE' }));
    fireEvent.click(screen.getByTestId('auto-chart-local-file'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ localFile: true, backend: 'octave' }],
    });
  });

  it('shows a clear error when no auto-chart backend is available', () => {
    renderAutoChart();
    emitBackends({
      sightkick: false,
      remote: false,
      octave: false,
      default: 'sightkick',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));

    expect(screen.getByTestId('auto-chart-no-backend')).toHaveTextContent(
      'No auto-chart engine is available',
    );
  });

  it('shows a clear, honest error when a YouTube download fails', () => {
    renderAutoChart();
    emitBackends({
      sightkick: true,
      remote: false,
      octave: false,
      default: 'sightkick',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    fireEvent.change(screen.getByTestId('auto-chart-youtube-url'), {
      target: { value: 'https://youtu.be/abcdefghijk' },
    });
    fireEvent.click(screen.getByTestId('auto-chart-from-youtube'));

    emitJob({
      id: 'job-1',
      attempt: 1,
      stage: 'failed',
      backend: 'sightkick',
      message: 'Chart creation failed',
      error: 'This video is age-restricted and cannot be downloaded',
      sourceName: 'Official title',
    });

    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'This video is age-restricted and cannot be downloaded',
    );
    expect(
      screen
        .getByTestId('auto-chart-steps')
        .querySelector('.ant-steps-item-error'),
    ).toHaveTextContent('Download audio');
  });

  it('lets the user cancel an in-flight chart at any stage', () => {
    renderAutoChart();
    emitBackends({
      sightkick: true,
      remote: false,
      octave: false,
      default: 'sightkick',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    fireEvent.change(screen.getByTestId('auto-chart-youtube-url'), {
      target: { value: 'https://youtu.be/abcdefghijk' },
    });
    fireEvent.click(screen.getByTestId('auto-chart-from-youtube'));

    emitJob({
      id: 'job-1',
      attempt: 1,
      stage: 'downloading',
      backend: 'sightkick',
      message: 'Downloading audio from YouTube',
      sourceName: 'Official title',
      percent: 5,
    });

    fireEvent.click(screen.getByTestId('auto-chart-cancel'));
    expect(ipc.sent).toContainEqual({
      channel: 'cancel-auto-chart',
      args: ['job-1'],
    });
  });

  it('stores, tests, and selects a configured remote backend', () => {
    renderAutoChart();
    emitRemoteSettings('http://localhost:18010', false);
    emitBackends({
      sightkick: false,
      remote: false,
      octave: true,
      default: 'octave',
    });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    fireEvent.change(screen.getByTestId('auto-chart-remote-token'), {
      target: { value: 'secret-token' },
    });
    fireEvent.click(screen.getByTestId('auto-chart-remote-test'));

    expect(ipc.sent).toContainEqual({
      channel: 'save-test-auto-chart-remote',
      args: [
        {
          endpoint: 'http://localhost:18010',
          token: 'secret-token',
        },
      ],
    });

    act(() => {
      ipc.emit('auto-chart-remote-test', {
        ok: true,
        message: 'Remote transcriber is reachable',
      });
    });
    emitBackends({
      sightkick: false,
      remote: true,
      octave: true,
      default: 'remote',
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Remote' }));
    fireEvent.change(screen.getByTestId('auto-chart-youtube-url'), {
      target: { value: 'https://youtu.be/abcdefghijk' },
    });
    fireEvent.click(screen.getByTestId('auto-chart-from-youtube'));

    expect(
      screen.getByTestId('auto-chart-remote-test-result'),
    ).toHaveTextContent('Remote transcriber is reachable');
    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: 'https://youtu.be/abcdefghijk', backend: 'remote' }],
    });
  });

  it('renders the pending queue behind the active job, with a per-job cancel and a cancel-all', () => {
    renderAutoChart();
    emitBackends({
      sightkick: true,
      remote: false,
      octave: false,
      default: 'sightkick',
    });

    const activeJob: IpcAutoChartJob = {
      id: 'job-1',
      attempt: 1,
      stage: 'downloading',
      backend: 'sightkick',
      message: 'Downloading audio from YouTube',
      sourceName: 'Active song',
      percent: 10,
    };
    const queuedJob2: IpcAutoChartJob = {
      id: 'job-2',
      attempt: 1,
      stage: 'queued',
      backend: 'sightkick',
      message: 'Chart queued for Drumroll processing',
      sourceName: 'Queued song 1',
      youtubeUrl: 'https://www.youtube.com/watch?v=queuedqueue1',
    };
    const queuedJob3: IpcAutoChartJob = {
      id: 'job-3',
      attempt: 1,
      stage: 'queued',
      backend: 'sightkick',
      message: 'Chart queued for Drumroll processing',
      sourceName: 'Queued song 2',
      youtubeUrl: 'https://www.youtube.com/watch?v=queuedqueue2',
    };

    emitJob({ ...activeJob, jobs: [activeJob, queuedJob2, queuedJob3] });

    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'Active song',
    );
    expect(screen.getByTestId('auto-chart-pending-queue')).toHaveTextContent(
      '2 more charts queued',
    );
    expect(screen.getByTestId('auto-chart-pending-job-2')).toHaveTextContent(
      'Queued song 1',
    );
    expect(screen.getByTestId('auto-chart-pending-job-3')).toHaveTextContent(
      'Queued song 2',
    );

    fireEvent.click(screen.getByTestId('auto-chart-pending-cancel-job-2'));
    expect(ipc.sent).toContainEqual({
      channel: 'cancel-auto-chart',
      args: ['job-2'],
    });

    fireEvent.click(screen.getByTestId('auto-chart-cancel-all'));
    expect(ipc.sent).toContainEqual({
      channel: 'cancel-auto-chart',
      args: ['job-3'],
    });

    // The backend confirms both cancellations by dropping them from the
    // next snapshot — the queue panel should then disappear entirely.
    emitJob({ ...activeJob, jobs: [activeJob] });
    expect(
      screen.queryByTestId('auto-chart-pending-queue'),
    ).not.toBeInTheDocument();
  });

  it('does not let an unrelated queued job steal the panel from the job being displayed', () => {
    renderAutoChart();
    emitBackends({
      sightkick: true,
      remote: false,
      octave: false,
      default: 'sightkick',
    });

    const activeJob: IpcAutoChartJob = {
      id: 'job-1',
      attempt: 1,
      stage: 'downloading',
      backend: 'sightkick',
      message: 'Downloading audio from YouTube',
      sourceName: 'Active song',
      percent: 30,
    };

    emitJob(activeJob);
    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'Active song',
    );

    // A second job (e.g. from My Music's bulk add) is created and
    // immediately notifies its own initial "queued" state — this must not
    // replace the panel showing job-1's progress, only appear in the
    // pending queue alongside it.
    const otherJob: IpcAutoChartJob = {
      id: 'job-2',
      attempt: 1,
      stage: 'queued',
      backend: 'sightkick',
      message: 'Chart queued for Drumroll processing',
      sourceName: 'Other song',
    };

    emitJob({ ...otherJob, jobs: [activeJob, otherJob] });

    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'Active song',
    );
    expect(screen.getByTestId('auto-chart-progress')).not.toHaveTextContent(
      'Other song',
    );
    expect(screen.getByTestId('auto-chart-pending-queue')).toHaveTextContent(
      'Other song',
    );

    // Once job-1 finishes, the panel frees up for the next job.
    emitJob({
      ...activeJob,
      stage: 'imported',
      song: undefined,
      jobs: [otherJob],
    });
    emitJob({ ...otherJob, stage: 'downloading', jobs: [otherJob] });

    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'Other song',
    );
  });
});
