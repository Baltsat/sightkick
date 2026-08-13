import { useEffect, useRef, useState } from 'react';
import { parseChartFile } from 'scan-chart';
import { ParsedChart } from '../../../chart-parser/types';
import { isPlayableEvidence } from '../../../library-sources/playability';
import {
  IpcLoadSongResponse,
  IpcResult,
  isIpcError,
  Song,
} from '../../../types';

const CHART_REQUEST_TIMEOUT_MS = 8000;
const CHART_PARSE_CONCURRENCY = 3;

/**
 * A small, deliberate duplicate of song-hover-preview.ts's private
 * `loadSong` helper — id-matched against every `on('load-song', …)` reply,
 * not `useSongLoader`'s single-flight `once`, which would resolve the
 * wrong request once two songs are in flight at the same time. That file
 * (song-hover-preview.ts) is outside this lane's scope, so this stays a
 * intentional copy rather than a cross-lane edit. It reads only the notes
 * file — the same IPC round trip hover preview already proves is
 * interactive-grade, not the audio file.
 *
 * `loadSong` (main/ipc/loadSong.ts) replies `{ error }` with no song id on
 * failure, so an error reply cannot be safely matched to the request that
 * caused it. Settling every in-flight listener on any error reply would
 * let one broken song poison its concurrent siblings — silently starving
 * honestly-loadable songs of a difficulty. This helper therefore only
 * settles on an id match or its own timeout; a genuine per-song failure
 * costs that one request the timeout instead of corrupting others.
 */
function requestSongFile(id: string): {
  promise: Promise<IpcLoadSongResponse | undefined>;
  cancel: () => void;
} {
  let removeListener: () => void = () => {};
  let settle: (result: IpcLoadSongResponse | undefined) => void = () => {};
  let settled = false;
  const promise = new Promise<IpcLoadSongResponse | undefined>((resolve) => {
    const timeout = setTimeout(
      () => settle(undefined),
      CHART_REQUEST_TIMEOUT_MS,
    );

    settle = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      removeListener();
      resolve(result);
    };

    removeListener = window.electron.ipcRenderer.on<
      IpcResult<IpcLoadSongResponse>
    >('load-song', (payload) => {
      if (!isIpcError(payload) && payload.data.id === id) {
        settle(payload);
      }
    });

    window.electron.ipcRenderer.sendMessage('load-song', id);
  });

  return { promise, cancel: () => settle(undefined) };
}

/**
 * Mirrors unified-library.ts's `song_ready` — inlined because that file is
 * outside this lane's scope. Only a song that can plausibly load is worth
 * queueing: `loadSong` throws (the id-less error reply above) for any
 * source-linked song not yet proven playable, and a row that isn't ready
 * sorts after every ready row regardless of difficulty anyway, so parsing
 * its chart would be pure waste ahead of a request that can actually
 * resolve.
 */
function songLikelyLoadable(song: Song): boolean {
  if (song.sourceLinked || song.sourceProvenance) {
    return isPlayableEvidence(song.playability);
  }

  return song.audio.length > 0 && (song.drumDifficulties?.length ?? 0) > 0;
}

/**
 * Background, bounded-concurrency chart parse so the shelf's "Difficulty"
 * sort can use the real My Wave learner-relative score
 * (services/pedagogy/my-wave.ts, fed through unified-library.ts's `charts`
 * seam) instead of silently collapsing to alphabetical order — see the
 * "difficulty" ordering rule in docs/visual-system-v3.md and the truth rule
 * in docs/design-acceptance-notes.md.
 *
 * A song whose chart never resolves (parse error, missing file, still
 * downloading) simply never enters `charts`. `unified-library.ts` already
 * treats a missing chart as "no known difficulty" rather than fabricating
 * one — this hook only ever supplies real, successfully parsed charts.
 * `settled` separately tracks every song whose request has finished
 * (chart or not) so a caller can say a ready song is honestly unrated
 * instead of leaving the boundary invisible.
 *
 * Every plausibly-loadable song is requested at most once per mount
 * (`attemptedRef` survives across re-renders); a library rescan or a fresh
 * score update produces a new `songs` array reference but only genuinely
 * new entries re-queue. A request cancelled mid-flight (unmount, or the
 * effect re-running before it resolved) is removed from `attemptedRef` so
 * it is retried rather than permanently stranded as unrated.
 */
export function useLibraryDifficultyCharts(
  songs: readonly Song[],
  active: boolean,
): {
  charts: ReadonlyMap<string, ParsedChart>;
  settled: ReadonlySet<string>;
} {
  const [charts, setCharts] = useState<ReadonlyMap<string, ParsedChart>>(
    () => new Map(),
  );
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const queue = songs.filter(
      (song) => songLikelyLoadable(song) && !attemptedRef.current.has(song.id),
    );

    if (queue.length === 0) {
      return undefined;
    }

    let cancelled = false;
    let cursor = 0;
    const pendingCancels = new Set<() => void>();
    const runNext = (): void => {
      if (cancelled || cursor >= queue.length) {
        return;
      }

      const song = queue[cursor];

      cursor += 1;
      attemptedRef.current.add(song.id);

      const request = requestSongFile(song.id);

      pendingCancels.add(request.cancel);

      request.promise
        .then((loaded) => {
          if (!loaded) {
            return undefined;
          }

          try {
            return parseChartFile(
              new Uint8Array(loaded.fileData),
              loaded.data.format,
              {
                pro_drums: loaded.data.proDrums,
                five_lane_drums: loaded.data.fiveLaneDrums,
              },
            );
          } catch {
            return undefined;
          }
        })
        .catch(() => undefined)
        .then((chart) => {
          pendingCancels.delete(request.cancel);

          if (cancelled) {
            // Never really resolved — let a later mount try this song
            // again instead of stranding it as unrated for the session.
            attemptedRef.current.delete(song.id);

            return;
          }

          if (chart) {
            setCharts((current) => {
              const next = new Map(current);

              next.set(song.id, chart);

              return next;
            });
          }

          setSettled((current) => {
            const next = new Set(current);

            next.add(song.id);

            return next;
          });
          runNext();
        });
    };

    for (let lane = 0; lane < CHART_PARSE_CONCURRENCY; lane += 1) {
      runNext();
    }

    return () => {
      cancelled = true;
      pendingCancels.forEach((cancel) => cancel());
      pendingCancels.clear();
    };
  }, [songs, active]);

  return { charts, settled };
}
