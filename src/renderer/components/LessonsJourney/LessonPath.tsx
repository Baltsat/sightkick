import { useMemo } from 'react';
import { LessonEntry, LessonProgress } from '../../hooks/useLessons';
import { LessonNode } from './LessonNode';
import { nodeState } from './journey';

/**
 * A deliberate physical beat between nodes in the Arena. On a 1000px-tall
 * desktop window the scene lands six exercises in view; longer units remain
 * scrollable instead of compressing every part of a 25-lesson unit into an
 * unreadable board.
 */
const SCENE_PAGE_HEIGHT = 500;
const VISIBLE_NODE_COUNT = 6;
/**
 * These anchors deliberately sit over the six real drum pads in
 * `journey-studio.png`. Subsequent groups of six repeat on the scrollable
 * continuation of the path rather than becoming tiny, non-interactive dots.
 */
const STUDIO_NODE_ANCHORS = [
  { x: 64, y: 92 },
  { x: 79, y: 168 },
  { x: 70, y: 244 },
  { x: 80, y: 320 },
  { x: 64, y: 396 },
  { x: 42, y: 468 },
];

interface StudioPoint {
  x: number;
  y: number;
}

function studioPoint(index: number): StudioPoint {
  const page = Math.floor(index / VISIBLE_NODE_COUNT);
  const anchor = STUDIO_NODE_ANCHORS[index % VISIBLE_NODE_COUNT];

  return { x: anchor.x, y: anchor.y + page * SCENE_PAGE_HEIGHT };
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
  onPlay: (entry: LessonEntry) => void;
  onLockedClick: (entry: LessonEntry) => void;
}

/**
 * Winding vertical path through a season's exercises: a decorative SVG
 * connector (neutral for the whole season, accent for the stretch already
 * unlocked) behind a column of positioned `LessonNode`s. Pure CSS/SVG, no
 * charting library — node x-positions and the curve both come from
 * `buildSnakePath` so they always agree.
 */
export function LessonPath({
  unit,
  entries,
  progress,
  onPlay,
  onLockedClick,
}: LessonPathProps) {
  const points = useMemo(
    () => entries.map((_, index) => studioPoint(index)),
    [entries],
  );
  const d = useMemo(() => studioPath(points), [points]);
  const unlockedCount = entries.filter((entry) => entry.unlocked).length;
  const travelledD = useMemo(
    () => studioPath(points.slice(0, unlockedCount)),
    [points, unlockedCount],
  );
  const pageCount = Math.max(1, Math.ceil(entries.length / VISIBLE_NODE_COUNT));
  const sceneHeight = pageCount * SCENE_PAGE_HEIGHT;

  return (
    <div
      className="daybreak-lesson-path relative mt-4"
      data-testid={`lesson-path-${unit}`}
      style={{ height: sceneHeight }}
    >
      <svg
        viewBox={`0 0 100 ${sceneHeight}`}
        preserveAspectRatio="none"
        className="daybreak-lesson-path__track pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={d}
          fill="none"
          stroke="rgba(17, 23, 34, 0.22)"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {unlockedCount > 1 && (
          <path
            d={travelledD}
            fill="none"
            className="daybreak-lesson-path__track--completed"
            stroke="#f73586"
            strokeOpacity={0.8}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <ul className="relative m-0 size-full list-none p-0">
        {entries.map((entry, index) => (
          <li key={entry.song.id} className="m-0 p-0">
            <LessonNode
              entry={entry}
              state={nodeState(entry, progress)}
              xPercent={points[index].x}
              yPx={points[index].y}
              onPlay={onPlay}
              onLockedClick={onLockedClick}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
