import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import { Stars } from '../Stars';
import { Tooltip } from '../Tooltip';
import { LessonEntry, lockedHint } from '../../hooks/useLessons';

export interface LessonListItemProps {
  entry: LessonEntry;
  onPlay: (entry: LessonEntry) => void;
  onLockedClick: (entry: LessonEntry) => void;
}

export function LessonListItem({
  entry,
  onPlay,
  onLockedClick,
}: LessonListItemProps) {
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
      className={cn(
        'flex min-w-0 items-center gap-3 border border-border-soft grow bg-surface rounded-xl duration-100 ease-out cursor-pointer p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        unlocked
          ? 'hover:bg-accent-soft-bg hover:border-accent-soft-border transition-[background-color,border-color,box-shadow]'
          : 'opacity-60 hover:opacity-80',
      )}
    >
      <div
        className={cn(
          'flex size-14 shrink-0 items-center justify-center rounded-lg font-display text-xs font-semibold shadow-frame outline outline-1 -outline-offset-1 outline-white/10',
          unlocked
            ? 'bg-accent-soft-bg text-accent-text'
            : 'bg-fill text-text-dim',
        )}
      >
        {unlocked ? (
          lesson.id
        ) : (
          <FontAwesomeIcon icon={faLock} aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 grow">
        <div
          className="truncate font-display text-base font-semibold leading-tight text-text-body"
          title={lesson.title}
        >
          {lesson.title}
        </div>
        <div
          className="mt-1 truncate font-ui text-sm text-text-muted"
          title={lesson.unit}
        >
          {lesson.unit} · Lesson {lesson.id}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-2">
        <Stars rating={bestStars} size="xs" className="gap-1" />

        {!unlocked && (
          <Tooltip title={`${hint} to unlock this lesson`}>
            <div className="flex items-center gap-1.5 text-xs text-text-faint">
              <FontAwesomeIcon icon={faLock} aria-hidden="true" />
              <span>{hint}</span>
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
