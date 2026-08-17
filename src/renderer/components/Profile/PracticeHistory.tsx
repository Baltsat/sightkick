import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';
import {
  LongitudinalMonth,
  LongitudinalProgress,
} from '../../services/practice-stats';
import type { WeeklyMusicalRecap } from '../../services/pedagogy';

const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatMonth(month: string): string {
  return monthFormatter.format(new Date(`${month}-01T12:00:00.000Z`));
}

function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T12:00:00.000Z`));
}

function formatAccuracy(accuracy: number | undefined): string {
  return accuracy === undefined
    ? 'No scored notes'
    : `${Math.round(accuracy * 100)}%`;
}

function formatTiming(meanTimingMs: number | undefined): string {
  if (meanTimingMs === undefined) {
    return 'No timing samples';
  }

  if (Math.abs(meanTimingMs) < 0.5) {
    return 'Centered';
  }

  return `${Math.round(Math.abs(meanTimingMs))} ms ${
    meanTimingMs < 0 ? 'early' : 'late'
  }`;
}

interface ChartPoint {
  month: string;
  label: string;
  runs: number;
  accuracy?: number;
}

export function buildPracticeHistoryChartData(
  months: readonly LongitudinalMonth[],
): ChartPoint[] {
  return months.map((month) => ({
    month: month.month,
    label: formatMonth(month.month),
    runs: month.runCount,
    ...(month.accuracy === undefined
      ? {}
      : { accuracy: Math.round(month.accuracy * 1000) / 10 }),
  }));
}

function HistoryTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border-soft bg-surface-raised px-3 py-2 text-xs shadow-panel">
      <div className="mb-1 font-semibold text-text">{label}</div>
      {payload.map((entry) => (
        <div
          key={entry.dataKey?.toString()}
          className="flex items-center gap-2 text-text-muted"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: entry.color }}
            aria-hidden="true"
          />
          <span>{entry.name}</span>
          <span className="ml-auto tabular-nums text-text">
            {typeof entry.value === 'number'
              ? `${entry.value}${entry.dataKey === 'accuracy' ? '%' : ''}`
              : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

function HistoryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl bg-fill px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-semibold tabular-nums text-text">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-text-faint">
        {detail}
      </div>
    </div>
  );
}

/**
 * An all-history Profile surface backed by the compact archive. The graph is
 * paired with a real table so its monthly evidence remains readable without
 * relying on color, hover, or an SVG accessibility implementation.
 */
export function PracticeHistory({
  progress,
  weeklyRecap,
}: {
  progress: LongitudinalProgress | undefined;
  weeklyRecap?: WeeklyMusicalRecap;
}) {
  if (!progress) {
    return (
      <section
        className="rounded-2xl border border-border-soft bg-surface p-5"
        data-testid="profile-practice-history-loading"
      >
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Practice history
        </h3>
        <p className="mt-2 text-sm text-text-muted">
          Loading your saved practice…
        </p>
      </section>
    );
  }

  const { allTime } = progress;
  const chartData = buildPracticeHistoryChartData(progress.months);
  const evidenceRange =
    progress.firstEvidenceDate && progress.lastEvidenceDate
      ? `${formatDate(progress.firstEvidenceDate)} – ${formatDate(
          progress.lastEvidenceDate,
        )}`
      : 'No dated runs yet';

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-border-soft bg-surface p-5"
      data-testid="profile-practice-history"
      aria-labelledby="profile-practice-history-title"
    >
      <div>
        <h3
          id="profile-practice-history-title"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint"
        >
          Practice history
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          All saved runs · {evidenceRange}
        </p>
      </div>

      {weeklyRecap && (
        <section
          className="border-y border-border-soft py-3"
          data-testid="profile-practice-history-weekly-recap"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
            This week in your hands
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {weeklyRecap.sessions} saved session
            {weeklyRecap.sessions === 1 ? '' : 's'} across{' '}
            {weeklyRecap.played_days} played day
            {weeklyRecap.played_days === 1 ? '' : 's'} ·{' '}
            {weeklyRecap.skill.label}. {weeklyRecap.next}
          </p>
        </section>
      )}

      {allTime.runCount === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border-soft bg-fill px-4 py-6 text-center text-sm text-text-faint"
          data-testid="profile-practice-history-empty"
        >
          Finish a practice run to start your long-term record.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <HistoryMetric
              label="All runs"
              value={integerFormatter.format(allTime.runCount)}
              detail={`${integerFormatter.format(
                progress.archivedRunCount,
              )} archived + ${integerFormatter.format(
                progress.recentRunCount,
              )} recent`}
            />
            <HistoryMetric
              label="Scored notes"
              value={integerFormatter.format(allTime.scoredNoteCount)}
              detail={`${integerFormatter.format(
                allTime.wrongHitCount,
              )} unmatched kit hits`}
            />
            <HistoryMetric
              label="Hit accuracy"
              value={formatAccuracy(allTime.accuracy)}
              detail="Hits ÷ all hit-or-miss notes"
            />
            <HistoryMetric
              label="Timing center"
              value={formatTiming(allTime.meanTimingMs)}
              detail={`${integerFormatter.format(
                allTime.timingSampleCount,
              )} correctly hit notes`}
            />
          </div>

          {chartData.length > 0 && (
            <div>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-text-body">
                    Monthly progress
                  </h4>
                  <p className="text-[11px] text-text-faint">
                    Latest {progress.months.length} active month
                    {progress.months.length === 1 ? '' : 's'}
                  </p>
                </div>
                {progress.omittedActiveMonthCount > 0 && (
                  <span className="text-right text-[10px] text-text-faint">
                    {progress.omittedActiveMonthCount} earlier active month
                    {progress.omittedActiveMonthCount === 1 ? '' : 's'} in all
                    history
                  </span>
                )}
              </div>
              <div
                className="h-56 w-full"
                aria-label="Monthly practice runs and hit accuracy chart"
                role="img"
                data-testid="profile-practice-history-chart"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 2, left: -22, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--color-border-soft)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--color-text-faint)', fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border-soft)' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="runs"
                      allowDecimals={false}
                      tick={{ fill: 'var(--color-text-faint)', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={34}
                    />
                    <YAxis
                      yAxisId="accuracy"
                      orientation="right"
                      domain={[0, 100]}
                      hide
                    />
                    <Tooltip content={HistoryTooltip} />
                    <Bar
                      yAxisId="runs"
                      dataKey="runs"
                      name="Runs"
                      fill="var(--color-blue)"
                      fillOpacity={0.32}
                      radius={[5, 5, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="accuracy"
                      type="monotone"
                      dataKey="accuracy"
                      name="Accuracy"
                      stroke="var(--color-accent-bright)"
                      strokeWidth={2.5}
                      dot={{
                        r: 3,
                        fill: 'var(--color-accent-bright)',
                        strokeWidth: 0,
                      }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <details className="rounded-xl border border-border-soft bg-fill px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-text-body">
              Monthly progress table
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-96 text-left text-xs">
                <caption className="sr-only">
                  Monthly runs, scored notes, hit accuracy, and mean timing
                </caption>
                <thead className="text-[10px] uppercase tracking-[0.08em] text-text-faint">
                  <tr>
                    <th className="pb-2 pr-3" scope="col">
                      Month
                    </th>
                    <th className="pb-2 pr-3 text-right" scope="col">
                      Runs
                    </th>
                    <th className="pb-2 pr-3 text-right" scope="col">
                      Notes
                    </th>
                    <th className="pb-2 pr-3 text-right" scope="col">
                      Accuracy
                    </th>
                    <th className="pb-2 text-right" scope="col">
                      Timing
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft text-text-muted">
                  {progress.months.map((month) => (
                    <tr key={month.month}>
                      <th
                        className="py-2 pr-3 font-medium text-text-body"
                        scope="row"
                      >
                        {formatMonth(month.month)}
                      </th>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {integerFormatter.format(month.runCount)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {integerFormatter.format(month.scoredNoteCount)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatAccuracy(month.accuracy)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatTiming(month.meanTimingMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      <div
        className="space-y-1 border-t border-border-soft pt-3 text-[11px] leading-relaxed text-text-faint"
        data-testid="profile-practice-history-definition"
      >
        <p>
          All history counts each archived and recent run once. Accuracy uses
          scored hits. Timing uses scored samples: early is negative, late is
          positive.
        </p>
        {progress.aggregateOnlyArchivedRunCount > 0 && (
          <p
            className="text-text-muted"
            data-testid="historical-detail-unavailable"
          >
            Historical detail unavailable: exact bar and skill diagnosis was not
            retained for{' '}
            {integerFormatter.format(progress.aggregateOnlyArchivedRunCount)}{' '}
            archived run
            {progress.aggregateOnlyArchivedRunCount === 1 ? '' : 's'} on
            aggregate-only days. Their run volume, hit/miss accuracy, and
            available timing are still included.
          </p>
        )}
        {progress.unknownDateRunCount > 0 && (
          <p>
            {integerFormatter.format(progress.unknownDateRunCount)} undated run
            {progress.unknownDateRunCount === 1 ? '' : 's'} included in All
            history only.
          </p>
        )}
      </div>
    </section>
  );
}
