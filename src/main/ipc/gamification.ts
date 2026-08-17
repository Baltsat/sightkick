import { IpcMainEvent } from 'electron';
import type {
  PracticeRunArchiveBySong,
  RunSummary,
  StoredPracticeRun,
} from '../../renderer/services/practice-stats';
import type { DayRollup, PracticeDays } from '../../renderer/services/streaks';
import type { SkillEvidenceEvent } from '../../renderer/services/pedagogy/types';
import { appState } from '../AppState';
import {
  PRACTICE_RUN_ARCHIVE_STORE_KEY,
  PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY,
  readSkillEvidenceArchive,
} from './practiceStats';
import { readPracticeRunArchive } from '../../renderer/services/practice-stats';
import {
  curriculumItemManifest,
  deriveAtomicSkillEvidence,
} from '../../renderer/services/pedagogy';

/**
 * Daily-rollup and cross-song-run storage for the gamification feature.
 * Deliberately its own file rather than an addition to `practiceStats.ts`
 * — `practiceStats.ts` owns per-song run history (`practiceRuns.<songId>`)
 * and stays untouched; this file owns the two new store surfaces the
 * streak/achievements features need:
 *
 * - `practiceDays` — one rollup per local calendar day (see
 *   `renderer/services/streaks` for the date-key convention and the
 *   pure streak math that consumes this shape).
 * - reading `practiceRuns` in aggregate (every song, not just one) so
 *   achievements that need run-level history (Perfect 10, Full Kit) can
 *   be derived without a second, duplicate store of run data.
 */

/** Keep roughly 13 months of daily rollups - plenty for a streak feature,
 * bounded so the store never grows forever. Longest-streak stats are
 * therefore "longest within retention", not all-time-forever. */
export const MAX_STORED_PRACTICE_DAYS = 400;

const DAYS_STORE_KEY = 'practiceDays';
const RUNS_STORE_KEY = 'practiceRuns';
const RUN_DETAILS_STORE_KEY = 'practiceRunDetails';

export interface IpcRecordPracticeDayPayload {
  /** Local "YYYY-MM-DD" - computed renderer-side (see
   * `renderer/services/streaks/localDateKey`), not derived here, so the
   * main process never has to guess at the user's timezone. */
  date: string;
  xp: number;
  stars: number;
  minutes: number;
}

export interface IpcRecordPracticeDayResponse {
  days: PracticeDays;
  /** Echoes back whether `date` had zero runs before this call - the
   * renderer already computes this itself (it needs it before sending, to
   * decide the first-run-of-day XP bonus), but echoing it back keeps the
   * reply self-describing and costs nothing extra. */
  wasFirstRunOfDay: boolean;
}

export interface IpcLoadPracticeDaysResponse {
  days: PracticeDays;
}

export interface IpcLoadAllPracticeRunsResponse {
  runs: RunSummary[];
  runsBySong: Record<string, RunSummary[]>;
  /** Compact per-song evidence for history older than recent summary caps. */
  archiveBySong: PracticeRunArchiveBySong;
  /**
   * Atomic per-item skill evidence (Bayesian mastery/spaced-review) carried
   * by summaries evicted past each song's recent-summary cap - see
   * `PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY` in practiceStats.ts.
   * Mastery replay must read this alongside each song's
   * `runsBySong[songId][].atomicSkillEvidence` rather than in place of it:
   * this map only ever holds evidence for runs no longer present there.
   */
  atomicSkillEvidenceArchiveBySong: Record<string, SkillEvidenceEvent[]>;
  timingEvidenceBySong: Record<string, SkillEvidenceEvent[]>;
}

function timingEvidenceForRuns(
  details: Record<string, StoredPracticeRun[]>,
): Record<string, SkillEvidenceEvent[]> {
  return Object.fromEntries(
    Object.entries(details).flatMap(([songId, storedRuns]) => {
      const manifest = curriculumItemManifest(songId.replace(/^lesson:/, ''));

      if (!manifest) {
        return [];
      }

      const previous_events: SkillEvidenceEvent[] = [];
      const events = [...storedRuns]
        .sort((left, right) =>
          left.summary.completedAt.localeCompare(right.summary.completedAt),
        )
        .flatMap((run) => {
          const timing = deriveAtomicSkillEvidence({
            run_id: run.summary.context?.sessionId ?? run.summary.completedAt,
            summary: run.summary,
            manifest,
            records: run.records,
            previous_events,
          }).events.filter(({ skill_id }) =>
            skill_id.startsWith('timing.steadiness.'),
          );

          previous_events.push(...timing);

          return timing;
        });

      return events.length > 0 ? [[songId, events]] : [];
    }),
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Drops the oldest dates beyond MAX_STORED_PRACTICE_DAYS. "YYYY-MM-DD"
 * keys sort chronologically as plain strings, so a lexical sort is enough
 * - no date parsing needed. */
function capDays(days: PracticeDays): PracticeDays {
  const keys = Object.keys(days).sort();

  if (keys.length <= MAX_STORED_PRACTICE_DAYS) {
    return days;
  }

  const kept = keys.slice(keys.length - MAX_STORED_PRACTICE_DAYS);
  const next: PracticeDays = {};

  for (const key of kept) {
    next[key] = days[key];
  }

  return next;
}

/**
 * Increments one local day's rollup (runs +1, xp/stars/minutes added) and
 * replies with the full, capped map so every mounted `useGamification`
 * instance in the window (library header + the song currently being
 * practiced) can update from the same broadcast - mirrors how
 * `update-song` replies reach every `useSongList` listener.
 */
export function recordPracticeDay(
  event: IpcMainEvent,
  payload: IpcRecordPracticeDayPayload,
): void {
  try {
    const { date, xp, stars, minutes } = payload;

    if (!date) {
      throw new Error('date is required');
    }

    const existing =
      (appState.store.get(DAYS_STORE_KEY) as PracticeDays | undefined) ?? {};
    const prevEntry = existing[date];
    const wasFirstRunOfDay = !prevEntry || prevEntry.runs === 0;
    const nextEntry: DayRollup = {
      runs: (prevEntry?.runs ?? 0) + 1,
      stars: (prevEntry?.stars ?? 0) + stars,
      minutes: (prevEntry?.minutes ?? 0) + minutes,
      xp: (prevEntry?.xp ?? 0) + xp,
    };
    const next = capDays({ ...existing, [date]: nextEntry });

    appState.store.set(DAYS_STORE_KEY, next);
    event.reply('record-practice-day', { days: next, wasFirstRunOfDay });
  } catch (error) {
    event.reply('record-practice-day', { error: toErrorMessage(error) });
  }
}

/** Loads every stored daily rollup, `{}` when none exist yet. */
export function loadPracticeDays(event: IpcMainEvent): void {
  try {
    const days =
      (appState.store.get(DAYS_STORE_KEY) as PracticeDays | undefined) ?? {};

    event.reply('load-practice-days', { days });
  } catch (error) {
    event.reply('load-practice-days', { error: toErrorMessage(error) });
  }
}

/**
 * Flattens every song's stored run history into one array, for
 * achievements that need to look across the whole library (Perfect 10,
 * Full Kit) rather than one song at a time. Reads the same
 * `practiceRuns` store key `practiceStats.ts` already maintains, plus its
 * compact archive surface for older history. Existing `runs`/`runsBySong`
 * fields remain recent detailed summaries so old consumers retain identical
 * behaviour; archive evidence is additive for Profile/Coach consumers.
 */
export function loadAllPracticeRuns(event: IpcMainEvent): void {
  try {
    const bySong =
      (appState.store.get(RUNS_STORE_KEY) as
        | Record<string, RunSummary[]>
        | undefined) ?? {};
    const runs = Object.values(bySong).flat();
    const rawArchiveBySong =
      (appState.store.get(PRACTICE_RUN_ARCHIVE_STORE_KEY) as
        | Record<string, unknown>
        | undefined) ?? {};
    const archiveBySong: PracticeRunArchiveBySong = Object.fromEntries(
      Object.entries(rawArchiveBySong).map(([songId, archive]) => [
        songId,
        readPracticeRunArchive(archive),
      ]),
    );
    const rawSkillEvidenceArchiveBySong =
      (appState.store.get(PRACTICE_RUN_SKILL_EVIDENCE_ARCHIVE_STORE_KEY) as
        | Record<string, unknown>
        | undefined) ?? {};
    const atomicSkillEvidenceArchiveBySong: Record<
      string,
      SkillEvidenceEvent[]
    > = Object.fromEntries(
      Object.entries(rawSkillEvidenceArchiveBySong).map(([songId, archive]) => [
        songId,
        readSkillEvidenceArchive(archive),
      ]),
    );
    const details =
      (appState.store.get(RUN_DETAILS_STORE_KEY) as
        | Record<string, StoredPracticeRun[]>
        | undefined) ?? {};
    const timingEvidenceBySong = timingEvidenceForRuns(details);

    event.reply('load-all-practice-runs', {
      runs,
      runsBySong: bySong,
      archiveBySong,
      atomicSkillEvidenceArchiveBySong,
      timingEvidenceBySong,
    } satisfies IpcLoadAllPracticeRunsResponse);
  } catch (error) {
    event.reply('load-all-practice-runs', { error: toErrorMessage(error) });
  }
}
