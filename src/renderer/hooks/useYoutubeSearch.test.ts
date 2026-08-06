import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIpcMock, IpcMock } from './test-support';
import { useYoutubeSearch } from './useYoutubeSearch';

let ipc: IpcMock;

beforeEach(() => {
  ipc = installIpcMock();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useYoutubeSearch', () => {
  it('does not search for an empty query', () => {
    renderHook(() => useYoutubeSearch(''));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(ipc.sent).toEqual([]);
  });

  it('debounces before sending a search request', () => {
    const { result } = renderHook(() => useYoutubeSearch('never gonna'));

    expect(ipc.sent).toEqual([]);
    expect(result.current.loading).toBe(true);

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(ipc.sent).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ipc.sent).toEqual([
      { channel: 'search-youtube', args: [{ query: 'never gonna' }] },
    ]);
  });

  it('trims the query before sending it', () => {
    renderHook(() => useYoutubeSearch('  spaced out  '));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(ipc.sent).toEqual([
      { channel: 'search-youtube', args: [{ query: 'spaced out' }] },
    ]);
  });

  it('populates results from a successful reply', () => {
    const { result } = renderHook(() => useYoutubeSearch('some song'));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const results = [
      {
        videoId: 'abcdefghijk',
        title: 'Some Song',
        watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      },
    ];

    act(() => {
      ipc.emit('search-youtube', { results });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual(results);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces an honest error from the main process', () => {
    const { result } = renderHook(() => useYoutubeSearch('some song'));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      ipc.emit('search-youtube', { error: 'YouTube search needs yt-dlp' });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('YouTube search needs yt-dlp');
    expect(result.current.results).toEqual([]);
  });

  it('drops the pending listener when the query changes before the reply arrives', () => {
    const { rerender } = renderHook(({ query }) => useYoutubeSearch(query), {
      initialProps: { query: 'first query' },
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ipc.onceCount('search-youtube')).toBe(1);

    rerender({ query: 'second query' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(ipc.sent).toEqual([
      { channel: 'search-youtube', args: [{ query: 'first query' }] },
      { channel: 'search-youtube', args: [{ query: 'second query' }] },
    ]);
    expect(ipc.onceCount('search-youtube')).toBe(1);
  });

  it('cancels the debounce timer entirely when the query changes before it fires', () => {
    const { rerender } = renderHook(({ query }) => useYoutubeSearch(query), {
      initialProps: { query: 'first query' },
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    rerender({ query: 'second query' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(ipc.sent).toEqual([
      { channel: 'search-youtube', args: [{ query: 'second query' }] },
    ]);
  });

  it('clears results and drops the pending listener when the query is cleared', () => {
    const { result, rerender } = renderHook(
      ({ query }) => useYoutubeSearch(query),
      { initialProps: { query: 'some song' } },
    );

    act(() => {
      vi.advanceTimersByTime(300);
      ipc.emit('search-youtube', {
        results: [
          {
            videoId: 'abcdefghijk',
            title: 'Some Song',
            watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          },
        ],
      });
    });

    expect(result.current.results).toHaveLength(1);

    rerender({ query: '' });

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(ipc.onceCount('search-youtube')).toBe(0);
  });

  it('drops the pending listener on unmount', () => {
    const { unmount } = renderHook(() => useYoutubeSearch('some song'));

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(ipc.onceCount('search-youtube')).toBe(1);

    unmount();

    expect(ipc.onceCount('search-youtube')).toBe(0);
  });
});
