import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import { App, Button } from 'antd';
import { Stars } from '../Stars';
import {
  LessonEntry,
  LessonProgress,
  lockedHint,
} from '../../hooks/useLessons';
import { LessonListItem } from './LessonListItem';

export interface LessonsViewProps {
  progress: LessonProgress;
  onPlay: (entry: LessonEntry) => void;
}

export function LessonsView({ progress, onPlay }: LessonsViewProps) {
  const { notification } = App.useApp();
  const {
    groups,
    totalLessons,
    unlockedCount,
    totalStars,
    continueEntry,
    nextLockedEntry,
  } = progress;
  const handleLockedClick = (entry: LessonEntry) => {
    notification.info({
      title: 'This lesson is locked',
      description: `${lockedHint(entry)} across your lessons to unlock “${
        entry.lesson.title
      }.”`,
      placement: 'bottomRight',
    });
  };

  if (totalLessons === 0) {
    return (
      <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <h2 className="font-display text-2xl font-semibold text-text-body">
          No lessons found
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">
          The SightKick Method curriculum wasn&apos;t found in your library.
          Rescan your library folder to pick it up.
        </p>
      </section>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex max-w-250 flex-col gap-4 px-4 py-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
            SightKick Method
          </div>
          <h2
            className="font-display text-xl font-semibold leading-tight text-text-body"
            data-testid="lesson-progress-summary"
          >
            {unlockedCount} of {totalLessons} unlocked · {totalStars}⭐ earned
          </h2>
        </div>

        {continueEntry ? (
          <section
            className="flex min-w-0 items-center gap-3 rounded-2xl border border-accent-soft-border bg-accent-soft-bg p-2.5 shadow-accent-soft"
            data-testid="lesson-continue-card"
            aria-labelledby="lesson-continue-title"
          >
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface font-display text-sm font-semibold text-accent-text outline outline-1 -outline-offset-1 outline-white/10">
              {continueEntry.lesson.id}
            </div>
            <div className="min-w-0 grow">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
                Continue
              </div>
              <h3
                id="lesson-continue-title"
                className="truncate font-display text-lg font-semibold leading-tight text-text-body"
                title={continueEntry.lesson.title}
              >
                {continueEntry.lesson.title}
              </h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                <Stars
                  rating={continueEntry.bestStars}
                  size="xs"
                  className="gap-1"
                />
                <span className="truncate">{continueEntry.lesson.unit}</span>
              </div>
            </div>
            <Button
              type="primary"
              size="large"
              className="min-h-11 shrink-0"
              icon={<FontAwesomeIcon icon={faPlay} />}
              aria-label={`Play ${continueEntry.lesson.title}`}
              onClick={() => onPlay(continueEntry)}
            >
              Play
            </Button>
          </section>
        ) : nextLockedEntry ? (
          <section
            className="rounded-2xl border border-border-soft bg-surface p-3"
            data-testid="lesson-all-mastered-card"
          >
            <p className="text-sm text-text-muted">
              You&apos;ve mastered every lesson you&apos;ve unlocked.{' '}
              {lockedHint(nextLockedEntry)} to unlock “
              {nextLockedEntry.lesson.title}.”
            </p>
          </section>
        ) : (
          <section
            className="rounded-2xl border border-border-soft bg-surface p-3"
            data-testid="lesson-complete-card"
          >
            <p className="text-sm text-text-muted">
              You&apos;ve completed the whole SightKick Method curriculum. Nice
              work!
            </p>
          </section>
        )}

        <div className="flex flex-col gap-5 pb-4">
          {groups.map((group) => (
            <div key={group.unit} className="flex flex-col gap-2">
              <h3
                className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-text-dim"
                data-testid={`lesson-group-${group.unit}`}
              >
                {group.unit}
              </h3>
              <div className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <LessonListItem
                    key={entry.song.id}
                    entry={entry}
                    onPlay={onPlay}
                    onLockedClick={handleLockedClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
