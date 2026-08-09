import type {
  YandexPlaylistCandidate,
  YandexPlaylistCandidateCollection,
} from '../../../types';
import { Button, Tooltip } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { libraryCandidateState } from './libraryCandidates';

function durationLabel(durationSeconds: number | null): string | undefined {
  if (durationSeconds === null) {
    return undefined;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
}

export interface LibraryCandidateListProps {
  source: YandexPlaylistCandidateCollection;
  tracks: readonly YandexPlaylistCandidate[];
  query: string;
  linkedTrackIds?: ReadonlySet<string>;
  canFindAndChart: boolean;
  onFindAndChart: (track: YandexPlaylistCandidate) => void;
}

export function LibraryCandidateList({
  source,
  tracks,
  query,
  linkedTrackIds,
  canFindAndChart,
  onFindAndChart,
}: LibraryCandidateListProps) {
  if (tracks.length === 0) {
    return (
      <section
        className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center"
        data-testid="playlist-candidate-empty"
      >
        <h2 className="font-display text-2xl font-semibold text-text-body">
          No playlist matches for “{query.trim()}”
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">
          Search by track title or artist. The source playlist remains
          unchanged.
        </p>
      </section>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto px-2 py-2"
      data-testid="playlist-candidate-surface"
    >
      <section className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-text-body">
            {source.playlist.name} · Yandex Music
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Metadata only. Add lawful local audio and a drum chart before
            practice.
          </p>
        </div>
        <div className="shrink-0 text-sm tabular-nums text-text-muted">
          {tracks.length} {tracks.length === 1 ? 'source row' : 'source rows'}
        </div>
      </section>

      <ol aria-label={`${source.playlist.name} playlist candidates`}>
        {tracks.map((track) => {
          const duration = durationLabel(track.durationSeconds);
          const unavailable = track.practiceStatus === 'unavailable';
          const privateOnly = track.sourceAvailability === 'private';
          const linked = linkedTrackIds?.has(track.id) ?? false;

          return (
            <li
              key={track.id}
              className="mb-2 flex min-h-18 items-center gap-3 rounded-xl border border-border-soft bg-surface px-4 py-3"
              data-testid={`library-candidate-${track.ordinal}`}
              data-practice-status={linked ? 'linked' : track.practiceStatus}
            >
              <span className="w-7 shrink-0 text-right text-sm tabular-nums text-text-faint">
                {track.ordinal.toString().padStart(2, '0')}
              </span>
              <div className="min-w-0 grow">
                <div className="truncate font-display text-lg font-semibold leading-tight text-text-body">
                  {track.title}
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
                  <span className="truncate">
                    {track.artists.join(', ')}
                    {duration ? ` · ${duration}` : ''}
                  </span>
                  <span
                    className={
                      linked
                        ? 'shrink-0 font-medium text-accent-text'
                        : unavailable
                        ? 'shrink-0 font-medium text-red'
                        : privateOnly
                        ? 'shrink-0 font-medium text-orange'
                        : 'shrink-0 font-medium text-text-muted'
                    }
                    data-testid={`library-candidate-state-${track.ordinal}`}
                  >
                    {libraryCandidateState(track, linked)}
                  </span>
                </div>
              </div>
              <Tooltip
                title={
                  linked
                    ? 'This source row is linked to a playable local chart'
                    : canFindAndChart
                    ? 'Review matching YouTube results, then create a local practice chart'
                    : 'Select a local library folder first'
                }
              >
                <Button
                  className="shrink-0"
                  icon={
                    <FontAwesomeIcon
                      icon={linked ? faCheck : faMagnifyingGlass}
                    />
                  }
                  disabled={linked || !canFindAndChart}
                  aria-label={
                    linked
                      ? `${track.title} is linked to a local chart`
                      : `Find audio and create a chart for ${
                          track.title
                        } by ${track.artists.join(', ')}`
                  }
                  onClick={() => onFindAndChart(track)}
                >
                  {linked ? 'Linked' : 'Find & chart'}
                </Button>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
