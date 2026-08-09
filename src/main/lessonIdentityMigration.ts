import type { Goal } from './ipc/goals';
import type { StorageSchema } from '../types';
import type {
  RunSummary,
  StoredPracticeRun,
} from '../renderer/services/practice-stats';
import {
  mergePracticeRunArchives,
  readPracticeRunArchive,
  type PracticeRunArchive,
} from '../renderer/services/practice-stats';

export interface LessonIdentityStoreData {
  practiceRuns?: Record<string, RunSummary[]>;
  practiceRunDetails?: Record<string, StoredPracticeRun[]>;
  practiceRunArchive?: Record<string, PracticeRunArchive>;
  goals?: Goal[];
}

export const RETIRED_LESSON_SONGS_STORE_KEY = 'retiredLessonSongs';

export interface LessonProfileMigration {
  songs?: StorageSchema['songs'];
  songIdMigrations?: Record<string, string>;
  retiredLessonSongs?: StorageSchema['songs'];
}

export interface LessonProfileStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  set(values: Record<string, unknown>): void;
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

function completedAt(value: RunSummary | StoredPracticeRun): string {
  return 'summary' in value ? value.summary.completedAt : value.completedAt;
}

function mergeUniqueChronological<T extends RunSummary | StoredPracticeRun>(
  left: readonly T[],
  right: readonly T[],
): T[] {
  const byContent = new Map<string, T>();

  for (const entry of [...left, ...right]) {
    byContent.set(canonicalJson(entry), entry);
  }

  return [...byContent.values()].sort(
    (leftEntry, rightEntry) =>
      completedAt(leftEntry).localeCompare(completedAt(rightEntry)) ||
      canonicalJson(leftEntry).localeCompare(canonicalJson(rightEntry)),
  );
}

function migrateArrayRecord<T extends RunSummary | StoredPracticeRun>(
  raw: Record<string, T[]> | undefined,
  migrations: Readonly<Record<string, string>>,
): Record<string, T[]> | undefined {
  if (!raw) {
    return undefined;
  }

  const moves = Object.entries(migrations).filter(
    ([legacyId, canonicalId]) =>
      legacyId !== canonicalId && raw[legacyId] !== undefined,
  );
  const sourceIds = new Set(moves.map(([legacyId]) => legacyId));
  const migrated = Object.fromEntries(
    Object.entries(raw).filter(([songId]) => !sourceIds.has(songId)),
  );

  // Every source is read from the immutable input. This matters when old
  // canonical-looking IDs form a renumbering chain (A -> B and B -> C): A's
  // evidence belongs at B, while B's original evidence alone belongs at C.
  for (const [legacyId, canonicalId] of moves) {
    migrated[canonicalId] = mergeUniqueChronological(
      raw[legacyId],
      migrated[canonicalId] ?? [],
    );
  }

  return migrated;
}

function migrateArchiveRecord(
  raw: Record<string, PracticeRunArchive> | undefined,
  migrations: Readonly<Record<string, string>>,
): Record<string, PracticeRunArchive> | undefined {
  if (!raw) {
    return undefined;
  }

  const moves = Object.entries(migrations).filter(
    ([legacyId, canonicalId]) =>
      legacyId !== canonicalId && raw[legacyId] !== undefined,
  );
  const sourceIds = new Set(moves.map(([legacyId]) => legacyId));
  const migrated = Object.fromEntries(
    Object.entries(raw).filter(([songId]) => !sourceIds.has(songId)),
  );
  const fingerprintsByTarget = new Map<string, Set<string>>();

  for (const [legacyId, canonicalId] of moves) {
    const normalizedSource = readPracticeRunArchive(raw[legacyId]);
    const sourceFingerprint = canonicalJson(normalizedSource);
    let fingerprints = fingerprintsByTarget.get(canonicalId);

    if (!fingerprints) {
      fingerprints = new Set<string>();

      if (migrated[canonicalId]) {
        fingerprints.add(
          canonicalJson(readPracticeRunArchive(migrated[canonicalId])),
        );
      }

      fingerprintsByTarget.set(canonicalId, fingerprints);
    }

    if (fingerprints.has(sourceFingerprint)) {
      continue;
    }

    migrated[canonicalId] = mergePracticeRunArchives(
      normalizedSource,
      migrated[canonicalId],
    );
    fingerprints.add(sourceFingerprint);
  }

  return migrated;
}

/**
 * Moves every persistent song-ID reference for exercises whose content
 * identity was proven by the lesson bootstrap. The transformation is pure
 * and idempotent: legacy keys are deleted in the same top-level value that
 * receives their data, so a relaunch after any completed store write cannot
 * duplicate evidence.
 */
export function migrateLessonIdentityStoreData(
  data: LessonIdentityStoreData,
  migrations: Readonly<Record<string, string>>,
): LessonIdentityStoreData {
  if (Object.keys(migrations).length === 0) {
    return data;
  }

  return {
    ...(data.practiceRuns
      ? {
          practiceRuns: migrateArrayRecord(data.practiceRuns, migrations),
        }
      : {}),
    ...(data.practiceRunDetails
      ? {
          practiceRunDetails: migrateArrayRecord(
            data.practiceRunDetails,
            migrations,
          ),
        }
      : {}),
    ...(data.practiceRunArchive
      ? {
          practiceRunArchive: migrateArchiveRecord(
            data.practiceRunArchive,
            migrations,
          ),
        }
      : {}),
    ...(data.goals
      ? {
          goals: data.goals.map((goal) => ({
            ...goal,
            songId: migrations[goal.songId] ?? goal.songId,
          })),
        }
      : {}),
  };
}

/**
 * Applies the complete profile migration as one electron-store transaction.
 * This is important for renumbering chains: an interrupted sequence of
 * independent namespace writes could otherwise mistake evidence already moved
 * into an intermediate target for that target's original evidence. Conf's
 * object overload materialises every update into one config snapshot and then
 * performs one atomic file replacement, so startup observes either the full
 * legacy profile or the full canonical profile.
 */
export function applyLessonProfileMigration(
  store: LessonProfileStore,
  migration: LessonProfileMigration,
): void {
  const identityMigrations = migration.songIdMigrations ?? {};
  const updates: Record<string, unknown> = {};

  if (Object.keys(identityMigrations).length > 0) {
    const migrated = migrateLessonIdentityStoreData(
      {
        practiceRuns: store.get('practiceRuns') as
          | Record<string, RunSummary[]>
          | undefined,
        practiceRunDetails: store.get('practiceRunDetails') as
          | Record<string, StoredPracticeRun[]>
          | undefined,
        practiceRunArchive: store.get('practiceRunArchive') as
          | Record<string, PracticeRunArchive>
          | undefined,
        goals: store.get('goals') as Goal[] | undefined,
      },
      identityMigrations,
    );

    Object.assign(updates, migrated);
  }

  if (
    migration.retiredLessonSongs &&
    Object.keys(migration.retiredLessonSongs).length > 0
  ) {
    const retired =
      (store.get(RETIRED_LESSON_SONGS_STORE_KEY) as
        | StorageSchema['songs']
        | undefined) ?? {};

    updates[RETIRED_LESSON_SONGS_STORE_KEY] = {
      ...retired,
      ...migration.retiredLessonSongs,
    };
  }

  if (migration.songs) {
    updates.songs = migration.songs;
  }

  if (Object.keys(updates).length > 0) {
    store.set(updates);
  }
}
