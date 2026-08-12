import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faStar } from '@fortawesome/free-solid-svg-icons';
import { Button } from 'antd';
import {
  LESSON_METHOD_DISPLAY_NAME,
  LessonProgress,
  lockedHint,
} from '../../hooks/useLessons';
import { currentSeasonInfo } from './journey';

export interface HeaderStripProps {
  progress: LessonProgress;
  onPlay: (entry: NonNullable<LessonProgress['continueEntry']>) => void;
}

export function HeaderStrip({ progress, onPlay }: HeaderStripProps) {
  const {
    unlockedCount,
    totalLessons,
    totalStars,
    continueEntry,
    nextLockedEntry,
  } = progress;
  const info = currentSeasonInfo(progress);
  const continueTitle =
    continueEntry?.lesson.title || continueEntry?.song.name || '';

  return (
    <header className="journey-manifest" data-testid="lessons-header-strip">
      <div className="journey-manifest__context">
        <p className="journey-manifest__eyebrow">
          {LESSON_METHOD_DISPLAY_NAME}
          {info && (
            <>
              <span aria-hidden="true">·</span>
              <span data-testid="lesson-header-current-season">
                Current season · {info.group.unit}
              </span>
            </>
          )}
        </p>
        <h2>{info?.group.unit ?? 'Your rehearsal route'}</h2>
        {info && (
          <p
            className="journey-manifest__position"
            data-testid="lesson-header-node-position"
          >
            Node {info.positionInSeason} of {info.seasonSize}
          </p>
        )}
        <p
          className="journey-manifest__progress"
          data-testid="lesson-progress-summary"
        >
          {unlockedCount} of {totalLessons} unlocked · {totalStars}{' '}
          <FontAwesomeIcon icon={faStar} aria-label="stars" /> earned
        </p>
      </div>

      {continueEntry ? (
        <section
          className="journey-manifest__next"
          data-testid="lesson-continue-card"
          aria-labelledby="lesson-continue-title"
        >
          <div>
            <p>Next lesson</p>
            <h3 id="lesson-continue-title" title={continueTitle}>
              {continueTitle}
            </h3>
            <span>
              {continueEntry.lesson.cue ??
                `${continueEntry.lesson.unit} · settle the pulse before adding speed`}
            </span>
          </div>
          <Button
            type="primary"
            size="large"
            aria-label={`Start ${continueTitle}`}
            onClick={() => onPlay(continueEntry)}
          >
            <FontAwesomeIcon icon={faPlay} aria-hidden="true" />
            Start
          </Button>
        </section>
      ) : nextLockedEntry ? (
        <section
          className="journey-manifest__next journey-manifest__next--complete"
          data-testid="lesson-all-mastered-card"
        >
          <p>
            Your unlocked route is clear. {lockedHint(nextLockedEntry)} to open
            “{nextLockedEntry.lesson.title}.”
          </p>
        </section>
      ) : (
        <section
          className="journey-manifest__next journey-manifest__next--complete"
          data-testid="lesson-complete-card"
        >
          <p>You’ve completed the {LESSON_METHOD_DISPLAY_NAME} route.</p>
        </section>
      )}
    </header>
  );
}
