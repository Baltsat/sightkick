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

/**
 * "Perform run", "Practice run", or "Practice run at 0.7x" — omitted
 * entirely for runs stored before `mode` existed (undefined stays
 * undefined, never guessed at). Speed only appears in Practice, and only
 * when it's off the 1x default — Perform locks speed at 1x, so it would
 * never say anything there anyway.
 */
function runModeLabel(summary: RunSummary): string | undefined {
  if (!summary.mode) {
    return undefined;
  }

  const label = summary.mode === 'practice' ? 'Practice run' : 'Perform run';
  const showsSpeed =
    summary.mode === 'practice' &&
    summary.playbackSpeed !== undefined &&
    summary.playbackSpeed !== 1;

  return showsSpeed ? `${label} at ${summary.playbackSpeed}x` : label;
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

  const modeLabel = runModeLabel(summary);
  // A run that never left the ground floor of the streak ladder isn't
  // worth a "Best streak 0" line - only show it once there's something to
  // brag about.
  const hasBestStreak =
    summary.bestStreak !== undefined && summary.bestStreak > 0;

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
      {(modeLabel || hasBestStreak) && (
        <div className="flex items-center justify-between gap-2">
          {modeLabel && (
            <div
              data-testid="practice-run-mode"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint"
            >
              {modeLabel}
            </div>
          )}
          {hasBestStreak && (
            <div
              data-testid="practice-best-streak"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text"
            >
              Best streak {summary.bestStreak}
            </div>
          )}
        </div>
      )}

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
