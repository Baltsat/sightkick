import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { songAutoSpeedKey, useAutoPracticeSpeed } from './useAutoPracticeSpeed';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useAutoPracticeSpeed', () => {
  it('persists only the auto-owned speed for the current song', () => {
    const { result } = renderHook(() => useAutoPracticeSpeed('song-a'));

    act(() => result.current[1](0.7));

    expect(result.current[0]).toBe(0.7);
    expect(localStorage.getItem(songAutoSpeedKey('song-a')!)).toBe('0.7');
  });

  it('does not cross-write a speed when SongView moves to another song', () => {
    const { result, rerender } = renderHook(
      ({ songId }) => useAutoPracticeSpeed(songId),
      { initialProps: { songId: 'song-a' } },
    );

    act(() => result.current[1](0.7));
    rerender({ songId: 'song-b' });

    expect(result.current[0]).toBeNull();
    expect(localStorage.getItem(songAutoSpeedKey('song-b')!)).toBeNull();
  });
});
