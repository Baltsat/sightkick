import { describe, expect, it } from 'vitest';
import {
  archiveRunSummaries,
  emptyPracticeRunArchive,
  PracticeAttemptCheckpoint,
  RunSummary,
} from '../renderer/services/practice-stats';
import {
  applyLessonProfileMigration,
  migrateLessonIdentityStoreData,
} from './lessonIdentityMigration';

function run(completedAt: string, totalHits: number): RunSummary {
  return {
    completedAt,
    totalHits,
    totalMisses: 1,
    totalWrong: 0,
    overallAccuracy: totalHits / (totalHits + 1),
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: totalHits,
      sampleCount: totalHits,
    },
    wrongHitCounts: [],
  };
}

function checkpoint(
  songId: string,
  sessionId: string,
  updatedAt: string,
): PracticeAttemptCheckpoint {
  return {
    schemaVersion: 1,
    state: 'in-progress',
    songId,
    sessionId,
    startedAt: '2026-08-10T00:00:00.000Z',
    updatedAt,
    chartRevision: 'chart-revision-1',
    mode: 'practice',
    difficulty: 'expert',
    playbackSpeed: 0.8,
    positionTick: 960,
    records: [],
  };
}

describe('migrateLessonIdentityStoreData', () => {
  it('moves summaries, full evidence, archives, and goals to the canonical lesson ID', () => {
    const legacyRun = run('2026-08-01T10:00:00.000Z', 8);
    const canonicalRun = run('2026-08-02T10:00:00.000Z', 9);
    const legacyArchive = archiveRunSummaries(emptyPracticeRunArchive(), [
      legacyRun,
    ]);
    const canonicalArchive = archiveRunSummaries(emptyPracticeRunArchive(), [
      canonicalRun,
    ]);
    const migrated = migrateLessonIdentityStoreData(
      {
        practiceRuns: {
          legacy: [legacyRun],
          'lesson:01.01': [canonicalRun],
          personal: [run('2026-08-03T10:00:00.000Z', 10)],
        },
        practiceRunDetails: {
          legacy: [{ summary: legacyRun, records: [] }],
          'lesson:01.01': [{ summary: canonicalRun, records: [] }],
        },
        practiceRunArchive: {
          legacy: legacyArchive,
          'lesson:01.01': canonicalArchive,
        },
        practiceAttemptCheckpoints: {
          legacy: [
            checkpoint('legacy', 'legacy-attempt', '2026-08-10T00:03:00.000Z'),
          ],
          'lesson:01.01': [
            checkpoint(
              'lesson:01.01',
              'canonical-attempt',
              '2026-08-10T00:04:00.000Z',
            ),
          ],
        },
        goals: [
          {
            id: 'goal-1',
            songId: 'legacy',
            difficulty: 'expert',
            createdAt: '2026-08-01T00:00:00.000Z',
            isPrimary: true,
          },
          {
            id: 'goal-2',
            songId: 'personal',
            difficulty: 'hard',
            createdAt: '2026-08-01T00:00:00.000Z',
            isPrimary: false,
          },
        ],
      },
      { legacy: 'lesson:01.01' },
    );

    expect(migrated.practiceRuns?.legacy).toBeUndefined();
    expect(
      migrated.practiceRuns?.['lesson:01.01']?.map(
        ({ completedAt }) => completedAt,
      ),
    ).toEqual(['2026-08-01T10:00:00.000Z', '2026-08-02T10:00:00.000Z']);
    expect(migrated.practiceRuns?.personal).toHaveLength(1);
    expect(migrated.practiceRunDetails?.legacy).toBeUndefined();
    expect(migrated.practiceRunDetails?.['lesson:01.01']).toHaveLength(2);
    expect(migrated.practiceRunArchive?.legacy).toBeUndefined();
    expect(migrated.practiceAttemptCheckpoints?.legacy).toBeUndefined();
    expect(migrated.practiceAttemptCheckpoints?.['lesson:01.01']).toEqual([
      expect.objectContaining({
        songId: 'lesson:01.01',
        sessionId: 'legacy-attempt',
      }),
      expect.objectContaining({
        songId: 'lesson:01.01',
        sessionId: 'canonical-attempt',
      }),
    ]);
    expect(
      Object.values(
        migrated.practiceRunArchive?.['lesson:01.01']?.days ?? {},
      ).reduce((sum, day) => sum + day.runCount, 0),
    ).toBe(2);
    expect(migrated.goals?.map(({ songId }) => songId)).toEqual([
      'lesson:01.01',
      'personal',
    ]);

    expect(
      migrateLessonIdentityStoreData(migrated, {
        legacy: 'lesson:01.01',
      }),
    ).toEqual(migrated);
  });

  it('deduplicates exact evidence when two legacy aliases converge', () => {
    const shared = run('2026-08-01T10:00:00.000Z', 8);
    const sharedArchive = archiveRunSummaries(emptyPracticeRunArchive(), [
      shared,
    ]);
    const migrated = migrateLessonIdentityStoreData(
      {
        practiceRuns: {
          legacyA: [shared],
          legacyB: [shared],
        },
        practiceRunArchive: {
          legacyA: sharedArchive,
          legacyB: sharedArchive,
        },
      },
      {
        legacyA: 'lesson:01.01',
        legacyB: 'lesson:01.01',
      },
    );

    expect(migrated.practiceRuns).toEqual({
      'lesson:01.01': [shared],
    });
    expect(
      Object.values(
        migrated.practiceRunArchive?.['lesson:01.01']?.days ?? {},
      ).reduce((sum, day) => sum + day.runCount, 0),
    ).toBe(1);
  });

  it('moves renumbering chains from the immutable source without cascading evidence', () => {
    const fromThree = run('2026-08-01T10:00:00.000Z', 3);
    const fromFive = run('2026-08-02T10:00:00.000Z', 5);
    const migrated = migrateLessonIdentityStoreData(
      {
        practiceRuns: {
          'lesson:03.01': [fromThree],
          'lesson:05.01': [fromFive],
        },
        practiceRunArchive: {
          'lesson:03.01': archiveRunSummaries(emptyPracticeRunArchive(), [
            fromThree,
          ]),
          'lesson:05.01': archiveRunSummaries(emptyPracticeRunArchive(), [
            fromFive,
          ]),
        },
        goals: [
          {
            id: 'goal-three',
            songId: 'lesson:03.01',
            difficulty: 'expert',
            createdAt: '2026-08-01T00:00:00.000Z',
            isPrimary: true,
          },
          {
            id: 'goal-five',
            songId: 'lesson:05.01',
            difficulty: 'expert',
            createdAt: '2026-08-01T00:00:00.000Z',
            isPrimary: false,
          },
        ],
      },
      {
        'lesson:03.01': 'lesson:05.01',
        'lesson:05.01': 'lesson:07.01',
      },
    );

    expect(migrated.practiceRuns?.['lesson:05.01']).toEqual([fromThree]);
    expect(migrated.practiceRuns?.['lesson:07.01']).toEqual([fromFive]);
    expect(
      Object.values(
        migrated.practiceRunArchive?.['lesson:05.01']?.days ?? {},
      ).reduce((sum, day) => sum + day.totalHits, 0),
    ).toBe(3);
    expect(
      Object.values(
        migrated.practiceRunArchive?.['lesson:07.01']?.days ?? {},
      ).reduce((sum, day) => sum + day.totalHits, 0),
    ).toBe(5);
    expect(migrated.goals?.map(({ songId }) => songId)).toEqual([
      'lesson:05.01',
      'lesson:07.01',
    ]);
  });

  it('commits every profile namespace atomically or leaves the legacy snapshot intact', () => {
    const summary = run('2026-08-01T10:00:00.000Z', 8);
    const archive = archiveRunSummaries(emptyPracticeRunArchive(), [summary]);
    const initial = {
      songs: {
        legacy: { id: 'legacy', dir: '/legacy' },
        personal: { id: 'personal', dir: '/personal' },
      },
      practiceRuns: { legacy: [summary] },
      practiceRunDetails: {
        legacy: [{ summary, records: [] }],
      },
      practiceRunArchive: { legacy: archive },
      goals: [
        {
          id: 'goal',
          songId: 'legacy',
          difficulty: 'expert',
          createdAt: '2026-08-01T00:00:00.000Z',
          isPrimary: true,
        },
      ],
    };
    const migration = {
      songs: {
        personal: { id: 'personal', dir: '/personal' },
        'lesson:01.01': { id: 'lesson:01.01', dir: '/canonical' },
      },
      songIdMigrations: { legacy: 'lesson:01.01' },
      retiredLessonSongs: {
        retired: { id: 'retired', dir: '/retired' },
      },
    };

    class MemoryStore {
      data: Record<string, unknown>;
      failAt: number | undefined;
      writes = 0;

      constructor(data: Record<string, unknown>, failAt?: number) {
        this.data = structuredClone(data);
        this.failAt = failAt;
      }

      get(key: string) {
        return this.data[key];
      }

      set(key: string, value: unknown): void;
      set(values: Record<string, unknown>): void;
      set(keyOrValues: string | Record<string, unknown>, value?: unknown) {
        this.writes += 1;

        if (this.writes === this.failAt) {
          throw new Error(`interrupted at write ${this.writes}`);
        }

        if (typeof keyOrValues === 'string') {
          this.data[keyOrValues] = structuredClone(value);
        } else {
          Object.assign(this.data, structuredClone(keyOrValues));
        }
      }
    }

    const completed = new MemoryStore(initial);

    applyLessonProfileMigration(completed, migration as never);
    expect(completed.writes).toBe(1);

    const interrupted = new MemoryStore(initial, 1);

    expect(() =>
      applyLessonProfileMigration(interrupted, migration as never),
    ).toThrow('interrupted at write 1');
    expect(interrupted.data).toEqual(initial);

    interrupted.failAt = undefined;
    applyLessonProfileMigration(interrupted, migration as never);

    expect(interrupted.data).toEqual(completed.data);
  });

  it('atomically preserves both sides of a renumbering chain', () => {
    const fromThree = run('2026-08-01T10:00:00.000Z', 3);
    const fromFive = run('2026-08-02T10:00:00.000Z', 5);
    const data: Record<string, unknown> = {
      songs: {
        'lesson:03.01': { id: 'lesson:03.01', dir: '/old-three' },
        'lesson:05.01': { id: 'lesson:05.01', dir: '/old-five' },
      },
      practiceRuns: {
        'lesson:03.01': [fromThree],
        'lesson:05.01': [fromFive],
      },
    };

    class AtomicStore {
      writes: Array<Record<string, unknown>> = [];

      get(key: string) {
        return data[key];
      }

      set(key: string, value: unknown): void;
      set(values: Record<string, unknown>): void;
      set(keyOrValues: string | Record<string, unknown>, value?: unknown) {
        const values =
          typeof keyOrValues === 'string'
            ? { [keyOrValues]: value }
            : keyOrValues;

        this.writes.push(structuredClone(values));
        Object.assign(data, structuredClone(values));
      }
    }

    const store = new AtomicStore();

    applyLessonProfileMigration(store, {
      songs: {
        'lesson:05.01': { id: 'lesson:05.01', dir: '/new-five' },
        'lesson:07.01': { id: 'lesson:07.01', dir: '/new-seven' },
      },
      songIdMigrations: {
        'lesson:03.01': 'lesson:05.01',
        'lesson:05.01': 'lesson:07.01',
      },
    } as never);

    expect(store.writes).toHaveLength(1);
    expect(data.practiceRuns).toEqual({
      'lesson:05.01': [fromThree],
      'lesson:07.01': [fromFive],
    });
    expect(data.songs).toEqual({
      'lesson:05.01': { id: 'lesson:05.01', dir: '/new-five' },
      'lesson:07.01': { id: 'lesson:07.01', dir: '/new-seven' },
    });
  });
});
