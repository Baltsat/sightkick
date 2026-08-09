import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';
import { App, Button, Progress } from 'antd';
import {
  currentSeasonInfo,
  HeaderStrip,
  SeasonCard,
  seasonState,
} from '../LessonsJourney';
import {
  LESSON_METHOD_DISPLAY_NAME,
  LessonEntry,
  LessonProgress,
  lockedHint,
} from '../../hooks/useLessons';
import journeyStudio from '../../assets/daybreak/journey-studio.png';
import '../LessonsJourney/daybreak-journey.css';

export interface LessonsViewProps {
  progress: LessonProgress;
  onPlay: (entry: LessonEntry) => void;
  /** Rescan progress percent (0-100), or undefined when not scanning. */
  scanPercent?: number;
  /** Fires the same 'rescan-songs' IPC as the settings rescan button. */
  onRescan: () => void;
}

/**
 * The Lessons tab as a progression journey: units render as "season" cards
 * (progress ring, locked/active/completed state) each containing a winding
 * path of exercise nodes. Presentation only — the unlock chain itself still
 * lives in `useLessons`/`computeLessonProgress`, untouched.
 */
export function LessonsView({
  progress,
  onPlay,
  scanPercent,
  onRescan,
}: LessonsViewProps) {
  const { notification } = App.useApp();
  const { groups, totalLessons } = progress;
  const isScanning = scanPercent !== undefined;
  // The season the "where am I" pointer sits in opens by default; once the
  // whole curriculum is mastered (no pointer left) the finale season opens
  // instead of leaving everything collapsed.
  const currentUnit =
    currentSeasonInfo(progress)?.group.unit ?? groups[groups.length - 1]?.unit;
  const [selectedUnit, setSelectedUnit] = useState(currentUnit);
  const visibleUnit = useMemo(
    () =>
      groups.some((group) => group.unit === selectedUnit)
        ? selectedUnit
        : currentUnit,
    [currentUnit, groups, selectedUnit],
  );
  const visibleSeasonIndex = Math.max(
    0,
    groups.findIndex((group) => group.unit === visibleUnit),
  );
  const visibleGroup = groups[visibleSeasonIndex];
  const visibleState = visibleGroup ? seasonState(visibleGroup) : 'active';
  const visibleStateLabel =
    visibleState === 'completed'
      ? 'Season mastered'
      : visibleState === 'locked'
      ? 'Venue locked'
      : 'Current stage';
  const handleLockedClick = (entry: LessonEntry) => {
    const readableHint = lockedHint(entry).replaceAll('\u2b50', 'stars');

    notification.info({
      title: 'This lesson is locked',
      description: `${readableHint} across your lessons to unlock “${
        entry.song.name || entry.lesson.title
      }.”`,
      placement: 'bottomRight',
    });
  };

  if (totalLessons === 0) {
    if (isScanning) {
      return (
        <section
          className="m-auto flex w-full max-w-md flex-col items-center gap-3 px-6 text-center"
          data-testid="lessons-scan-progress"
        >
          <h2 className="font-display text-2xl font-semibold text-text-body">
            Scanning your library
          </h2>
          <p className="text-sm leading-relaxed text-text-muted">
            Looking for the {LESSON_METHOD_DISPLAY_NAME} curriculum in your
            songs folder…
          </p>
          <Progress percent={scanPercent} className="w-full" />
        </section>
      );
    }

    return (
      <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <h2 className="font-display text-2xl font-semibold text-text-body">
          No lessons found
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">
          The {LESSON_METHOD_DISPLAY_NAME} curriculum wasn&apos;t found in your
          library. Rescan your library folder to pick it up.
        </p>
        <Button
          type="primary"
          icon={<FontAwesomeIcon icon={faArrowsRotate} />}
          data-testid="lessons-rescan"
          onClick={onRescan}
        >
          Rescan library
        </Button>
      </section>
    );
  }

  return (
    <div
      className="daybreak-journey-root h-full w-full overflow-y-auto"
      data-testid="lessons-scroll-root"
    >
      <div className="daybreak-journey-shell mx-auto flex w-full flex-col gap-4 px-4 py-4 sm:px-5">
        <HeaderStrip progress={progress} onPlay={onPlay} />

        <nav
          className="daybreak-season-rail"
          aria-label="Lesson seasons"
          data-testid="lesson-season-rail"
        >
          {groups.map((group, index) => {
            const state = seasonState(group);
            const isSelected = group.unit === visibleUnit;

            return (
              <button
                key={group.unit}
                type="button"
                className="daybreak-season-tab"
                data-testid={`season-rail-${group.unit}`}
                data-selected={isSelected ? 'true' : 'false'}
                data-season-state={state}
                aria-current={isSelected ? 'step' : undefined}
                aria-label={`Season ${index + 1}: ${group.unit}`}
                onClick={() => setSelectedUnit(group.unit)}
              >
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, '0')} ·{' '}
                </span>
                {group.unit}
                <span
                  className="daybreak-season-tab__state"
                  data-state={state}
                  data-testid={`season-rail-state-${group.unit}`}
                  aria-hidden="true"
                >
                  {state === 'completed'
                    ? 'Mastered'
                    : state === 'locked'
                    ? 'Locked'
                    : 'Live'}
                </span>
              </button>
            );
          })}
        </nav>

        <div
          className="daybreak-journey-stage pb-2"
          style={{
            backgroundImage: `url(${journeyStudio})`,
          }}
          data-testid="lesson-season-stage"
          data-selected-season-state={visibleState}
        >
          <div
            className="daybreak-journey-stage__atmosphere"
            aria-hidden="true"
          >
            <span className="daybreak-journey-stage__beam daybreak-journey-stage__beam--amber" />
            <span className="daybreak-journey-stage__beam daybreak-journey-stage__beam--magenta" />
            <span className="daybreak-journey-stage__beam daybreak-journey-stage__beam--cyan" />
          </div>
          {visibleGroup && (
            <div
              className="daybreak-journey-stage__tour-marker"
              data-state={visibleState}
              data-testid="journey-world-marker"
              aria-hidden="true"
            >
              <span>
                World tour · stop{' '}
                {String(visibleSeasonIndex + 1).padStart(2, '0')}
              </span>
              <strong>{visibleGroup.unit}</strong>
              <small>{visibleStateLabel}</small>
            </div>
          )}
          {groups.map((group, index) => (
            <SeasonCard
              key={group.unit}
              group={group}
              seasonNumber={index + 1}
              progress={progress}
              isCurrent={group.unit === currentUnit}
              isFeatured={group.unit === visibleUnit}
              onPlay={onPlay}
              onLockedClick={handleLockedClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
