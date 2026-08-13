import { ReactNode, createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Song } from '../../types';
import { OnlineSong } from '../types';
import { installIpcMock, IpcMock } from './test-support';
import { useDownload } from './useDownload';

let ipc: IpcMock;
const song: OnlineSong = {
  source: 'online',
  id: 'abcdefghijk',
  downloadUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  name: 'Studio recording',
  artist: 'Artist',
  charter: 'YouTube',
  drumDifficulty: 0,
};

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AntdApp, undefined, children);
}

beforeEach(() => {
  ipc = installIpcMock();
});

describe('useDownload', () => {
  it('hands a selected YouTube recording to the automatic chart queue', () => {
    const onSongAdded = () => {};
    const { result } = renderHook(() => useDownload([song], onSongAdded), {
      wrapper,
    });

    act(() => {
      result.current.handleDownload(song.id);
    });

    expect(ipc.sent).toEqual([
      {
        channel: 'create-auto-chart',
        args: [
          {
            youtubeUrl: song.downloadUrl,
            autoImport: true,
            youtubeCandidate: {
              videoId: song.id,
              title: song.name,
              uploader: song.artist,
              watchUrl: song.downloadUrl,
            },
          },
        ],
      },
    ]);
    expect(result.current.downloadingIds).toEqual(new Set([song.id]));
  });

  it('keeps a failed job retryable and adds the imported song exactly once', () => {
    const added: Song[] = [];
    const { result } = renderHook(
      () => useDownload([song], (value) => added.push(value)),
      {
        wrapper,
      },
    );

    act(() => {
      result.current.handleDownload(song.id);
      ipc.emit('auto-chart-update', {
        id: 'job-1',
        attempt: 1,
        stage: 'failed',
        message: 'Chart creation failed',
        error: 'yt-dlp could not fetch this recording',
        backend: 'sightkick',
        youtubeUrl: song.downloadUrl,
      });
    });

    expect(result.current.failedJobIds).toEqual(new Map([[song.id, 'job-1']]));

    act(() => {
      result.current.retryDownload(song.id);
    });

    expect(ipc.sent.at(-1)).toEqual({
      channel: 'retry-auto-chart',
      args: ['job-1'],
    });

    const imported = {
      id: 'local-song',
      dir: '/library/local-song',
      name: 'Studio recording',
      artist: 'Artist',
      album: '',
      charter: 'Drumroll',
      genre: '',
      year: '',
      fiveLaneDrums: false,
      proDrums: false,
      delaySeconds: 0,
      drumDifficulty: 1,
      format: 'mid' as const,
      audio: [],
    } satisfies Song;

    act(() => {
      ipc.emit('auto-chart-update', {
        id: 'job-2',
        attempt: 2,
        stage: 'imported',
        message: 'Added',
        backend: 'sightkick',
        youtubeUrl: song.downloadUrl,
        song: imported,
      });
    });

    expect(added).toEqual([imported]);
    expect(result.current.downloadingIds).toEqual(new Set());
  });
});
