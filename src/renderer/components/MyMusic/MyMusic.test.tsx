import { act, fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it } from 'vitest';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { IpcAutoChartBackendsResponse, IpcAutoChartJob } from '../../../types';
import { MyMusic } from './MyMusic';
import { LibrarySongRef, MyMusicSong } from './types';

let ipc: IpcMock;

function renderMyMusic(librarySongs: LibrarySongRef[] = [], disabled = false) {
  render(
    <AntdApp>
      <MyMusic librarySongs={librarySongs} disabled={disabled} />
    </AntdApp>,
  );
}

function emitSongs(songs: MyMusicSong[]) {
  act(() => {
    ipc.emit('my-music-fetch', { songs });
  });
}

function emitError(error: string, code: string) {
  act(() => {
    ipc.emit('my-music-fetch', { error, code });
  });
}

function emitAutoChartUpdate(job: Partial<IpcAutoChartJob> & { id: string }) {
  act(() => {
    ipc.emit('auto-chart-update', {
      attempt: 1,
      stage: 'queued',
      message: 'Chart queued',
      backend: 'sightkick',
      jobs: [],
      ...job,
    });
  });
}

function emitAutoChartBackends(response: IpcAutoChartBackendsResponse) {
  act(() => {
    ipc.emit('auto-chart-backends', response);
  });
}

const songA: MyMusicSong = {
  videoId: 'aaaaaaaaaaa',
  title: 'Song A',
  artist: 'Artist A',
  durationSec: 125,
  watchUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
};
const songB: MyMusicSong = {
  videoId: 'bbbbbbbbbbb',
  title: 'Song B',
  artist: 'Artist B',
  durationSec: 200,
  watchUrl: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
};

describe('MyMusic', () => {
  beforeEach(() => {
    ipc = installIpcMock();
  });

  it('shows the Connect empty state and does not fetch on mount', () => {
    renderMyMusic();

    expect(screen.getByTestId('my-music-connect')).toBeInTheDocument();
    // My Music does proactively ask for the detected default auto-chart
    // backend on mount (so Add is ready to send it immediately — see the
    // payload-parity tests below), it just never fetches liked songs until
    // the user asks it to.
    expect(
      ipc.sent.filter((message) => message.channel === 'my-music-fetch'),
    ).toEqual([]);
  });

  it('fetches liked songs when Connect is clicked and lists results', () => {
    renderMyMusic();

    fireEvent.click(screen.getByTestId('my-music-connect-button'));

    expect(ipc.sent).toContainEqual({
      channel: 'my-music-fetch',
      args: [{}],
    });

    emitSongs([songA, songB]);

    expect(screen.getByTestId('my-music-row-aaaaaaaaaaa')).toBeInTheDocument();
    expect(screen.getByTestId('my-music-row-bbbbbbbbbbb')).toBeInTheDocument();
    expect(screen.getByText('Artist A · 02:05')).toBeInTheDocument();
  });

  it('disables the Connect button when disabled is true', () => {
    renderMyMusic([], true);

    expect(screen.getByTestId('my-music-connect-button')).toBeDisabled();
  });

  it('shows an honest, distinct error message and lets the user retry', () => {
    renderMyMusic();
    fireEvent.click(screen.getByTestId('my-music-connect-button'));

    emitError("Chrome's cookie database is locked", 'chrome-cookie-locked');

    expect(screen.getByTestId('my-music-error')).toHaveTextContent(
      "Chrome's cookie database is locked",
    );

    fireEvent.click(screen.getByTestId('my-music-retry'));

    const fetchMessages = ipc.sent.filter(
      (message) => message.channel === 'my-music-fetch',
    );

    expect(fetchMessages).toHaveLength(2);
    expect(fetchMessages[1]).toEqual({
      channel: 'my-music-fetch',
      args: [{}],
    });
  });

  it('dispatches create-auto-chart with the watch URL when Add is clicked', () => {
    renderMyMusic();
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA]);

    fireEvent.click(screen.getByTestId('my-music-add-aaaaaaaaaaa'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' }],
    });
  });

  it('shows an "In library" badge instead of Add for a song already in the library', () => {
    renderMyMusic([{ artist: 'Artist A', name: 'Song A' }]);
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA, songB]);

    expect(
      screen.getByTestId('my-music-in-library-aaaaaaaaaaa'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('my-music-add-aaaaaaaaaaa'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('my-music-add-bbbbbbbbbbb')).toBeInTheDocument();
  });

  it('enqueues Add top 10 in list order, skipping songs already in the library', () => {
    const songC: MyMusicSong = {
      videoId: 'ccccccccccc',
      title: 'Song C',
      artist: 'Artist C',
      watchUrl: 'https://www.youtube.com/watch?v=ccccccccccc',
    };

    renderMyMusic([{ artist: 'Artist B', name: 'Song B' }]);
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA, songB, songC]);

    fireEvent.click(screen.getByTestId('my-music-add-top-10'));

    const createChartMessages = ipc.sent.filter(
      (message) => message.channel === 'create-auto-chart',
    );

    expect(createChartMessages).toEqual([
      {
        channel: 'create-auto-chart',
        args: [{ youtubeUrl: songA.watchUrl }],
      },
      {
        channel: 'create-auto-chart',
        args: [{ youtubeUrl: songC.watchUrl }],
      },
    ]);
  });

  it('disables Add top 10 once every fetched song is already in the library', () => {
    renderMyMusic([{ artist: 'Artist A', name: 'Song A' }]);
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA]);

    expect(screen.getByTestId('my-music-add-top-10')).toBeDisabled();
  });

  it('refresh sends a new fetch request', () => {
    renderMyMusic();
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA]);

    fireEvent.click(screen.getByTestId('my-music-refresh'));

    expect(
      ipc.sent.filter((message) => message.channel === 'my-music-fetch'),
    ).toHaveLength(2);
  });

  it('includes the detected default auto-chart backend, matching what the Create Chart modal would send', () => {
    renderMyMusic();
    emitAutoChartBackends({
      sightkick: false,
      remote: true,
      octave: true,
      default: 'remote',
    });
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA]);

    fireEvent.click(screen.getByTestId('my-music-add-aaaaaaaaaaa'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: songA.watchUrl, backend: 'remote' }],
    });
  });

  it('double-clicking Add enqueues exactly one job and disables the button immediately', () => {
    renderMyMusic();
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA]);

    const addButton = screen.getByTestId('my-music-add-aaaaaaaaaaa');

    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(
      ipc.sent.filter((message) => message.channel === 'create-auto-chart'),
    ).toHaveLength(1);
    expect(addButton).toBeDisabled();
  });

  it('disables a row once the queue reports a non-terminal job for its watch URL', () => {
    renderMyMusic();
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA, songB]);

    // Simulate the Create Chart modal (or a previous session) having
    // already queued songA — My Music never sent this job itself, but must
    // still recognize it via the shared queue snapshot and disable the row.
    emitAutoChartUpdate({
      id: 'other-job',
      stage: 'queued',
      youtubeUrl: songA.watchUrl,
      jobs: [
        {
          id: 'other-job',
          attempt: 1,
          stage: 'queued',
          message: 'Chart queued',
          backend: 'sightkick',
          youtubeUrl: songA.watchUrl,
        },
      ],
    });

    expect(screen.getByTestId('my-music-add-aaaaaaaaaaa')).toBeDisabled();
    expect(screen.getByTestId('my-music-add-bbbbbbbbbbb')).toBeEnabled();
  });

  it('re-enables a row once its own job reaches a terminal stage', () => {
    renderMyMusic();
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA]);

    const addButton = screen.getByTestId('my-music-add-aaaaaaaaaaa');

    fireEvent.click(addButton);
    expect(addButton).toBeDisabled();

    emitAutoChartUpdate({
      id: 'job-1',
      stage: 'failed',
      error: 'This video is age-restricted and cannot be downloaded',
      youtubeUrl: songA.watchUrl,
      jobs: [],
    });

    expect(screen.getByTestId('my-music-add-aaaaaaaaaaa')).toBeEnabled();
  });

  it('excludes already-queued songs from Add top 10 and its count', () => {
    const songC: MyMusicSong = {
      videoId: 'ccccccccccc',
      title: 'Song C',
      artist: 'Artist C',
      watchUrl: 'https://www.youtube.com/watch?v=ccccccccccc',
    };

    renderMyMusic();
    fireEvent.click(screen.getByTestId('my-music-connect-button'));
    emitSongs([songA, songB, songC]);

    fireEvent.click(screen.getByTestId('my-music-add-aaaaaaaaaaa'));

    const createChartMessages = ipc.sent.filter(
      (message) => message.channel === 'create-auto-chart',
    );

    expect(createChartMessages).toHaveLength(1);

    fireEvent.click(screen.getByTestId('my-music-add-top-10'));

    const afterTop10 = ipc.sent.filter(
      (message) => message.channel === 'create-auto-chart',
    );

    expect(afterTop10).toHaveLength(3);
    expect(afterTop10[1]).toEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: songB.watchUrl, backend: undefined }],
    });
    expect(afterTop10[2]).toEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: songC.watchUrl, backend: undefined }],
    });
  });
});
