import { describe, expect, it } from 'vitest';
import { ALL_DIFFICULTIES } from '../../../constants';
import {
  LIBRARY_SORT_OPTIONS,
  nextDifficulty,
  nextSongIndex,
  sortForIndex,
  sortIndexForKey,
  wrapSortIndex,
} from './helpers';

describe('nextSongIndex', () => {
  it('starts at the end going up from no selection', () => {
    expect(nextSongIndex(undefined, 5, -1)).toBe(4);
  });

  it('starts at the top going down from no selection', () => {
    expect(nextSongIndex(undefined, 5, 1)).toBe(0);
  });

  it('wraps past the end going down', () => {
    expect(nextSongIndex(4, 5, 1)).toBe(0);
  });

  it('wraps past the start going up', () => {
    expect(nextSongIndex(0, 5, -1)).toBe(4);
  });

  it('returns 0 for an empty list', () => {
    expect(nextSongIndex(undefined, 0, 1)).toBe(0);
    expect(nextSongIndex(3, 0, -1)).toBe(0);
  });
});

describe('wrapSortIndex', () => {
  it('wraps within the sort options', () => {
    expect(wrapSortIndex(0, -1)).toBe(LIBRARY_SORT_OPTIONS.length - 1);
    expect(wrapSortIndex(LIBRARY_SORT_OPTIONS.length - 1, 1)).toBe(0);
    expect(wrapSortIndex(1, 1)).toBe(2);
  });
});

describe('sortIndexForKey', () => {
  it('finds the index of every sort key', () => {
    LIBRARY_SORT_OPTIONS.forEach((option, index) => {
      expect(sortIndexForKey(option.key)).toBe(index);
    });
  });
});

describe('sortForIndex', () => {
  it('returns the key at the index', () => {
    LIBRARY_SORT_OPTIONS.forEach((option, index) => {
      expect(sortForIndex(index)).toBe(option.key);
    });
  });

  it('falls back to difficulty for an out-of-range index', () => {
    expect(sortForIndex(99)).toBe('difficulty');
  });
});

describe('nextDifficulty', () => {
  it('advances to the next difficulty', () => {
    expect(nextDifficulty(ALL_DIFFICULTIES[0])).toBe(ALL_DIFFICULTIES[1]);
  });

  it('wraps from the last back to the first', () => {
    const last = ALL_DIFFICULTIES[ALL_DIFFICULTIES.length - 1];

    expect(nextDifficulty(last)).toBe(ALL_DIFFICULTIES[0]);
  });
});
