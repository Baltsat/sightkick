import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Difficulty } from 'scan-chart';
import { Button, Tooltip } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHeart as faHeartSolid,
  faMagnifyingGlass,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { faHeart } from '@fortawesome/free-regular-svg-icons';
import songArtPlaceholder from '../../../../assets/song-art-placeholder.svg';
import type {
  LibraryCandidateResolution,
  Song,
  YandexPlaylistCandidate,
} from '../../../types';
import { cn } from '../../cn';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { Stars } from '../Stars';
import { IconButton } from '../IconButton';
import { useSongHoverPreview } from '../../hooks/useSongHoverPreview';
import type { SongHoverPreviewState } from '../../services/song-hover-preview';
import type { UnifiedLibraryEntry } from '../../services/library/unified-library';
import { libraryCandidateState } from './libraryCandidates';

export interface LibraryCandidateListProps {
  /** The one continuous, already searched/filtered/sorted shelf. */
  entries: readonly UnifiedLibraryEntry[];
  difficulty: Difficulty;
  previewEnabled?: boolean;
  focusedIndex?: number;
  scrollKey?: string;
  resolutions?: Readonly<Record<string, LibraryCandidateResolution>>;
  resolvingTrackIds?: ReadonlySet<string>;
  canUseLocalAudio: boolean;
  onPlaySong: (songId: string) => void;
  onLikeChange?: (songId: string, liked: boolean) => void;
  onResolveSource: (track: YandexPlaylistCandidate) => void;
  onUseLocalAudioForSource: (track: YandexPlaylistCandidate) => void;
  onUseLocalAudioForSong?: (song: Song) => void;
  /**
   * Songs whose difficulty parse has settled with no learner-relative
   * score to show — a ready song can never fabricate a difficulty for a
   * chart that has none, so it says so once, quietly. Absent while a
   * parse is still in flight.
   */
  unratedSongIds?: ReadonlySet<string>;
}

const ROW_HEIGHT = 76;

function durationLabel(
  durationSeconds: number | null | undefined,
): string | undefined {
  if (durationSeconds === null || durationSeconds === undefined) {
    return undefined;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
}

function supportLine(artists: readonly string[], extra?: string): string {
  return [artists.join(', '), extra].filter(Boolean).join(' · ');
}

interface SongRowProps {
  entry: UnifiedLibraryEntry;
  song: Song;
  difficulty: Difficulty;
  focused: boolean;
  preview: SongHoverPreviewState | undefined;
  unrated: boolean;
  onPlay: () => void;
  onLikeChange?: (songId: string, liked: boolean) => void;
  onPreviewStart: () => void;
  onPreviewEnd: () => void;
}

function SongRow({
  entry,
  song,
  difficulty,
  focused,
  preview,
  unrated,
  onPlay,
  onLikeChange,
  onPreviewStart,
  onPreviewEnd,
}: SongRowProps) {
  const score = song.scoreData?.[difficulty];
  const accuracy = score ? calculateAccuracy(score) : undefined;
  const autoChartToolName = song.autoChartTool?.split('(')[0].trim();
  const scoreLabel =
    accuracy !== undefined
      ? `Best score: ${Math.round(accuracy * 100)}% accuracy`
      : 'No best score yet. Play once to earn stars';

  return (
    <div
      onClick={entry.ready ? onPlay : undefined}
      onPointerEnter={entry.ready ? onPreviewStart : undefined}
      onPointerLeave={entry.ready ? onPreviewEnd : undefined}
      onKeyDown={(event) => {
        if (
          entry.ready &&
          event.currentTarget === event.target &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          onPlay();
        }
      }}
      role={entry.ready ? 'button' : undefined}
      tabIndex={entry.ready ? 0 : undefined}
      aria-label={entry.ready ? `Play ${entry.title}` : undefined}
      aria-disabled={!entry.ready ? true : undefined}
      data-testid={`song-item-${song.id}`}
      data-focused={focused ? 'true' : undefined}
      data-previewing={preview ? 'true' : undefined}
      className={cn(
        'group flex min-w-0 items-center gap-3 border-b border-border-soft px-2 py-2 duration-100 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dr-focus)]',
        {
          'cursor-pointer hover:bg-[var(--dr-paper-low)]': entry.ready,
          'bg-[var(--dr-paper-low)] outline-2 -outline-offset-2 outline-[var(--dr-focus)]':
            focused,
        },
      )}
    >
      <img
        src={song.albumCover ?? songArtPlaceholder}
        alt=""
        onError={(event) => {
          event.currentTarget.src = songArtPlaceholder;
        }}
        className="size-14 shrink-0 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-white/10"
      />

      <div className="min-w-0 grow">
        <div
          className="truncate font-display text-lg font-semibold leading-tight text-text-body"
          title={entry.title}
        >
          {entry.title}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <div className="truncate font-ui text-sm text-text-muted">
            {supportLine(
              entry.artists,
              [
                entry.sourceLabels[0]
                  ? `From ${entry.sourceLabels[0]}`
                  : undefined,
                // Never fabricate a difficulty for a chart that has
                // none — say so once, quietly, rather than leaving the
                // rated/unrated boundary invisible. See
                // docs/visual-system-v3.md's "difficulty" rule.
                unrated ? 'Unrated' : undefined,
              ]
                .filter(Boolean)
                .join(' · ') || undefined,
            )}
          </div>

          {autoChartToolName && (
            <Tooltip title={`Auto-charted with ${autoChartToolName}`}>
              <span
                className="inline-flex shrink-0 items-center text-text-dim"
                tabIndex={0}
                aria-label={`Auto-charted with ${autoChartToolName}`}
              >
                <FontAwesomeIcon icon={faWandMagicSparkles} />
              </span>
            </Tooltip>
          )}

          {preview && (
            <div
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--dr-paper-low)] px-1.5 py-0.5 font-ui text-[10px] font-semibold text-[var(--dr-ink)]"
              data-testid="song-preview-status"
              aria-live="polite"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-[var(--dr-ember)]" />
              {preview.label}
            </div>
          )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-right">
        {entry.ready ? (
          <span tabIndex={0} aria-label={scoreLabel}>
            {accuracy !== undefined ? (
              <span aria-hidden="true">
                <Stars
                  rating={getStarRating(score!)}
                  perfect={accuracy === 1}
                  size="xs"
                  className="justify-end gap-1"
                />
              </span>
            ) : (
              <span className="text-xs text-text-faint">
                play once to earn stars
              </span>
            )}
          </span>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            <span
              className="text-xs font-medium text-[var(--dr-warning)]"
              aria-label={`${entry.title} is not playable yet`}
            >
              {entry.stateLabel}
            </span>
          </div>
        )}
        {onLikeChange && (
          <IconButton
            data-testid="like-toggle"
            type={song.liked ? 'primary' : 'default'}
            size="lg"
            aria-label={
              song.liked ? `Unlike ${song.name}` : `Like ${song.name}`
            }
            aria-pressed={Boolean(song.liked)}
            icon={song.liked ? faHeartSolid : faHeart}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onLikeChange(song.id, !song.liked);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface SourceRowProps {
  entry: UnifiedLibraryEntry;
  track: YandexPlaylistCandidate;
  focused: boolean;
  resolution?: LibraryCandidateResolution;
  resolving: boolean;
  onResolve: () => void;
}

function sourceStateClassName(state: UnifiedLibraryEntry['state']): string {
  // A source row that cannot be resolved is an honest, recoverable
  // limitation of the row — never the broken-save/input alarm docs/visual-
  // system-v3.md reserves red/`--dr-error` for.
  if (state === 'reference-only') {
    return 'text-[var(--dr-ink-muted)]';
  }

  if (state === 'metadata-only') {
    return 'text-[var(--dr-warning)]';
  }

  return 'text-text-muted';
}

function SourceRow({
  entry,
  track,
  focused,
  resolution,
  resolving,
  onResolve,
}: SourceRowProps) {
  const duration = durationLabel(track.durationSeconds);
  const label = libraryCandidateState(track, false, resolution);
  // `ordinal` is only unique within its own source collection — Drums and
  // Favorites both start counting at 1 — so the merged shelf must key the
  // testid by source too, or a Drums row and a Favorites row collide.
  const testIdSuffix = `${entry.sourceLabels[0] ?? 'source'}-${track.ordinal}`;

  return (
    <div
      data-testid={`library-candidate-${testIdSuffix}`}
      data-practice-status={track.practiceStatus}
      data-focused={focused ? 'true' : undefined}
      className={cn(
        'group flex min-w-0 items-center gap-3 border-b border-border-soft px-2 py-2',
        {
          'bg-[var(--dr-paper-low)] outline-2 -outline-offset-2 outline-[var(--dr-focus)]':
            focused,
        },
      )}
    >
      <img
        src={songArtPlaceholder}
        alt=""
        className="size-14 shrink-0 rounded-lg object-cover opacity-70 outline outline-1 -outline-offset-1 outline-white/10"
      />

      <div className="min-w-0 grow">
        <div
          className="truncate font-display text-lg font-semibold leading-tight text-text-body"
          title={track.title}
        >
          {track.title}
        </div>
        <div className="mt-1 truncate font-ui text-sm text-text-muted">
          {supportLine(
            track.artists,
            [
              duration,
              entry.sourceLabels[0]
                ? `From ${entry.sourceLabels[0]}`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
          )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5 pl-2">
        <span
          className={cn(
            'text-xs font-medium',
            sourceStateClassName(entry.state),
          )}
          data-testid={`library-candidate-state-${testIdSuffix}`}
        >
          {label}
        </span>
        <div
          data-testid={`library-candidate-actions-${testIdSuffix}`}
          className={cn(
            'flex shrink-0 items-center gap-2 opacity-0 transition-opacity duration-[120ms] ease-out focus-within:opacity-100 group-hover:opacity-100',
            { 'opacity-100': focused },
          )}
        >
          <Tooltip title="Check Chorus Encore and RhythmVerse for an exact reviewed drum chart">
            <Button
              type="text"
              size="small"
              className="text-xs text-text-muted"
              icon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              disabled={resolving}
              aria-label={`Check reviewed public drum charts for ${
                track.title
              } by ${track.artists.join(', ')}`}
              onClick={onResolve}
            >
              {resolving
                ? 'Checking…'
                : resolution?.status === 'exact-reviewed-chart'
                ? 'Chart found'
                : 'Check charts'}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export function LibraryCandidateList({
  entries,
  difficulty,
  previewEnabled = true,
  focusedIndex,
  scrollKey,
  resolutions,
  resolvingTrackIds,
  onPlaySong,
  onLikeChange,
  onResolveSource,
  unratedSongIds,
}: LibraryCandidateListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { preview, startPreview, stopPreview } = useSongHoverPreview(
    previewEnabled,
    difficulty,
  );

  useEffect(() => {
    parentRef.current?.scrollTo(0, 0);
  }, [scrollKey]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
  });

  useEffect(() => {
    if (focusedIndex !== undefined && focusedIndex >= 0) {
      rowVirtualizer.scrollToIndex(focusedIndex, { align: 'auto' });
    }
  }, [focusedIndex, rowVirtualizer]);

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto"
      data-testid="library-shelf"
    >
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const entry = entries[virtualItem.index];

          if (!entry) {
            return null;
          }

          return (
            <div
              ref={rowVirtualizer.measureElement}
              key={entry.key}
              data-index={virtualItem.index}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${
                  virtualItem.start - rowVirtualizer.options.scrollMargin
                }px)`,
              }}
            >
              {entry.kind === 'song' && entry.song ? (
                <SongRow
                  entry={entry}
                  song={entry.song}
                  difficulty={difficulty}
                  focused={virtualItem.index === focusedIndex}
                  preview={
                    preview?.songId === entry.song.id ? preview : undefined
                  }
                  unrated={unratedSongIds?.has(entry.song.id) ?? false}
                  onPlay={() => onPlaySong(entry.song!.id)}
                  onLikeChange={onLikeChange}
                  onPreviewStart={() => startPreview(entry.song!)}
                  onPreviewEnd={() => stopPreview(entry.song!.id)}
                />
              ) : entry.sourceRow ? (
                <SourceRow
                  entry={entry}
                  track={entry.sourceRow}
                  focused={virtualItem.index === focusedIndex}
                  resolution={resolutions?.[entry.sourceRow.id]}
                  resolving={
                    resolvingTrackIds?.has(entry.sourceRow.id) ?? false
                  }
                  onResolve={() => onResolveSource(entry.sourceRow!)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
