import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import {
  MasteryTimelinePoint,
  MasteryTrendProjection,
} from '../../services/mastery';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export interface MasteryChartPoint {
  label: string;
  completedAt: string;
  mastery?: number;
  accuracy?: number;
  /** speedFactor scaled to 0..100, same axis as mastery/accuracy. */
  speedFactor?: number;
  /** Only populated on the last real point (line start) and the
   * projected-crossing point (line end) — every other point leaves this
   * undefined so the projected line doesn't draw across real history. */
  projected?: number;
}

/**
 * Turns the pure `MasteryTimelinePoint[]` + `MasteryTrendProjection` into
 * one flat array recharts can render as a single `ComposedChart`'s `data`.
 * The trend projection becomes one extra trailing point (`projected: 100`
 * at `trend.projectedMasteryDate`), with the last real point also getting
 * a matching `projected` value so the dashed trend line has a start to
 * draw from — everywhere else `projected` stays undefined so the line
 * doesn't retroactively cross real history.
 *
 * Exported (and kept pure — no chart library imports) so the data
 * transform is unit-testable without rendering recharts at all.
 */
export function buildChartData(
  timeline: MasteryTimelinePoint[],
  trend: MasteryTrendProjection | undefined,
): MasteryChartPoint[] {
  const points: MasteryChartPoint[] = timeline.map((point) => ({
    label: dateFormatter.format(new Date(point.completedAt)),
    completedAt: point.completedAt,
    mastery: point.mastery,
    accuracy: point.accuracy,
    speedFactor: Math.round(point.speedFactor * 100),
  }));

  if (trend?.projectedMasteryDate && points.length > 0) {
    const last = points[points.length - 1];

    last.projected = last.mastery;
    points.push({
      label: dateFormatter.format(new Date(trend.projectedMasteryDate)),
      completedAt: trend.projectedMasteryDate,
      projected: 100,
    });
  }

  return points;
}

function GraphTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-border-soft bg-surface-raised px-3 py-2 text-xs shadow-panel"
      data-testid="mastery-graph-tooltip"
    >
      <div className="mb-1 font-semibold text-text">{label}</div>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-text-muted">
          <span
            className="size-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span>{entry.name}</span>
          <span className="ml-auto tabular-nums text-text">
            {typeof entry.value === 'number' ? Math.round(entry.value) : '—'}%
          </span>
        </div>
      ))}
    </div>
  );
}

export interface MasteryGraphProps {
  timeline: MasteryTimelinePoint[];
  trend?: MasteryTrendProjection;
  height?: number;
}

/**
 * The Profile's headline visualization: mastery % over time (per run),
 * layered with the accuracy and speed-factor sub-series, a target
 * reference line at 100%, and a dashed projected-trend line when the
 * history supports one. Renders an empty state instead of an empty chart
 * when there's no run history yet — an axis-only chart with nothing on it
 * reads as broken, not as "no data".
 */
export function MasteryGraph({
  timeline,
  trend,
  height = 280,
}: MasteryGraphProps) {
  const data = buildChartData(timeline, trend);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-border-soft bg-fill text-sm text-text-faint"
        style={{ height }}
        data-testid="mastery-graph-empty"
      >
        Play a run at this difficulty to start the convergence graph.
      </div>
    );
  }

  return (
    <div data-testid="mastery-graph" style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
        >
          <CartesianGrid stroke="var(--color-border-soft)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--color-text-faint)"
            tick={{ fill: 'var(--color-text-faint)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border-soft)' }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="var(--color-text-faint)"
            tick={{ fill: 'var(--color-text-faint)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip content={GraphTooltip} />
          <ReferenceLine
            y={100}
            stroke="var(--color-green)"
            strokeDasharray="4 4"
            label={{
              value: 'Goal',
              position: 'insideTopRight',
              fill: 'var(--color-green)',
              fontSize: 11,
            }}
          />
          <Line
            type="monotone"
            dataKey="speedFactor"
            name="Speed"
            stroke="var(--color-blue)"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="accuracy"
            name="Accuracy"
            stroke="var(--color-yellow)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mastery"
            name="Mastery"
            stroke="var(--color-accent-bright)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: 'var(--color-accent-bright)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="projected"
            name="Projected"
            stroke="var(--color-text-faint)"
            strokeWidth={1.5}
            strokeDasharray="2 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
