import { Difficulty } from 'scan-chart';
import { ALL_DIFFICULTIES } from '../../../constants';
import { UnifiedLibrarySort } from '../../services/library/unified-library';

export interface LibrarySortOption {
  key: UnifiedLibrarySort;
  label: string;
}

// Difficulty first: sit down, hit play, learn something. The shelf opens on
// the order that actually teaches. The rest are quiet alternatives, never
// the default.
export const LIBRARY_SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'recent', label: 'Recently added' },
  { key: 'length', label: 'Shortest' },
  { key: 'ready', label: 'Ready first' },
];

export function nextSongIndex(
  current: number | undefined,
  length: number,
  direction: 1 | -1,
): number {
  if (length === 0) {
    return 0;
  }

  if (current === undefined) {
    return direction === -1 ? length - 1 : 0;
  }

  return (current + direction + length) % length;
}

export function wrapSortIndex(current: number, delta: number): number {
  return (
    (current + delta + LIBRARY_SORT_OPTIONS.length) %
    LIBRARY_SORT_OPTIONS.length
  );
}

export function sortIndexForKey(key: UnifiedLibrarySort): number {
  const index = LIBRARY_SORT_OPTIONS.findIndex((option) => option.key === key);

  return index === -1 ? 0 : index;
}

export function sortForIndex(index: number): UnifiedLibrarySort {
  return LIBRARY_SORT_OPTIONS[index]?.key ?? 'difficulty';
}

export function nextDifficulty(current: Difficulty): Difficulty {
  const index = ALL_DIFFICULTIES.indexOf(current);

  return ALL_DIFFICULTIES[(index + 1) % ALL_DIFFICULTIES.length];
}
