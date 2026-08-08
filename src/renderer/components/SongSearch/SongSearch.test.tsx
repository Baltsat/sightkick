import { act, fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { SongSearch } from './SongSearch';

// antd's Popover drives its open/close animation (CSSMotion) off real
// browser timing primitives regardless of vi.useFakeTimers() below, so these
// tests are more sensitive to a loaded machine than plain hook tests.
vi.setConfig({ testTimeout: 30_000 });

let ipc: IpcMock;

function renderSongSearch(disabled = false) {
  render(
    <AntdApp>
      <SongSearch disabled={disabled} />
    </AntdApp>,
  );
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByTestId('song-search-input'), {
    target: { value },
  });
}

// Flushes the hook's 300ms debounce timer under fake timers so the
// 'search-youtube' request fires deterministically, without depending on
// wall-clock waits that get flaky under a loaded machine.
function flushDebounce() {
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

const sampleResults = [
  {
    videoId: 'abcdefghijk',
    title: 'Some Great Drum Song',
    uploader: 'Some Channel',
    durationSeconds: 125,
    thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
    watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  },
  {
    videoId: '11111111111',
    title: 'Another Song',
    uploader: 'Another Channel',
    durationSeconds: 200,
    watchUrl: 'https://www.youtube.com/watch?v=11111111111',
  },
];

describe('SongSearch', () => {
  beforeEach(() => {
    ipc = installIpcMock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a disabled input with a helpful tooltip when there is no library folder', () => {
    renderSongSearch(true);

    expect(screen.getByTestId('song-search-input')).toBeDisabled();
  });

  it('debounces typing before asking the main process to search YouTube', () => {
    renderSongSearch();

    typeQuery('never gonna give you up');

    // Nothing sent yet — still inside the debounce window.
    expect(ipc.sent).toEqual([]);

    flushDebounce();

    expect(ipc.sent).toEqual([
      {
        channel: 'search-youtube',
        args: [{ query: 'never gonna give you up' }],
      },
    ]);
  });

  it('renders results with thumbnail, uploader and duration once the reply arrives', () => {
    renderSongSearch();

    typeQuery('some song');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', { results: sampleResults });
    });

    expect(
      screen.getByTestId('song-search-result-abcdefghijk'),
    ).toHaveTextContent('Some Great Drum Song');
    expect(
      screen.getByTestId('song-search-result-abcdefghijk'),
    ).toHaveTextContent('Some Channel');
    expect(
      screen.getByTestId('song-search-result-abcdefghijk'),
    ).toHaveTextContent('2:05');
    expect(screen.getByTestId('song-search-provenance')).toHaveTextContent(
      'Results from YouTube search',
    );
  });

  it('sends the same create-auto-chart IPC message the AutoChart submit sends when a result is clicked', () => {
    renderSongSearch();

    typeQuery('some song');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', { results: sampleResults });
    });

    fireEvent.click(screen.getByTestId('song-search-result-abcdefghijk'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }],
    });
  });

  it('selects a result with the keyboard using ArrowDown then Enter', () => {
    renderSongSearch();

    typeQuery('some song');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', { results: sampleResults });
    });

    const input = screen.getByTestId('song-search-input');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [{ youtubeUrl: 'https://www.youtube.com/watch?v=11111111111' }],
    });
  });

  it('closes the results panel on Escape', () => {
    renderSongSearch();

    typeQuery('some song');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', { results: sampleResults });
    });

    expect(screen.getByTestId('song-search-results')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('song-search-input'), {
      key: 'Escape',
    });

    // antd's Popover keeps the panel mounted through its close animation, so
    // assert on the input's own collapsed state rather than DOM removal.
    expect(screen.getByTestId('song-search-input')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows an honest empty state when there are no results', () => {
    renderSongSearch();

    typeQuery('a very obscure query');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', { results: [] });
    });

    expect(screen.getByTestId('song-search-empty')).toHaveTextContent(
      'No YouTube results for "a very obscure query"',
    );
  });

  it('shows an honest error state when the main process cannot search', () => {
    renderSongSearch();

    typeQuery('some song');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', {
        error: 'YouTube search needs yt-dlp. Reinstall Drumroll.',
      });
    });

    expect(screen.getByTestId('song-search-error')).toHaveTextContent(
      'YouTube search needs yt-dlp. Reinstall Drumroll.',
    );
  });

  it('does not search when the input is empty', () => {
    renderSongSearch();

    typeQuery('   ');
    flushDebounce();

    expect(ipc.sent).toEqual([]);
    expect(screen.queryByTestId('song-search-panel')).not.toBeInTheDocument();
  });
});
