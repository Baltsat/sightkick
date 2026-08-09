import { RunSummary, StoredPracticeRun } from '../../services/practice-stats';
import { KIT_ELEMENTS } from '../../constants';

function latestByCompletedAt(runs: RunSummary[]): RunSummary | undefined {
  return [...runs].sort(
    (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
  )[0];
}

/**
 * Old summary records intentionally remain useful, but are not allowed to
 * masquerade as the full hit-by-hit evidence saved by newer versions. Match
 * by completedAt because that timestamp is generated once into the summary
 * before both stores receive it.
 */
export function latestSummaryOnlyRun(
  runs: RunSummary[] | undefined,
  fullRuns: StoredPracticeRun[] | undefined,
): RunSummary | undefined {
  if (!runs?.length) {
    return undefined;
  }

  const fullResolutionTimes = new Set(
    fullRuns?.map(({ summary }) => summary.completedAt) ?? [],
  );

  return latestByCompletedAt(
    runs.filter((run) => !fullResolutionTimes.has(run.completedAt)),
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function timingCopy(summary: RunSummary): string {
  const { meanMs, sampleCount } = summary.timingBias;

  if (sampleCount === 0) {
    return 'Timing: no matched-hit timing samples were saved.';
  }

  const direction = meanMs < 0 ? 'early' : meanMs > 0 ? 'late' : 'on time';

  return `Timing: ${Math.abs(Math.round(meanMs))} ms ${direction} on average.`;
}

function weakestLaneCopy(summary: RunSummary): string {
  const weakest = [...summary.laneAccuracy].sort(
    (a, b) => a.accuracy - b.accuracy,
  )[0];

  if (!weakest) {
    return 'Weakest lane: no per-lane accuracy was saved.';
  }

  const name =
    KIT_ELEMENTS.get(weakest.element)?.displayName ?? weakest.element;

  return `Weakest lane: ${name} at ${percent(weakest.accuracy)}.`;
}

function dateCopy(completedAt: string): string {
  const parsed = new Date(completedAt);

  if (Number.isNaN(parsed.getTime())) {
    return 'Latest saved run';
  }

  return `Latest saved run · ${completedAt.slice(0, 10)}`;
}

export function SummaryCoachCard({ summary }: { summary: RunSummary }) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-accent-soft-border bg-accent-soft-bg p-4 shadow-frame"
      data-testid="coach-summary-only"
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-text">
          {dateCopy(summary.completedAt)}
        </div>
        <h3 className="mt-1 font-display text-lg font-semibold text-text">
          {percent(summary.overallAccuracy)} accuracy at{' '}
          {summary.playbackSpeed ?? 1}x
        </h3>
      </div>
      <div className="grid gap-2 text-sm leading-relaxed text-text-muted">
        <p>{timingCopy(summary)}</p>
        <p>{weakestLaneCopy(summary)}</p>
        <p>
          Wrong hits: {summary.totalWrong}. Best streak:{' '}
          {summary.bestStreak ?? 'not recorded'}.
        </p>
      </div>
      <p className="border-t border-accent-soft-border pt-3 text-sm leading-relaxed text-text">
        This run predates per-hit history, so Coach will not invent trouble bars
        or a loop. Play it again to unlock bar-level guidance.
      </p>
    </article>
  );
}
