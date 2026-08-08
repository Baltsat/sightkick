import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faLock } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import { Stars } from '../Stars';
import { Tooltip } from '../Tooltip';
import { LessonEntry, lockedHint } from '../../hooks/useLessons';
import { NodeState } from './journey';

export interface LessonNodeProps {
  entry: LessonEntry;
  state: NodeState;
  /** Horizontal position (0-100) along the season's winding path. */
  xPercent: number;
  onPlay: (entry: LessonEntry) => void;
  onLockedClick: (entry: LessonEntry) => void;
}

/**
 * One exercise on a season's path. Same click/keyboard/aria contract as the
 * list-item this replaces (`lesson-item-${id}`, `data-locked`, activation on
 * Enter/Space) — only the visual shell changed from a full-width row to a
 * node positioned along the winding track.
 */
export function LessonNode({
  entry,
  state,
  xPercent,
  onPlay,
  onLockedClick,
}: LessonNodeProps) {
  const { lesson, unlocked, bestStars } = entry;
  const hint = lockedHint(entry);
  const activate = () => {
    if (unlocked) {
      onPlay(entry);
    } else {
      onLockedClick(entry);
    }
  };

  return (
    <div
      onClick={activate}
      onKeyDown={(event) => {
        if (
          event.currentTarget === event.target &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          activate();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={
        unlocked
          ? `Play ${lesson.title}`
          : `${lesson.title}, locked. ${hint} to unlock.`
      }
      data-testid={`lesson-item-${lesson.id}`}
      data-locked={unlocked ? undefined : 'true'}
      data-node-state={state}
      style={{ left: `${xPercent}%` }}
      className={cn(
        'absolute top-1/2 flex max-w-56 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full border border-border-soft bg-surface py-1.5 pl-1.5 pr-3 shadow-frame outline outline-1 -outline-offset-1 outline-white/10 cursor-pointer motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        unlocked
          ? 'hover:scale-105 hover:bg-accent-soft-bg hover:border-accent-soft-border motion-safe:transition-transform'
          : 'opacity-55 hover:opacity-75',
        state === 'next-up' &&
          'border-accent-soft-border bg-accent-soft-bg shadow-accent-chip motion-safe:animate-pulse',
      )}
    >
      <div
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-semibold',
          state === 'locked' && 'bg-fill text-text-dim',
          state === 'done' && 'bg-accent-soft-bg text-accent-text',
          state === 'next-up' && 'bg-accent text-accent-ink',
          state === 'available' && 'bg-fill-strong text-text-body',
        )}
      >
        {state === 'locked' ? (
          <FontAwesomeIcon icon={faLock} aria-hidden="true" />
        ) : state === 'done' ? (
          <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
        ) : (
          lesson.id
        )}
      </div>

      <div className="min-w-0">
        <div
          className="truncate font-ui text-xs font-semibold leading-tight text-text-body"
          title={lesson.title}
        >
          {lesson.title}
        </div>

        {unlocked ? (
          <Stars rating={bestStars} size="xs" className="mt-0.5 gap-1" />
        ) : (
          <Tooltip title={`${hint} to unlock this exercise`}>
            <span className="mt-0.5 block truncate text-[11px] text-text-faint">
              {hint}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
