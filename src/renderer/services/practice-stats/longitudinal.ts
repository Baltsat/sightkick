import { PracticeRunArchiveBySong, PracticeRunDayArchive } from './archive';
import { RunSummary } from './types';

export const MAX_LONGITUDINAL_ACTIVE_MONTHS = 12;

export interface LongitudinalEvidenceTotals {
  runCount: number;
  scoredNoteCount: number;
  wrongHitCount: number;
  /** Hit-weighted accuracy: hits / (hits + misses). */
  accuracy?: number;
  /** Sample-weighted signed timing delta. Negative is early; positive is late. */
  meanTimingMs?: number;
  timingSampleCount: number;
}

export interface LongitudinalMonth extends LongitudinalEvidenceTotals {
  /** UTC calendar month, `YYYY-MM`. */
  month: string;
}

export interface LongitudinalProgress {
  allTime: LongitudinalEvidenceTotals;
  /** At most the latest 12 months that contain evidence, oldest first. */
  months: LongitudinalMonth[];
  archivedRunCount: number;
  recentRunCount: number;
  /** Archived runs on days where exact bar/skill detail was not retained. */
  aggregateOnlyArchivedRunCount: number;
  /** Runs whose persisted date cannot be assigned to a calendar month. */
  unknownDateRunCount: number;
  omittedActiveMonthCount: number;
  firstEvidenceDate?: string;
  lastEvidenceDate?: string;
}

interface MutableEvidence {
  runCount: number;
  totalHits: number;
  totalMisses: number;
  wrongHitCount: number;
  totalTimingDeltaMs: number;
  timingSampleCount: number;
}

function emptyEvidence(): MutableEvidence {
  return {
    runCount: 0,
    totalHits: 0,
    totalMisses: 0,
    wrongHitCount: 0,
    totalTimingDeltaMs: 0,
    timingSampleCount: 0,
  };
}

function addEvidence(target: MutableEvidence, evidence: MutableEvidence): void {
  target.runCount += evidence.runCount;
  target.totalHits += evidence.totalHits;
  target.totalMisses += evidence.totalMisses;
  target.wrongHitCount += evidence.wrongHitCount;
  target.totalTimingDeltaMs += evidence.totalTimingDeltaMs;
  target.timingSampleCount += evidence.timingSampleCount;
}

function dayEvidence(day: PracticeRunDayArchive): MutableEvidence {
  return {
    runCount: day.runCount,
    totalHits: day.totalHits,
    totalMisses: day.totalMisses,
    wrongHitCount: day.totalWrong,
    totalTimingDeltaMs: day.timing.totalDeltaMs,
    timingSampleCount: day.timing.sampleCount,
  };
}

function runEvidence(run: RunSummary): MutableEvidence {
  return {
    runCount: 1,
    totalHits: run.totalHits,
    totalMisses: run.totalMisses,
    wrongHitCount: run.totalWrong,
    totalTimingDeltaMs: run.timingBias.meanMs * run.timingBias.sampleCount,
    timingSampleCount: run.timingBias.sampleCount,
  };
}

function monthFromDate(value: string): string | undefined {
  return /^(\d{4}-\d{2})-\d{2}/.exec(value)?.[1];
}

function readableDate(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
}

function finishEvidence(evidence: MutableEvidence): LongitudinalEvidenceTotals {
  const scoredNoteCount = evidence.totalHits + evidence.totalMisses;

  return {
    runCount: evidence.runCount,
    scoredNoteCount,
    wrongHitCount: evidence.wrongHitCount,
    ...(scoredNoteCount > 0
      ? { accuracy: evidence.totalHits / scoredNoteCount }
      : {}),
    ...(evidence.timingSampleCount > 0
      ? {
          meanTimingMs:
            evidence.totalTimingDeltaMs / evidence.timingSampleCount,
        }
      : {}),
    timingSampleCount: evidence.timingSampleCount,
  };
}

/**
 * Builds a bounded Profile model from the two disjoint persistence layers:
 * `archiveBySong` contains only summaries evicted from the recent cap, while
 * `recentRunsBySong` contains the summaries still kept verbatim. Adding those
 * layers once each preserves all-history counts without counting a stored run
 * twice. The archive intentionally cannot recreate exact historical bars or
 * skills, so that coverage is reported separately instead of inferred.
 */
export function computeLongitudinalProgress(
  archiveBySong: Readonly<PracticeRunArchiveBySong> | undefined,
  recentRunsBySong: Readonly<Record<string, readonly RunSummary[]>> | undefined,
): LongitudinalProgress {
  const allTime = emptyEvidence();
  const monthly = new Map<string, MutableEvidence>();
  let archivedRunCount = 0;
  let recentRunCount = 0;
  let aggregateOnlyArchivedRunCount = 0;
  let unknownDateRunCount = 0;
  let firstEvidenceDate: string | undefined;
  let lastEvidenceDate: string | undefined;
  const addDated = (date: string, evidence: MutableEvidence) => {
    addEvidence(allTime, evidence);

    const month = monthFromDate(date);
    const normalizedDate = readableDate(date);

    if (!month || !normalizedDate) {
      unknownDateRunCount += evidence.runCount;

      return;
    }

    const bucket = monthly.get(month) ?? emptyEvidence();

    addEvidence(bucket, evidence);
    monthly.set(month, bucket);
    firstEvidenceDate =
      !firstEvidenceDate || normalizedDate < firstEvidenceDate
        ? normalizedDate
        : firstEvidenceDate;
    lastEvidenceDate =
      !lastEvidenceDate || normalizedDate > lastEvidenceDate
        ? normalizedDate
        : lastEvidenceDate;
  };

  Object.values(archiveBySong ?? {}).forEach((archive) => {
    Object.values(archive.days).forEach((day) => {
      const evidence = dayEvidence(day);

      archivedRunCount += day.runCount;

      if (day.historicalDetailState === 'historical-detail-unavailable') {
        aggregateOnlyArchivedRunCount += day.runCount;
      }

      addDated(day.date, evidence);
    });
  });

  Object.values(recentRunsBySong ?? {}).forEach((runs) => {
    runs.forEach((run) => {
      recentRunCount += 1;

      addDated(run.completedAt, runEvidence(run));
    });
  });

  const allMonths = [...monthly.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, evidence]) => ({ month, ...finishEvidence(evidence) }));
  const omittedActiveMonthCount = Math.max(
    0,
    allMonths.length - MAX_LONGITUDINAL_ACTIVE_MONTHS,
  );

  return {
    allTime: finishEvidence(allTime),
    months: allMonths.slice(-MAX_LONGITUDINAL_ACTIVE_MONTHS),
    archivedRunCount,
    recentRunCount,
    aggregateOnlyArchivedRunCount,
    unknownDateRunCount,
    omittedActiveMonthCount,
    ...(firstEvidenceDate ? { firstEvidenceDate } : {}),
    ...(lastEvidenceDate ? { lastEvidenceDate } : {}),
  };
}
