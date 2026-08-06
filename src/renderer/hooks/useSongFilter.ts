import { useMemo, useState } from 'react';
import { Difficulty } from 'scan-chart';
import { Song } from '../../types';
import { type SortState } from '../components/SortButton';
import { useOnlineSearch } from './useOnlineSearch';
import { usePersisted } from './usePersisted';
import { LibraryMode } from '../types';
import { rankOnlineSongs, searchLocalSongs } from '../songSearch';
import { isLessonSong } from './useLessons';

export function useSongFilter(songList: Song[], difficulty: Difficulty) {
  const [nameFilter, setNameFilter] = useState('');
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('local');
  const [sort, setSort] = usePersisted<SortState>('settings.sort', {
    key: 'favorite',
    direction: 'asc',
  });
  const {
    results: onlineResults,
    total: onlineTotal,
    loading: onlineLoading,
    loadMore,
  } = useOnlineSearch(libraryMode === 'online', nameFilter, difficulty);
  const rankedOnline = useMemo(
    () => rankOnlineSongs(onlineResults, nameFilter),
    [onlineResults, nameFilter],
  );
  const filteredSongList = useMemo(() => {
    if (libraryMode === 'online') {
      return rankedOnline.songs;
    }

    const byDifficulty = songList.filter(
      (s) => s.drumDifficulties?.includes(difficulty),
    );

    if (nameFilter) {
      // A search should still be able to surface lesson songs — only the
      // default (unfiltered) view hides them, so 118 drills don't bury the
      // rest of the library.
      return searchLocalSongs(byDifficulty, nameFilter);
    }

    return [...byDifficulty]
      .filter((s) => !isLessonSong(s))
      .sort((a, b) => {
        switch (sort.key) {
          case 'name': {
            const cmp = a.name.localeCompare(b.name);

            return sort.direction === 'asc' ? cmp : -cmp;
          }

          case 'favorite':
            return +(b.liked ?? 0) - +(a.liked ?? 0);

          case 'lastAdded': {
            const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

            return sort.direction === 'asc' ? at - bt : bt - at;
          }

          case 'difficulty': {
            const ad = a.drumDifficulty;
            const bd = b.drumDifficulty;

            return sort.direction === 'asc' ? ad - bd : bd - ad;
          }

          default:
            return a.name.localeCompare(b.name);
        }
      });
  }, [songList, nameFilter, libraryMode, rankedOnline.songs, sort, difficulty]);

  return {
    nameFilter,
    setNameFilter,
    libraryMode,
    setLibraryMode,
    sort,
    setSort,
    filteredSongList,
    onlineResults: rankedOnline.songs,
    onlineHasExactMatch: rankedOnline.hasExactMatch,
    onlineTotal,
    onlineLoading,
    loadMore,
  };
}
