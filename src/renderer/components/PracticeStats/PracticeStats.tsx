import { RunSummary, RunTrendPoint } from '../../services/practice-stats';
import { cn } from '../../cn';
import { AccuracySparkline } from './AccuracySparkline';
import { BiasIndicator } from './BiasIndicator';
import { LaneAccuracyBars } from './LaneAccuracyBars';
import { WrongHitTable } from './WrongHitTable';

/**
 * 'inline' mounts inside the expanded end-of-run ScoreSummary; 'panel'
 * mounts as a standalone per-song stats view. Both render the same content
 * — the variant only changes outer spacing/framing, not what's shown.
 */
export type PracticeStatsVariant = 'inline' | 'panel';

interface Props {
  summary: RunSummary | undefined;
  trend?: RunTrendPoint[];
  variant?: PracticeStatsVariant;
  className?: string;
}

function hasAnyAttempt(summary: RunSummary): boolean {
  return summary.totalHits + summary.totalMisses + summary.totalWrong > 0;
}

export function PracticeStats({
  summary,
  trend = [],
  variant = 'panel',
  className,
}: Props) {
  if (!summary || !hasAnyAttempt(summary)) {
    return (
      <div
        className={cn(
          'rounded-xl bg-fill p-4 text-center text-sm text-text-faint',
          className,
        )}
        data-testid="practice-stats-empty"
      >
        Play a run to see your stats.
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        variant === 'panel' && 'gap-6',
        className,
      )}
      data-testid="practice-stats"
      data-variant={variant}
    >
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Accuracy per drum
        </h3>
        <LaneAccuracyBars laneAccuracy={summary.laneAccuracy} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Timing
        </h3>
        <BiasIndicator
          timingBias={summary.timingBias}
          laneBias={summary.laneBias}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Wrong hits
        </h3>
        <WrongHitTable wrongHitCounts={summary.wrongHitCounts} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Last runs
        </h3>
        <AccuracySparkline trend={trend} />
      </section>
    </div>
  );
}
