import fs from 'fs';
import path from 'path';
import { SongData, StorageSchema } from '../types';
import { buildSongFromDir } from './util';

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
  existingSongs: StorageSchema['songs'] = {},
): StorageSchema['songs'] {
  const expectedIds = new Set(manifest.lessons.map((entry) => entry.song.id));
  const directories = lessonDirectories(root);

  if (directories.length !== manifest.lessonCount) {
    throw new Error(
      `Bundled lesson library is incomplete: expected ${manifest.lessonCount} folders, found ${directories.length}.`,
    );
  }

  const songs = directories.map((dir) => {
    const scanned = buildSongFromDir(dir, {
      drumDifficulties: ['expert'],
    });
    const existing = scanned ? existingSongs[scanned.id] : undefined;

    if (!scanned || !existing) {
      return scanned;
    }

    // Lesson files are app-owned, while these fields are musician-owned. Keep
    // earned scores and explicit likes when a packaged lesson is refreshed.
    return {
      ...scanned,
      ...(existing.liked !== undefined ? { liked: existing.liked } : {}),
      ...(existing.scoreData !== undefined
        ? { scoreData: existing.scoreData }
        : {}),
    };
  });

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

function isCompleteLessonLibrary(root: string): boolean {
  const manifest = readLessonManifest(root);

  if (!manifest) {
    return false;
  }

  try {
    scanBundledLessons(root, manifest);

    return true;
  } catch {
    return false;
  }
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

  fs.mkdirSync(path.dirname(libraryRoot), { recursive: true });
  fs.rmSync(installingRoot, { recursive: true, force: true });

  try {
    fs.cpSync(bundledRoot, installingRoot, {
      recursive: true,
      errorOnExist: true,
    });

    const copiedManifest = readLessonManifest(installingRoot);

    if (!copiedManifest || !manifestsMatch(copiedManifest, bundledManifest)) {
      throw new Error(
        'Copied lesson library manifest does not match the bundle.',
      );
    }

    // Validate every copied folder before the old install is moved.
    scanBundledLessons(installingRoot, copiedManifest);
  } catch (error) {
    fs.rmSync(installingRoot, { recursive: true, force: true });

    throw error;
  }

  const hadLibrary = fs.existsSync(libraryRoot);

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
      installedLessons = scanBundledLessons(
        libraryRoot,
        installedManifest,
        existingSongs,
      );
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
    scanBundledLessons(libraryRoot, currentManifest, existingSongs);

  return {
    libraryRoot,
    songs: { ...existingSongs, ...lessons },
    installed: needsRefresh,
  };
}
