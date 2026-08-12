const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 96;
const BAR_GAP = 6;
const MIN_BAR_HEIGHT = 3;

export interface WeeklyXpPoint {
  date: Date;
  xp: number;
}

/**
 * Bar heights (px) for a week of XP values, scaled against the largest
 * value in the set (or `goalXp` if every day falls short of it, so the
 * goal line stays a meaningful reference rather than every bar reading as
 * "full"). Exported for direct testing — mirrors
 * `PracticeStats/AccuracySparkline.tsx`'s `sparklineCoords` split between
 * pure geometry and the SVG that draws it.
 */
export function weeklyBarHeights(
  values: number[],
  goalXp: number,
  maxHeight: number,
): number[] {
  const scaleMax = Math.max(goalXp, ...values, 1);

  return values.map((value) =>
    value <= 0 ? 0 : Math.max(MIN_BAR_HEIGHT, (value / scaleMax) * maxHeight),
  );
}

interface Props {
  points: WeeklyXpPoint[];
  goalXp: number;
  rhythm?: 'daily' | 'weekly';
  width?: number;
  height?: number;
}

export function WeeklyXpChart({
  points,
  goalXp,
  rhythm,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: Props) {
  const barWidth = (width - BAR_GAP * (points.length - 1)) / points.length;
  const heights = weeklyBarHeights(
    points.map((point) => point.xp),
    goalXp,
    height,
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      data-testid="weekly-xp-chart"
      data-rhythm={rhythm}
      role="img"
      aria-label={`${rhythm ? `${rhythm} rhythm. ` : ''}This week's XP: ${points
        .map((point) => point.xp)
        .join(', ')}`}
    >
      {points.map((point, index) => {
        const barHeight = heights[index];
        const x = index * (barWidth + BAR_GAP);
        const y = height - barHeight;
        const metGoal = point.xp >= goalXp && goalXp > 0;

        return (
          <rect
            key={point.date.toISOString()}
            data-testid={`weekly-xp-bar-${index}`}
            data-met-goal={metGoal}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={barWidth / 4}
            fill={metGoal ? 'var(--color-green)' : 'var(--color-accent)'}
            opacity={point.xp > 0 ? 1 : 0.25}
          />
        );
      })}
    </svg>
  );
}
