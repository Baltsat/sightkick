import { IpcMainEvent } from 'electron';
import type {
  PracticeRunArchive,
  HitRecord,
  RunSummary,
  StoredHitRecord,
  StoredPracticeRun,
} from '../../renderer/services/practice-stats';
import {
  archiveRunSummaries,
  MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG,
  MAX_RECENT_PRACTICE_SUMMARIES_PER_SONG,
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

export const PRACTICE_RUN_ARCHIVE_STORE_KEY = 'practiceRunArchive';

const archiveStoreKey = (songId: string) =>
  `${PRACTICE_RUN_ARCHIVE_STORE_KEY}.${songId}`;

export interface IpcSavePracticeRunPayload {
  songId: string;
  summary: RunSummary;
  records?: HitRecord[];
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
    const { songId, summary, records } = payload;

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
    });

    event.reply('save-practice-run', { songId, runs: next, fullRuns, archive });
  } catch (error) {
    event.reply('save-practice-run', { error: toErrorMessage(error) });
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
