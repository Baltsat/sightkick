import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootstrapLessonLibrary,
  DESKTOP_LESSON_LIBRARY_FOLDER,
} from './lessonLibrary';

const CHART = `[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
}
[ExpertDrums]
{
  0 = N 0 0
}
`;
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'drumroll-lessons-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function makeLessonBundle(
  count = 170,
  name = 'bundle',
  audio = 'lesson-audio',
): string {
  const bundle = path.join(root, name);
  const lessons = Array.from({ length: count }, (_, index) => {
    const unit = String(Math.floor(index / 10) + 1).padStart(2, '0');
    const exercise = String((index % 10) + 1).padStart(2, '0');
    const lessonId = `${unit}.${exercise}`;
    const folder = `SightKick Method - Lesson ${lessonId}`;
    const dir = path.join(bundle, folder);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'song.ini'),
      `[Song]\nname = Lesson ${lessonId}\nartist = Drumroll Method\npro_drums = True\nsk_lesson_id = ${lessonId}\n`,
    );
    fs.writeFileSync(path.join(dir, 'notes.chart'), CHART);
    fs.writeFileSync(path.join(dir, 'drums.ogg'), audio);

    return { song: { id: `lesson:${lessonId}`, drumDifficulties: ['expert'] } };
  });

  fs.writeFileSync(
    path.join(bundle, 'manifest.json'),
    JSON.stringify({ version: 1, lessonCount: lessons.length, lessons }),
  );

  return bundle;
}

function makeImportedSong(libraryRoot: string, name = 'Imported Song'): string {
  const dir = path.join(libraryRoot, name);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'song.ini'),
    '[Song]\nname = Imported Song\nartist = A Musician\npro_drums = True\n',
  );
  fs.writeFileSync(path.join(dir, 'notes.chart'), CHART);
  fs.writeFileSync(path.join(dir, 'drums.ogg'), 'imported-audio');
  fs.writeFileSync(
    path.join(dir, '.sightkick'),
    JSON.stringify({ id: 'imported-song' }),
  );

  return dir;
}

describe('bootstrapLessonLibrary', () => {
  it('makes all 170 bundled lessons discoverable in a clean private profile with stable IDs', () => {
    const bundle = makeLessonBundle();
    const userDataRoot = path.join(root, 'clean-profile');
    const first = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot,
      existingSongs: {
        personal: { id: 'personal', dir: '/personal/song' },
      } as never,
    });

    expect(first.installed).toBe(true);
    expect(first.libraryRoot).toBe(
      path.join(userDataRoot, DESKTOP_LESSON_LIBRARY_FOLDER),
    );
    expect(Object.keys(first.songs ?? {})).toHaveLength(171);
    expect(
      Object.keys(first.songs ?? {}).filter((id) => id.startsWith('lesson:')),
    ).toHaveLength(170);
    expect(first.songs?.['lesson:01.01']?.name).toBe('Lesson 01.01');
    expect(first.songs?.['lesson:17.10']?.id).toBe('lesson:17.10');
    expect(
      fs.existsSync(
        path.join(bundle, 'SightKick Method - Lesson 01.01', '.sightkick'),
      ),
    ).toBe(false);

    const noOpMarker = path.join(
      userDataRoot,
      DESKTOP_LESSON_LIBRARY_FOLDER,
      'same-version-marker',
    );

    fs.writeFileSync(noOpMarker, 'keep');

    const second = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot,
      existingSongs: first.songs,
    });

    expect(second.installed).toBe(false);
    expect(fs.readFileSync(noOpMarker, 'utf-8')).toBe('keep');
    expect(Object.keys(second.songs ?? {})).toHaveLength(171);
    expect(second.songs?.['lesson:01.01']?.id).toBe('lesson:01.01');
  });

  it('adds private bundled lessons without replacing a selected music folder or personal songs', () => {
    const bundle = makeLessonBundle();
    const userDataRoot = path.join(root, 'selected-profile');
    const result = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot,
      existingLibraryRoot: '/user-selected-library',
      existingSongs: {
        personal: { id: 'personal', dir: '/user-selected-library/song' },
      } as never,
    });

    expect(result.installed).toBe(true);
    expect(result.libraryRoot).toBe(
      path.join(userDataRoot, DESKTOP_LESSON_LIBRARY_FOLDER),
    );
    expect(result.songs?.personal?.dir).toBe('/user-selected-library/song');
    expect(result.songs?.['lesson:01.01']?.id).toBe('lesson:01.01');
    expect(
      Object.keys(result.songs ?? {}).filter((id) => id.startsWith('lesson:')),
    ).toHaveLength(170);
  });

  it('keeps an imported song in the default lesson-backed library across relaunch', () => {
    const bundle = makeLessonBundle();
    const userDataRoot = path.join(root, 'default-library-import');
    const first = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot,
    });
    const importedDir = makeImportedSong(first.libraryRoot!);
    const imported = {
      id: 'imported-song',
      dir: importedDir,
      name: 'Imported Song',
    };
    const second = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot,
      existingSongs: {
        ...first.songs,
        'imported-song': imported,
      } as never,
    });

    expect(second.installed).toBe(false);
    expect(fs.existsSync(importedDir)).toBe(true);
    expect(second.songs?.['imported-song']).toMatchObject(imported);
  });

  it('transactionally upgrades a same-schema 118-lesson install to 170 while preserving musician data', () => {
    const oldBundle = makeLessonBundle(118, 'old-bundle', 'old-audio');
    const newBundle = makeLessonBundle(170, 'new-bundle', 'new-audio');
    const userDataRoot = path.join(root, 'upgrade-profile');
    const selectedLibrary = path.join(root, 'selected-music');
    const selectedMarker = path.join(selectedLibrary, 'my-song.txt');

    fs.mkdirSync(selectedLibrary, { recursive: true });
    fs.writeFileSync(selectedMarker, 'personal music');

    const old = bootstrapLessonLibrary({
      bundledRoot: oldBundle,
      userDataRoot,
      existingLibraryRoot: selectedLibrary,
      existingSongs: {
        personal: { id: 'personal', dir: selectedLibrary },
        'lesson:01.01': {
          id: 'lesson:01.01',
          dir: '/stale/private/lesson',
          liked: true,
          scoreData: { expert: { score: 1234 } },
        },
      } as never,
    });

    expect(
      Object.keys(old.songs ?? {}).filter((id) => id.startsWith('lesson:')),
    ).toHaveLength(118);

    const importedDir = makeImportedSong(
      old.libraryRoot!,
      'Imported During Upgrade',
    );
    const imported = {
      id: 'imported-song',
      dir: importedDir,
      name: 'Imported Song',
    };
    const upgraded = bootstrapLessonLibrary({
      bundledRoot: newBundle,
      userDataRoot,
      existingLibraryRoot: selectedLibrary,
      existingSongs: {
        ...old.songs,
        'imported-song': imported,
      } as never,
    });
    const privateRoot = path.join(userDataRoot, DESKTOP_LESSON_LIBRARY_FOLDER);
    const installedManifest = JSON.parse(
      fs.readFileSync(path.join(privateRoot, 'manifest.json'), 'utf-8'),
    );

    expect(upgraded.installed).toBe(true);
    expect(installedManifest.lessonCount).toBe(170);
    expect(
      Object.keys(upgraded.songs ?? {}).filter((id) =>
        id.startsWith('lesson:'),
      ),
    ).toHaveLength(170);
    expect(upgraded.songs?.personal?.dir).toBe(selectedLibrary);
    expect(upgraded.songs?.['imported-song']).toMatchObject(imported);
    expect(fs.existsSync(importedDir)).toBe(true);
    expect(upgraded.songs?.['lesson:01.01']?.liked).toBe(true);
    expect(upgraded.songs?.['lesson:01.01']?.scoreData).toEqual({
      expert: { score: 1234 },
    });
    expect(upgraded.songs?.['lesson:01.01']?.dir).toContain(privateRoot);
    expect(
      fs.readFileSync(
        path.join(privateRoot, 'SightKick Method - Lesson 01.01', 'drums.ogg'),
        'utf-8',
      ),
    ).toBe('new-audio');
    expect(fs.readFileSync(selectedMarker, 'utf-8')).toBe('personal music');
    expect(fs.existsSync(`${privateRoot}.installing`)).toBe(false);
    expect(fs.existsSync(`${privateRoot}.previous`)).toBe(false);
  });

  it('reconciles a real UUID-keyed legacy profile to 170 canonical lessons without losing retired metadata', () => {
    const bundle = makeLessonBundle();
    const seed = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot: path.join(root, 'seed-profile'),
    });
    const matchingLegacy = {
      ...seed.songs?.['lesson:01.01'],
      id: 'legacy-song-id',
      dir: '/selected/SightKick Method - Lesson 01.01',
      liked: true,
      scoreData: {
        expert: { totalNotes: 100, hitNotes: 94, falseHits: 2 },
      },
    };
    const retiredLegacy = {
      ...seed.songs?.['lesson:03.01'],
      id: 'retired-song-id',
      dir: '/selected/SightKick Method - Lesson 03.01 - Old Coordination',
      name: 'Lesson 03.01 — Old Coordination Exercise',
      scoreData: {
        expert: { totalNotes: 80, hitNotes: 70, falseHits: 1 },
      },
    };
    const userDataRoot = path.join(root, 'legacy-uuid-profile');
    const upgraded = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot,
      existingSongs: {
        personal: { id: 'personal', dir: '/selected/personal' },
        'legacy-storage-key': matchingLegacy,
        'retired-storage-key': retiredLegacy,
      } as never,
    });

    expect(Object.keys(upgraded.songs ?? {})).toHaveLength(171);
    expect(
      Object.keys(upgraded.songs ?? {}).filter((id) =>
        id.startsWith('lesson:'),
      ),
    ).toHaveLength(170);
    expect(upgraded.songs?.['legacy-storage-key']).toBeUndefined();
    expect(upgraded.songs?.['retired-storage-key']).toBeUndefined();
    expect(upgraded.songs?.personal?.dir).toBe('/selected/personal');
    expect(upgraded.songs?.['lesson:01.01']?.liked).toBe(true);
    expect(upgraded.songs?.['lesson:01.01']?.scoreData).toEqual(
      matchingLegacy.scoreData,
    );
    expect(upgraded.songIdMigrations).toEqual({
      'legacy-storage-key': 'lesson:01.01',
      'legacy-song-id': 'lesson:01.01',
    });
    expect(upgraded.retiredLessonSongs).toEqual({
      'retired-storage-key': retiredLegacy,
    });

    const relaunched = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot,
      existingSongs: upgraded.songs,
    });

    expect(relaunched.installed).toBe(false);
    expect(relaunched.songs).toEqual(upgraded.songs);
    expect(relaunched.songIdMigrations).toEqual({});
    expect(relaunched.retiredLessonSongs).toEqual({});
  });

  it('does not transfer a score to redesigned content merely because the lesson ID is reused', () => {
    const bundle = makeLessonBundle();
    const seed = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot: path.join(root, 'redesign-seed'),
    });
    const oldContent = {
      ...seed.songs?.['lesson:03.01'],
      id: 'lesson:03.01',
      name: 'Lesson 03.01 — Hi-Hat and Snare Handshake',
      scoreData: {
        expert: { totalNotes: 100, hitNotes: 100, falseHits: 0 },
      },
    };
    const upgraded = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot: path.join(root, 'redesign-profile'),
      existingSongs: { 'lesson:03.01': oldContent } as never,
    });

    expect(upgraded.songs?.['lesson:03.01']?.name).toBe('Lesson 03.01');
    expect(upgraded.songs?.['lesson:03.01']?.scoreData).toBeUndefined();
    expect(upgraded.retiredLessonSongs).toEqual({
      'lesson:03.01': oldContent,
    });
  });

  it('keeps the score with the strongest displayed mastery instead of raw hit ratio', () => {
    const bundle = makeLessonBundle();
    const seed = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot: path.join(root, 'score-merge-seed'),
    });
    const lesson = seed.songs?.['lesson:01.01'];
    const fourStars = {
      ...lesson,
      id: 'legacy-four-stars',
      scoreData: {
        expert: { totalNotes: 100, hitNotes: 80, falseHits: 0 },
      },
    };
    const twoStars = {
      ...lesson,
      id: 'legacy-two-stars',
      scoreData: {
        expert: { totalNotes: 100, hitNotes: 81, falseHits: 50 },
      },
    };
    const upgraded = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot: path.join(root, 'score-merge-profile'),
      existingSongs: {
        'legacy-four-stars': fourStars,
        'legacy-two-stars': twoStars,
      } as never,
    });

    expect(upgraded.songs?.['lesson:01.01']?.scoreData?.expert).toEqual(
      fourStars.scoreData.expert,
    );
  });

  it('moves an unchanged exercise to its renumbered canonical lesson identity', () => {
    const bundle = makeLessonBundle();
    const targetIni = path.join(
      bundle,
      'SightKick Method - Lesson 03.02',
      'song.ini',
    );

    fs.writeFileSync(
      targetIni,
      '[Song]\nname = Lesson 03.02 — Moving Exercise\nartist = Drumroll Method\npro_drums = True\nsk_lesson_id = 03.02\n',
    );

    const legacy = {
      id: 'legacy-moving-id',
      dir: '/selected/SightKick Method - Lesson 01.01 - Moving Exercise',
      name: 'Lesson 01.01 — Moving Exercise',
      sk_lesson_id: '01.01',
      liked: true,
      scoreData: {
        expert: { totalNotes: 100, hitNotes: 92, falseHits: 0 },
      },
    };
    const upgraded = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot: path.join(root, 'renumbered-profile'),
      existingSongs: { 'legacy-moving-storage': legacy } as never,
    });

    expect(upgraded.songIdMigrations).toEqual({
      'legacy-moving-storage': 'lesson:03.02',
      'legacy-moving-id': 'lesson:03.02',
    });
    expect(upgraded.songs?.['lesson:03.02']).toMatchObject({
      name: 'Lesson 03.02 — Moving Exercise',
      liked: true,
      scoreData: legacy.scoreData,
    });
    expect(upgraded.songs?.['lesson:01.01']?.scoreData).toBeUndefined();
    expect(upgraded.retiredLessonSongs).toEqual({});
  });

  it('never removes a personal song merely because its display name resembles a lesson', () => {
    const bundle = makeLessonBundle();
    const personal = {
      id: 'personal-lesson-name',
      dir: '/selected/Lesson 01.01 - My Own Recording',
      name: 'Lesson 01.01 — My Own Recording',
      scoreData: {
        expert: { totalNotes: 20, hitNotes: 18, falseHits: 1 },
      },
    };
    const upgraded = bootstrapLessonLibrary({
      bundledRoot: bundle,
      userDataRoot: path.join(root, 'lesson-name-guard'),
      existingSongs: { 'personal-lesson-name': personal } as never,
    });

    expect(upgraded.songs?.['personal-lesson-name']).toEqual(personal);
    expect(upgraded.retiredLessonSongs).toEqual({});
    expect(Object.keys(upgraded.songs ?? {})).toHaveLength(171);
  });

  it('recovers a previous complete install after an interrupted directory swap, then upgrades', () => {
    const oldBundle = makeLessonBundle(118, 'interrupted-old');
    const newBundle = makeLessonBundle(170, 'interrupted-new');
    const userDataRoot = path.join(root, 'interrupted-profile');
    const first = bootstrapLessonLibrary({
      bundledRoot: oldBundle,
      userDataRoot,
    });
    const privateRoot = first.libraryRoot!;

    fs.renameSync(privateRoot, `${privateRoot}.previous`);
    fs.mkdirSync(`${privateRoot}.installing`, { recursive: true });
    fs.writeFileSync(
      path.join(`${privateRoot}.installing`, 'partial-copy'),
      'partial',
    );

    const recovered = bootstrapLessonLibrary({
      bundledRoot: newBundle,
      userDataRoot,
      existingSongs: first.songs,
    });

    expect(recovered.installed).toBe(true);
    expect(
      Object.keys(recovered.songs ?? {}).filter((id) =>
        id.startsWith('lesson:'),
      ),
    ).toHaveLength(170);
    expect(fs.existsSync(`${privateRoot}.installing`)).toBe(false);
    expect(fs.existsSync(`${privateRoot}.previous`)).toBe(false);
  });

  it('rolls back to the complete old install when the final atomic rename fails', () => {
    const oldBundle = makeLessonBundle(118, 'rollback-old');
    const newBundle = makeLessonBundle(170, 'rollback-new');
    const userDataRoot = path.join(root, 'rollback-profile');
    const first = bootstrapLessonLibrary({
      bundledRoot: oldBundle,
      userDataRoot,
    });
    const privateRoot = first.libraryRoot!;
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(((
      from,
      to,
    ) => {
      if (String(from) === `${privateRoot}.installing`) {
        throw new Error('simulated final rename failure');
      }

      originalRename(from, to);
    }) as typeof fs.renameSync);

    try {
      expect(() =>
        bootstrapLessonLibrary({
          bundledRoot: newBundle,
          userDataRoot,
          existingSongs: first.songs,
        }),
      ).toThrow('simulated final rename failure');
    } finally {
      rename.mockRestore();
    }

    const manifest = JSON.parse(
      fs.readFileSync(path.join(privateRoot, 'manifest.json'), 'utf-8'),
    );

    expect(manifest.lessonCount).toBe(118);
    expect(fs.existsSync(`${privateRoot}.installing`)).toBe(false);
    expect(fs.existsSync(`${privateRoot}.previous`)).toBe(false);
  });
});
