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

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeNumberRecord<Key extends string>(
  value: unknown,
): Partial<Record<Key, number>> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, entry]) => typeof entry === 'number' && Number.isFinite(entry),
      )
      .map(([key, entry]) => [key, entry]),
  ) as Partial<Record<Key, number>>;
}

function normalizeTroubleRecovery(
  value: unknown,
): ArchivedTroubleRecoveryStats {
  const record = isRecord(value) ? value : {};

  return {
    troubleCount: Math.max(0, finiteNumber(record.troubleCount)),
    recoveryCleanCount: Math.max(0, finiteNumber(record.recoveryCleanCount)),
    recoveryRetryCount: Math.max(0, finiteNumber(record.recoveryRetryCount)),
    recoveryDeferredCount: Math.max(
      0,
      finiteNumber(record.recoveryDeferredCount),
    ),
  };
}

function normalizeNamedTroubleRecovery(
  value: unknown,
  maximum: number,
): Record<string, ArchivedTroubleRecoveryStats> {
  if (!isRecord(value)) {
    return {};
  }

  return capNamedEvidence(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeTroubleRecovery(entry),
      ]),
    ),
    maximum,
  );
}

function normalizeChartRevisions(
  value: unknown,
): Record<string, ArchivedChartRevisionEvidence> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const revisions = Object.fromEntries(
    Object.entries(value).flatMap(([key, rawRevision]) => {
      if (!isRecord(rawRevision)) {
        return [];
      }

      const chartRevision =
        typeof rawRevision.chartRevision === 'string' &&
        rawRevision.chartRevision.trim()
          ? rawRevision.chartRevision
          : key;

      return [
        [
          chartRevision,
          {
            chartRevision,
            lastCompletedAt:
              typeof rawRevision.lastCompletedAt === 'string'
                ? rawRevision.lastCompletedAt
                : '',
            runCount: Math.max(0, finiteNumber(rawRevision.runCount)),
            skills: normalizeNamedTroubleRecovery(
              rawRevision.skills,
              MAX_ARCHIVED_SKILLS_PER_REVISION,
            ),
            bars: normalizeNamedTroubleRecovery(
              rawRevision.bars,
              MAX_ARCHIVED_BARS_PER_REVISION,
            ),
          },
        ],
      ];
    }),
  );

  if (Object.keys(revisions).length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(revisions)
      .sort(
        ([, left], [, right]) =>
          right.lastCompletedAt.localeCompare(left.lastCompletedAt) ||
          left.chartRevision.localeCompare(right.chartRevision),
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeArchiveDay(
  date: string,
  value: unknown,
): PracticeRunDayArchive {
  const day = isRecord(value) ? value : {};
  const timing = isRecord(day.timing) ? day.timing : {};
  const rawLanes = isRecord(day.lanes) ? day.lanes : {};
  const lanes = Object.fromEntries(
    Object.entries(rawLanes).flatMap(([lane, rawStats]) => {
      if (!isRecord(rawStats)) {
        return [];
      }

      return [
        [
          lane,
          {
            hits: Math.max(0, finiteNumber(rawStats.hits)),
            misses: Math.max(0, finiteNumber(rawStats.misses)),
            timingSampleCount: Math.max(
              0,
              finiteNumber(rawStats.timingSampleCount),
            ),
            totalDeltaMs: finiteNumber(rawStats.totalDeltaMs),
          },
        ],
      ];
    }),
  );
  const chartRevisions = normalizeChartRevisions(day.chartRevisions);

  return {
    date,
    runCount: Math.max(0, finiteNumber(day.runCount)),
    totalHits: Math.max(0, finiteNumber(day.totalHits)),
    totalMisses: Math.max(0, finiteNumber(day.totalMisses)),
    totalWrong: Math.max(0, finiteNumber(day.totalWrong)),
    overallAccuracySum: finiteNumber(day.overallAccuracySum),
    minOverallAccuracy: finiteNumber(day.minOverallAccuracy),
    maxOverallAccuracy: finiteNumber(day.maxOverallAccuracy),
    bestStreak: Math.max(0, finiteNumber(day.bestStreak)),
    timing: {
      ...emptyTiming(),
      sampleCount: Math.max(0, finiteNumber(timing.sampleCount)),
      totalDeltaMs: finiteNumber(timing.totalDeltaMs),
      earlyCount: Math.max(0, finiteNumber(timing.earlyCount)),
      lateCount: Math.max(0, finiteNumber(timing.lateCount)),
      onTimeCount: Math.max(0, finiteNumber(timing.onTimeCount)),
      medianMsSum: finiteNumber(timing.medianMsSum),
      spreadMsSum: Math.max(0, finiteNumber(timing.spreadMsSum)),
      summaryCount: Math.max(0, finiteNumber(timing.summaryCount)),
    },
    lanes,
    wrongHits: normalizeNumberRecord<KitElement>(day.wrongHits),
    modes: normalizeNumberRecord<GameMode>(day.modes),
    difficulties: normalizeNumberRecord<Difficulty>(day.difficulties),
    historicalDetailState:
      day.historicalDetailState === 'available'
        ? 'available'
        : 'historical-detail-unavailable',
    ...(chartRevisions ? { chartRevisions } : {}),
  };
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
      Object.entries(raw.days).map(([date, rawDay]) => [
        date,
        normalizeArchiveDay(date, rawDay),
      ]),
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

function mergeNumberRecords<Key extends string>(
  left: Partial<Record<Key, number>>,
  right: Partial<Record<Key, number>>,
): Partial<Record<Key, number>> {
  const merged = { ...left };

  for (const [rawKey, rawValue] of Object.entries(right) as Array<
    [Key, number]
  >) {
    merged[rawKey] = (merged[rawKey] ?? 0) + rawValue;
  }

  return merged;
}

function mergeTroubleRecovery(
  left: ArchivedTroubleRecoveryStats | undefined,
  right: ArchivedTroubleRecoveryStats | undefined,
): ArchivedTroubleRecoveryStats {
  return {
    troubleCount: (left?.troubleCount ?? 0) + (right?.troubleCount ?? 0),
    recoveryCleanCount:
      (left?.recoveryCleanCount ?? 0) + (right?.recoveryCleanCount ?? 0),
    recoveryRetryCount:
      (left?.recoveryRetryCount ?? 0) + (right?.recoveryRetryCount ?? 0),
    recoveryDeferredCount:
      (left?.recoveryDeferredCount ?? 0) + (right?.recoveryDeferredCount ?? 0),
  };
}

function mergeNamedTroubleRecovery(
  left: Record<string, ArchivedTroubleRecoveryStats>,
  right: Record<string, ArchivedTroubleRecoveryStats>,
  maximum: number,
): Record<string, ArchivedTroubleRecoveryStats> {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  return capNamedEvidence(
    Object.fromEntries(
      [...keys].map((key) => [
        key,
        mergeTroubleRecovery(left[key], right[key]),
      ]),
    ),
    maximum,
  );
}

function mergeChartRevisionEvidence(
  left: Record<string, ArchivedChartRevisionEvidence> | undefined,
  right: Record<string, ArchivedChartRevisionEvidence> | undefined,
): Record<string, ArchivedChartRevisionEvidence> | undefined {
  const leftRecords = left ?? {};
  const rightRecords = right ?? {};
  const keys = new Set([
    ...Object.keys(leftRecords),
    ...Object.keys(rightRecords),
  ]);

  if (keys.size === 0) {
    return undefined;
  }

  const revisions = Object.fromEntries(
    [...keys].map((key) => {
      const leftRevision = leftRecords[key];
      const rightRevision = rightRecords[key];

      if (!leftRevision) {
        return [key, rightRevision];
      }

      if (!rightRevision) {
        return [key, leftRevision];
      }

      return [
        key,
        {
          chartRevision: key,
          lastCompletedAt:
            leftRevision.lastCompletedAt.localeCompare(
              rightRevision.lastCompletedAt,
            ) >= 0
              ? leftRevision.lastCompletedAt
              : rightRevision.lastCompletedAt,
          runCount: leftRevision.runCount + rightRevision.runCount,
          skills: mergeNamedTroubleRecovery(
            leftRevision.skills,
            rightRevision.skills,
            MAX_ARCHIVED_SKILLS_PER_REVISION,
          ),
          bars: mergeNamedTroubleRecovery(
            leftRevision.bars,
            rightRevision.bars,
            MAX_ARCHIVED_BARS_PER_REVISION,
          ),
        },
      ];
    }),
  );

  return Object.fromEntries(
    Object.entries(revisions)
      .sort(
        ([, leftRevision], [, rightRevision]) =>
          rightRevision.lastCompletedAt.localeCompare(
            leftRevision.lastCompletedAt,
          ) ||
          leftRevision.chartRevision.localeCompare(rightRevision.chartRevision),
      )
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  );
}

function mergeArchiveDay(
  left: PracticeRunDayArchive,
  right: PracticeRunDayArchive,
): PracticeRunDayArchive {
  const laneKeys = new Set([
    ...Object.keys(left.lanes),
    ...Object.keys(right.lanes),
  ] as KitElement[]);
  const lanes = Object.fromEntries(
    [...laneKeys].map((lane) => {
      const leftLane = left.lanes[lane];
      const rightLane = right.lanes[lane];

      return [
        lane,
        {
          hits: (leftLane?.hits ?? 0) + (rightLane?.hits ?? 0),
          misses: (leftLane?.misses ?? 0) + (rightLane?.misses ?? 0),
          timingSampleCount:
            (leftLane?.timingSampleCount ?? 0) +
            (rightLane?.timingSampleCount ?? 0),
          totalDeltaMs:
            (leftLane?.totalDeltaMs ?? 0) + (rightLane?.totalDeltaMs ?? 0),
        },
      ];
    }),
  );
  const chartRevisions = mergeChartRevisionEvidence(
    left.chartRevisions,
    right.chartRevisions,
  );

  return {
    date: left.date,
    runCount: left.runCount + right.runCount,
    totalHits: left.totalHits + right.totalHits,
    totalMisses: left.totalMisses + right.totalMisses,
    totalWrong: left.totalWrong + right.totalWrong,
    overallAccuracySum: left.overallAccuracySum + right.overallAccuracySum,
    minOverallAccuracy:
      left.runCount === 0
        ? right.minOverallAccuracy
        : right.runCount === 0
        ? left.minOverallAccuracy
        : Math.min(left.minOverallAccuracy, right.minOverallAccuracy),
    maxOverallAccuracy:
      left.runCount === 0
        ? right.maxOverallAccuracy
        : right.runCount === 0
        ? left.maxOverallAccuracy
        : Math.max(left.maxOverallAccuracy, right.maxOverallAccuracy),
    bestStreak: Math.max(left.bestStreak, right.bestStreak),
    timing: {
      sampleCount: left.timing.sampleCount + right.timing.sampleCount,
      totalDeltaMs: left.timing.totalDeltaMs + right.timing.totalDeltaMs,
      earlyCount: left.timing.earlyCount + right.timing.earlyCount,
      lateCount: left.timing.lateCount + right.timing.lateCount,
      onTimeCount: left.timing.onTimeCount + right.timing.onTimeCount,
      medianMsSum: left.timing.medianMsSum + right.timing.medianMsSum,
      spreadMsSum: left.timing.spreadMsSum + right.timing.spreadMsSum,
      summaryCount: left.timing.summaryCount + right.timing.summaryCount,
    },
    lanes,
    wrongHits: mergeNumberRecords(left.wrongHits, right.wrongHits),
    modes: mergeNumberRecords(left.modes, right.modes),
    difficulties: mergeNumberRecords(left.difficulties, right.difficulties),
    historicalDetailState:
      left.historicalDetailState === 'available' ||
      right.historicalDetailState === 'available'
        ? 'available'
        : 'historical-detail-unavailable',
    ...(chartRevisions ? { chartRevisions } : {}),
  };
}

/**
 * Combines two already-aggregated per-song archives without discarding
 * identity-migration evidence. This is used only when a proven legacy lesson
 * identity is moved to its canonical ID. Unlike normal rolling archival,
 * their existing chart-revision buckets are unioned without applying the
 * per-day ingestion cap; every numeric count remains additive. Inputs are
 * normalized first so legacy/malformed values cannot break profile startup.
 */
export function mergePracticeRunArchives(
  leftRaw: unknown,
  rightRaw: unknown,
): PracticeRunArchive {
  const left = readPracticeRunArchive(leftRaw);
  const right = readPracticeRunArchive(rightRaw);
  const dates = new Set([
    ...Object.keys(left.days),
    ...Object.keys(right.days),
  ]);

  return {
    schemaVersion: PRACTICE_RUN_ARCHIVE_SCHEMA_VERSION,
    days: Object.fromEntries(
      [...dates]
        .sort((leftDate, rightDate) => leftDate.localeCompare(rightDate))
        .map((date) => {
          const leftDay = left.days[date];
          const rightDay = right.days[date];

          return [
            date,
            leftDay && rightDay
              ? mergeArchiveDay(leftDay, rightDay)
              : leftDay ?? rightDay,
          ];
        }),
    ),
  };
}
