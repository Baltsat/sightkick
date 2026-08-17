import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import type { IpcAutoChartJob, Song } from '../../types';
import {
  createAutoImportRequest,
  retryAutoImportRequest,
} from '../services/auto-import';
import { OnlineSong } from '../types';

function autoImportCandidate(song: OnlineSong) {
  let url: URL;

  try {
    url = new URL(song.downloadUrl);
  } catch {
    return undefined;
  }

  const videoId = url.searchParams.get('v');

  if (
    url.hostname !== 'www.youtube.com' ||
    url.pathname !== '/watch' ||
    !videoId ||
    !/^[A-Za-z0-9_-]{11}$/.test(videoId)
  ) {
    return undefined;
  }

  return {
    videoId,
    title: song.name,
    uploader: song.artist,
    durationSeconds: song.durationSeconds,
    thumbnailUrl: song.albumCover,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    score: 0,
  };
}

export function useDownload(
  onlineResults: OnlineSong[],
  onSongAdded: (song: Song) => void,
) {
  const { notification } = App.useApp();
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [failedJobIds, setFailedJobIds] = useState<Map<string, string>>(
    new Map(),
  );
  const downloadingRef = useRef<Set<string>>(new Set());
  const failedJobIdsRef = useRef<Map<string, string>>(new Map());
  const songIdsByUrlRef = useRef<Map<string, string>>(new Map());
  const onlineResultsRef = useRef(onlineResults);
  const onSongAddedRef = useRef(onSongAdded);

  useEffect(() => {
    onlineResultsRef.current = onlineResults;
    onSongAddedRef.current = onSongAdded;
  }, [onlineResults, onSongAdded]);

  const setDownloading = useCallback((next: Set<string>) => {
    downloadingRef.current = next;
    setDownloadingIds(new Set(next));
  }, []);
  const setFailedJob = useCallback((songId: string, jobId?: string) => {
    const next = new Map(failedJobIdsRef.current);

    if (jobId) {
      next.set(songId, jobId);
    } else {
      next.delete(songId);
    }

    failedJobIdsRef.current = next;
    setFailedJobIds(new Map(next));
  }, []);

  useEffect(() => {
    return window.electron.ipcRenderer.on<IpcAutoChartJob>(
      'auto-chart-update',
      (job) => {
        if (!job.youtubeUrl) {
          return;
        }

        const songId = songIdsByUrlRef.current.get(job.youtubeUrl);

        if (!songId || !downloadingRef.current.has(songId)) {
          return;
        }

        if (job.stage === 'imported' && job.song) {
          const next = new Set(downloadingRef.current);

          next.delete(songId);
          setDownloading(next);
          setFailedJob(songId);
          songIdsByUrlRef.current.delete(job.youtubeUrl);
          onSongAddedRef.current(job.song);

          return;
        }

        if (job.stage === 'failed' || job.stage === 'cancelled') {
          const next = new Set(downloadingRef.current);

          next.delete(songId);
          setDownloading(next);
          setFailedJob(songId, job.id);
          notification.error({
            title: 'Recording add failed',
            description: job.error ?? job.message,
            placement: 'bottomRight',
          });
        }
      },
    );
  }, [notification, setDownloading, setFailedJob]);

  const handleDownload = useCallback(
    (id: string) => {
      const song = onlineResultsRef.current.find(
        (candidate) => candidate.id === id,
      );
      const candidate = song && autoImportCandidate(song);

      if (!song || downloadingRef.current.has(id)) {
        return;
      }

      if (!candidate) {
        notification.error({
          title: 'Recording add failed',
          description: 'This result has no verified YouTube recording URL.',
          placement: 'bottomRight',
        });

        return;
      }

      setFailedJob(id);
      setDownloading(new Set([...downloadingRef.current, id]));
      songIdsByUrlRef.current.set(candidate.watchUrl, id);
      window.electron.ipcRenderer.sendMessage(
        'create-auto-chart',
        createAutoImportRequest(candidate),
      );
    },
    [notification, setDownloading, setFailedJob],
  );
  const retryDownload = useCallback(
    (id: string) => {
      const jobId = failedJobIdsRef.current.get(id);

      if (!jobId || downloadingRef.current.has(id)) {
        return;
      }

      setFailedJob(id);
      setDownloading(new Set([...downloadingRef.current, id]));

      const retry = retryAutoImportRequest(jobId);

      window.electron.ipcRenderer.sendMessage(retry.channel, retry.id);
    },
    [setDownloading, setFailedJob],
  );

  return { downloadingIds, failedJobIds, handleDownload, retryDownload };
}
