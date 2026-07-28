import { act, fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcAutoChartJob, Song } from '../../../types';
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

function emit(job: IpcAutoChartJob) {
  act(() => {
    ipc.emit('auto-chart-update', job);
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

  it('moves from optional YouTube discovery through local processing to review and import confirmation', () => {
    const onImported = renderAutoChart();

    fireEvent.click(screen.getByTestId('create-chart-trigger'));
    expect(
      screen.getByText(
        'YouTube is discovery only. SightKick never downloads audiovisual media from it.',
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('auto-chart-youtube-url'), {
      target: { value: 'https://youtu.be/abcdefghijk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose local audio' }));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: 'https://youtu.be/abcdefghijk' }],
    });

    emit({
      id: 'job-1',
      attempt: 1,
      stage: 'processing',
      message: 'OCTAVE is preparing a drum chart locally',
      sourceName: 'owned-track.mp3',
      percent: 42,
    });
    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent(
      'owned-track.mp3',
    );
    expect(screen.getByTestId('auto-chart-progress')).toHaveTextContent('42%');

    emit({
      id: 'job-1',
      attempt: 1,
      stage: 'preview-ready',
      message: 'Chart is ready to review before adding it to your library',
      metadata: {
        title: 'Official title',
        authorName: 'Official channel',
        thumbnailUrl: preview.thumbnailUrl,
      },
      preview,
    });
    expect(screen.getByText('Review generated drum chart')).toBeInTheDocument();
    expect(screen.getByText('Official title')).toBeInTheDocument();
    expect(screen.getByText('Auto-charted with STRUM')).toBeInTheDocument();
    expect(screen.queryByTestId('import-artwork-url')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));
    expect(ipc.sent).toContainEqual({
      channel: 'import-auto-chart',
      args: ['job-1'],
    });
    expect(onImported).not.toHaveBeenCalled();

    emit({
      id: 'job-1',
      attempt: 1,
      stage: 'imported',
      message: 'Added "Official title" to the current library',
      song: importedSong,
    });
    expect(onImported).toHaveBeenCalledWith(importedSong);
  });
});
