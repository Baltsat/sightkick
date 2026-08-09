import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faStar } from '@fortawesome/free-solid-svg-icons';
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
  const continueTitle =
    continueEntry?.song.name || continueEntry?.lesson.title || '';
  const continueLesson = continueEntry?.lesson;

  return (
    <div
      className="daybreak-header-strip sticky top-0 z-10 flex flex-col gap-3 p-4"
      data-testid="lessons-header-strip"
    >
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#9d3d2e]">
          <span>{LESSON_METHOD_DISPLAY_NAME}</span>
          {info && (
            <>
              <span className="text-[#65717e]" aria-hidden="true">
                ·
              </span>
              <span data-testid="lesson-header-current-season">
                {info.group.unit}
              </span>
              <span className="text-[#65717e]" aria-hidden="true">
                ·
              </span>
              <span data-testid="lesson-header-node-position">
                Node {info.positionInSeason} of {info.seasonSize}
              </span>
            </>
          )}
        </div>
        <h2
          className="font-display text-xl font-semibold leading-tight text-[#111722]"
          data-testid="lesson-progress-summary"
        >
          {unlockedCount} of {totalLessons} unlocked · {totalStars}{' '}
          <FontAwesomeIcon icon={faStar} aria-label="stars" /> earned
        </h2>
      </div>

      {continueEntry ? (
        <section
          className="daybreak-next-up flex min-w-0 items-center gap-3 rounded-2xl border p-2.5"
          data-testid="lesson-continue-card"
          aria-labelledby="lesson-continue-title"
        >
          <div className="daybreak-next-up-number flex size-14 shrink-0 items-center justify-center rounded-xl font-display text-sm font-semibold">
            {continueEntry.lesson.id}
          </div>
          <div className="min-w-0 grow">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b42b6c]">
              Continue
            </div>
            <h3
              id="lesson-continue-title"
              className="truncate font-display text-lg font-semibold leading-tight text-[#111722]"
              title={continueTitle}
            >
              {continueTitle}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-[#53606d]">
              <Stars
                rating={continueEntry.bestStars}
                size="xs"
                className="gap-1"
              />
              <span className="truncate">{continueEntry.lesson.unit}</span>
            </div>
            {continueLesson?.cue && (
              <div
                className="daybreak-lesson-plan mt-2 text-xs leading-relaxed text-[#3f4b58]"
                data-testid="lesson-continue-plan"
              >
                <p className="m-0">
                  <strong>Cue:</strong> {continueLesson.cue}
                </p>
                <p className="m-0">
                  <strong>Tempo:</strong> {continueLesson.bpmStart ?? '—'} →{' '}
                  {continueLesson.bpmTarget ?? '—'} BPM
                  {continueLesson.prerequisiteIds?.length
                    ? ` · prerequisite: ${continueLesson.prerequisiteIds.join(
                        ', ',
                      )}`
                    : ' · no prerequisite'}
                </p>
                {continueLesson.doseRule && (
                  <p className="m-0">
                    <strong>Dose:</strong> {continueLesson.doseRule}
                  </p>
                )}
                {continueLesson.masteryRule && (
                  <p className="m-0">
                    <strong>Mastery:</strong> {continueLesson.masteryRule}
                  </p>
                )}
                <p
                  className="m-0 text-[#65717e]"
                  data-testid="lesson-assessment-boundary"
                >
                  {continueLesson.assessmentBoundary ??
                    'MIDI assesses timing and pad choice; sticking/form cue is not assessed.'}
                </p>
              </div>
            )}
          </div>
          <Button
            type="primary"
            size="large"
            className="min-h-11 shrink-0"
            icon={<FontAwesomeIcon icon={faPlay} />}
            aria-label={`Play ${continueTitle}`}
            onClick={() => onPlay(continueEntry)}
          >
            Play
          </Button>
        </section>
      ) : nextLockedEntry ? (
        <section
          className="rounded-2xl border border-[#111722]/15 bg-white/75 p-3"
          data-testid="lesson-all-mastered-card"
        >
          <p className="text-sm text-[#53606d]">
            You&apos;ve mastered every lesson you&apos;ve unlocked.{' '}
            {lockedHint(nextLockedEntry)} to unlock “
            {nextLockedEntry.lesson.title}.”
          </p>
        </section>
      ) : (
        <section
          className="rounded-2xl border border-[#111722]/15 bg-white/75 p-3"
          data-testid="lesson-complete-card"
        >
          <p className="text-sm text-[#53606d]">
            You&apos;ve completed the whole {LESSON_METHOD_DISPLAY_NAME}{' '}
            curriculum. Nice work!
          </p>
        </section>
      )}
    </div>
  );
}
