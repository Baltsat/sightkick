import { IpcMainEvent } from 'electron';
import {
  IpcRetiredLessonsResponse,
  RetiredLessonEvidence,
  SongData,
  StorageSchema,
} from '../../types';
import { getStarRating } from '../../renderer/scoring';
import {
  readPracticeRunArchive,
  type PracticeRunArchive,
  type RunSummary,
  type StoredPracticeRun,
} from '../../renderer/services/practice-stats';
import { appState } from '../AppState';
import { RETIRED_LESSON_SONGS_STORE_KEY } from '../lessonIdentityMigration';
import type { Goal } from './goals';

export interface RetiredLessonStoreSnapshot {
  retiredLessonSongs?: StorageSchema['songs'];
  practiceRuns?: Record<string, RunSummary[]>;
  practiceRunDetails?: Record<string, StoredPracticeRun[]>;
  practiceRunArchive?: Record<string, PracticeRunArchive>;
  goals?: Goal[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function uniqueAliasedEntries<T>(
  record: Record<string, T[]> | undefined,
  aliases: readonly string[],
): T[] {
  const unique = new Map<string, T>();

  for (const alias of aliases) {
    for (const entry of record?.[alias] ?? []) {
      unique.set(canonicalJson(entry), entry);
    }
  }

  return [...unique.values()];
}

function bestStars(song: SongData): number {
  return Object.values(song.scoreData ?? {}).reduce(
    (best, score) => (score ? Math.max(best, getStarRating(score)) : best),
    0,
  );
}

function archivedRunCount(
  record: Record<string, PracticeRunArchive> | undefined,
  aliases: readonly string[],
): number {
  const unique = new Map<string, PracticeRunArchive>();

  for (const alias of aliases) {
    if (!record?.[alias]) {
      continue;
    }

    const archive = readPracticeRunArchive(record[alias]);

    unique.set(canonicalJson(archive), archive);
  }

  return [...unique.values()].reduce(
    (total, archive) =>
      total +
      Object.values(archive.days).reduce(
        (dayTotal, day) => dayTotal + day.runCount,
        0,
      ),
    0,
  );
}

export function summarizeRetiredLessons({
  retiredLessonSongs = {},
  practiceRuns,
  practiceRunDetails,
  practiceRunArchive,
  goals = [],
}: RetiredLessonStoreSnapshot): RetiredLessonEvidence[] {
  return Object.entries(retiredLessonSongs)
    .map(([storageId, song]) => {
      const aliases = [...new Set([storageId, song.id])].sort();
      const goalIds = new Set(
        goals
          .filter((goal) => aliases.includes(goal.songId))
          .map((goal) => goal.id),
      );

      return {
        legacySongIds: aliases,
        ...(song.sk_lesson_id ? { lessonId: song.sk_lesson_id } : {}),
        name: song.name || `Retired lesson ${song.sk_lesson_id ?? ''}`.trim(),
        bestStars: bestStars(song),
        recentRunCount: uniqueAliasedEntries(practiceRuns, aliases).length,
        fullRunCount: uniqueAliasedEntries(practiceRunDetails, aliases).length,
        archivedRunCount: archivedRunCount(practiceRunArchive, aliases),
        goalCount: goalIds.size,
      };
    })
    .sort(
      (left, right) =>
        (left.lessonId ?? '').localeCompare(right.lessonId ?? '', undefined, {
          numeric: true,
        }) || left.name.localeCompare(right.name),
    );
}

export function loadRetiredLessons(event: IpcMainEvent): void {
  try {
    const response: IpcRetiredLessonsResponse = {
      lessons: summarizeRetiredLessons({
        retiredLessonSongs: appState.store.get(
          RETIRED_LESSON_SONGS_STORE_KEY,
        ) as StorageSchema['songs'] | undefined,
        practiceRuns: appState.store.get('practiceRuns') as
          | Record<string, RunSummary[]>
          | undefined,
        practiceRunDetails: appState.store.get('practiceRunDetails') as
          | Record<string, StoredPracticeRun[]>
          | undefined,
        practiceRunArchive: appState.store.get('practiceRunArchive') as
          | Record<string, PracticeRunArchive>
          | undefined,
        goals: appState.store.get('goals') as Goal[] | undefined,
      }),
    };

    event.reply('load-retired-lessons', response);
  } catch (error) {
    event.reply('load-retired-lessons', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
