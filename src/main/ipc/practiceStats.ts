import { IpcMainEvent } from 'electron';
import type {
  KitElement,
  LaneAccuracy,
  LaneBias,
  PracticeAttemptCheckpoint,
  PracticeAttemptCheckpointBySong,
  PracticeRunArchive,
  HitRecord,
  MidiInputTelemetry,
  RunSummary,
  StoredHitRecord,
  StoredPracticeRun,
  TimingBiasStats,
  WrongHitCount,
} from '../../renderer/services/practice-stats';
import {
  archiveRunSummaries,
  MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG,
  MAX_PRACTICE_ATTEMPT_RECORDS,
  MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG,
  MAX_RECENT_PRACTICE_SUMMARIES_PER_SONG,
  PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION,
  readPracticeRunArchive,
  summarizeRun,
} from '../../renderer/services/practice-stats';
import type { SkillEvidenceEvent } from '../../renderer/services/pedagogy/types';
import { appState } from '../AppState';

/** Keep recent, individually inspectable summaries; older evidence is archived. */
export const MAX_STORED_RUNS_PER_SONG = MAX_RECENT_PRACTICE_SUMMARIES_PER_SONG;

/** Full hit records remain bounded independently of summary/archive retention. */
export const MAX_STORED_FULL_RUNS_PER_SONG =
  MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG;

const storeKey = (songId: string) => `practiceRuns.${songId}`;
const detailsStoreKey = (songId: string) => `practiceRunDetails.${songId}`;
const PRACTICE_RUNS_STORE_KEY = 'practiceRuns';
const PRACTICE_RUN_DETAILS_STORE_KEY = 'practiceRunDetails';

/**
 * In-progress evidence lives in a deliberately separate namespace. It must
 * never be read as a completed run by Coach, mastery, achievements, or the
 * compact archive.
 */
export const PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY =
  'practiceAttemptCheckpoints';

export const PRACTICE_RUN_ARCHIVE_STORE_KEY = 'practiceRunArchive';

const archiveStoreKey = (songId: string) =>
  `${PRACTICE_RUN_ARCHIVE_STORE_KEY}.${songId}`;

/**
 * Atomic per-item skill evidence (the Bayesian mastery/spaced-review
 * signal) is the one kind of run evidence `archiveRunSummaries`/`addToDay`
 * does not fold into the compact per-day archive when a summary is evicted
 * past `MAX_STORED_RUNS_PER_SONG` - see `RunLearningEvidence` vs
 * `atomicSkillEvidence` in practice-stats/types.ts. Without a home of its
 * own, that evidence would be silently destroyed the moment a well-practiced
 * song crosses the retention cap. This sidecar keeps every evicted event,
 * append-only, independent of the summary/archive/full-run caps above.
 */
export const PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY =
  'practiceRunSkillEvidenceArchive';

/**
 * A generous safety rail, not a normal truncation policy (mirrors
 * `MAX_PRACTICE_ATTEMPT_RECORDS`'s reasoning): one atomic event is authored
 * per manifest item per run, far sparser than raw hit records, so this would
 * take many thousands of runs on one song to ever approach.
 */
export const MAX_ARCHIVED_SKILL_EVIDENCE_EVENTS_PER_SONG = 20_000;

const skillEvidenceArchiveStoreKey = (songId: string) =>
  `${PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY}.${songId}`;

export interface IpcSavePracticeRunPayload {
  songId: string;
  summary: RunSummary;
  records?: HitRecord[];
  /**
   * Optional session whose open checkpoint is finalized in the same atomic
   * store snapshot as this completed run. Never pass this before a genuine
   * natural completion.
   */
  finalizeAttemptSessionId?: string;
  /**
   * All open drafts retired by this completed run. A resumed run has both
   * its new live session and the older source checkpoint; clearing them in
   * the same store snapshot prevents the source draft becoming a ghost
   * prompt after relaunch. The singular field remains for older callers.
   */
  finalizeAttemptSessionIds?: string[];
}

export interface IpcSavePracticeAttemptCheckpointPayload {
  checkpoint: Omit<
    PracticeAttemptCheckpoint,
    'schemaVersion' | 'state' | 'records'
  > & {
    records: HitRecord[];
  };
}

export interface IpcFinalizePracticeAttemptCheckpointPayload {
  songId: string;
  sessionId: string;
}

export interface IpcPracticeAttemptCheckpointsResponse {
  songId: string;
  checkpoints: PracticeAttemptCheckpoint[];
}

export interface IpcPracticeRunsResponse {
  songId: string;
  runs: RunSummary[];
  fullRuns: StoredPracticeRun[];
  /** Compact evidence for detailed summaries evicted by the retention cap. */
  archive: PracticeRunArchive;
  /**
   * Atomic per-item skill evidence carried by summaries evicted past the
   * retention cap - see `PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY`.
   * Consumers that replay full mastery history should read this alongside
   * `runs[].atomicSkillEvidence` rather than in place of it: this array only
   * ever holds evidence for runs no longer present in `runs`.
   */
  atomicSkillEvidenceArchive: SkillEvidenceEvent[];
}

export interface IpcPracticeStatsError {
  error: string;
}

type PracticeRunsStore = Record<string, RunSummary[]>;

type PracticeRunDetailsStore = Record<string, StoredPracticeRun[]>;

type PracticeRunArchiveStore = Record<string, PracticeRunArchive>;

type PracticeRunSkillEvidenceArchiveStore = Record<
  string,
  SkillEvidenceEvent[]
>;

type PracticeAttemptCheckpointsStore = PracticeAttemptCheckpointBySong;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compactRecord(record: HitRecord): StoredHitRecord {
  return {
    tick: record.tick,
    deltaMs: record.deltaMs,
    element: record.element,
    verdict: record.verdict,
    ...(record.velocity === undefined ? {} : { velocity: record.velocity }),
    ...(record.expectedTick === undefined
      ? {}
      : { expectedTick: record.expectedTick }),
    ...(record.actualTick === undefined
      ? {}
      : { actualTick: record.actualTick }),
    ...(record.expectedElement === undefined
      ? {}
      : { expectedElement: record.expectedElement }),
    ...(record.actualElement === undefined
      ? {}
      : { actualElement: record.actualElement }),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isStoredHitRecord(value: unknown): value is StoredHitRecord {
  if (!isObject(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.tick) &&
    isFiniteNumber(value.deltaMs) &&
    typeof value.element === 'string' &&
    (value.verdict === 'hit' ||
      value.verdict === 'miss' ||
      value.verdict === 'wrong') &&
    isOptionalFiniteNumber(value.velocity) &&
    isOptionalFiniteNumber(value.expectedTick) &&
    isOptionalFiniteNumber(value.actualTick) &&
    isOptionalString(value.expectedElement) &&
    isOptionalString(value.actualElement)
  );
}

function isHitRecord(value: unknown): value is HitRecord {
  return (
    isStoredHitRecord(value) &&
    isFiniteNumber((value as Record<string, unknown>).timeSeconds)
  );
}

function isMidiInputTelemetry(value: unknown): value is MidiInputTelemetry {
  if (!isObject(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.rawMessageCount) &&
    value.rawMessageCount >= 0 &&
    isOptionalFiniteNumber(value.lastMidiTimestamp) &&
    isFiniteNumber(value.selectedPortEpoch) &&
    value.selectedPortEpoch >= 0 &&
    (value.lastMappedLane === undefined ||
      value.lastMappedLane === 'hihat' ||
      value.lastMappedLane === 'ride' ||
      value.lastMappedLane === 'crash' ||
      value.lastMappedLane === 'kick' ||
      value.lastMappedLane === 'snare' ||
      value.lastMappedLane === 'tom1' ||
      value.lastMappedLane === 'tom2' ||
      value.lastMappedLane === 'tom3')
  );
}

function isSkillEvidenceEvent(value: unknown): value is SkillEvidenceEvent {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.run_id === 'string' &&
    typeof value.chart_revision === 'string' &&
    typeof value.manifest_revision === 'string' &&
    typeof value.skill_id === 'string' &&
    typeof value.item_id === 'string' &&
    typeof value.context_signature === 'string' &&
    (value.evidence_kind === 'acquisition' ||
      value.evidence_kind === 'retention' ||
      value.evidence_kind === 'transfer') &&
    isFiniteNumber(value.quality) &&
    isFiniteNumber(value.weight) &&
    isFiniteNumber(value.playback_speed) &&
    typeof value.completed_at === 'string' &&
    isOptionalFiniteNumber(value.target_bpm) &&
    isOptionalFiniteNumber(value.scored_notes) &&
    isOptionalFiniteNumber(value.judging_window_ms) &&
    isOptionalFiniteNumber(value.raw_timing_spread_ms) &&
    isOptionalFiniteNumber(value.normalized_timing_stability)
  );
}

/**
 * Malformed or legacy (pre-feature) data reads as an empty archive. Exported
 * for `gamification.ts`'s `loadAllPracticeRuns`, which reads this same store
 * key across every song - the actual read path `SongListView`'s mastery/My
 * Wave replay uses (see the store key's own doc comment).
 */
export function readSkillEvidenceArchive(raw: unknown): SkillEvidenceEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isSkillEvidenceEvent);
}

function assertValidCheckpointPayload(
  checkpoint: IpcSavePracticeAttemptCheckpointPayload['checkpoint'] | undefined,
): asserts checkpoint is IpcSavePracticeAttemptCheckpointPayload['checkpoint'] {
  if (!checkpoint?.songId) {
    throw new Error('checkpoint.songId is required');
  }

  if (!checkpoint.sessionId) {
    throw new Error('checkpoint.sessionId is required');
  }

  if (!checkpoint.startedAt || !checkpoint.updatedAt) {
    throw new Error('checkpoint startedAt and updatedAt are required');
  }

  if (!checkpoint.chartRevision) {
    throw new Error('checkpoint.chartRevision is required');
  }

  if (checkpoint.mode !== 'practice' && checkpoint.mode !== 'perform') {
    throw new Error('checkpoint.mode is required');
  }

  if (
    checkpoint.difficulty !== 'easy' &&
    checkpoint.difficulty !== 'medium' &&
    checkpoint.difficulty !== 'hard' &&
    checkpoint.difficulty !== 'expert'
  ) {
    throw new Error('checkpoint.difficulty is required');
  }

  if (
    !isFiniteNumber(checkpoint.playbackSpeed) ||
    !isFiniteNumber(checkpoint.positionTick)
  ) {
    throw new Error('checkpoint position and speed must be finite numbers');
  }

  if (
    !Array.isArray(checkpoint.records) ||
    !checkpoint.records.every(isHitRecord)
  ) {
    throw new Error('checkpoint records must be scored hit records');
  }

  if (
    checkpoint.midiTelemetry !== undefined &&
    !isMidiInputTelemetry(checkpoint.midiTelemetry)
  ) {
    throw new Error('checkpoint MIDI telemetry is invalid');
  }
}

/**
 * Sanitizes checkpoint data at the persistence boundary. A malformed or
 * stale draft is discarded rather than blocking completed practice history.
 */
export function readPracticeAttemptCheckpoints(
  raw: unknown,
): PracticeAttemptCheckpoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .flatMap((value): PracticeAttemptCheckpoint[] => {
      if (!isObject(value)) {
        return [];
      }

      const mode = value.mode;
      const difficulty = value.difficulty;
      const midiTelemetry = isMidiInputTelemetry(value.midiTelemetry)
        ? value.midiTelemetry
        : undefined;

      if (
        value.state !== 'in-progress' ||
        typeof value.songId !== 'string' ||
        !value.songId ||
        typeof value.sessionId !== 'string' ||
        !value.sessionId ||
        typeof value.startedAt !== 'string' ||
        !value.startedAt ||
        typeof value.updatedAt !== 'string' ||
        !value.updatedAt ||
        typeof value.chartRevision !== 'string' ||
        !value.chartRevision ||
        (mode !== 'practice' && mode !== 'perform') ||
        (difficulty !== 'easy' &&
          difficulty !== 'medium' &&
          difficulty !== 'hard' &&
          difficulty !== 'expert') ||
        !isFiniteNumber(value.playbackSpeed) ||
        !isFiniteNumber(value.positionTick) ||
        !Array.isArray(value.records)
      ) {
        return [];
      }

      return [
        {
          schemaVersion: PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION,
          state: 'in-progress',
          songId: value.songId,
          sessionId: value.sessionId,
          startedAt: value.startedAt,
          updatedAt: value.updatedAt,
          chartRevision: value.chartRevision,
          mode,
          difficulty,
          playbackSpeed: value.playbackSpeed,
          positionTick: value.positionTick,
          records: value.records
            .filter(isStoredHitRecord)
            .slice(-MAX_PRACTICE_ATTEMPT_RECORDS),
          ...(midiTelemetry ? { midiTelemetry } : {}),
        },
      ];
    })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG);
}

function weightedMean(
  meanA: number,
  countA: number,
  meanB: number,
  countB: number,
): number {
  const totalCount = countA + countB;

  return totalCount === 0 ? 0 : (meanA * countA + meanB * countB) / totalCount;
}

function mergeLaneAccuracy(
  a: LaneAccuracy[],
  b: LaneAccuracy[],
): LaneAccuracy[] {
  const byLane = new Map<KitElement, { hits: number; misses: number }>();

  for (const lane of [...a, ...b]) {
    const entry = byLane.get(lane.element) ?? { hits: 0, misses: 0 };

    entry.hits += lane.hits;
    entry.misses += lane.misses;
    byLane.set(lane.element, entry);
  }

  return [...byLane.entries()].map(([element, { hits, misses }]) => ({
    element,
    hits,
    misses,
    accuracy: hits / (hits + misses),
  }));
}

function mergeLaneBias(a: LaneBias[], b: LaneBias[]): LaneBias[] {
  const byLane = new Map<KitElement, { meanMs: number; sampleCount: number }>();

  for (const lane of [...a, ...b]) {
    const existing = byLane.get(lane.element);

    byLane.set(
      lane.element,
      existing
        ? {
            meanMs: weightedMean(
              existing.meanMs,
              existing.sampleCount,
              lane.meanMs,
              lane.sampleCount,
            ),
            sampleCount: existing.sampleCount + lane.sampleCount,
          }
        : { meanMs: lane.meanMs, sampleCount: lane.sampleCount },
    );
  }

  return [...byLane.entries()].map(([element, stats]) => ({
    element,
    ...stats,
  }));
}

function mergeWrongHitCounts(
  a: WrongHitCount[],
  b: WrongHitCount[],
): WrongHitCount[] {
  const byLane = new Map<KitElement, number>();

  for (const wrong of [...a, ...b]) {
    byLane.set(wrong.element, (byLane.get(wrong.element) ?? 0) + wrong.count);
  }

  return [...byLane.entries()].map(([element, count]) => ({ element, count }));
}

function mergeTimingBias(
  a: TimingBiasStats,
  b: TimingBiasStats,
): TimingBiasStats {
  return {
    meanMs: weightedMean(a.meanMs, a.sampleCount, b.meanMs, b.sampleCount),
    // Exact per-run medians/spreads aren't recoverable from two already-
    // aggregated summaries (the raw deltas behind them are gone); a sample-
    // count-weighted blend is the closest available approximation.
    medianMs: weightedMean(
      a.medianMs,
      a.sampleCount,
      b.medianMs,
      b.sampleCount,
    ),
    spreadMs: weightedMean(
      a.spreadMs,
      a.sampleCount,
      b.spreadMs,
      b.sampleCount,
    ),
    earlyCount: a.earlyCount + b.earlyCount,
    lateCount: a.lateCount + b.lateCount,
    onTimeCount: a.onTimeCount + b.onTimeCount,
    sampleCount: a.sampleCount + b.sampleCount,
  };
}

/** Exact count-based merge of two already-aggregated summaries' base stats. */
function mergeSummaryStatsApproximate(
  summary: RunSummary,
  orphaned: RunSummary,
): RunSummary {
  const totalHits = summary.totalHits + orphaned.totalHits;
  const totalMisses = summary.totalMisses + orphaned.totalMisses;

  return {
    ...summary,
    totalHits,
    totalMisses,
    totalWrong: summary.totalWrong + orphaned.totalWrong,
    overallAccuracy:
      totalHits + totalMisses === 0 ? 0 : totalHits / (totalHits + totalMisses),
    laneAccuracy: mergeLaneAccuracy(
      summary.laneAccuracy,
      orphaned.laneAccuracy,
    ),
    laneBias: mergeLaneBias(summary.laneBias, orphaned.laneBias),
    timingBias: mergeTimingBias(summary.timingBias, orphaned.timingBias),
    wrongHitCounts: mergeWrongHitCounts(
      summary.wrongHitCounts,
      orphaned.wrongHitCounts,
    ),
  };
}

/**
 * Folds already-scored hit records from a checkpoint that belongs to a
 * *different* scored session than the run being saved into the persisted
 * summary/records, instead of letting them silently vanish the instant the
 * checkpoint that held them is discarded (see the `orphanedRecords` filter
 * in `savePracticeRun`, below, for which checkpoints qualify - the run's own
 * periodic safety-net autosave is deliberately excluded there, since its
 * records already are this run's `records`).
 *
 * `summarizeRun` and everything it calls in compute.ts never read
 * `timeSeconds`; only `verdict`/`element`/`deltaMs` drive every derived
 * stat, so a checkpoint's `StoredHitRecord` (which has no `timeSeconds`) can
 * stand in for a `HitRecord` here without losing any precision that matters.
 */
function mergeOrphanedCheckpointEvidence(
  summary: RunSummary,
  records: HitRecord[] | undefined,
  orphanedRecords: StoredHitRecord[],
): { summary: RunSummary; records: HitRecord[] | undefined } {
  if (orphanedRecords.length === 0) {
    return { summary, records };
  }

  const orphanedAsHitRecords: HitRecord[] = orphanedRecords.map((record) => ({
    ...record,
    timeSeconds: 0,
  }));

  if (records !== undefined) {
    const mergedRecords = [...orphanedAsHitRecords, ...records];

    return {
      summary: {
        ...summary,
        ...summarizeRun(mergedRecords, summary.completedAt),
      },
      records: mergedRecords,
    };
  }

  // No full-resolution records travelled with this save. Every current
  // production caller sends them (see SongView.tsx's save-practice-run
  // message), so this is a defensive fallback for a hypothetical caller
  // that omits them - the counts stay exact, the continuous timing stats
  // become a documented approximation (see mergeTimingBias/mergeLaneBias).
  const orphanedSummary = summarizeRun(
    orphanedAsHitRecords,
    summary.completedAt,
  );

  return {
    summary: mergeSummaryStatsApproximate(summary, orphanedSummary),
    records,
  };
}

/**
 * Appends one run summary to the song's detailed history. The latest
 * `MAX_STORED_RUNS_PER_SONG` summaries remain individually inspectable;
 * evicted summaries are folded into the versioned per-day archive, so the
 * cap never discards run-count or aggregate statistical evidence. Full hit
 * records retain their independent, bounded recent-history policy.
 */
export function savePracticeRun(
  event: IpcMainEvent,
  payload: IpcSavePracticeRunPayload,
): void {
  try {
    const {
      songId,
      summary: submittedSummary,
      records: submittedRecords,
      finalizeAttemptSessionId,
      finalizeAttemptSessionIds,
    } = payload;
    const finalizedSessionIds = new Set(
      [finalizeAttemptSessionId, ...(finalizeAttemptSessionIds ?? [])].filter(
        (sessionId): sessionId is string => Boolean(sessionId),
      ),
    );

    if (!songId) {
      throw new Error('songId is required');
    }

    const practiceRuns =
      (appState.store.get(PRACTICE_RUNS_STORE_KEY) as
        | PracticeRunsStore
        | undefined) ?? {};
    const practiceRunArchive =
      (appState.store.get(PRACTICE_RUN_ARCHIVE_STORE_KEY) as
        | PracticeRunArchiveStore
        | undefined) ?? {};
    const practiceRunDetails =
      (appState.store.get(PRACTICE_RUN_DETAILS_STORE_KEY) as
        | PracticeRunDetailsStore
        | undefined) ?? {};
    const practiceAttemptCheckpoints =
      finalizedSessionIds.size > 0
        ? (appState.store.get(PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY) as
            | PracticeAttemptCheckpointsStore
            | undefined) ?? {}
        : undefined;
    const checkpointsForSong = practiceAttemptCheckpoints
      ? readPracticeAttemptCheckpoints(practiceAttemptCheckpoints[songId])
      : [];
    // A checkpoint finalized in this same snapshot may hold hit evidence the
    // submitted `summary`/`records` never saw: the pre-interruption attempt
    // this run resumed from, or a draft left over from a run whose own save
    // previously failed (its sessionId stays "pending" and gets retried on
    // the next successful save for this song). A checkpoint sharing this
    // run's own session id is instead the run's own periodic autosave -
    // already fully reflected in `submittedRecords` - so it is deliberately
    // excluded here and just discarded below like before.
    const orphanedRecords: StoredHitRecord[] = checkpointsForSong
      .filter(
        (checkpoint) =>
          finalizedSessionIds.has(checkpoint.sessionId) &&
          checkpoint.sessionId !== submittedSummary.context?.sessionId,
      )
      .flatMap((checkpoint) => checkpoint.records);
    const { summary, records } = mergeOrphanedCheckpointEvidence(
      submittedSummary,
      submittedRecords,
      orphanedRecords,
    );
    const existing = practiceRuns[songId] ?? [];
    const allRuns = [...existing, summary];
    const firstRetainedIndex = Math.max(
      0,
      allRuns.length - MAX_STORED_RUNS_PER_SONG,
    );
    const evicted = allRuns.slice(0, firstRetainedIndex);
    const next = allRuns.slice(firstRetainedIndex);
    const archive = archiveRunSummaries(
      readPracticeRunArchive(practiceRunArchive[songId]),
      evicted,
    );
    // Every evicted summary's atomic skill evidence must survive the cap
    // too - `archiveRunSummaries` above only folds in aggregate/learning
    // evidence, never `atomicSkillEvidence` (see the constant's doc comment).
    const evictedSkillEvidence: SkillEvidenceEvent[] = evicted.flatMap(
      (evictedSummary) => evictedSummary.atomicSkillEvidence ?? [],
    );
    const practiceRunSkillEvidenceArchive =
      (appState.store.get(PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY) as
        | PracticeRunSkillEvidenceArchiveStore
        | undefined) ?? {};
    const skillEvidenceArchive = [
      ...readSkillEvidenceArchive(practiceRunSkillEvidenceArchive[songId]),
      ...evictedSkillEvidence,
    ].slice(-MAX_ARCHIVED_SKILL_EVIDENCE_EVENTS_PER_SONG);
    const existingFullRuns = practiceRunDetails[songId] ?? [];
    const fullRuns =
      records !== undefined
        ? [
            ...existingFullRuns,
            { summary, records: records.map(compactRecord) },
          ].slice(-MAX_STORED_FULL_RUNS_PER_SONG)
        : existingFullRuns;
    const finalizedCheckpoints =
      finalizedSessionIds.size > 0
        ? checkpointsForSong.filter(
            (checkpoint) => !finalizedSessionIds.has(checkpoint.sessionId),
          )
        : undefined;

    // electron-store's object-form setter builds the complete next store in
    // memory and performs one filesystem write. Keeping every evidence
    // namespace in that single snapshot prevents a failed write from leaving
    // summaries, archives, full-resolution details, and archived skill
    // evidence out of sync.
    appState.store.set({
      [PRACTICE_RUNS_STORE_KEY]: { ...practiceRuns, [songId]: next },
      [PRACTICE_RUN_ARCHIVE_STORE_KEY]:
        evicted.length > 0
          ? { ...practiceRunArchive, [songId]: archive }
          : practiceRunArchive,
      [PRACTICE_RUN_DETAILS_STORE_KEY]:
        records !== undefined
          ? { ...practiceRunDetails, [songId]: fullRuns }
          : practiceRunDetails,
      [PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY]:
        evictedSkillEvidence.length > 0
          ? {
              ...practiceRunSkillEvidenceArchive,
              [songId]: skillEvidenceArchive,
            }
          : practiceRunSkillEvidenceArchive,
      ...(finalizedCheckpoints && practiceAttemptCheckpoints
        ? {
            [PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY]: {
              ...practiceAttemptCheckpoints,
              [songId]: finalizedCheckpoints,
            },
          }
        : {}),
    });

    try {
      appState.practicePresence.recordPractice(summary.completedAt);
    } catch (error) {
      console.warn('Could not update practice presence:', error);
    }

    event.reply('save-practice-run', { songId, runs: next, fullRuns, archive });
  } catch (error) {
    event.reply('save-practice-run', { error: toErrorMessage(error) });
  }
}

/**
 * Atomically replace one open attempt checkpoint. This is intentionally a
 * side channel from `savePracticeRun`: checkpoints hold only observed hit
 * evidence and cannot affect completed history, rewards, mastery, or Coach
 * findings until a natural run completion explicitly saves a RunSummary.
 */
export function savePracticeAttemptCheckpoint(
  event: IpcMainEvent,
  payload: IpcSavePracticeAttemptCheckpointPayload,
): void {
  try {
    const checkpoint = payload?.checkpoint;

    assertValidCheckpointPayload(checkpoint);

    const checkpointsBySong =
      (appState.store.get(PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY) as
        | PracticeAttemptCheckpointsStore
        | undefined) ?? {};
    const existing = readPracticeAttemptCheckpoints(
      checkpointsBySong[checkpoint.songId],
    );
    const normalized: PracticeAttemptCheckpoint = {
      schemaVersion: PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION,
      state: 'in-progress',
      songId: checkpoint.songId,
      sessionId: checkpoint.sessionId,
      startedAt: checkpoint.startedAt,
      updatedAt: checkpoint.updatedAt,
      chartRevision: checkpoint.chartRevision,
      mode: checkpoint.mode,
      difficulty: checkpoint.difficulty,
      playbackSpeed: checkpoint.playbackSpeed,
      positionTick: checkpoint.positionTick,
      records: checkpoint.records
        .map(compactRecord)
        .slice(-MAX_PRACTICE_ATTEMPT_RECORDS),
      ...(checkpoint.midiTelemetry
        ? { midiTelemetry: checkpoint.midiTelemetry }
        : {}),
    };
    const checkpoints = [
      ...existing.filter(
        (candidate) => candidate.sessionId !== normalized.sessionId,
      ),
      normalized,
    ]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(-MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG);

    // One object-form store write leaves either the prior valid draft or the
    // full replacement on disk; it never creates a completed run as a
    // side-effect of an autosave.
    appState.store.set({
      [PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY]: {
        ...checkpointsBySong,
        [normalized.songId]: checkpoints,
      },
    });

    event.reply('save-practice-attempt-checkpoint', {
      songId: normalized.songId,
      checkpoints,
    } satisfies IpcPracticeAttemptCheckpointsResponse);
  } catch (error) {
    event.reply('save-practice-attempt-checkpoint', {
      error: toErrorMessage(error),
    });
  }
}

/** Loads unfinished local attempts for an explicit recovery UI. */
export function loadPracticeAttemptCheckpoints(
  event: IpcMainEvent,
  songId: string,
): void {
  try {
    if (!songId) {
      throw new Error('songId is required');
    }

    const checkpointsBySong =
      (appState.store.get(PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY) as
        | PracticeAttemptCheckpointsStore
        | undefined) ?? {};
    const checkpoints = readPracticeAttemptCheckpoints(
      checkpointsBySong[songId],
    );

    event.reply('load-practice-attempt-checkpoints', {
      songId,
      checkpoints,
    } satisfies IpcPracticeAttemptCheckpointsResponse);
  } catch (error) {
    event.reply('load-practice-attempt-checkpoints', {
      error: toErrorMessage(error),
    });
  }
}

/**
 * Removes a draft only after the caller has durably finalized its completed
 * run. The operation is idempotent so a duplicate renderer acknowledgement
 * cannot erase a newer session's evidence.
 */
export function finalizePracticeAttemptCheckpoint(
  event: IpcMainEvent,
  payload: IpcFinalizePracticeAttemptCheckpointPayload,
): void {
  try {
    const { songId, sessionId } = payload ?? {};

    if (!songId) {
      throw new Error('songId is required');
    }

    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const checkpointsBySong =
      (appState.store.get(PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY) as
        | PracticeAttemptCheckpointsStore
        | undefined) ?? {};
    const checkpoints = readPracticeAttemptCheckpoints(
      checkpointsBySong[songId],
    ).filter((checkpoint) => checkpoint.sessionId !== sessionId);

    appState.store.set({
      [PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY]: {
        ...checkpointsBySong,
        [songId]: checkpoints,
      },
    });

    event.reply('finalize-practice-attempt-checkpoint', {
      songId,
      checkpoints,
    } satisfies IpcPracticeAttemptCheckpointsResponse);
  } catch (error) {
    event.reply('finalize-practice-attempt-checkpoint', {
      error: toErrorMessage(error),
    });
  }
}

/**
 * Loads recent, full-resolution history plus compact archive evidence for a
 * song. Stores written before the archive feature read as an empty v1 archive.
 */
export function loadPracticeRuns(event: IpcMainEvent, songId: string): void {
  try {
    if (!songId) {
      throw new Error('songId is required');
    }

    const runs =
      (appState.store.get(storeKey(songId)) as RunSummary[] | undefined) ?? [];
    const fullRuns =
      (appState.store.get(detailsStoreKey(songId)) as
        | StoredPracticeRun[]
        | undefined) ?? [];
    const archive = readPracticeRunArchive(
      appState.store.get(archiveStoreKey(songId)),
    );
    const atomicSkillEvidenceArchive = readSkillEvidenceArchive(
      appState.store.get(skillEvidenceArchiveStoreKey(songId)),
    );

    event.reply('load-practice-runs', {
      songId,
      runs,
      fullRuns,
      archive,
      atomicSkillEvidenceArchive,
    } satisfies IpcPracticeRunsResponse);
  } catch (error) {
    event.reply('load-practice-runs', { error: toErrorMessage(error) });
  }
}
