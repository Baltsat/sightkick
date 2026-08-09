import { Difficulty } from 'scan-chart';
import { GameMode } from '../../types';
import { KitElement, RunLearningEvidenceCount, RunSummary } from './types';

/**
 * The archive is deliberately independent of the run-context schema. It is
 * an additive, compact retention layer: detailed summaries and hit records
 * keep their existing caps while their numerical evidence remains available
 * as daily aggregates indefinitely.
 */
export const PRACTICE_RUN_ARCHIVE_SCHEMA_VERSION = 1 as const;

/** Recent history stays inspectable at these bounded, cross-platform limits. */
export const MAX_RECENT_PRACTICE_SUMMARIES_PER_SONG = 50;

export const MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG = 30;

/** Prevent one long-lived song with many chart revisions from growing forever. */
export const MAX_ARCHIVED_CHART_REVISIONS_PER_DAY = 8;

export const MAX_ARCHIVED_SKILLS_PER_REVISION = 24;

export const MAX_ARCHIVED_BARS_PER_REVISION = 96;

export interface ArchivedLaneStats {
  hits: number;
  misses: number;
  timingSampleCount: number;
  /** Sum of every hit's timing delta represented by this aggregate. */
  totalDeltaMs: number;
}

export interface ArchivedTimingStats {
  sampleCount: number;
  totalDeltaMs: number;
  earlyCount: number;
  lateCount: number;
  onTimeCount: number;
  /** Sum of per-run medians/spreads for callers that need daily averages. */
  medianMsSum: number;
  spreadMsSum: number;
  summaryCount: number;
}

export interface ArchivedTroubleRecoveryStats {
  troubleCount: number;
  recoveryCleanCount: number;
  recoveryRetryCount: number;
  recoveryDeferredCount: number;
}

/**
 * Revision-scoped compact evidence. A bar number only has meaning against
 * this exact chart revision; never merge the same numeric bar across edits.
 */
export interface ArchivedChartRevisionEvidence {
  chartRevision: string;
  lastCompletedAt: string;
  runCount: number;
  skills: Record<string, ArchivedTroubleRecoveryStats>;
  bars: Record<string, ArchivedTroubleRecoveryStats>;
}

export type HistoricalDetailState =
  | 'available'
  | 'historical-detail-unavailable';

/** Compact, deterministic evidence for all evicted summaries on one UTC day. */
export interface PracticeRunDayArchive {
  date: string;
  runCount: number;
  totalHits: number;
  totalMisses: number;
  totalWrong: number;
  overallAccuracySum: number;
  minOverallAccuracy: number;
  maxOverallAccuracy: number;
  bestStreak: number;
  timing: ArchivedTimingStats;
  lanes: Partial<Record<KitElement, ArchivedLaneStats>>;
  wrongHits: Partial<Record<KitElement, number>>;
  modes: Partial<Record<GameMode, number>>;
  difficulties: Partial<Record<Difficulty, number>>;
  /** Explicitly distinguishes raw legacy summaries from detail-backed data. */
  historicalDetailState: HistoricalDetailState;
  /** Present only when the evicted summaries carried chart-revision evidence. */
  chartRevisions?: Record<string, ArchivedChartRevisionEvidence>;
}

/** One compact archive per song. Day keys are sorted `YYYY-MM-DD` UTC keys. */
export interface PracticeRunArchive {
  schemaVersion: typeof PRACTICE_RUN_ARCHIVE_SCHEMA_VERSION;
  days: Record<string, PracticeRunDayArchive>;
}

export type PracticeRunArchiveBySong = Record<string, PracticeRunArchive>;

function emptyTiming(): ArchivedTimingStats {
  return {
    sampleCount: 0,
    totalDeltaMs: 0,
    earlyCount: 0,
    lateCount: 0,
    onTimeCount: 0,
    medianMsSum: 0,
    spreadMsSum: 0,
    summaryCount: 0,
  };
}

function emptyDay(date: string): PracticeRunDayArchive {
  return {
    date,
    runCount: 0,
    totalHits: 0,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracySum: 0,
    minOverallAccuracy: 0,
    maxOverallAccuracy: 0,
    bestStreak: 0,
    timing: emptyTiming(),
    lanes: {},
    wrongHits: {},
    modes: {},
    difficulties: {},
    historicalDetailState: 'historical-detail-unavailable',
  };
}

/** Empty archives are returned for legacy stores which predate this feature. */
export function emptyPracticeRunArchive(): PracticeRunArchive {
  return { schemaVersion: PRACTICE_RUN_ARCHIVE_SCHEMA_VERSION, days: {} };
}

/**
 * Completed-at values are persisted ISO instants. Keeping their literal UTC
 * date prefix avoids depending on the current machine timezone during a
 * later archive migration/read. Invalid legacy timestamps remain visible in
 * a stable `unknown` bucket instead of being discarded.
 */
export function archiveDayKey(completedAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(completedAt);

  return match?.[1] ?? 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Old electron-store data has no archive key. Treat it as a valid empty v1
 * archive. Malformed or unrecognised values stay readable as an empty archive
 * rather than breaking the practice flow.
 */
export function readPracticeRunArchive(raw: unknown): PracticeRunArchive {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== PRACTICE_RUN_ARCHIVE_SCHEMA_VERSION ||
    !isRecord(raw.days)
  ) {
    return emptyPracticeRunArchive();
  }

  return {
    schemaVersion: PRACTICE_RUN_ARCHIVE_SCHEMA_VERSION,
    days: Object.fromEntries(
      Object.entries(raw.days).map(([date, rawDay]) => {
        const day = rawDay as PracticeRunDayArchive;

        return [
          date,
          {
            ...day,
            historicalDetailState:
              day.historicalDetailState === 'available'
                ? 'available'
                : 'historical-detail-unavailable',
          },
        ];
      }),
    ),
  };
}

function emptyTroubleRecovery(): ArchivedTroubleRecoveryStats {
  return {
    troubleCount: 0,
    recoveryCleanCount: 0,
    recoveryRetryCount: 0,
    recoveryDeferredCount: 0,
  };
}

function finiteCount(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function addTroubleRecovery(
  current: ArchivedTroubleRecoveryStats | undefined,
  update: RunLearningEvidenceCount,
): ArchivedTroubleRecoveryStats {
  const previous = current ?? emptyTroubleRecovery();

  return {
    troubleCount: previous.troubleCount + finiteCount(update.troubleCount),
    recoveryCleanCount:
      previous.recoveryCleanCount + finiteCount(update.recoveryCleanCount),
    recoveryRetryCount:
      previous.recoveryRetryCount + finiteCount(update.recoveryRetryCount),
    recoveryDeferredCount:
      previous.recoveryDeferredCount +
      finiteCount(update.recoveryDeferredCount),
  };
}

function capNamedEvidence(
  values: Record<string, ArchivedTroubleRecoveryStats>,
  maximum: number,
): Record<string, ArchivedTroubleRecoveryStats> {
  return Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) =>
        left.localeCompare(right, undefined, { numeric: true }),
      )
      .slice(0, maximum),
  );
}

function addLearningEvidence(
  current: PracticeRunDayArchive,
  summary: RunSummary,
): Pick<PracticeRunDayArchive, 'historicalDetailState' | 'chartRevisions'> {
  const chartRevision = summary.context?.chartRevision;
  const evidence = summary.learningEvidence;

  if (!chartRevision || !evidence) {
    return {
      historicalDetailState: current.historicalDetailState,
      ...(current.chartRevisions
        ? { chartRevisions: current.chartRevisions }
        : {}),
    };
  }

  const revisions = { ...(current.chartRevisions ?? {}) };
  const previous = revisions[chartRevision] ?? {
    chartRevision,
    lastCompletedAt: summary.completedAt,
    runCount: 0,
    skills: {},
    bars: {},
  };
  const skills = { ...previous.skills };
  const bars = { ...previous.bars };

  Object.entries(evidence.skills ?? {}).forEach(([skill, counts]) => {
    if (skill.trim()) {
      skills[skill] = addTroubleRecovery(skills[skill], counts);
    }
  });
  Object.entries(evidence.bars ?? {}).forEach(([bar, counts]) => {
    if (/^[1-9]\d*$/.test(bar)) {
      bars[bar] = addTroubleRecovery(bars[bar], counts);
    }
  });
  revisions[chartRevision] = {
    chartRevision,
    lastCompletedAt:
      previous.lastCompletedAt.localeCompare(summary.completedAt) >= 0
        ? previous.lastCompletedAt
        : summary.completedAt,
    runCount: previous.runCount + 1,
    skills: capNamedEvidence(skills, MAX_ARCHIVED_SKILLS_PER_REVISION),
    bars: capNamedEvidence(bars, MAX_ARCHIVED_BARS_PER_REVISION),
  };

  const boundedRevisions = Object.fromEntries(
    Object.entries(revisions)
      .sort(
        ([, left], [, right]) =>
          right.lastCompletedAt.localeCompare(left.lastCompletedAt) ||
          left.chartRevision.localeCompare(right.chartRevision),
      )
      .slice(0, MAX_ARCHIVED_CHART_REVISIONS_PER_DAY)
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    historicalDetailState: 'available',
    chartRevisions: boundedRevisions,
  };
}

function addToDay(
  previous: PracticeRunDayArchive | undefined,
  summary: RunSummary,
): PracticeRunDayArchive {
  const date = archiveDayKey(summary.completedAt);
  const current = previous ?? emptyDay(date);
  const priorRunCount = current.runCount;
  const laneStats = { ...current.lanes };
  const wrongHits = { ...current.wrongHits };

  for (const lane of summary.laneAccuracy) {
    const previousLane = laneStats[lane.element] ?? {
      hits: 0,
      misses: 0,
      timingSampleCount: 0,
      totalDeltaMs: 0,
    };

    laneStats[lane.element] = {
      ...previousLane,
      hits: previousLane.hits + lane.hits,
      misses: previousLane.misses + lane.misses,
    };
  }

  for (const lane of summary.laneBias) {
    const previousLane = laneStats[lane.element] ?? {
      hits: 0,
      misses: 0,
      timingSampleCount: 0,
      totalDeltaMs: 0,
    };

    laneStats[lane.element] = {
      ...previousLane,
      timingSampleCount: previousLane.timingSampleCount + lane.sampleCount,
      totalDeltaMs: previousLane.totalDeltaMs + lane.meanMs * lane.sampleCount,
    };
  }

  for (const wrong of summary.wrongHitCounts) {
    wrongHits[wrong.element] = (wrongHits[wrong.element] ?? 0) + wrong.count;
  }

  const timing = summary.timingBias;
  const modes = { ...current.modes };
  const difficulties = { ...current.difficulties };

  if (summary.mode) {
    modes[summary.mode] = (modes[summary.mode] ?? 0) + 1;
  }

  if (summary.difficulty) {
    difficulties[summary.difficulty] =
      (difficulties[summary.difficulty] ?? 0) + 1;
  }

  const learning = addLearningEvidence(current, summary);

  return {
    ...current,
    runCount: priorRunCount + 1,
    totalHits: current.totalHits + summary.totalHits,
    totalMisses: current.totalMisses + summary.totalMisses,
    totalWrong: current.totalWrong + summary.totalWrong,
    overallAccuracySum: current.overallAccuracySum + summary.overallAccuracy,
    minOverallAccuracy:
      priorRunCount === 0
        ? summary.overallAccuracy
        : Math.min(current.minOverallAccuracy, summary.overallAccuracy),
    maxOverallAccuracy:
      priorRunCount === 0
        ? summary.overallAccuracy
        : Math.max(current.maxOverallAccuracy, summary.overallAccuracy),
    bestStreak: Math.max(current.bestStreak, summary.bestStreak ?? 0),
    timing: {
      sampleCount: current.timing.sampleCount + timing.sampleCount,
      totalDeltaMs:
        current.timing.totalDeltaMs + timing.meanMs * timing.sampleCount,
      earlyCount: current.timing.earlyCount + timing.earlyCount,
      lateCount: current.timing.lateCount + timing.lateCount,
      onTimeCount: current.timing.onTimeCount + timing.onTimeCount,
      medianMsSum: current.timing.medianMsSum + timing.medianMs,
      spreadMsSum: current.timing.spreadMsSum + timing.spreadMs,
      summaryCount: current.timing.summaryCount + 1,
    },
    lanes: laneStats,
    wrongHits,
    modes,
    difficulties,
    ...learning,
  };
}

/**
 * A UI-facing, honest answer for old summary-only archives. It is never a
 * request to reverse-engineer bars from aggregate lane numbers.
 */
export function historicalDetailState(
  archive: PracticeRunArchive,
): HistoricalDetailState {
  return Object.values(archive.days).some(
    (day) => day.historicalDetailState === 'available',
  )
    ? 'available'
    : 'historical-detail-unavailable';
}

/**
 * Folds summaries into their per-day bucket. It never mutates the loaded
 * archive, and sorts day keys before storing so equivalent writes have an
 * identical serialized shape regardless of eviction order.
 */
export function archiveRunSummaries(
  archive: PracticeRunArchive,
  summaries: readonly RunSummary[],
): PracticeRunArchive {
  if (summaries.length === 0) {
    return archive;
  }

  const days = { ...archive.days };

  for (const summary of summaries) {
    const date = archiveDayKey(summary.completedAt);

    days[date] = addToDay(days[date], summary);
  }

  return {
    schemaVersion: PRACTICE_RUN_ARCHIVE_SCHEMA_VERSION,
    days: Object.fromEntries(
      Object.entries(days).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}
