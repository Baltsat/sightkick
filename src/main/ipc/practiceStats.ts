import { IpcMainEvent } from 'electron';
import type {
  HitRecord,
  RunSummary,
  StoredHitRecord,
  StoredPracticeRun,
} from '../../renderer/services/practice-stats';
import { appState } from '../AppState';

/** Keep only the most recent N runs per song, oldest dropped first. */
export const MAX_STORED_RUNS_PER_SONG = 50;
export const MAX_STORED_FULL_RUNS_PER_SONG = 30;

const storeKey = (songId: string) => `practiceRuns.${songId}`;
const detailsStoreKey = (songId: string) => `practiceRunDetails.${songId}`;

export interface IpcSavePracticeRunPayload {
  songId: string;
  summary: RunSummary;
  records?: HitRecord[];
}

export interface IpcPracticeRunsResponse {
  songId: string;
  runs: RunSummary[];
  fullRuns: StoredPracticeRun[];
}

export interface IpcPracticeStatsError {
  error: string;
}

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
 * Appends one run summary to the song's stored history, capped to the last
 * `MAX_STORED_RUNS_PER_SONG` runs, and replies with the resulting list so
 * the caller can render immediately without a round-trip load.
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

    const existing =
      (appState.store.get(storeKey(songId)) as RunSummary[] | undefined) ?? [];
    const next = [...existing, summary].slice(-MAX_STORED_RUNS_PER_SONG);
    const existingFullRuns =
      (appState.store.get(detailsStoreKey(songId)) as
        | StoredPracticeRun[]
        | undefined) ?? [];
    const fullRuns = records
      ? [
          ...existingFullRuns,
          { summary, records: records.map(compactRecord) },
        ].slice(-MAX_STORED_FULL_RUNS_PER_SONG)
      : existingFullRuns;

    appState.store.set(storeKey(songId), next);
    if (records) {
      appState.store.set(detailsStoreKey(songId), fullRuns);
    }
    event.reply('save-practice-run', { songId, runs: next, fullRuns });
  } catch (error) {
    event.reply('save-practice-run', { error: toErrorMessage(error) });
  }
}

/** Loads the stored run history for a song, oldest first, [] when none. */
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

    event.reply('load-practice-runs', { songId, runs, fullRuns });
  } catch (error) {
    event.reply('load-practice-runs', { error: toErrorMessage(error) });
  }
}
