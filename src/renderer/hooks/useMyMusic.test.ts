import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { installIpcMock, IpcMock } from './test-support';
import { useMyMusic } from './useMyMusic';

let ipc: IpcMock;

beforeEach(() => {
  ipc = installIpcMock();
});

describe('useMyMusic', () => {
  it('does not fetch on mount', () => {
    renderHook(() => useMyMusic());

    expect(ipc.sent).toEqual([]);
  });

  it('sends a fetch request with no limit by default when refresh is called', () => {
    const { result } = renderHook(() => useMyMusic());

    act(() => {
      result.current.refresh();
    });

    expect(ipc.sent).toEqual([{ channel: 'my-music-fetch', args: [{}] }]);
    expect(result.current.loading).toBe(true);
  });

  it('passes an explicit limit through to the request', () => {
    const { result } = renderHook(() => useMyMusic());

    act(() => {
      result.current.refresh(10);
    });

    expect(ipc.sent).toEqual([
      { channel: 'my-music-fetch', args: [{ limit: 10 }] },
    ]);
  });

  it('populates songs from a successful reply', () => {
    const { result } = renderHook(() => useMyMusic());

    act(() => {
      result.current.refresh();
    });

    const songs = [
      {
        videoId: 'abcdefghijk',
        title: 'Some Song',
        artist: 'Some Artist',
        watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      },
    ];

    act(() => {
      ipc.emit('my-music-fetch', { songs });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.hasFetched).toBe(true);
    expect(result.current.songs).toEqual(songs);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces a distinct error code and message from the main process', () => {
    const { result } = renderHook(() => useMyMusic());

    act(() => {
      result.current.refresh();
    });

    act(() => {
      ipc.emit('my-music-fetch', {
        error: "Chrome's cookie database is locked",
        code: 'chrome-cookie-locked',
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.hasFetched).toBe(true);
    expect(result.current.error).toEqual({
      code: 'chrome-cookie-locked',
      message: "Chrome's cookie database is locked",
    });
    expect(result.current.songs).toEqual([]);
  });

  it('clears a previous error when a new refresh starts', () => {
    const { result } = renderHook(() => useMyMusic());

    act(() => {
      result.current.refresh();
      ipc.emit('my-music-fetch', { error: 'nope', code: 'not-signed-in' });
    });
    expect(result.current.error).toBeDefined();

    act(() => {
      result.current.refresh();
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.loading).toBe(true);
  });

  it('drops the pending listener from an earlier refresh when refresh is called again', () => {
    const { result } = renderHook(() => useMyMusic());

    act(() => {
      result.current.refresh();
    });
    expect(ipc.onceCount('my-music-fetch')).toBe(1);

    act(() => {
      result.current.refresh();
    });
    expect(ipc.onceCount('my-music-fetch')).toBe(1);
    expect(ipc.sent).toHaveLength(2);

    act(() => {
      ipc.emit('my-music-fetch', {
        songs: [
          {
            videoId: 'abcdefghijk',
            title: 'Only the second reply should apply',
            watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
          },
        ],
      });
    });

    expect(result.current.songs).toHaveLength(1);
  });

  it('drops the pending listener on unmount', () => {
    const { result, unmount } = renderHook(() => useMyMusic());

    act(() => {
      result.current.refresh();
    });
    expect(ipc.onceCount('my-music-fetch')).toBe(1);

    unmount();

    expect(ipc.onceCount('my-music-fetch')).toBe(0);
  });
});
