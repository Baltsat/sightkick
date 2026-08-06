import { IpcMainEvent } from 'electron';
import type { RunSummary } from '../../renderer/services/practice-stats';
import { appState } from '../AppState';

/** Keep only the most recent N runs per song, oldest dropped first. */
export const MAX_STORED_RUNS_PER_SONG = 50;

const storeKey = (songId: string) => `practiceRuns.${songId}`;

export interface IpcSavePracticeRunPayload {
  songId: string;
  summary: RunSummary;
}

export interface IpcPracticeRunsResponse {
  songId: string;
  runs: RunSummary[];
}

export interface IpcPracticeStatsError {
  error: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    const { songId, summary } = payload;

    if (!songId) {
      throw new Error('songId is required');
    }

    const existing =
      (appState.store.get(storeKey(songId)) as RunSummary[] | undefined) ?? [];
    const next = [...existing, summary].slice(-MAX_STORED_RUNS_PER_SONG);

    appState.store.set(storeKey(songId), next);
    event.reply('save-practice-run', { songId, runs: next });
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

    event.reply('load-practice-runs', { songId, runs });
  } catch (error) {
    event.reply('load-practice-runs', { error: toErrorMessage(error) });
  }
}
