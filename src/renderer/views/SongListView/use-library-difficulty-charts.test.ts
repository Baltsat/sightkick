import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedChart } from '../../../chart-parser/types';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { makeListSong } from '../test-support';
import { useLibraryDifficultyCharts } from './use-library-difficulty-charts';

const parseChartFileMock = vi.fn();

vi.mock('scan-chart', async (importOriginal) => {
  const actual = await importOriginal<typeof import('scan-chart')>();

  return {
    ...actual,
    parseChartFile: (...args: unknown[]) => parseChartFileMock(...args),
  };
});

const fakeChart = { resolution: 480 } as unknown as ParsedChart;
let ipc: IpcMock;

beforeEach(() => {
  ipc = installIpcMock();
  parseChartFileMock.mockReset();
  parseChartFileMock.mockReturnValue(fakeChart);
});

function respondLoadSong(id: string, overrides: Record<string, unknown> = {}) {
  act(() => {
    ipc.emit('load-song', {
      data: { id, format: 'chart', proDrums: true, fiveLaneDrums: false },
      fileData: new Uint8Array([1, 2, 3]),
      ...overrides,
    });
  });
}

describe('useLibraryDifficultyCharts', () => {
  it('does nothing while inactive', () => {
    const songs = [makeListSong('a'), makeListSong('b')];

    renderHook(() => useLibraryDifficultyCharts(songs, false));

    expect(ipc.sent).toEqual([]);
  });

  it('requests every plausibly-loadable song once and populates the map from real parsed charts', async () => {
    const songs = [makeListSong('a'), makeListSong('b')];
    const { result } = renderHook(() =>
      useLibraryDifficultyCharts(songs, true),
    );

    expect(ipc.sent).toEqual([
      { channel: 'load-song', args: ['a'] },
      { channel: 'load-song', args: ['b'] },
    ]);

    respondLoadSong('a');
    respondLoadSong('b');

    await waitFor(() => expect(result.current.charts.size).toBe(2));
    expect(result.current.charts.get('a')).toBe(fakeChart);
    expect(result.current.charts.get('b')).toBe(fakeChart);
    expect(result.current.settled.has('a')).toBe(true);
    expect(result.current.settled.has('b')).toBe(true);
  });

  it('never queues a song that could not plausibly load, matching unified-library.ts song_ready', () => {
    const notReady = makeListSong('unready', {
      audio: [],
      drumDifficulties: undefined,
    });

    renderHook(() => useLibraryDifficultyCharts([notReady], true));

    expect(ipc.sent).toEqual([]);
  });

  it('never fabricates a difficulty: a chart that fails to parse stays out of the map but still settles', async () => {
    parseChartFileMock.mockImplementation(() => {
      throw new Error('corrupt chart');
    });

    const songs = [makeListSong('corrupt')];
    const { result } = renderHook(() =>
      useLibraryDifficultyCharts(songs, true),
    );

    respondLoadSong('corrupt');

    await waitFor(() =>
      expect(result.current.settled.has('corrupt')).toBe(true),
    );
    expect(result.current.charts.size).toBe(0);
  });

  it('an id-less error reply never poisons a concurrent sibling request', async () => {
    const songs = [makeListSong('broken'), makeListSong('fine')];
    const { result } = renderHook(() =>
      useLibraryDifficultyCharts(songs, true),
    );

    expect(ipc.sent).toEqual([
      { channel: 'load-song', args: ['broken'] },
      { channel: 'load-song', args: ['fine'] },
    ]);

    // `loadSong.ts` replies `{ error }` with no song id on failure — this
    // must not resolve any in-flight request it cannot be matched to.
    act(() => {
      ipc.emit('load-song', { error: 'notes.chart is missing' });
    });
    await Promise.resolve();
    expect(result.current.settled.size).toBe(0);

    respondLoadSong('fine');

    await waitFor(() => expect(result.current.settled.has('fine')).toBe(true));
    expect(result.current.charts.get('fine')).toBe(fakeChart);
    // The broken request is still honestly pending, not fabricated or
    // wrongly resolved by the unrelated error reply.
    expect(result.current.settled.has('broken')).toBe(false);
  });

  it('a genuinely unresolved request settles unrated via its own timeout, never fabricated', async () => {
    vi.useFakeTimers();

    const songs = [makeListSong('broken')];
    const { result } = renderHook(() =>
      useLibraryDifficultyCharts(songs, true),
    );

    act(() => {
      ipc.emit('load-song', { error: 'notes.chart is missing' });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(result.current.settled.has('broken')).toBe(true);
    expect(result.current.charts.size).toBe(0);

    vi.useRealTimers();
  });

  it('never re-requests a song already attempted, even after the songs array is replaced', async () => {
    const songs = [makeListSong('a')];
    const { result, rerender } = renderHook(
      ({ list }: { list: typeof songs }) =>
        useLibraryDifficultyCharts(list, true),
      { initialProps: { list: songs } },
    );

    respondLoadSong('a');
    await waitFor(() => expect(result.current.charts.size).toBe(1));

    ipc.sendMessage.mockClear();

    // A fresh array reference with the same song id, as would happen after
    // an unrelated song-list update (e.g. `update-song`).
    rerender({ list: [makeListSong('a')] });

    expect(ipc.sendMessage).not.toHaveBeenCalled();
  });

  it('retries a request cancelled mid-flight instead of stranding it as unrated forever', () => {
    const songs = [makeListSong('a')];
    // Same hook instance throughout — `attemptedRef` is a ref, so it only
    // proves the fix if it survives across `rerender`s of one mount, not a
    // fresh `renderHook()` (which would start with an empty ref regardless
    // of whether cancellation correctly frees the id).
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useLibraryDifficultyCharts(songs, active),
      { initialProps: { active: true } },
    );

    expect(ipc.sent).toEqual([{ channel: 'load-song', args: ['a'] }]);

    // Leaving Songs mid-flight (no reply ever arrived) cancels the request
    // via the effect's own cleanup, without unmounting the component.
    rerender({ active: false });
    ipc.sendMessage.mockClear();

    // Returning to Songs must re-request the never-resolved song rather
    // than leaving it permanently unrated for the session.
    rerender({ active: true });

    expect(ipc.sent).toEqual([{ channel: 'load-song', args: ['a'] }]);
  });

  it('cancels in-flight requests on unmount without leaving dangling listeners', () => {
    const songs = [makeListSong('a'), makeListSong('b'), makeListSong('c')];
    const { unmount } = renderHook(() =>
      useLibraryDifficultyCharts(songs, true),
    );

    expect(ipc.onCount('load-song')).toBeGreaterThan(0);

    unmount();

    expect(ipc.onCount('load-song')).toBe(0);
  });
});
