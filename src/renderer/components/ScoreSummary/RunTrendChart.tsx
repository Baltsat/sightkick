import type { RunInsightTrendPoint } from '../../services/run-insights';

interface Props {
  points: readonly RunInsightTrendPoint[];
}

const WIDTH = 720;
const HEIGHT = 150;
const X_PADDING = 18;
const Y_PADDING = 14;

function position(
  point: RunInsightTrendPoint,
  index: number,
  count: number,
): { x: number; y: number } {
  const x =
    count === 1
      ? WIDTH / 2
      : X_PADDING + (index / (count - 1)) * (WIDTH - X_PADDING * 2);
  const y = HEIGHT - Y_PADDING - point.hitRate * (HEIGHT - Y_PADDING * 2);

  return { x, y };
}

export function RunTrendChart({ points }: Props) {
  const coords = points.map((point, index) =>
    position(point, index, points.length),
  );
  const baseline = coords.length === 1;
  const line = baseline
    ? `${X_PADDING},${coords[0].y} ${WIDTH - X_PADDING},${coords[0].y}`
    : coords.map(({ x, y }) => `${x},${y}`).join(' ');
  const area =
    coords.length > 0
      ? `${X_PADDING},${HEIGHT - Y_PADDING} ${line} ${WIDTH - X_PADDING},${
          HEIGHT - Y_PADDING
        }`
      : '';
  const aria = baseline
    ? `First saved run baseline: ${Math.round(
        points[0].hitRate * 100,
      )}% hit rate.`
    : `Hit rate across ${points.length} runs: ${points
        .map(({ hitRate }) => `${Math.round(hitRate * 100)}%`)
        .join(', ')}.`;

  return (
    <svg
      className="drumroll-score-summary__trend-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={aria}
      data-testid="run-trend-chart"
    >
      <line
        x1={X_PADDING}
        x2={WIDTH - X_PADDING}
        y1={HEIGHT / 2}
        y2={HEIGHT / 2}
        className="drumroll-score-summary__trend-guide"
      />
      <polygon points={area} className="drumroll-score-summary__trend-area" />
      <polyline points={line} className="drumroll-score-summary__trend-line" />
      {coords.map(({ x, y }, index) => (
        <circle
          key={points[index].completedAt}
          cx={x}
          cy={y}
          r={index === coords.length - 1 ? 7 : 5}
          className="drumroll-score-summary__trend-point"
        />
      ))}
    </svg>
  );
}
