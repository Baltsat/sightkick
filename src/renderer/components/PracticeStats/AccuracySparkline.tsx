import { RunTrendPoint } from '../../services/practice-stats';

interface Props {
  trend: RunTrendPoint[];
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 32;
const PADDING = 3;

export interface SparklineCoord {
  x: number;
  y: number;
}

/** Maps accuracy trend points onto an SVG viewbox. Exported for direct testing. */
export function sparklineCoords(
  trend: RunTrendPoint[],
  width: number,
  height: number,
): SparklineCoord[] {
  const top = PADDING;
  const bottom = height - PADDING;

  return trend.map((point, index) => {
    const x =
      trend.length === 1 ? width / 2 : (index / (trend.length - 1)) * width;
    const y = bottom - point.accuracy * (bottom - top);

    return { x, y };
  });
}

export function AccuracySparkline({
  trend,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: Props) {
  if (trend.length === 0) {
    return (
      <div
        className="text-sm text-text-faint"
        data-testid="accuracy-sparkline-empty"
      >
        Play a few runs to see your trend.
      </div>
    );
  }

  const coords = sparklineCoords(trend, width, height);
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      data-testid="accuracy-sparkline"
      role="img"
      aria-label={`Accuracy across the last ${trend.length} run${
        trend.length === 1 ? '' : 's'
      }: ${Math.round(trend[trend.length - 1].accuracy * 100)}% most recent`}
    >
      <polyline
        points={coords.map((coord) => `${coord.x},${coord.y}`).join(' ')}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill="var(--color-accent)" />
    </svg>
  );
}
