import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRotateRight,
  faCheck,
  faMusic,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { App, Button, Empty, Spin, Tag } from 'antd';
import appIcon from '../../../../assets/icon.png';
import { formatTime } from '../../helpers';
import { Tooltip } from '../Tooltip';
import { useMyMusic } from '../../hooks/useMyMusic';
import { useAutoChartBackends } from '../../hooks/useAutoChartBackends';
import {
  isTerminalAutoChartStage,
  useAutoChartJobs,
} from '../../hooks/useAutoChartJobs';
import { IpcCreateAutoChartRequest } from '../../../types';
import { isInLibrary, selectBulkAddable } from './helpers';
import { LibrarySongRef, MyMusicSong } from './types';

export interface MyMusicProps {
  librarySongs: LibrarySongRef[];
  disabled?: boolean;
}

const BULK_ADD_COUNT = 10;

function rowSubtitle(song: MyMusicSong): string {
  const parts: string[] = [];

  if (song.artist) {
    parts.push(song.artist);
  }

  if (typeof song.durationSec === 'number') {
    parts.push(formatTime(song.durationSec));
  }

  return parts.join(' · ');
}

export function MyMusic({ librarySongs, disabled }: MyMusicProps) {
  const { notification } = App.useApp();
  const { songs, loading, error, hasFetched, refresh } = useMyMusic();
  const { backends } = useAutoChartBackends();
  // Optimistic, click-time guard against re-entrancy: a watch URL lands
  // here the instant its Add is clicked (before any IPC round trip), and
  // leaves the instant that job's own update reaches a terminal stage
  // (imported/failed/cancelled) — so a double-click can never enqueue the
  // same video twice, even in the brief window before the main process's
  // first 'auto-chart-update' for it arrives.
  const [inFlightUrls, setInFlightUrls] = useState<Set<string>>(new Set());
  const jobs = useAutoChartJobs((nextJob) => {
    if (!nextJob.youtubeUrl || !isTerminalAutoChartStage(nextJob.stage)) {
      return;
    }

    setInFlightUrls((current) => {
      if (!current.has(nextJob.youtubeUrl!)) {
        return current;
      }

      const next = new Set(current);

      next.delete(nextJob.youtubeUrl!);

      return next;
    });
  });
  // Reconciled with the live queue too — not just our own optimistic
  // guard — so a video the *Create chart* modal (or a previous My Music
  // session) already queued or is actively charting also shows as
  // unavailable here, and AutoChart.tsx's pending-queue "Cancel" correctly
  // re-enables the row once that job goes away.
  const queuedUrls = new Set(
    jobs
      .map((queuedJob) => queuedJob.youtubeUrl)
      .filter((url): url is string => Boolean(url)),
  );
  const isQueued = (watchUrl: string) =>
    inFlightUrls.has(watchUrl) || queuedUrls.has(watchUrl);
  const addableSongs = songs.filter((song) => !isQueued(song.watchUrl));
  const addableCount = selectBulkAddable(
    addableSongs,
    librarySongs,
    BULK_ADD_COUNT,
  ).length;
  const markInFlight = (watchUrls: string[]) => {
    setInFlightUrls((current) => {
      const next = new Set(current);

      watchUrls.forEach((watchUrl) => next.add(watchUrl));

      return next;
    });
  };
  const enqueue = (song: MyMusicSong) => {
    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      youtubeUrl: song.watchUrl,
      backend: backends?.default,
    } satisfies IpcCreateAutoChartRequest);
  };
  const addOne = (song: MyMusicSong) => {
    if (isQueued(song.watchUrl)) {
      return;
    }

    markInFlight([song.watchUrl]);
    enqueue(song);
    notification.info({
      title: 'Creating a chart',
      description: `Finding drums for "${song.title}"…`,
      placement: 'bottomRight',
    });
  };
  const addTop10 = () => {
    const toAdd = selectBulkAddable(addableSongs, librarySongs, BULK_ADD_COUNT);

    if (toAdd.length === 0) {
      return;
    }

    markInFlight(toAdd.map((song) => song.watchUrl));

    // Enqueued sequentially, in list order — the auto-chart queue is FIFO
    // with a single active job, so this simply hands it a batch to work
    // through one at a time.
    toAdd.forEach(enqueue);

    notification.info({
      title: 'Adding your top songs',
      description: `Queued ${toAdd.length} song${
        toAdd.length === 1 ? '' : 's'
      } for charting…`,
      placement: 'bottomRight',
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="my-music-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-text-body">
            My Music
          </h2>
          <p className="text-sm text-text-muted">
            Your YouTube Music Liked Songs, ready to chart.
          </p>
        </div>
        {hasFetched && (
          <div className="flex gap-2">
            <Tooltip title="Add the top 10 songs not already in your library">
              <Button
                data-testid="my-music-add-top-10"
                onClick={addTop10}
                disabled={disabled || loading || addableCount === 0}
              >
                Add top 10
              </Button>
            </Tooltip>
            <Tooltip title="Refresh from YouTube Music">
              <Button
                data-testid="my-music-refresh"
                icon={<FontAwesomeIcon icon={faArrowRotateRight} />}
                onClick={() => refresh()}
                disabled={disabled || loading}
                aria-label="Refresh liked songs"
              />
            </Tooltip>
          </div>
        )}
      </div>

      {loading && (
        <div
          className="flex items-center gap-2 p-4 text-sm text-text-muted"
          data-testid="my-music-loading"
        >
          <Spin size="small" /> Reading your Liked Music from Chrome…
        </div>
      )}

      {!loading && !hasFetched && (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border border-border-soft p-8 text-center"
          data-testid="my-music-connect"
        >
          <FontAwesomeIcon
            icon={faMusic}
            size="2x"
            color="var(--color-text-dim)"
          />
          <div className="max-w-sm text-sm leading-relaxed text-text-muted">
            Sign in to music.youtube.com in Chrome. Then connect your YouTube
            Music Liked Songs. Drumroll never receives your password.
          </div>
          <Tooltip
            title={
              disabled
                ? 'Select a library folder first'
                : 'Reads your Liked Music playlist via Chrome'
            }
          >
            <Button
              type="primary"
              data-testid="my-music-connect-button"
              disabled={disabled}
              onClick={() => refresh()}
            >
              Connect YouTube Music
            </Button>
          </Tooltip>
        </div>
      )}

      {!loading && hasFetched && error && (
        <div
          className="rounded-xl border border-red/40 bg-red/10 p-4 text-sm leading-relaxed text-text-body"
          data-testid="my-music-error"
          role="alert"
        >
          <div className="mb-3">{error.message}</div>
          <Button
            data-testid="my-music-retry"
            disabled={disabled}
            onClick={() => refresh()}
          >
            Try again
          </Button>
        </div>
      )}

      {!loading && hasFetched && !error && songs.length === 0 && (
        <div className="p-4" data-testid="my-music-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No liked songs found"
          />
        </div>
      )}

      {!loading && hasFetched && !error && songs.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="my-music-results">
          {songs.map((song) => {
            const inLibrary = isInLibrary(song, librarySongs);
            const queued = isQueued(song.watchUrl);

            return (
              <div
                key={song.videoId}
                data-testid={`my-music-row-${song.videoId}`}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent-soft-bg"
              >
                <img
                  src={song.thumbnailUrl ?? appIcon}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.src = appIcon;
                  }}
                  className="size-12 shrink-0 rounded-md object-cover outline outline-1 -outline-offset-1 outline-white/10"
                />
                <div className="min-w-0 grow">
                  <div
                    className="truncate text-sm font-semibold text-text-body"
                    title={song.title}
                  >
                    {song.title}
                  </div>
                  <div className="truncate text-xs text-text-muted">
                    {rowSubtitle(song)}
                  </div>
                </div>
                {inLibrary ? (
                  <Tag
                    icon={<FontAwesomeIcon icon={faCheck} />}
                    color="green"
                    data-testid={`my-music-in-library-${song.videoId}`}
                  >
                    In library
                  </Tag>
                ) : (
                  <Button
                    size="small"
                    icon={<FontAwesomeIcon icon={faPlus} />}
                    data-testid={`my-music-add-${song.videoId}`}
                    disabled={disabled || queued}
                    loading={queued}
                    onClick={() => addOne(song)}
                  >
                    Add
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
