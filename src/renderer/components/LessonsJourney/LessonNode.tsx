import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faLock } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import { Stars } from '../Stars';
import { Tooltip } from '../Tooltip';
import { LessonEntry, lockedHint } from '../../hooks/useLessons';
import { NodeState } from './journey';
import drumstickCursor from '../../assets/daybreak/drumstick-cursor.png';
import pearlSnare from '../../assets/daybreak/journey-nodes/pearl-snare.png';
import meshPad from '../../assets/daybreak/journey-nodes/mesh-pad.png';
import bronzeCymbal from '../../assets/daybreak/journey-nodes/bronze-cymbal.png';
import kickPad from '../../assets/daybreak/journey-nodes/kick-pad.png';

type LessonLane = NonNullable<
  LessonEntry['lesson']['targetLanes']
>[number]['element'];

type CanonicalColorLane = 'orange' | 'red' | 'yellow' | 'blue' | 'green';

interface LessonNodeVisual {
  asset: string;
  instrument: 'snare' | 'pad' | 'cymbal' | 'kick-pad';
  label: string;
  colorLane: CanonicalColorLane;
}

const NODE_VISUALS: Record<LessonLane, LessonNodeVisual> = {
  kick: {
    asset: kickPad,
    instrument: 'kick-pad',
    label: 'Kick',
    colorLane: 'orange',
  },
  snare: {
    asset: pearlSnare,
    instrument: 'snare',
    label: 'Snare',
    colorLane: 'red',
  },
  hihat: {
    asset: bronzeCymbal,
    instrument: 'cymbal',
    label: 'Hi-hat',
    colorLane: 'yellow',
  },
  tom1: {
    asset: meshPad,
    instrument: 'pad',
    label: 'Tom 1',
    colorLane: 'yellow',
  },
  ride: {
    asset: bronzeCymbal,
    instrument: 'cymbal',
    label: 'Ride',
    colorLane: 'blue',
  },
  tom2: {
    asset: meshPad,
    instrument: 'pad',
    label: 'Tom 2',
    colorLane: 'blue',
  },
  crash: {
    asset: bronzeCymbal,
    instrument: 'cymbal',
    label: 'Crash',
    colorLane: 'green',
  },
  tom3: {
    asset: meshPad,
    instrument: 'pad',
    label: 'Floor tom',
    colorLane: 'green',
  },
};

function inferredLane(title: string): LessonLane {
  const normalized = title.toLowerCase();

  if (normalized.includes('kick')) {
    return 'kick';
  }

  if (normalized.includes('ride')) {
    return 'ride';
  }

  if (normalized.includes('crash')) {
    return 'crash';
  }

  if (normalized.includes('hi-hat') || normalized.includes('hihat')) {
    return 'hihat';
  }

  if (normalized.includes('tom 3') || normalized.includes('floor tom')) {
    return 'tom3';
  }

  if (normalized.includes('tom 2')) {
    return 'tom2';
  }

  if (normalized.includes('tom')) {
    return 'tom1';
  }

  return 'snare';
}

function visualForLesson(entry: LessonEntry): LessonNodeVisual {
  const dominantLane = entry.lesson.targetLanes?.reduce(
    (strongest, target) =>
      !strongest || target.weight > strongest.weight ? target : strongest,
    undefined as
      | NonNullable<LessonEntry['lesson']['targetLanes']>[number]
      | undefined,
  )?.element;

  return NODE_VISUALS[
    dominantLane ?? inferredLane(entry.song.name || entry.lesson.title)
  ];
}

export interface LessonNodeProps {
  entry: LessonEntry;
  state: NodeState;
  /** Horizontal position (0-100) along the season's winding path. */
  xPercent: number;
  /** Vertical position (0-100) inside the fixed-size studio viewport. */
  yPercent: number;
  /** Current kit/keyboard target. Confirm always arms this unlocked lesson. */
  isKitFocused?: boolean;
  /** Off-window nodes remain mounted for stable IDs, but are not interactive. */
  isInViewport?: boolean;
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
  yPercent,
  isKitFocused = false,
  isInViewport = true,
  onPlay,
  onLockedClick,
}: LessonNodeProps) {
  const { lesson, unlocked, bestStars } = entry;
  /* The numbered badge already carries the curriculum coordinate. Keeping
   * the plaque to the authored exercise title preserves the useful words at
   * drum distance instead of repeating "Lesson 01.01" in every node. */
  const exerciseTitle = lesson.title || entry.song.name;
  const visual = visualForLesson(entry);
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
      ? 'Cleared'
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
      tabIndex={isInViewport ? 0 : -1}
      aria-label={
        unlocked
          ? `Play ${exerciseTitle}`
          : `${exerciseTitle}, locked. ${readableHint} to unlock.`
      }
      data-testid={`lesson-item-${lesson.id}`}
      data-locked={unlocked ? undefined : 'true'}
      data-node-state={state}
      data-node-instrument={visual.instrument}
      data-color-lane={visual.colorLane}
      data-kit-focused={isKitFocused ? 'true' : undefined}
      data-in-journey-viewport={isInViewport ? 'true' : 'false'}
      aria-hidden={isInViewport ? undefined : true}
      style={{
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        cursor: `url(${drumstickCursor}) 8 3, pointer`,
      }}
      className={cn(
        'daybreak-lesson-node absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer',
        !unlocked && 'daybreak-lesson-node--locked',
        !isInViewport && 'daybreak-lesson-node--offstage',
      )}
    >
      <div className="daybreak-lesson-node__instrument" aria-hidden="true">
        <span className="daybreak-lesson-node__glow" />
        <img
          className="daybreak-lesson-node__image"
          src={visual.asset}
          alt=""
          draggable={false}
        />
        <span className="daybreak-lesson-node__badge">
          {state === 'locked' ? (
            <FontAwesomeIcon icon={faLock} />
          ) : state === 'done' ? (
            <FontAwesomeIcon icon={faCheck} />
          ) : (
            lesson.id
          )}
        </span>
      </div>

      <div className="daybreak-lesson-node__plaque">
        <div className="daybreak-lesson-node__meta">
          <span className="daybreak-node-status">{stateLabel}</span>
          <span className="daybreak-node-lane">{visual.label}</span>
        </div>
        <div
          className="daybreak-lesson-node__title font-ui text-[13px] font-semibold leading-tight"
          title={exerciseTitle}
        >
          {exerciseTitle}
        </div>

        {unlocked ? (
          <Stars
            rating={bestStars}
            size="xs"
            className="daybreak-lesson-node__stars gap-1"
          />
        ) : (
          <Tooltip title={`${readableHint} to unlock this exercise`}>
            <span className="daybreak-lesson-node__unlock block truncate text-xs font-medium text-white/70">
              {readableHint}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
