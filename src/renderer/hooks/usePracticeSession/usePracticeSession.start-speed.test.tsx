import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePracticeSession } from './usePracticeSession';

describe('usePracticeSession start speed', () => {
  it('applies a newly selected speed before normal and count-in starts', () => {
    const calls: string[] = [];
    const engine = {
      setPlaybackSpeed: vi.fn((speed: number) => calls.push(`speed:${speed}`)),
      setLoopRegion: vi.fn(),
      timeStore: { get: () => 0 },
    };
    const onPlay = vi.fn(() => calls.push('play'));
    const onPlayFromTick = vi.fn(() => calls.push('play-from-tick'));
    const { result } = renderHook(() =>
      usePracticeSession({
        engine: engine as never,
        policy: { speedControl: true, looping: false } as never,
        chart: { resolution: 480, tempos: [] } as never,
        renderData: [{ measure: { startTick: 0, endTick: 480 } }] as never,
        delaySeconds: 0,
        isEnded: false,
        onExit: vi.fn(),
        onPlay,
        onPlayFromTick,
      }),
    );

    calls.length = 0;
    act(() => {
      result.current.setPlaybackSpeed(0.5);
      result.current.controlHandlers.confirm!();
    });

    expect(calls.slice(0, 2)).toEqual(['speed:0.5', 'play']);

    calls.length = 0;
    act(() => {
      result.current.controlHandlers.down!();
    });
    act(() => {
      result.current.controlHandlers.confirm!();
    });

    expect(calls.slice(0, 2)).toEqual(['speed:0.5', 'play-from-tick']);
  });
});
