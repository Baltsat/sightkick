import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faChevronDown,
  faLock,
  faStar,
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
  /** Whether this season is the spatial scene currently chosen from the rail. */
  isFeatured: boolean;
  /** The unlocked lesson selected for kit/keyboard confirmation. */
  focusedLessonId?: string;
  /** Visible, truthful summary of the controls active on this Journey. */
  controlLegend: string;
  controlSource: 'explicit' | 'kit-lanes' | 'unavailable';
  onPlay: (entry: LessonEntry) => void;
  onLockedClick: (entry: LessonEntry) => void;
}

/**
 * A unit rendered as a racing-game "season": a ring showing how much of it
 * is cleared, a locked/active/completed visual state, and (once opened) the
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
  isFeatured,
  focusedLessonId,
  controlLegend,
  controlSource,
  onPlay,
  onLockedClick,
}: SeasonCardProps) {
  const [expanded, setExpanded] = useState(isCurrent);
  const state = seasonState(group);
  const { earned, possible, clearedCount } = seasonStars(group);
  const donePercent = Math.round((clearedCount / group.entries.length) * 100);
  const pathId = `lesson-path-${group.unit}`;
  // Rail selection always presents a usable path. The manual open/close state
  // still controls unfeatured seasons, preserving the old DOM/test contract.
  const isPathExpanded = expanded || isFeatured;

  return (
    <section
      data-testid={`season-card-${group.unit}`}
      data-season-state={state}
      data-expanded={isPathExpanded ? 'true' : 'false'}
      data-featured={isFeatured ? 'true' : 'false'}
      className={cn(
        'daybreak-season-card motion-safe:transition-opacity motion-safe:duration-500',
        isFeatured && 'daybreak-season-card--featured',
        state === 'locked' && 'opacity-85',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={isPathExpanded}
        aria-controls={pathId}
        data-testid={`season-toggle-${group.unit}`}
        className="daybreak-season-card__masthead flex items-center gap-3.5 text-left cursor-pointer"
      >
        <div
          data-testid={`season-ring-${group.unit}`}
          data-percent={donePercent}
          className="daybreak-season-progress ml-3.5 shrink-0"
        >
          <Progress
            type="circle"
            percent={donePercent}
            size={52}
            showInfo={false}
            strokeColor="#f73586"
            railColor="rgba(17, 23, 34, 0.1)"
          />
        </div>

        <div className="min-w-0 grow py-3.5">
          <div
            className="daybreak-season-state mb-0.5 flex text-[11px] font-semibold uppercase tracking-[0.16em]"
            data-state={state}
          >
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
            className="truncate font-display text-xl font-semibold leading-tight text-[#111722]"
            data-testid={`lesson-group-${group.unit}`}
            title={group.unit}
          >
            {group.unit}
          </h3>
          <div
            className="mt-0.5 text-xs text-[#53606d]"
            data-testid={`season-stars-${group.unit}`}
          >
            {earned} / {possible}{' '}
            <FontAwesomeIcon icon={faStar} aria-label="stars" /> ·{' '}
            {clearedCount}/{group.entries.length} exercises cleared
          </div>
        </div>

        <FontAwesomeIcon
          icon={faChevronDown}
          aria-hidden="true"
          className={cn(
            'mr-3.5 shrink-0 text-[#53606d] motion-safe:transition-transform motion-safe:duration-200',
            isPathExpanded && 'rotate-180',
          )}
        />
      </button>

      <div
        id={pathId}
        className={cn(
          'daybreak-season-card__body',
          !isPathExpanded && 'hidden',
        )}
      >
        <LessonPath
          unit={group.unit}
          entries={group.entries}
          progress={progress}
          focusedLessonId={focusedLessonId}
          controlLegend={controlLegend}
          controlSource={controlSource}
          onPlay={onPlay}
          onLockedClick={onLockedClick}
        />
      </div>
    </section>
  );
}
