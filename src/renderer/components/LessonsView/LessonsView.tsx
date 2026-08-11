import { useCallback, useMemo, useState } from 'react';
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
import { useInput } from '../../context/InputContext';
import { useInputControls } from '../../hooks/useInputControls';
import journeyStudio from '../../assets/daybreak/journey-studio.png';
import { resolveJourneyControls } from './journey-controls';
import '../LessonsJourney/daybreak-journey.css';
import '../LessonsJourney/JourneyV2.css';

export interface LessonsViewProps {
  progress: LessonProgress;
  onPlay: (entry: LessonEntry) => void;
  /** Rescan progress percent (0-100), or undefined when not scanning. */
  scanPercent?: number;
  /** Fires the same 'rescan-songs' IPC as the settings rescan button. */
  onRescan: () => void;
  /** Returns from Journey to the previous top-level surface. */
  onBack?: () => void;
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
  onBack,
}: LessonsViewProps) {
  const { notification } = App.useApp();
  const { controlMapping, inputMapping } = useInput();
  const journeyControls = useMemo(
    () => resolveJourneyControls(controlMapping, inputMapping),
    [controlMapping, inputMapping],
  );
  const { groups, totalLessons } = progress;
  const isScanning = scanPercent !== undefined;
  // The season the "where am I" pointer sits in opens by default; once the
  // whole curriculum is cleared (no pointer left) the finale season opens
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
  const focusableEntries = useMemo(
    () => visibleGroup?.entries.filter((entry) => entry.unlocked) ?? [],
    [visibleGroup],
  );
  const preferredFocusedLessonId =
    focusableEntries.find(
      (entry) => entry.song.id === progress.continueEntry?.song.id,
    )?.song.id ?? focusableEntries[0]?.song.id;
  const [focusedLessonId, setFocusedLessonId] = useState<string | undefined>(
    preferredFocusedLessonId,
  );
  const [journeyControlsVisible, setJourneyControlsVisible] = useState(false);
  const resolvedFocusedLessonId = focusableEntries.some(
    (entry) => entry.song.id === focusedLessonId,
  )
    ? focusedLessonId
    : preferredFocusedLessonId;
  const selectSeason = useCallback(
    (unit: string) => {
      const group = groups.find((candidate) => candidate.unit === unit);
      const unlocked = group?.entries.filter((entry) => entry.unlocked) ?? [];
      const nextFocusedId =
        unlocked.find(
          (entry) => entry.song.id === progress.continueEntry?.song.id,
        )?.song.id ?? unlocked[0]?.song.id;

      setSelectedUnit(unit);
      setFocusedLessonId(nextFocusedId);
    },
    [groups, progress.continueEntry?.song.id],
  );
  const revealJourneyControls = useCallback(() => {
    setJourneyControlsVisible(true);
  }, []);
  const moveKitFocus = useCallback(
    (delta: number) => {
      revealJourneyControls();

      if (focusableEntries.length === 0) {
        return;
      }

      setFocusedLessonId((current) => {
        const currentIndex = focusableEntries.findIndex(
          (entry) => entry.song.id === current,
        );
        const startIndex = currentIndex === -1 ? 0 : currentIndex;
        const nextIndex =
          (startIndex + delta + focusableEntries.length) %
          focusableEntries.length;

        return focusableEntries[nextIndex].song.id;
      });
    },
    [focusableEntries, revealJourneyControls],
  );
  const moveSeason = useCallback(
    (delta: number) => {
      revealJourneyControls();

      const navigableGroups = groups.filter((group) =>
        group.entries.some((entry) => entry.unlocked),
      );

      if (navigableGroups.length === 0) {
        return;
      }

      const currentIndex = navigableGroups.findIndex(
        (group) => group.unit === visibleUnit,
      );
      const startIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex =
        (startIndex + delta + navigableGroups.length) % navigableGroups.length;

      selectSeason(navigableGroups[nextIndex].unit);
    },
    [groups, revealJourneyControls, selectSeason, visibleUnit],
  );
  const confirmFocusedLesson = useCallback(() => {
    revealJourneyControls();

    const focused = focusableEntries.find(
      (entry) => entry.song.id === resolvedFocusedLessonId,
    );

    if (focused) {
      onPlay(focused);
    }
  }, [
    focusableEntries,
    onPlay,
    resolvedFocusedLessonId,
    revealJourneyControls,
  ]);

  // The lane-derived fallback exists only in this mounted Journey surface.
  // InputContext remains unchanged, so the same pads retain their musical
  // assignments in Practice and cannot collide with global app navigation.
  useInputControls(
    journeyControls.mapping,
    {
      up: () => moveKitFocus(-1),
      down: () => moveKitFocus(1),
      left: () => moveSeason(-1),
      right: () => moveSeason(1),
      confirm: confirmFocusedLesson,
      back: () => {
        revealJourneyControls();
        onBack?.();
      },
    },
    true,
  );

  const visibleState = visibleGroup ? seasonState(visibleGroup) : 'active';
  const visibleStateLabel =
    visibleState === 'completed'
      ? 'Season cleared'
      : visibleState === 'locked'
      ? 'Venue locked'
      : 'Current stage';
  const handleLockedClick = (entry: LessonEntry) => {
    const readableHint = lockedHint(entry);

    notification.info({
      title: 'This lesson is locked',
      description: `${readableHint} to unlock “${
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
      className="daybreak-journey-root journey-route overflow-hidden"
      data-testid="lessons-scroll-root"
    >
      <div className="daybreak-journey-shell journey-route__shell">
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
                onClick={() => selectSeason(group.unit)}
              >
                <span
                  className="daybreak-season-tab__number"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="daybreak-season-tab__label">{group.unit}</span>
                <span
                  className="daybreak-season-tab__state"
                  data-state={state}
                  data-testid={`season-rail-state-${group.unit}`}
                  aria-hidden="true"
                >
                  {state === 'completed'
                    ? 'Cleared'
                    : state === 'locked'
                    ? 'Locked'
                    : 'Live'}
                </span>
              </button>
            );
          })}
        </nav>

        <div
          className="daybreak-journey-stage journey-route__stage grow"
          style={{
            backgroundImage: `url(${journeyStudio})`,
          }}
          data-testid="lesson-season-stage"
          data-selected-season-state={visibleState}
        >
          {visibleGroup && (
            <div
              className="journey-venue-plaque"
              data-state={visibleState}
              data-testid="journey-world-marker"
              aria-hidden="true"
            >
              <span>
                Season {String(visibleSeasonIndex + 1).padStart(2, '0')}
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
              focusedLessonId={resolvedFocusedLessonId}
              controlLegend={journeyControls.legend}
              controlSource={journeyControls.source}
              kitActions={journeyControls.kitActions}
              controlsVisible={journeyControlsVisible}
              onRevealControls={revealJourneyControls}
              onPlay={onPlay}
              onLockedClick={handleLockedClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
