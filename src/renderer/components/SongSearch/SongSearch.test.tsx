import { act, fireEvent, render, screen } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { SongSearch, SongSearchRequest } from './SongSearch';

// antd's Popover drives its open/close animation (CSSMotion) off real
// browser timing primitives regardless of vi.useFakeTimers() below, so these
// tests are more sensitive to a loaded machine than plain hook tests.
vi.setConfig({ testTimeout: 30_000 });

let ipc: IpcMock;

function renderSongSearch(
  disabled = false,
  requestedSearch?: SongSearchRequest,
) {
  return render(
    <AntdApp>
      <SongSearch disabled={disabled} requestedSearch={requestedSearch} />
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
const yandexProvenance = {
  provider: 'yandex-music' as const,
  collectionId: 'f37c90e8-ddab-5270-9379-4a72d66e0cac',
  collectionName: 'drums',
  trackId: 'yandex:f37c90e8-ddab-5270-9379-4a72d66e0cac:2',
  title: 'Natural Villain',
  artists: ['Mokita'],
  durationSeconds: 199,
  sourceUrl: 'https://music.yandex.ru/album/123/track/456',
};

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

  it('opens a reviewed search from a playlist candidate request', () => {
    const view = renderSongSearch(false, {
      id: 1,
      query: 'Heat Waves Glass Animals',
    });

    expect(screen.getByTestId('song-search-input')).toHaveValue(
      'Heat Waves Glass Animals',
    );
    expect(screen.getByTestId('song-search-input')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    flushDebounce();
    expect(ipc.sent).toContainEqual({
      channel: 'search-youtube',
      args: [{ query: 'Heat Waves Glass Animals' }],
    });

    view.rerender(
      <AntdApp>
        <SongSearch
          requestedSearch={{ id: 2, query: 'Natural Villain Mokita' }}
        />
      </AntdApp>,
    );
    expect(screen.getByTestId('song-search-input')).toHaveValue(
      'Natural Villain Mokita',
    );
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
      args: [
        {
          youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          autoImport: true,
          youtubeCandidate: {
            videoId: 'abcdefghijk',
            title: 'Some Great Drum Song',
            uploader: 'Some Channel',
            durationSeconds: 125,
            watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          },
        },
      ],
    });
  });

  it('accepts only the exact source-linked recording and sends its candidate identity', () => {
    renderSongSearch(false, {
      id: 3,
      query: 'Natural Villain Mokita',
      sourceProvenance: yandexProvenance,
    });
    flushDebounce();

    const exact = {
      videoId: 'abcdefghijk',
      title: 'Mokita - Natural Villain (Official Audio)',
      uploader: 'Mokita',
      durationSeconds: 199,
      watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    };

    act(() => {
      ipc.emit('search-youtube', {
        results: [
          exact,
          {
            ...exact,
            videoId: 'live0000001',
            title: 'Mokita - Natural Villain (Live)',
            durationSeconds: 200,
            watchUrl: 'https://www.youtube.com/watch?v=live0000001',
          },
          {
            ...exact,
            videoId: 'cover000001',
            title: 'Natural Villain cover',
            uploader: 'A different channel',
            watchUrl: 'https://www.youtube.com/watch?v=cover000001',
          },
          {
            ...exact,
            videoId: 'artist000001',
            title: 'Other Artist - Natural Villain',
            uploader: 'Other Artist',
            watchUrl: 'https://www.youtube.com/watch?v=artist000001',
          },
          {
            ...exact,
            videoId: 'duration001',
            durationSeconds: 208,
            watchUrl: 'https://www.youtube.com/watch?v=duration001',
          },
        ],
      });
    });

    expect(screen.getByTestId('song-search-provenance')).toHaveTextContent(
      'Reviewing matches for Natural Villain from drums',
    );

    expect(
      screen.getByTestId('song-search-result-abcdefghijk'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('song-search-result-live0000001')).toBeNull();
    expect(screen.queryByTestId('song-search-result-cover000001')).toBeNull();
    expect(screen.queryByTestId('song-search-result-artist000001')).toBeNull();
    expect(screen.queryByTestId('song-search-result-duration001')).toBeNull();

    fireEvent.click(screen.getByTestId('song-search-result-abcdefghijk'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [
        {
          youtubeUrl: exact.watchUrl,
          autoImport: true,
          youtubeCandidate: exact,
          sourceProvenance: yandexProvenance,
        },
      ],
    });
  });

  it('drops source linkage when the reviewed query is edited', () => {
    renderSongSearch(false, {
      id: 4,
      query: 'Natural Villain Mokita',
      sourceProvenance: yandexProvenance,
    });

    typeQuery('some song');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', { results: sampleResults });
    });

    expect(screen.getByTestId('song-search-provenance')).toHaveTextContent(
      'Results from YouTube search',
    );

    fireEvent.click(screen.getByTestId('song-search-result-abcdefghijk'));

    expect(ipc.sent).toContainEqual({
      channel: 'create-auto-chart',
      args: [
        {
          youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          autoImport: true,
          youtubeCandidate: {
            videoId: 'abcdefghijk',
            title: 'Some Great Drum Song',
            uploader: 'Some Channel',
            durationSeconds: 125,
            watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          },
        },
      ],
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
      args: [
        {
          youtubeUrl: 'https://www.youtube.com/watch?v=11111111111',
          autoImport: true,
          youtubeCandidate: {
            videoId: '11111111111',
            title: 'Another Song',
            uploader: 'Another Channel',
            durationSeconds: 200,
            watchUrl: 'https://www.youtube.com/watch?v=11111111111',
          },
        },
      ],
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

  it('offers a retry after an honest search error', () => {
    renderSongSearch();

    typeQuery('some song');
    flushDebounce();

    act(() => {
      ipc.emit('search-youtube', { error: 'YouTube search failed' });
    });

    fireEvent.click(screen.getByTestId('song-search-retry'));
    flushDebounce();

    expect(ipc.sent).toEqual([
      { channel: 'search-youtube', args: [{ query: 'some song' }] },
      { channel: 'search-youtube', args: [{ query: 'some song' }] },
    ]);
  });

  it('does not search when the input is empty', () => {
    renderSongSearch();

    typeQuery('   ');
    flushDebounce();

    expect(ipc.sent).toEqual([]);
    expect(screen.queryByTestId('song-search-panel')).not.toBeInTheDocument();
  });

  it('reports every keystroke through onQueryChange', () => {
    const onQueryChange = vi.fn();

    render(
      <AntdApp>
        <SongSearch onQueryChange={onQueryChange} />
      </AntdApp>,
    );

    expect(onQueryChange).toHaveBeenLastCalledWith('');

    typeQuery('boulevard');

    expect(onQueryChange).toHaveBeenLastCalledWith('boulevard');
  });

  it('stays visible but suppresses the YouTube panel and network search while inactive', () => {
    const view = render(
      <AntdApp>
        <SongSearch active={false} />
      </AntdApp>,
    );

    typeQuery('boulevard of broken dreams');
    flushDebounce();

    expect(ipc.sent).toEqual([]);
    expect(screen.queryByTestId('song-search-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('song-search-input')).toHaveValue(
      'boulevard of broken dreams',
    );

    // Once a caller's own library search comes up empty, flipping back to
    // active resumes the same YouTube fallback proven above.
    view.rerender(
      <AntdApp>
        <SongSearch active />
      </AntdApp>,
    );
    flushDebounce();

    expect(ipc.sent).toContainEqual({
      channel: 'search-youtube',
      args: [{ query: 'boulevard of broken dreams' }],
    });
  });

  it('renders the input under a caller-chosen testid', () => {
    render(
      <AntdApp>
        <SongSearch inputTestId="song-search" />
      </AntdApp>,
    );

    expect(screen.getByTestId('song-search')).toBeInTheDocument();
    expect(screen.queryByTestId('song-search-input')).not.toBeInTheDocument();
  });
});
