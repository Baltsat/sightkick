import { useEffect, useMemo, useRef } from 'react';
import { Song } from '../../../types';
import { hasUnparsedLessonSongs } from './helpers';

export interface UseLessonAutoRescanOptions {
  songList: Song[];
  /** Whether the Lessons tab is the one currently shown to the user. */
  isLessonsTabActive: boolean;
  totalLessons: number;
  isScanning: boolean;
  rescan: () => void;
}

/**
 * Self-heals a stale-schema Lessons index. If the Lessons tab is open, no
 * lesson songs parsed out of the library, but the library clearly contains
 * SightKick Method folders that failed to parse (see
 * `hasUnparsedLessonSongs`), kicks off exactly one rescan for the lifetime
 * of the calling component — i.e. once per app session, since the caller
 * (SongListView) stays mounted for the whole session regardless of which
 * tab is active. Guarded by a ref so it never retries even if the rescan
 * doesn't fix the problem.
 */
export function useLessonAutoRescan({
  songList,
  isLessonsTabActive,
  totalLessons,
  isScanning,
  rescan,
}: UseLessonAutoRescanOptions): void {
  const triggeredRef = useRef(false);
  const hasStaleSchema = useMemo(
    () => hasUnparsedLessonSongs(songList),
    [songList],
  );

  useEffect(() => {
    if (
      isLessonsTabActive &&
      totalLessons === 0 &&
      hasStaleSchema &&
      !isScanning &&
      !triggeredRef.current
    ) {
      triggeredRef.current = true;
      rescan();
    }
  }, [isLessonsTabActive, totalLessons, hasStaleSchema, isScanning, rescan]);
}
