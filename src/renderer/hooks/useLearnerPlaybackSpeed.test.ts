import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  songLearnerSpeedKey,
  useLearnerPlaybackSpeed,
} from './useLearnerPlaybackSpeed';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useLearnerPlaybackSpeed', () => {
  it('starts null - the learner has never touched this song', () => {
    const { result } = renderHook(() => useLearnerPlaybackSpeed('song-a'));

    expect(result.current[0]).toBeNull();
  });

  it('persists an explicit set and reflects it back for the same song', () => {
    const { result } = renderHook(() => useLearnerPlaybackSpeed('song-a'));

    act(() => result.current[1](0.7));

    expect(result.current[0]).toBe(0.7);
    expect(localStorage.getItem(songLearnerSpeedKey('song-a')!)).toBe('0.7');
  });

  it('loads a value set in a prior session (a fresh mount) for the same song', () => {
    localStorage.setItem(songLearnerSpeedKey('song-a')!, JSON.stringify(0.6));

    const { result } = renderHook(() => useLearnerPlaybackSpeed('song-a'));

    expect(result.current[0]).toBe(0.6);
  });

  it('does not cross-write song A speed onto song B when the same component instance navigates between them without remounting', () => {
    // SongView is mounted on the `:id` route param; React Router does not
    // remount it on a same-route id change. This drives that exact shape:
    // one renderHook instance, `rerender` with a new songId - never a fresh
    // mount - matching a live song-A -> song-B navigation.
    const { result, rerender } = renderHook(
      ({ songId }) => useLearnerPlaybackSpeed(songId),
      { initialProps: { songId: 'song-a' } },
    );

    act(() => result.current[1](0.7));
    expect(result.current[0]).toBe(0.7);

    rerender({ songId: 'song-b' });

    // Song B has never been touched - it must read as null, not inherit
    // song A's 0.7 - and nothing must have been written under its key.
    expect(result.current[0]).toBeNull();
    expect(localStorage.getItem(songLearnerSpeedKey('song-b')!)).toBeNull();

    // Song A's own value is untouched by the visit to song B.
    expect(localStorage.getItem(songLearnerSpeedKey('song-a')!)).toBe('0.7');

    // Explicitly setting song B's speed writes only song B's key.
    act(() => result.current[1](0.5));
    expect(localStorage.getItem(songLearnerSpeedKey('song-b')!)).toBe('0.5');
    expect(localStorage.getItem(songLearnerSpeedKey('song-a')!)).toBe('0.7');

    // Navigating back to song A recovers song A's own value, untouched.
    rerender({ songId: 'song-a' });
    expect(result.current[0]).toBe(0.7);
  });

  it('ignores a corrupted or non-numeric stored value rather than throwing', () => {
    localStorage.setItem(songLearnerSpeedKey('song-a')!, 'not json');

    const { result: withGarbage } = renderHook(() =>
      useLearnerPlaybackSpeed('song-a'),
    );

    expect(withGarbage.current[0]).toBeNull();

    localStorage.setItem(
      songLearnerSpeedKey('song-b')!,
      JSON.stringify('fast'),
    );

    const { result: withWrongType } = renderHook(() =>
      useLearnerPlaybackSpeed('song-b'),
    );

    expect(withWrongType.current[0]).toBeNull();
  });

  it('is a no-op setter and always reads null with no songId', () => {
    const { result } = renderHook(() => useLearnerPlaybackSpeed(undefined));

    act(() => result.current[1](0.7));

    expect(result.current[0]).toBeNull();
  });
});
