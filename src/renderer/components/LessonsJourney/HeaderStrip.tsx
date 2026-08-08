import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import { Button } from 'antd';
import {
  LESSON_METHOD_DISPLAY_NAME,
  LessonEntry,
  LessonProgress,
  lockedHint,
} from '../../hooks/useLessons';
import { Stars } from '../Stars';
import { currentSeasonInfo } from './journey';

export interface HeaderStripProps {
  progress: LessonProgress;
  onPlay: (entry: LessonEntry) => void;
}

/**
 * Persistent "where am I" strip: current season, node X of Y within it,
 * the existing chain-progress summary, and the Continue affordance (same
 * onPlay logic as before, just restyled). Sticky so it stays visible while
 * scrolling a long season path.
 */
export function HeaderStrip({ progress, onPlay }: HeaderStripProps) {
  const {
    unlockedCount,
    totalLessons,
    totalStars,
    continueEntry,
    nextLockedEntry,
  } = progress;
  const info = currentSeasonInfo(progress);

  return (
    <div
      className="sticky top-0 z-10 flex flex-col gap-4 bg-bg pb-4 pt-1"
      data-testid="lessons-header-strip"
    >
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
          <span>{LESSON_METHOD_DISPLAY_NAME}</span>
          {info && (
            <>
              <span className="text-text-dim" aria-hidden="true">
                ·
              </span>
              <span data-testid="lesson-header-current-season">
                {info.group.unit}
              </span>
              <span className="text-text-dim" aria-hidden="true">
                ·
              </span>
              <span data-testid="lesson-header-node-position">
                Node {info.positionInSeason} of {info.seasonSize}
              </span>
            </>
          )}
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
            You&apos;ve completed the whole {LESSON_METHOD_DISPLAY_NAME}{' '}
            curriculum. Nice work!
          </p>
        </section>
      )}
    </div>
  );
}
