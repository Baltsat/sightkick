import {
  KeyboardEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Empty, Input, Popover, Spin } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import appIcon from '../../../../assets/icon.png';
import {
  IpcYoutubeSearchResult,
  LibrarySourceTrackProvenance,
  Song,
} from '../../../types';
import { formatTime } from '../../helpers';
import { cn } from '../../cn';
import { popoverStyles } from '../../overlayStyles';
import { Tooltip } from '../Tooltip';
import { useYoutubeSearch } from '../../hooks/useYoutubeSearch';
import { useAutoChartJobs } from '../../hooks/useAutoChartJobs';
import {
  createAutoImportRequest,
  initialAutoImportState,
  rankAutoImportCandidates,
  reduceAutoImport,
  retryAutoImportRequest,
} from '../../services/auto-import';
import type { AutoImportCandidate } from '../../services/auto-import';

export interface SongSearchRequest {
  id: number;
  query: string;
  sourceProvenance?: LibrarySourceTrackProvenance;
}

interface Props {
  disabled?: boolean;
  requestedSearch?: SongSearchRequest;
  /**
   * Reports every keystroke so a caller can search its own local library
   * against the same text. Optional — existing callers that only want the
   * YouTube-import behaviour can ignore it.
   */
  onQueryChange?: (query: string) => void;
  /**
   * When explicitly false, this stays the single visible search field but
   * suppresses the YouTube results panel (and the network search that
   * feeds it) — used to keep it quiet while the caller's own library
   * already has matches for the same text. Defaults to true.
   */
  active?: boolean;
  /** Overrides the input's data-testid; defaults to "song-search-input". */
  inputTestId?: string;
  onImported?: (song: Song) => void;
}

function resultSubtitle(result: IpcYoutubeSearchResult): string {
  const parts: string[] = [];

  if (result.uploader) {
    parts.push(result.uploader);
  }

  if (typeof result.durationSeconds === 'number') {
    parts.push(formatTime(result.durationSeconds));
  }

  return parts.join(' · ');
}

function SongSearchInner({
  disabled,
  requestedSearch,
  onQueryChange,
  active = true,
  inputTestId = 'song-search-input',
  onImported,
}: Props) {
  const requestedSearchQuery = requestedSearch?.query.trim();
  const requestedQuery = disabled ? '' : requestedSearchQuery || '';
  const [query, setQuery] = useState(requestedQuery);
  const [open, setOpen] = useState(Boolean(requestedQuery));
  const [activeIndex, setActiveIndex] = useState(-1);
  const [autoImport, dispatchAutoImport] = useReducer(
    reduceAutoImport,
    initialAutoImportState,
  );
  const selectedCandidateRef = useRef<AutoImportCandidate | undefined>(
    undefined,
  );
  const importedJobIdsRef = useRef<Set<string>>(new Set());
  const [sourceProvenance, setSourceProvenance] = useState<
    LibrarySourceTrackProvenance | undefined
  >(() => {
    if (!requestedQuery || !requestedSearch?.sourceProvenance) {
      return undefined;
    }

    return {
      ...requestedSearch.sourceProvenance,
      artists: [...requestedSearch.sourceProvenance.artists],
    };
  });

  useEffect(() => {
    onQueryChange?.(query);
    // Only the query itself should retrigger this — onQueryChange is
    // typically a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const trimmed = query.trim();
  // A caller's own library search already covers this text, so there is
  // nothing to fetch and nothing honest to show while `active` is false —
  // this both saves the network call and stops a misleading "no YouTube
  // results" flash while local matches are on screen.
  const { results, loading, error, retry } = useYoutubeSearch(
    active ? query : '',
  );
  const candidates = useMemo(
    () => rankAutoImportCandidates(query, results, sourceProvenance).candidates,
    [query, results, sourceProvenance],
  );
  const importInFlight = [
    'queued',
    'resolving',
    'fetching',
    'charting',
    'checking',
    'importing',
  ].includes(autoImport.phase);

  useAutoChartJobs((job) => {
    dispatchAutoImport({ type: 'job', job });

    if (
      job.stage === 'imported' &&
      job.song &&
      selectedCandidateRef.current?.watchUrl === job.youtubeUrl &&
      !importedJobIdsRef.current.has(job.id)
    ) {
      importedJobIdsRef.current.add(job.id);
      onImported?.(job.song);
    }
  });

  useEffect(() => {
    if (!active || !trimmed || autoImport.selected) {
      return;
    }

    if (loading) {
      dispatchAutoImport({ type: 'searching' });

      return;
    }

    if (!error) {
      dispatchAutoImport({ type: 'candidates', candidates });
    }
  }, [active, autoImport.selected, candidates, error, loading, trimmed]);

  const [prevResults, setPrevResults] = useState(results);

  if (results !== prevResults) {
    setPrevResults(results);
    setActiveIndex(-1);
  }

  const select = (result: AutoImportCandidate) => {
    selectedCandidateRef.current = result;
    dispatchAutoImport({ type: 'selected', candidate: result });
    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      ...createAutoImportRequest(result, sourceProvenance),
    });
    setActiveIndex(-1);
  };
  const retryImport = () => {
    if (!autoImport.retryJobId) {
      return;
    }

    const request = retryAutoImportRequest(autoImport.retryJobId);

    dispatchAutoImport({ type: 'retry' });
    window.electron.ipcRenderer.sendMessage(request.channel, request.id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setSourceProvenance(undefined);

      return;
    }

    if (!open || candidates.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % candidates.length);

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? candidates.length - 1 : index - 1,
      );

      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      select(candidates[activeIndex >= 0 ? activeIndex : 0]);
    }
  };
  const showPanel =
    open && Boolean(trimmed) && (active || Boolean(autoImport.selected));
  const content = (
    <div className="flex w-88 flex-col gap-1" data-testid="song-search-panel">
      {autoImport.selected && (
        <div
          className="flex items-center gap-3 rounded-lg p-2"
          data-testid="song-search-import-row"
          role={autoImport.error ? 'alert' : 'status'}
          aria-live={autoImport.error ? 'assertive' : 'polite'}
        >
          <img
            src={autoImport.selected.thumbnailUrl ?? appIcon}
            alt=""
            onError={(event) => {
              event.currentTarget.src = appIcon;
            }}
            className="size-12 shrink-0 rounded-md object-cover outline outline-1 -outline-offset-1 outline-white/10"
          />
          <div className="min-w-0 grow">
            <div
              className="truncate text-sm font-semibold text-text-body"
              title={autoImport.selected.title}
            >
              {autoImport.selected.title}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {autoImport.message ?? `Preparing ${autoImport.selected.title}`}
            </div>
            {autoImport.percent !== undefined && (
              <div
                className="mt-1 text-xs font-medium text-text-body"
                data-testid="song-search-import-progress"
              >
                {Math.round(autoImport.percent)}%
              </div>
            )}
            {autoImport.error && (
              <div className="mt-1 text-xs text-red">{autoImport.error}</div>
            )}
            {autoImport.retryJobId && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-text-body underline underline-offset-2"
                data-testid="song-search-import-retry"
                onClick={retryImport}
              >
                Retry import
              </button>
            )}
          </div>
        </div>
      )}

      {!autoImport.selected && loading && (
        <div
          className="flex items-center gap-2 p-3 text-sm text-text-muted"
          data-testid="song-search-loading"
        >
          <Spin size="small" /> Searching YouTube…
        </div>
      )}

      {!autoImport.selected && !loading && error && (
        <div
          className="p-3 text-sm text-red"
          role="alert"
          data-testid="song-search-error"
        >
          <div>{error}</div>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-text-body underline underline-offset-2"
            data-testid="song-search-retry"
            onClick={retry}
          >
            Retry search
          </button>
        </div>
      )}

      {!autoImport.selected &&
        !loading &&
        !error &&
        candidates.length === 0 && (
          <div className="p-3" data-testid="song-search-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                sourceProvenance && results.length > 0
                  ? `No exact recording found for "${sourceProvenance.title}"`
                  : `No YouTube results for "${trimmed}"`
              }
            />
          </div>
        )}

      {!autoImport.selected && !loading && !error && candidates.length > 0 && (
        <div
          role="listbox"
          id="song-search-listbox"
          aria-label="YouTube search results"
          data-testid="song-search-results"
          className="flex max-h-96 flex-col gap-1 overflow-y-auto"
        >
          {candidates.map((result, index) => (
            <button
              key={result.videoId}
              type="button"
              id={`song-search-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              data-testid={`song-search-result-${result.videoId}`}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                index === activeIndex
                  ? 'bg-[var(--dr-paper-low)]'
                  : 'hover:bg-[var(--dr-paper-low)]',
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(result)}
            >
              <img
                src={result.thumbnailUrl ?? appIcon}
                alt=""
                onError={(event) => {
                  event.currentTarget.src = appIcon;
                }}
                className="size-12 shrink-0 rounded-md object-cover outline outline-1 -outline-offset-1 outline-white/10"
              />
              <div className="min-w-0 grow">
                <div
                  className="truncate text-sm font-semibold text-text-body"
                  title={result.title}
                >
                  {result.title}
                </div>
                <div className="truncate text-xs text-text-muted">
                  {resultSubtitle(result)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!autoImport.selected && !loading && candidates.length > 0 && (
        <div
          className="border-t border-border-soft px-3 py-2 text-xs text-text-faint"
          data-testid="song-search-provenance"
        >
          {sourceProvenance
            ? `Reviewing matches for ${sourceProvenance.title} from ${sourceProvenance.collectionName}`
            : 'Results from YouTube search'}
        </div>
      )}
    </div>
  );
  const input = (
    <div className="w-full">
      <Input
        data-testid={inputTestId}
        aria-label="Search your music"
        placeholder="Search your music…"
        className="w-full"
        prefix={
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            color="var(--color-text-dim)"
          />
        }
        value={query}
        disabled={disabled || importInFlight}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls="song-search-listbox"
        aria-activedescendant={
          activeIndex >= 0 ? `song-search-option-${activeIndex}` : undefined
        }
        onChange={(event) => {
          const nextQuery = event.target.value;

          if (autoImport.selected && !importInFlight) {
            selectedCandidateRef.current = undefined;
            dispatchAutoImport({ type: 'reset' });
          }

          setQuery(nextQuery);

          // The exact Yandex row is a reviewed assertion, not a fuzzy title
          // match. As soon as the user changes that generated query, return
          // to an ordinary unlinked search so the chosen result cannot be
          // falsely attributed to the original source row.
          if (nextQuery.trim() !== requestedQuery) {
            setSourceProvenance(undefined);
          }

          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            if (!selectedCandidateRef.current) {
              setOpen(false);
            }
          }, 150);
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );

  if (disabled) {
    return <Tooltip title="Select a library folder first">{input}</Tooltip>;
  }

  return (
    <Popover
      open={showPanel}
      trigger={[]}
      placement="bottomLeft"
      styles={popoverStyles}
      content={content}
    >
      {input}
    </Popover>
  );
}

export function SongSearch(props: Props) {
  const requestKey = props.requestedSearch?.id ?? 'manual';

  return (
    <SongSearchInner
      key={`${props.disabled ? 'disabled' : 'enabled'}:${requestKey}`}
      {...props}
    />
  );
}
