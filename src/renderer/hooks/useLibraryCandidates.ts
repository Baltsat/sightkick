import { useEffect, useState } from 'react';
import type { IpcLibraryCandidatesResponse, IpcResult } from '../../types';
import { isIpcError } from '../../types';

export interface LibraryCandidatesState {
  candidates?: IpcLibraryCandidatesResponse;
  isLoaded: boolean;
  error?: string;
}

/**
 * Loads source-list metadata independently from playable Song records. The
 * distinction is deliberate: candidates never enter the play/download path
 * until the normal import flow has produced both lawful audio and a chart.
 */
export function useLibraryCandidates(): LibraryCandidatesState {
  const [state, setState] = useState<LibraryCandidatesState>({
    isLoaded: false,
  });

  useEffect(() => {
    const off = window.electron.ipcRenderer.once<
      IpcResult<IpcLibraryCandidatesResponse>
    >('load-library-candidates', (reply) => {
      setState(
        isIpcError(reply)
          ? { isLoaded: true, error: reply.error }
          : { isLoaded: true, candidates: reply },
      );
    });

    window.electron.ipcRenderer.sendMessage('load-library-candidates');

    return off;
  }, []);

  return state;
}
