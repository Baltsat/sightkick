import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faLock } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import { Stars } from '../Stars';
import { Tooltip } from '../Tooltip';
import { LessonEntry, lockedHint } from '../../hooks/useLessons';
import { NodeState } from './journey';
import drumstickCursor from '../../assets/daybreak/drumstick-cursor.png';

export interface LessonNodeProps {
  entry: LessonEntry;
  state: NodeState;
  /** Horizontal position (0-100) along the season's winding path. */
  xPercent: number;
  /** Vertical scene anchor (px) over the prepared studio drum pads. */
  yPx: number;
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
  yPx,
  onPlay,
  onLockedClick,
}: LessonNodeProps) {
  const { lesson, unlocked, bestStars } = entry;
  const exerciseTitle = entry.song.name || lesson.title;
  const hint = lockedHint(entry);
  const readableHint = hint.replaceAll('\u2b50', 'stars');
  const activate = () => {
    if (unlocked) {
      onPlay(entry);
    } else {
      onLockedClick(entry);
    }
  };
  const stateLabel =
    state === 'next-up'
      ? 'Next up'
      : state === 'done'
      ? 'Mastered'
      : state === 'available'
      ? 'Ready'
      : 'Locked';

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
          ? `Play ${exerciseTitle}`
          : `${exerciseTitle}, locked. ${readableHint} to unlock.`
      }
      data-testid={`lesson-item-${lesson.id}`}
      data-locked={unlocked ? undefined : 'true'}
      data-node-state={state}
      style={{
        left: `${xPercent}%`,
        top: yPx,
        cursor: `url(${drumstickCursor}) 8 3, pointer`,
      }}
      className={cn(
        'daybreak-lesson-node absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3 outline outline-1 -outline-offset-1 outline-white/50 cursor-pointer motion-safe:transition-[background-color,border-color,box-shadow,transform] motion-safe:duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#56d8f2]',
        unlocked ? 'hover:scale-105' : 'daybreak-lesson-node--locked',
      )}
    >
      <div
        className={cn(
          'daybreak-lesson-node__core flex size-11 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-semibold',
          state === 'locked' && 'bg-[#e5e8e8] text-[#65717e]',
          state === 'available' && 'bg-[#fff4d2] text-[#5b410f]',
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
        <span className="daybreak-node-status">{stateLabel}</span>
        <div
          className="daybreak-lesson-node__title font-ui text-[13px] font-semibold leading-tight text-[#111722]"
          title={exerciseTitle}
        >
          {exerciseTitle}
        </div>

        {unlocked ? (
          <Stars rating={bestStars} size="xs" className="mt-0.5 gap-1" />
        ) : (
          <Tooltip title={`${readableHint} to unlock this exercise`}>
            <span className="mt-0.5 block truncate text-xs font-medium text-[#46515e]">
              {readableHint}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
