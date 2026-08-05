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
  });

  it('pastes a YouTube URL and downloads, separates, transcribes and builds a chart automatically end to end', () => {
    const onImported = renderAutoChart();

    emitBackends({ sightkick: true, octave: false, default: 'sightkick' });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
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
      'downloading',
    );
    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'SightKick',
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
    expect(screen.getByText('Review generated drum chart')).toBeInTheDocument();
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
    emitBackends({ sightkick: true, octave: false, default: 'sightkick' });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    fireEvent.click(screen.getByTestId('auto-chart-local-file'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ localFile: true, backend: 'sightkick' }],
    });
  });

  it('disables the YouTube download action until sightkick is available', () => {
    renderAutoChart();
    emitBackends({ sightkick: false, octave: true, default: 'octave' });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    fireEvent.change(screen.getByTestId('auto-chart-youtube-url'), {
      target: { value: 'https://youtu.be/abcdefghijk' },
    });

    expect(screen.getByTestId('auto-chart-from-youtube')).toBeDisabled();
  });

  it('lets the user pick between two available backends and shows which one is used', () => {
    renderAutoChart();
    emitBackends({ sightkick: true, octave: true, default: 'sightkick' });

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
    emitBackends({ sightkick: false, octave: false, default: 'sightkick' });

    fireEvent.click(screen.getByTestId('create-chart-trigger'));

    expect(screen.getByTestId('auto-chart-no-backend')).toHaveTextContent(
      'No auto-chart engine is available',
    );
  });

  it('shows a clear, honest error when a YouTube download fails', () => {
    renderAutoChart();
    emitBackends({ sightkick: true, octave: false, default: 'sightkick' });

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
  });

  it('lets the user cancel an in-flight chart at any stage', () => {
    renderAutoChart();
    emitBackends({ sightkick: true, octave: false, default: 'sightkick' });

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
});
