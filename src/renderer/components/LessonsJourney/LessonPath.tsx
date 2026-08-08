import { useMemo } from 'react';
import { LessonEntry, LessonProgress } from '../../hooks/useLessons';
import { LessonNode } from './LessonNode';
import { buildSnakePath, nodeState } from './journey';

/** Row height (px) each exercise node occupies along the winding path. */
const ROW_HEIGHT = 84;

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
  const { xs, d } = useMemo(
    () => buildSnakePath(entries.length),
    [entries.length],
  );
  const unlockedCount = entries.filter((entry) => entry.unlocked).length;
  const travelledD = useMemo(
    () => buildSnakePath(unlockedCount).d,
    [unlockedCount],
  );

  return (
    <div
      className="relative mt-4"
      data-testid={`lesson-path-${unit}`}
      style={{ height: entries.length * ROW_HEIGHT }}
    >
      <svg
        viewBox={`0 0 100 ${entries.length}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={d}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {unlockedCount > 1 && (
          <path
            d={travelledD}
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity={0.55}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <ul className="relative m-0 list-none p-0">
        {entries.map((entry, index) => (
          <li
            key={entry.song.id}
            className="relative"
            style={{ height: ROW_HEIGHT }}
          >
            <LessonNode
              entry={entry}
              state={nodeState(entry, progress)}
              xPercent={xs[index]}
              onPlay={onPlay}
              onLockedClick={onLockedClick}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
