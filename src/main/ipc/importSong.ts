import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { dialog, IpcMainEvent } from 'electron';
import {
  IpcImportSongPreview,
  IpcImportSongRequest,
  IpcImportSongResponse,
  IpcSelectImportSongResponse,
  Song,
  SongData,
  StorageSchema,
} from '../../types';
import { appState } from '../AppState';
import { ingestSongCover, previewSongCover } from '../songCover';
import {
  buildSongFromDir,
  hasDuplicatedAutoCharter,
  isUnderDirectory,
  toSong,
  writeSongIdFile,
} from '../util';
import {
  persistPlayabilityEvidence,
  validatePlayabilityEvidence,
} from '../playability';

export function validateSongDir(dir: string): SongData {
  const song = buildSongFromDir(dir);

  if (!song) {
    throw new Error(
      'Choose a folder with song.ini and notes.mid or notes.chart',
    );
  }

  if (song.audio.length === 0) {
    throw new Error('This folder has no playable audio file');
  }

  if (!song.drumDifficulties?.length) {
    throw new Error('This chart has no playable drum difficulty');
  }

  return song;
}

export async function previewPreparedSong(
  sourceDir: string,
  options: Pick<IpcImportSongPreview, 'thumbnailUrl'> = {},
): Promise<IpcImportSongPreview> {
  const stored = validateSongDir(sourceDir);
  const song = toSong(stored);
  const cover = await previewSongCover(sourceDir);

  return {
    sourceDir,
    name: song.name,
    artist: song.artist,
    album: song.album,
    charter: song.charter,
    autoChartTool: song.autoChartTool,
    chartFormat: song.format,
    audioCount: song.audio.length,
    drumDifficulties: song.drumDifficulties ?? [],
    albumCoverDataUrl: cover.dataUrl,
    thumbnailUrl: options.thumbnailUrl,
    coverSource: cover.source,
  };
}

function destinationName(song: SongData, sourceDir: string): string {
  const sourceName = path.basename(sourceDir);
  const base =
    [song.artist, song.name].filter(Boolean).join(' - ') || sourceName;
  const safe = base.replace(/[\\/:*?"<>|]/g, '').trim();

  return safe.slice(0, 180) || 'Imported song';
}

function copySongDirectory(sourceDir: string, destinationDir: string): void {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error('Song folders with symbolic links are not supported');
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destination);
      copySongDirectory(source, destination);
    } else if (entry.isFile()) {
      fs.copyFileSync(source, destination);
    }
  }
}

function normalizeImportedProvenance(dir: string, song: SongData): void {
  if (!hasDuplicatedAutoCharter(song)) {
    return;
  }

  const iniPath = path.join(dir, 'song.ini');
  const original = fs.readFileSync(iniPath, 'utf-8');
  const normalized = original.replace(/^(\s*charter\s*=\s*).*$/im, '$1');

  fs.writeFileSync(iniPath, normalized);
}

export async function selectImportSong(event: IpcMainEvent): Promise<void> {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choose a prepared Clone Hero song folder',
      message: 'Choose a folder containing song.ini, a chart and audio',
    });

    if (result.canceled || !result.filePaths[0]) {
      event.reply('select-import-song', { cancelled: true });

      return;
    }

    const sourceDir = result.filePaths[0];
    const response: IpcSelectImportSongResponse = {
      preview: await previewPreparedSong(sourceDir),
    };

    event.reply('select-import-song', response);
  } catch (error) {
    event.reply('select-import-song', {
      error: error instanceof Error ? error.message : String(error),
    } satisfies IpcSelectImportSongResponse);
  }
}

export async function importPreparedSong({
  sourceDir,
  artworkUrl,
  playability,
}: IpcImportSongRequest): Promise<Song> {
  let outputDir: string | undefined;
  let outputCreated = false;

  try {
    const libraryRoot = appState.store.get('lastOpenedPath') as
      | string
      | undefined;

    if (!libraryRoot) {
      throw new Error('Select a library folder before importing');
    }

    if (isUnderDirectory(sourceDir, libraryRoot)) {
      throw new Error('This song is already inside the selected library');
    }

    if (isUnderDirectory(libraryRoot, sourceDir)) {
      throw new Error('The selected song folder cannot contain the library');
    }

    const sourceSong = validateSongDir(sourceDir);
    const folderName = destinationName(sourceSong, sourceDir);

    outputDir = path.join(libraryRoot, folderName);

    if (!isUnderDirectory(outputDir, libraryRoot)) {
      throw new Error('Invalid import destination');
    }

    if (fs.existsSync(outputDir)) {
      throw new Error(`A library folder named "${folderName}" already exists`);
    }

    fs.mkdirSync(outputDir);
    outputCreated = true;
    copySongDirectory(sourceDir, outputDir);
    normalizeImportedProvenance(outputDir, sourceSong);
    await ingestSongCover(outputDir, artworkUrl);

    const id = randomUUID();

    writeSongIdFile(outputDir, id);

    let songData = buildSongFromDir(outputDir, { id });

    if (!songData) {
      throw new Error('Imported files could not be read as a song');
    }

    if (playability) {
      validatePlayabilityEvidence(outputDir, playability);
      persistPlayabilityEvidence(outputDir, playability);
      songData = buildSongFromDir(outputDir, { id });

      if (!songData?.playability) {
        throw new Error('Playable proof could not be persisted with the song');
      }
    }

    if (songData.playability) {
      validatePlayabilityEvidence(outputDir, songData.playability);
    }

    const songs = (appState.store.get('songs') as StorageSchema['songs']) ?? {};

    appState.store.set('songs', { ...songs, [id]: songData });

    return toSong({
      ...songData,
      updatedAt: fs.statSync(outputDir).mtime.toISOString(),
    });
  } catch (error) {
    if (outputCreated && outputDir && fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }

    throw error;
  }
}

export async function importSong(
  event: IpcMainEvent,
  request: IpcImportSongRequest,
): Promise<void> {
  try {
    const song = await importPreparedSong(request);

    event.reply('import-song', {
      success: true,
      song,
    } satisfies IpcImportSongResponse);
  } catch (error) {
    event.reply('import-song', {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies IpcImportSongResponse);
  }
}
