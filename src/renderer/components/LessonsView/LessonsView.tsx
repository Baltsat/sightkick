import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';
import { App, Button, Progress } from 'antd';
import { currentSeasonInfo, HeaderStrip, SeasonCard } from '../LessonsJourney';
import {
  LESSON_METHOD_DISPLAY_NAME,
  LessonEntry,
  LessonProgress,
  lockedHint,
} from '../../hooks/useLessons';

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
      className="h-full w-full overflow-y-auto"
      data-testid="lessons-scroll-root"
    >
      <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-5 py-4">
        <HeaderStrip progress={progress} onPlay={onPlay} />

        <div className="flex flex-col gap-5 pb-4">
          {groups.map((group, index) => (
            <SeasonCard
              key={group.unit}
              group={group}
              seasonNumber={index + 1}
              progress={progress}
              isCurrent={group.unit === currentUnit}
              onPlay={onPlay}
              onLockedClick={handleLockedClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
