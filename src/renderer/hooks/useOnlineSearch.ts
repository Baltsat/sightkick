import { useCallback, useMemo } from 'react';
import { Difficulty } from 'scan-chart';
import type { IpcYoutubeSearchResult } from '../../types';
import { rankAutoImportCandidates } from '../services/auto-import';
import { OnlineSong } from '../types';
import { useYoutubeSearch } from './useYoutubeSearch';

export function mapSongs(
  results: readonly IpcYoutubeSearchResult[],
): OnlineSong[] {
  return results.map(
    (result): OnlineSong => ({
      source: 'online',
      id: result.videoId,
      downloadUrl: result.watchUrl,
      albumCover: result.thumbnailUrl,
      name: result.title,
      artist: result.uploader ?? 'YouTube',
      charter: 'YouTube',
      drumDifficulty: 0,
      durationSeconds: result.durationSeconds,
    }),
  );
}

export function useOnlineSearch(
  active: boolean,
  search: string,
  _difficulty: Difficulty,
) {
  const { results, loading } = useYoutubeSearch(active ? search : '');
  const songs = useMemo(
    () => mapSongs(rankAutoImportCandidates(search, results).candidates),
    [results, search],
  );
  const loadMore = useCallback(() => {}, []);

  return {
    results: songs,
    total: songs.length,
    loading,
    loadMore,
  };
}
