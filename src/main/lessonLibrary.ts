import fs from 'fs';
import path from 'path';
import { ScoreData, SongData, StorageSchema } from '../types';
import { calculateAccuracy, getStarRating } from '../renderer/scoring';
import { buildSongFromDir, stableLessonSongId } from './util';

/** The app-private copy is deliberately separate from a musician's library. */
export const DESKTOP_LESSON_LIBRARY_FOLDER = 'Drumroll Lessons';

interface LessonManifestSong {
  id: string;
  drumDifficulties?: SongData['drumDifficulties'];
}

interface LessonManifestEntry {
  song: LessonManifestSong;
}

interface LessonManifest {
  version: 1;
  lessonCount: number;
  lessons: LessonManifestEntry[];
}

export interface LessonBootstrapResult {
  libraryRoot?: string;
  songs?: StorageSchema['songs'];
  /**
   * Legacy song IDs which describe the exact same authored exercise as a
   * canonical bundled lesson. Main-process stores keyed by song ID use this
   * map to move run history and goals without guessing across redesigned
   * curriculum content.
   */
  songIdMigrations?: Record<string, string>;
  /**
   * Superseded lesson metadata which has no exact exercise in the current
   * curriculum. It is removed from the active library, but retained by the
   * profile as an audit/archive surface so an upgrade never destroys history.
   */
  retiredLessonSongs?: StorageSchema['songs'];
  installed: boolean;
  reason?: 'bundle-missing';
}

export interface BootstrapLessonLibraryOptions {
  bundledRoot: string;
  userDataRoot: string;
  existingLibraryRoot?: string;
  existingSongs?: StorageSchema['songs'];
}

function lessonManifestPath(root: string): string {
  return path.join(root, 'manifest.json');
}

function installingLibraryPath(root: string): string {
  return `${root}.installing`;
}

function previousLibraryPath(root: string): string {
  return `${root}.previous`;
}

function readLessonManifest(root: string): LessonManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(lessonManifestPath(root), 'utf-8'),
    );

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { version?: unknown }).version !== 1 ||
      !Number.isInteger((parsed as { lessonCount?: unknown }).lessonCount) ||
      !Array.isArray((parsed as { lessons?: unknown }).lessons)
    ) {
      return undefined;
    }

    const manifest = parsed as LessonManifest;

    if (manifest.lessonCount !== manifest.lessons.length) {
      return undefined;
    }

    const ids = manifest.lessons.map((entry) => entry.song?.id);

    if (
      ids.some((id) => !/^lesson:\d{2}\.\d{2}$/.test(id)) ||
      new Set(ids).size !== ids.length
    ) {
      return undefined;
    }

    return manifest;
  } catch {
    return undefined;
  }
}

function lessonDirectories(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort((left, right) => left.localeCompare(right));
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

function manifestsMatch(left: LessonManifest, right: LessonManifest): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function scanBundledLessons(
  root: string,
  manifest: LessonManifest,
  options: { allowPersonalSongs?: boolean } = {},
): StorageSchema['songs'] {
  const expectedIds = new Set(manifest.lessons.map((entry) => entry.song.id));
  const scannedSongs = lessonDirectories(root).map((dir) =>
    buildSongFromDir(dir, {
      drumDifficulties: ['expert'],
    }),
  );
  const songs = options.allowPersonalSongs
    ? scannedSongs.filter(
        (song): song is SongData => song !== null && expectedIds.has(song.id),
      )
    : scannedSongs;

  if (songs.length !== manifest.lessonCount) {
    throw new Error(
      `Bundled lesson library is incomplete: expected ${manifest.lessonCount} folders, found ${songs.length}.`,
    );
  }

  if (songs.some((song) => !song)) {
    throw new Error('Bundled lesson library contains an invalid song folder.');
  }

  const validSongs = songs as SongData[];
  const scannedIds = validSongs.map((song) => song.id);

  if (
    new Set(scannedIds).size !== manifest.lessonCount ||
    scannedIds.some((id) => !expectedIds.has(id))
  ) {
    throw new Error(
      'Bundled lesson library does not match its stable lesson-ID manifest.',
    );
  }

  return Object.fromEntries(validSongs.map((song) => [song.id, song]));
}

function storedLessonId(storageId: string, song: SongData): string | undefined {
  const parsed = stableLessonSongId(song.sk_lesson_id);

  if (parsed) {
    return parsed;
  }

  return /^lesson:\d{2}\.\d{2}$/.test(storageId)
    ? storageId
    : /^lesson:\d{2}\.\d{2}$/.test(song.id)
    ? song.id
    : undefined;
}

/**
 * The original 118-lesson library stored random UUID song IDs and reused a
 * unit title in `sk_lesson_title`. The exercise name is the only stable,
 * truthful content identity across that schema and the redesigned 170-lesson
 * curriculum. Strip the display number so an unchanged exercise can move to
 * a new chain position without losing the musician's evidence.
 */
function lessonExerciseIdentity(song: SongData): string | undefined {
  const raw = song.name?.trim();

  if (!raw) {
    return undefined;
  }

  const normalized = raw
    .normalize('NFKD')
    .replace(/^lesson\s+\d{2}\.\d{2}\s*(?:[-–—:]\s*)?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return normalized || undefined;
}

function scoreQuality(score: ScoreData | undefined) {
  if (!score) {
    return [-1, -1, -Infinity] as const;
  }

  const total = Number(score.totalNotes ?? 0);
  const hits = Number(score.hitNotes ?? 0);
  const falseHits = Number(score.falseHits ?? 0);

  return [
    getStarRating(score),
    calculateAccuracy(score),
    hits,
    -falseHits,
    total,
  ] as const;
}

function compareScoreQuality(
  left: ScoreData | undefined,
  right: ScoreData | undefined,
): number {
  const leftQuality = scoreQuality(left);
  const rightQuality = scoreQuality(right);

  for (let index = 0; index < leftQuality.length; index += 1) {
    if (leftQuality[index] !== rightQuality[index]) {
      return leftQuality[index] - rightQuality[index];
    }
  }

  return 0;
}

function mergeScoreData(
  candidates: readonly SongData[],
): SongData['scoreData'] | undefined {
  const merged: NonNullable<SongData['scoreData']> = {};

  for (const candidate of candidates) {
    for (const [difficulty, score] of Object.entries(
      candidate.scoreData ?? {},
    ) as Array<[keyof NonNullable<SongData['scoreData']>, ScoreData]>) {
      const key = difficulty as keyof NonNullable<SongData['scoreData']>;
      const current = merged[key];

      if (!current || compareScoreQuality(score, current) > 0) {
        merged[key] = score;
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

interface ReconciledLessons {
  activeSongs: StorageSchema['songs'];
  songIdMigrations: Record<string, string>;
  retiredLessonSongs: StorageSchema['songs'];
}

/**
 * Replaces every parsed legacy lesson record with the canonical packaged
 * record. Musician-owned fields move only when the exercise name is an exact
 * normalized match; an ID alone is not enough because kb.2 deliberately
 * redesigned and renumbered much of the old curriculum.
 */
function reconcileLessons(
  existingSongs: StorageSchema['songs'],
  installedLessons: StorageSchema['songs'],
): ReconciledLessons {
  const existingEntries = Object.entries(existingSongs);
  const existingLessonEntries = existingEntries.filter(([storageId, song]) =>
    storedLessonId(storageId, song),
  );
  const personalSongs = Object.fromEntries(
    existingEntries.filter(
      ([storageId, song]) => !storedLessonId(storageId, song),
    ),
  );
  const candidatesByExercise = new Map<
    string,
    Array<{ storageId: string; song: SongData }>
  >();
  const identitylessCandidatesByLessonId = new Map<
    string,
    Array<{ storageId: string; song: SongData }>
  >();

  for (const [storageId, song] of existingLessonEntries) {
    const identity = lessonExerciseIdentity(song);

    if (identity) {
      const candidates = candidatesByExercise.get(identity) ?? [];

      candidates.push({ storageId, song });
      candidatesByExercise.set(identity, candidates);
    } else {
      const lessonId = storedLessonId(storageId, song);

      if (lessonId) {
        const candidates = identitylessCandidatesByLessonId.get(lessonId) ?? [];

        candidates.push({ storageId, song });
        identitylessCandidatesByLessonId.set(lessonId, candidates);
      }
    }
  }

  const matchedStorageIds = new Set<string>();
  const songIdMigrations: Record<string, string> = {};
  const lessons = Object.fromEntries(
    Object.values(installedLessons).map((lesson) => {
      const identity = lessonExerciseIdentity(lesson);
      const matches = identity
        ? candidatesByExercise.get(identity) ?? []
        : identitylessCandidatesByLessonId.get(lesson.id) ?? [];
      const scoreData = mergeScoreData(matches.map(({ song }) => song));
      const hasLiked = matches.some(({ song }) => song.liked !== undefined);
      const liked = matches.some(({ song }) => song.liked === true);

      for (const { storageId, song } of matches) {
        matchedStorageIds.add(storageId);

        if (storageId !== lesson.id) {
          songIdMigrations[storageId] = lesson.id;
        }

        if (song.id !== lesson.id) {
          songIdMigrations[song.id] = lesson.id;
        }
      }

      return [
        lesson.id,
        {
          ...lesson,
          ...(hasLiked ? { liked } : {}),
          ...(scoreData ? { scoreData } : {}),
        },
      ];
    }),
  );
  const retiredLessonSongs = Object.fromEntries(
    existingLessonEntries.filter(
      ([storageId]) => !matchedStorageIds.has(storageId),
    ),
  );

  return {
    activeSongs: { ...personalSongs, ...lessons },
    songIdMigrations,
    retiredLessonSongs,
  };
}

function isCompleteLessonLibrary(root: string): boolean {
  const manifest = readLessonManifest(root);

  if (!manifest) {
    return false;
  }

  try {
    scanBundledLessons(root, manifest, { allowPersonalSongs: true });

    return true;
  } catch {
    return false;
  }
}

function personalSongDirectories(
  libraryRoot: string,
  bundledManifest: LessonManifest,
): string[] {
  const lessonIds = new Set(
    bundledManifest.lessons.map((entry) => entry.song.id),
  );

  return lessonDirectories(libraryRoot).filter((dir) => {
    const song = buildSongFromDir(dir, {
      drumDifficulties: ['expert'],
    });

    return !song || !lessonIds.has(song.id);
  });
}

/**
 * Resolves the only two crash windows in the directory swap below. A `.previous`
 * directory means the old complete install was retained until the new one was
 * already in place. A partial `.installing` directory is never made live.
 */
function recoverInterruptedInstall(libraryRoot: string): void {
  const installingRoot = installingLibraryPath(libraryRoot);
  const previousRoot = previousLibraryPath(libraryRoot);
  const hasLibrary = fs.existsSync(libraryRoot);
  const hasPrevious = fs.existsSync(previousRoot);

  if (!hasLibrary && hasPrevious) {
    fs.renameSync(previousRoot, libraryRoot);
  } else if (hasLibrary && hasPrevious) {
    if (isCompleteLessonLibrary(libraryRoot)) {
      fs.rmSync(previousRoot, { recursive: true, force: true });
    } else {
      fs.rmSync(libraryRoot, { recursive: true, force: true });
      fs.renameSync(previousRoot, libraryRoot);
    }
  }

  fs.rmSync(installingRoot, { recursive: true, force: true });
}

function replaceLessonLibrary(
  bundledRoot: string,
  bundledManifest: LessonManifest,
  libraryRoot: string,
): void {
  const installingRoot = installingLibraryPath(libraryRoot);
  const previousRoot = previousLibraryPath(libraryRoot);
  const hadLibrary = fs.existsSync(libraryRoot);
  const personalDirectories = hadLibrary
    ? personalSongDirectories(libraryRoot, bundledManifest)
    : [];

  fs.mkdirSync(path.dirname(libraryRoot), { recursive: true });
  fs.rmSync(installingRoot, { recursive: true, force: true });

  try {
    fs.cpSync(bundledRoot, installingRoot, {
      recursive: true,
      errorOnExist: true,
    });

    for (const sourceDir of personalDirectories) {
      const destinationDir = path.join(
        installingRoot,
        path.basename(sourceDir),
      );

      if (fs.existsSync(destinationDir)) {
        throw new Error(
          `Cannot preserve imported song folder during lesson refresh: ${path.basename(
            sourceDir,
          )}.`,
        );
      }

      fs.cpSync(sourceDir, destinationDir, {
        recursive: true,
        errorOnExist: true,
      });
    }

    const copiedManifest = readLessonManifest(installingRoot);

    if (!copiedManifest || !manifestsMatch(copiedManifest, bundledManifest)) {
      throw new Error(
        'Copied lesson library manifest does not match the bundle.',
      );
    }

    // Validate every copied folder before the old install is moved.
    scanBundledLessons(installingRoot, copiedManifest, {
      allowPersonalSongs: true,
    });
  } catch (error) {
    fs.rmSync(installingRoot, { recursive: true, force: true });

    throw error;
  }

  if (hadLibrary) {
    fs.renameSync(libraryRoot, previousRoot);
  }

  try {
    fs.renameSync(installingRoot, libraryRoot);
  } catch (error) {
    if (hadLibrary && fs.existsSync(previousRoot)) {
      fs.renameSync(previousRoot, libraryRoot);
    }

    fs.rmSync(installingRoot, { recursive: true, force: true });

    throw error;
  }

  fs.rmSync(previousRoot, { recursive: true, force: true });
}

/**
 * Installs the packaged lesson set into the app-private profile directory. It
 * never reads, copies, changes, or replaces the musician's selected library.
 * Existing songs are merged with stable lesson IDs so upgrades also receive
 * new curriculum content. A failed or missing bundle leaves the profile
 * untouched.
 */
export function bootstrapLessonLibrary({
  bundledRoot,
  userDataRoot,
  existingSongs = {},
}: BootstrapLessonLibraryOptions): LessonBootstrapResult {
  const bundledManifest = readLessonManifest(bundledRoot);

  if (!bundledManifest) {
    return { installed: false, reason: 'bundle-missing' };
  }

  // Source validation happens before recovery or replacement can touch the
  // current app-private install.
  scanBundledLessons(bundledRoot, bundledManifest);

  const libraryRoot = path.join(userDataRoot, DESKTOP_LESSON_LIBRARY_FOLDER);

  recoverInterruptedInstall(libraryRoot);

  const installedManifest = readLessonManifest(libraryRoot);
  let installedLessons: StorageSchema['songs'] | undefined;
  let needsRefresh = !installedManifest;

  if (installedManifest && manifestsMatch(installedManifest, bundledManifest)) {
    try {
      installedLessons = scanBundledLessons(libraryRoot, installedManifest, {
        allowPersonalSongs: true,
      });
    } catch {
      needsRefresh = true;
    }
  } else if (installedManifest) {
    needsRefresh = true;
  }

  if (needsRefresh) {
    replaceLessonLibrary(bundledRoot, bundledManifest, libraryRoot);
  }

  const currentManifest = readLessonManifest(libraryRoot);

  if (!currentManifest) {
    throw new Error('Installed lesson library manifest is unreadable.');
  }

  const lessons =
    installedLessons ??
    scanBundledLessons(libraryRoot, currentManifest, {
      allowPersonalSongs: true,
    });
  const reconciled = reconcileLessons(existingSongs, lessons);

  return {
    libraryRoot,
    songs: reconciled.activeSongs,
    songIdMigrations: reconciled.songIdMigrations,
    retiredLessonSongs: reconciled.retiredLessonSongs,
    installed: needsRefresh,
  };
}
