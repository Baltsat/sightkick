import { IpcMainEvent } from 'electron';
import type {
  PracticeAttemptCheckpoint,
  PracticeAttemptCheckpointBySong,
  PracticeRunArchive,
  HitRecord,
  RunSummary,
  StoredHitRecord,
  StoredPracticeRun,
} from '../../renderer/services/practice-stats';
import {
  archiveRunSummaries,
  MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG,
  MAX_PRACTICE_ATTEMPT_RECORDS,
  MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG,
  MAX_RECENT_PRACTICE_SUMMARIES_PER_SONG,
  PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION,
  readPracticeRunArchive,
} from '../../renderer/services/practice-stats';
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
}

export interface IpcPracticeStatsError {
  error: string;
}

type PracticeRunsStore = Record<string, RunSummary[]>;

type PracticeRunDetailsStore = Record<string, StoredPracticeRun[]>;

type PracticeRunArchiveStore = Record<string, PracticeRunArchive>;

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
        },
      ];
    })
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG);
}

function checkpointStoreKey(songId: string): string {
  return `${PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY}.${songId}`;
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
      summary,
      records,
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
        ? readPracticeAttemptCheckpoints(
            practiceAttemptCheckpoints?.[songId],
          ).filter(
            (checkpoint) => !finalizedSessionIds.has(checkpoint.sessionId),
          )
        : undefined;

    // electron-store's object-form setter builds the complete next store in
    // memory and performs one filesystem write. Keeping all three evidence
    // namespaces in that single snapshot prevents a failed write from leaving
    // summaries, archives, and full-resolution details out of sync.
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
      ...(finalizedCheckpoints && practiceAttemptCheckpoints
        ? {
            [PRACTICE_ATTEMPT_CHECKPOINTS_STORE_KEY]: {
              ...practiceAttemptCheckpoints,
              [songId]: finalizedCheckpoints,
            },
          }
        : {}),
    });

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

    const checkpoints = readPracticeAttemptCheckpoints(
      appState.store.get(checkpointStoreKey(songId)),
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

    event.reply('load-practice-runs', { songId, runs, fullRuns, archive });
  } catch (error) {
    event.reply('load-practice-runs', { error: toErrorMessage(error) });
  }
}
