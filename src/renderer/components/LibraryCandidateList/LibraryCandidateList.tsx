import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Difficulty } from 'scan-chart';
import { Button, Tooltip } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import appIcon from '../../../../assets/icon.png';
import type {
  LibraryCandidateResolution,
  Song,
  YandexPlaylistCandidate,
} from '../../../types';
import { cn } from '../../cn';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { Stars } from '../Stars';
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
  onResolveSource: (track: YandexPlaylistCandidate) => void;
  onUseLocalAudioForSource: (track: YandexPlaylistCandidate) => void;
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
  onPlay: () => void;
  onPreviewStart: () => void;
  onPreviewEnd: () => void;
}

function SongRow({
  entry,
  song,
  difficulty,
  focused,
  preview,
  onPlay,
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
        'flex min-w-0 items-center gap-3 border-b border-border-soft px-2 py-2 duration-100 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        {
          'cursor-pointer hover:bg-accent-soft-bg': entry.ready,
          'bg-accent-soft-bg outline-2 -outline-offset-2 outline-accent':
            focused,
        },
      )}
    >
      <img
        src={song.albumCover ?? appIcon}
        alt=""
        onError={(event) => {
          event.currentTarget.src = appIcon;
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
              entry.sourceLabels[0]
                ? `From ${entry.sourceLabels[0]}`
                : undefined,
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
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft-bg px-1.5 py-0.5 font-ui text-[10px] font-semibold text-accent"
              data-testid="song-preview-status"
              aria-live="polite"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              {preview.label}
            </div>
          )}
        </div>
      </div>

      <div className="ml-auto shrink-0 pl-2 text-right">
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
          <span
            className="text-xs text-orange"
            aria-label={`${entry.title} is not playable yet`}
          >
            {entry.stateLabel}
          </span>
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
  canUseLocalAudio: boolean;
  onResolve: () => void;
  onUseLocalAudio: () => void;
}

function sourceStateClassName(state: UnifiedLibraryEntry['state']): string {
  if (state === 'reference-only') {
    return 'text-red';
  }

  if (state === 'metadata-only') {
    return 'text-orange';
  }

  return 'text-text-muted';
}

function SourceRow({
  entry,
  track,
  focused,
  resolution,
  resolving,
  canUseLocalAudio,
  onResolve,
  onUseLocalAudio,
}: SourceRowProps) {
  const duration = durationLabel(track.durationSeconds);
  const label = libraryCandidateState(track, false, resolution);
  const canAutoChart = canUseLocalAudio && track.durationSeconds !== null;
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
        'flex min-w-0 items-center gap-3 border-b border-border-soft px-2 py-2',
        {
          'bg-accent-soft-bg outline-2 -outline-offset-2 outline-accent':
            focused,
        },
      )}
    >
      <img
        src={appIcon}
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
        <div className="flex shrink-0 gap-2">
          <Tooltip title="Check Chorus Encore and RhythmVerse for an exact reviewed drum chart">
            <Button
              size="small"
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
          <Tooltip
            title={
              track.durationSeconds === null
                ? 'This source row has no duration, so its identity cannot pass the safety gate'
                : canUseLocalAudio
                ? 'Choose audio you own or are allowed to process; Drumroll will chart it locally'
                : 'Select a local library folder first'
            }
          >
            <Button
              size="small"
              disabled={!canAutoChart}
              aria-label={`Use lawful local audio for ${
                track.title
              } by ${track.artists.join(', ')}`}
              onClick={onUseLocalAudio}
            >
              Use local audio
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
  canUseLocalAudio,
  onPlaySong,
  onResolveSource,
  onUseLocalAudioForSource,
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
                  onPlay={() => onPlaySong(entry.song!.id)}
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
                  canUseLocalAudio={canUseLocalAudio}
                  onResolve={() => onResolveSource(entry.sourceRow!)}
                  onUseLocalAudio={() =>
                    onUseLocalAudioForSource(entry.sourceRow!)
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
