import { Difficulty } from 'scan-chart';
import { Song } from '../../types';

export interface LessonManifestEntry {
  song: Song;
  chart: string;
  sticking?: string;
  files: string[];
}

export interface LessonManifest {
  version: 1;
  lessonCount: number;
  totalBytes: number;
  maxFileBytes: number;
  lessons: LessonManifestEntry[];
}

export interface StoredWebSong {
  id: string;
  song: Song;
  files: Record<string, Blob>;
}

const DB_NAME = 'drumroll-web';
const STORE_NAME = 'songs';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadStoredSongs(): Promise<StoredWebSong[]> {
  const db = await openDatabase();
  const result = await requestResult(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(),
  );

  db.close();

  return result as StoredWebSong[];
}

export async function loadStoredSong(
  id: string,
): Promise<StoredWebSong | undefined> {
  const db = await openDatabase();
  const result = await requestResult(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id),
  );

  db.close();

  return result as StoredWebSong | undefined;
}

export async function saveStoredSong(song: StoredWebSong): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readwrite');

  transaction.objectStore(STORE_NAME).put(song);

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export function hydrateStoredSong(stored: StoredWebSong): Song {
  const cover = Object.entries(stored.files).find(([name]) =>
    /^(album|cover)\.(jpe?g|png|webp)$/i.test(name),
  );

  return {
    ...stored.song,
    albumCover: cover ? URL.createObjectURL(cover[1]) : stored.song.albumCover,
    audio: Object.entries(stored.files)
      .filter(([name]) => /\.(ogg|mp3|wav|flac)$/i.test(name))
      .map(([name, blob]) => ({ name, src: URL.createObjectURL(blob) })),
  };
}

function parseIni(raw: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const source of raw.split(/\r?\n/)) {
    const line = source.trim();

    if (
      !line ||
      line.startsWith(';') ||
      line.startsWith('#') ||
      line.startsWith('[')
    ) {
      continue;
    }

    const split = line.indexOf('=');

    if (split === -1) {
      continue;
    }

    const key = line.slice(0, split).trim();
    const value = line
      .slice(split + 1)
      .trim()
      .replace(/^"|"$/g, '');

    values[key] = value;
  }

  return values;
}

function commonRoot(paths: string[]): string {
  const first = paths[0]?.split('/')[0];

  return first && paths.every((path) => path.startsWith(`${first}/`))
    ? `${first}/`
    : '';
}

export async function finalizeArchiveSong(
  jobId: string,
  archiveFiles: Map<string, Uint8Array>,
): Promise<StoredWebSong> {
  const root = commonRoot([...archiveFiles.keys()]);
  const files = Object.fromEntries(
    [...archiveFiles.entries()].map(([path, bytes]) => [
      path.slice(root.length),
      new Blob([
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ]),
    ]),
  );
  const iniBlob = files['song.ini'];

  if (!iniBlob || (!files['notes.mid'] && !files['notes.chart'])) {
    throw new Error(
      'The transcriber result is missing song.ini or a chart file.',
    );
  }

  const id = `import:${jobId}`;
  const format = files['notes.mid'] ? 'mid' : 'chart';
  const song: Song = {
    id,
    dir: `indexeddb:${id}`,
    name: 'Imported song',
    artist: '',
    album: '',
    charter: '',
    genre: '',
    year: '',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 0,
    format,
    audio: [],
    drumDifficulties: ['easy', 'medium', 'hard', 'expert'] as Difficulty[],
  };
  const ini = parseIni(await iniBlob.text());

  return {
    id,
    files,
    song: {
      ...song,
      name: ini.name || song.name,
      artist: ini.artist || '',
      album: ini.album || '',
      charter: ini.charter || '',
      genre: ini.genre || '',
      year: ini.year || '',
      proDrums: ini.pro_drums === 'True',
      fiveLaneDrums: ini.five_lane_drums === 'True',
      delaySeconds: (Number(ini.delay) || 0) / 1000,
      drumDifficulty: Math.max(0, Number(ini.diff_drums) || 0),
    },
  };
}
