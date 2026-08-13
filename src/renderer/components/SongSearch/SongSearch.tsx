import { KeyboardEvent, useEffect, useState } from 'react';
import { App, Empty, Input, Popover, Spin } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import appIcon from '../../../../assets/icon.png';
import {
  IpcYoutubeSearchResult,
  LibrarySourceTrackProvenance,
} from '../../../types';
import { formatTime } from '../../helpers';
import { cn } from '../../cn';
import { popoverStyles } from '../../overlayStyles';
import { Tooltip } from '../Tooltip';
import { useYoutubeSearch } from '../../hooks/useYoutubeSearch';

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
}: Props) {
  const { notification } = App.useApp();
  const requestedQuery = disabled ? '' : requestedSearch?.query.trim() ?? '';
  const [query, setQuery] = useState(requestedQuery);
  const [open, setOpen] = useState(Boolean(requestedQuery));
  const [activeIndex, setActiveIndex] = useState(-1);
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
  const { results, loading, error } = useYoutubeSearch(active ? query : '');
  const [prevResults, setPrevResults] = useState(results);

  if (results !== prevResults) {
    setPrevResults(results);
    setActiveIndex(-1);
  }

  const select = (result: IpcYoutubeSearchResult) => {
    if (sourceProvenance) {
      notification.warning({
        title: 'Use lawful local audio',
        description:
          'A source-linked row cannot use a YouTube match as its audio proof.',
        placement: 'bottomRight',
      });

      return;
    }

    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      youtubeUrl: result.watchUrl,
      autoImport: true,
    });
    notification.info({
      title: 'Adding to your library',
      description: `Finding drums for "${result.title}"…`,
      placement: 'bottomRight',
    });
    setQuery('');
    setSourceProvenance(undefined);
    setOpen(false);
    setActiveIndex(-1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setSourceProvenance(undefined);

      return;
    }

    if (!open || results.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));

      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      select(results[activeIndex >= 0 ? activeIndex : 0]);
    }
  };
  const showPanel = open && Boolean(trimmed) && active;
  const content = (
    <div className="flex w-88 flex-col gap-1" data-testid="song-search-panel">
      {loading && (
        <div
          className="flex items-center gap-2 p-3 text-sm text-text-muted"
          data-testid="song-search-loading"
        >
          <Spin size="small" /> Searching YouTube…
        </div>
      )}

      {!loading && error && (
        <div
          className="p-3 text-sm text-red"
          role="alert"
          data-testid="song-search-error"
        >
          {error}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="p-3" data-testid="song-search-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`No YouTube results for "${trimmed}"`}
          />
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div
          role="listbox"
          id="song-search-listbox"
          aria-label="YouTube search results"
          data-testid="song-search-results"
          className="flex max-h-96 flex-col gap-1 overflow-y-auto"
        >
          {results.map((result, index) => (
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

      {!loading && results.length > 0 && (
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
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls="song-search-listbox"
        aria-activedescendant={
          activeIndex >= 0 ? `song-search-option-${activeIndex}` : undefined
        }
        onChange={(event) => {
          const nextQuery = event.target.value;

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
          setTimeout(() => setOpen(false), 150);
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
