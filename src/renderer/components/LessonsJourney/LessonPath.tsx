import { useMemo } from 'react';
import { LessonEntry, LessonProgress } from '../../hooks/useLessons';
import { LessonNode } from './LessonNode';
import { nodeState } from './journey';
import { KitCommandPrompt } from '../KitCommandPrompt';

/**
 * The Journey is used from a kit at a fixed desktop distance. A season can
 * contain more exercises than are readable in one 768px scene, so the stage
 * intentionally shows a short, stable window around the kit-selected node.
 * All nodes stay mounted (stable test IDs / unlock semantics), but only the
 * four relevant pads occupy the visible studio instead of forcing a page
 * scroll or shrinking lessons into unreadable dots.
 */
const VISIBLE_NODE_COUNT = 4;
const STUDIO_NODE_ANCHORS = [
  { x: 21, y: 25 },
  { x: 47, y: 34 },
  { x: 31, y: 64 },
  { x: 59, y: 73 },
];

interface StudioPoint {
  x: number;
  y: number;
}

function studioPath(points: StudioPoint[]): string {
  if (points.length === 0) {
    return '';
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const turnY = (previous.y + point.y) / 2;

    d += ` C ${previous.x} ${turnY} ${point.x} ${turnY} ${point.x} ${point.y}`;
  }

  return d;
}

export interface LessonPathProps {
  unit: string;
  entries: LessonEntry[];
  progress: LessonProgress;
  /** The deterministic target used by configured kit/keyboard controls. */
  focusedLessonId?: string;
  controlLegend: string;
  controlSource: 'explicit' | 'mixed' | 'kit-lanes' | 'unavailable';
  kitActions: Array<'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'>;
  controlsVisible: boolean;
  onRevealControls: () => void;
  onPlay: (entry: LessonEntry) => void;
  onLockedClick: (entry: LessonEntry) => void;
}

/**
 * A compact, focused route through a season. It is deliberately a viewport,
 * not a vertically growing document: down/up changes the selected lesson and
 * slides the four-node window along the route; confirm starts the highlighted
 * unlocked lesson without the player leaving the kit.
 */
export function LessonPath({
  unit,
  entries,
  progress,
  focusedLessonId,
  controlLegend,
  controlSource,
  kitActions,
  controlsVisible,
  onRevealControls,
  onPlay,
  onLockedClick,
}: LessonPathProps) {
  const focusedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.song.id === focusedLessonId),
  );
  const windowStart = Math.min(
    Math.max(0, focusedIndex - 1),
    Math.max(0, entries.length - VISIBLE_NODE_COUNT),
  );
  const visibleEntries = entries.slice(
    windowStart,
    windowStart + VISIBLE_NODE_COUNT,
  );
  const points = useMemo(
    () =>
      new Map(
        visibleEntries.map((entry, index) => [
          entry.song.id,
          STUDIO_NODE_ANCHORS[index],
        ]),
      ),
    [visibleEntries],
  );
  const d = useMemo(() => studioPath([...points.values()]), [points]);
  const unlockedCount = visibleEntries.filter((entry) => entry.unlocked).length;
  const travelledD = useMemo(
    () => studioPath([...points.values()].slice(0, unlockedCount)),
    [points, unlockedCount],
  );
  const windowEnd = Math.min(entries.length, windowStart + VISIBLE_NODE_COUNT);
  const lessonSteps = [
    ...(kitActions.includes('up') ? (['tom1'] as const) : []),
    ...(kitActions.includes('down') ? (['tom2'] as const) : []),
  ];
  const lessonStepHints = [
    ...(kitActions.includes('up') ? ['Previous'] : []),
    ...(kitActions.includes('down') ? ['Next'] : []),
  ];
  const seasonSteps = [
    ...(kitActions.includes('left') ? (['hihat'] as const) : []),
    ...(kitActions.includes('right') ? (['ride'] as const) : []),
  ];
  const seasonStepHints = [
    ...(kitActions.includes('left') ? ['Previous'] : []),
    ...(kitActions.includes('right') ? ['Next'] : []),
  ];

  return (
    <div
      className="daybreak-lesson-path relative"
      data-testid={`lesson-path-${unit}`}
      data-window-start={windowStart + 1}
      data-window-end={windowEnd}
      data-window-size={visibleEntries.length}
      data-controls-visible={controlsVisible}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="daybreak-lesson-path__track pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={d}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {unlockedCount > 1 && (
          <path
            d={travelledD}
            fill="none"
            className="daybreak-lesson-path__track--completed"
            stroke="var(--signal-green)"
            strokeOpacity={0.8}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <button
        type="button"
        className="daybreak-lesson-path__controls-toggle"
        data-testid="journey-controls-toggle"
        aria-expanded={controlsVisible}
        onClick={onRevealControls}
      >
        Controls
      </button>

      <div
        className="daybreak-lesson-path__kit-hint"
        data-testid="journey-kit-controls"
        data-control-source={controlSource}
        data-visible={controlsVisible}
        onFocusCapture={onRevealControls}
      >
        <span>
          {controlSource === 'kit-lanes'
            ? 'Kit navigation'
            : controlSource === 'mixed'
            ? 'Mixed navigation'
            : 'Journey controls'}
        </span>
        {controlSource === 'kit-lanes' || controlSource === 'mixed' ? (
          <div className="daybreak-lesson-path__kit-commands">
            {lessonSteps.length > 0 && (
              <KitCommandPrompt
                compact
                tone="dark"
                model={{
                  label: 'Select',
                  steps: lessonSteps,
                  relationship: 'alternatives',
                  stepHints: lessonStepHints,
                }}
              />
            )}
            {seasonSteps.length > 0 && (
              <KitCommandPrompt
                compact
                tone="dark"
                model={{
                  label: 'Season',
                  steps: seasonSteps,
                  relationship: 'alternatives',
                  stepHints: seasonStepHints,
                }}
              />
            )}
            {kitActions.includes('confirm') && (
              <KitCommandPrompt
                compact
                tone="dark"
                model={{ label: 'Start', steps: ['snare'] }}
              />
            )}
            {kitActions.includes('back') && (
              <KitCommandPrompt
                compact
                tone="dark"
                model={{ label: 'Back', steps: ['crash'] }}
              />
            )}
          </div>
        ) : (
          <strong>{controlLegend}</strong>
        )}
        {(controlSource === 'kit-lanes' || controlSource === 'mixed') && (
          <strong className="sr-only">{controlLegend}</strong>
        )}
        <small>
          {windowStart + 1}–{windowEnd} of {entries.length}
        </small>
      </div>

      <ul className="relative m-0 size-full list-none p-0">
        {entries.map((entry) => {
          const point = points.get(entry.song.id);

          return (
            <li key={entry.song.id} className="m-0 p-0">
              <LessonNode
                entry={entry}
                state={nodeState(entry, progress)}
                xPercent={point?.x ?? 0}
                yPercent={point?.y ?? 0}
                isKitFocused={entry.song.id === focusedLessonId}
                isInViewport={Boolean(point)}
                onPlay={onPlay}
                onLockedClick={onLockedClick}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
