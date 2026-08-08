import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faChevronDown,
  faLock,
} from '@fortawesome/free-solid-svg-icons';
import { Progress } from 'antd';
import { cn } from '../../cn';
import {
  LessonEntry,
  LessonProgress,
  LessonUnitGroup,
} from '../../hooks/useLessons';
import { LessonPath } from './LessonPath';
import { seasonStars, seasonState } from './journey';

export interface SeasonCardProps {
  group: LessonUnitGroup;
  /** 1-based season number, for the "SEASON 01" eyebrow. */
  seasonNumber: number;
  progress: LessonProgress;
  /** Whether this is the season the "where am I" pointer is currently in. */
  isCurrent: boolean;
  onPlay: (entry: LessonEntry) => void;
  onLockedClick: (entry: LessonEntry) => void;
}

/**
 * A unit rendered as a racing-game "season": a ring showing how much of it
 * is mastered, a locked/active/completed visual state, and (once opened) the
 * winding path of its exercises. Like a level-select map, the current season
 * opens by default and the rest start collapsed to just their header — click
 * any header to open or close it. Collapsing is CSS-only (`hidden`, not a
 * conditional unmount) so every exercise node stays in the DOM and clickable
 * via `lesson-item-*`, which SongListView's integration tests rely on.
 * Presentation only — unlock math is untouched, this just reads
 * `entry.unlocked` / `entry.bestStars` off the existing chain.
 */
export function SeasonCard({
  group,
  seasonNumber,
  progress,
  isCurrent,
  onPlay,
  onLockedClick,
}: SeasonCardProps) {
  const [expanded, setExpanded] = useState(isCurrent);
  const state = seasonState(group);
  const { earned, possible, masteredCount } = seasonStars(group);
  const donePercent = Math.round((masteredCount / group.entries.length) * 100);
  const pathId = `lesson-path-${group.unit}`;

  return (
    <section
      data-testid={`season-card-${group.unit}`}
      data-season-state={state}
      data-expanded={expanded ? 'true' : 'false'}
      className={cn(
        'rounded-2xl border bg-surface p-4 motion-safe:transition-shadow motion-safe:duration-700',
        state === 'locked' && 'border-border-soft opacity-70',
        state === 'active' && 'border-accent-soft-border shadow-accent-soft',
        state === 'completed' && 'border-accent-soft-border shadow-accent-chip',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={pathId}
        data-testid={`season-toggle-${group.unit}`}
        className="flex w-full items-center gap-3.5 rounded-xl border-0 bg-transparent p-0 text-left cursor-pointer"
      >
        <div
          data-testid={`season-ring-${group.unit}`}
          data-percent={donePercent}
          className="shrink-0"
        >
          <Progress
            type="circle"
            percent={donePercent}
            size={52}
            showInfo={false}
            strokeColor="var(--color-accent)"
            trailColor="var(--color-fill-strong)"
          />
        </div>

        <div className="min-w-0 grow">
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-text">
            <span>Season {String(seasonNumber).padStart(2, '0')}</span>
            {state === 'locked' && (
              <FontAwesomeIcon
                icon={faLock}
                className="text-text-dim"
                aria-hidden="true"
              />
            )}
            {state === 'completed' && (
              <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
            )}
          </div>
          <h3
            className="truncate font-display text-lg font-semibold leading-tight text-text-body"
            data-testid={`lesson-group-${group.unit}`}
            title={group.unit}
          >
            {group.unit}
          </h3>
          <div
            className="mt-0.5 text-xs text-text-muted"
            data-testid={`season-stars-${group.unit}`}
          >
            {earned} / {possible}⭐ · {masteredCount}/{group.entries.length}{' '}
            exercises mastered
          </div>
        </div>

        <FontAwesomeIcon
          icon={faChevronDown}
          aria-hidden="true"
          className={cn(
            'shrink-0 text-text-dim motion-safe:transition-transform motion-safe:duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      <div id={pathId} className={cn(!expanded && 'hidden')}>
        <LessonPath
          unit={group.unit}
          entries={group.entries}
          progress={progress}
          onPlay={onPlay}
          onLockedClick={onLockedClick}
        />
      </div>
    </section>
  );
}
