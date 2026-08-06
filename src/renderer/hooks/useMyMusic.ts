import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isMyMusicError,
  MyMusicErrorInfo,
  MyMusicReply,
  MyMusicSong,
} from '../components/MyMusic/types';

export interface UseMyMusicResult {
  songs: MyMusicSong[];
  loading: boolean;
  error: MyMusicErrorInfo | undefined;
  hasFetched: boolean;
  refresh: (limit?: number) => void;
}

// Fetching reads the user's Chrome cookie store, so this hook never fetches
// on its own — the caller decides when that's appropriate (e.g. an explicit
// "Connect" click) by calling refresh(). Each refresh() call replaces any
// still-pending listener from a previous call, so only the latest request's
// reply is ever applied.
export function useMyMusic(): UseMyMusicResult {
  const [songs, setSongs] = useState<MyMusicSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MyMusicErrorInfo>();
  const [hasFetched, setHasFetched] = useState(false);
  const offRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    return () => {
      offRef.current?.();
      offRef.current = undefined;
    };
  }, []);

  const refresh = useCallback((limit?: number) => {
    offRef.current?.();
    setLoading(true);
    setError(undefined);

    offRef.current = window.electron.ipcRenderer.once<MyMusicReply>(
      'my-music-fetch',
      (reply) => {
        offRef.current = undefined;
        setLoading(false);
        setHasFetched(true);

        if (isMyMusicError(reply)) {
          setError({ code: reply.code, message: reply.error });
          setSongs([]);

          return;
        }

        setSongs(reply.songs);
      },
    );

    window.electron.ipcRenderer.sendMessage(
      'my-music-fetch',
      limit ? { limit } : {},
    );
  }, []);

  return { songs, loading, error, hasFetched, refresh };
}
