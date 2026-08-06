import { act, fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it } from 'vitest';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
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
    expect(ipc.sent).toEqual([]);
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
    expect(ipc.sent).toHaveLength(2);
    expect(ipc.sent[1]).toEqual({ channel: 'my-music-fetch', args: [{}] });
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
});
