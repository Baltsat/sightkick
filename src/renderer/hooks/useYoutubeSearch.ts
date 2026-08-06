import { useEffect, useState } from 'react';
import {
  IpcResult,
  IpcSearchYoutubeResponse,
  IpcYoutubeSearchResult,
  isIpcError,
} from '../../types';

const DEBOUNCE_MS = 300;

export interface UseYoutubeSearchResult {
  results: IpcYoutubeSearchResult[];
  loading: boolean;
  error: string | undefined;
}

export function useYoutubeSearch(query: string): UseYoutubeSearchResult {
  const trimmed = query.trim();
  const [results, setResults] = useState<IpcYoutubeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  // A sentinel distinct from any real (possibly empty) trimmed query, so the
  // comparison below also fires on the very first render — matching
  // useOnlineSearch's prevSearchKey pattern.
  const [prevQuery, setPrevQuery] = useState<string | undefined>(undefined);

  if (trimmed !== prevQuery) {
    setPrevQuery(trimmed);
    setError(undefined);
    setLoading(Boolean(trimmed));

    if (!trimmed) {
      setResults([]);
    }
  }

  useEffect(() => {
    if (!trimmed) {
      return undefined;
    }

    let off: (() => void) | undefined;
    const timer = setTimeout(() => {
      off = window.electron.ipcRenderer.once<
        IpcResult<IpcSearchYoutubeResponse>
      >('search-youtube', (reply) => {
        setLoading(false);

        if (isIpcError(reply)) {
          setError(reply.error);
          setResults([]);

          return;
        }

        setResults(reply.results);
      });

      window.electron.ipcRenderer.sendMessage('search-youtube', {
        query: trimmed,
      });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      off?.();
    };
  }, [trimmed]);

  return { results, loading, error };
}
