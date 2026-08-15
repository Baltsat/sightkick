import { StorageSchema } from '../../types';
import path from 'path';
import fs from 'fs';
import { appState } from '../AppState';
import { toSong } from '../util';
import { validateSourceSongForLaunch } from '../playability';

export function loadSong(event: Electron.IpcMainEvent, id: string) {
  try {
    const songData = (appState.store.get('songs') as StorageSchema['songs'])[
      id
    ];

    if (!songData) {
      throw new Error(`Song "${id}" not found`);
    }

    validateSourceSongForLaunch(songData);

    const notesFile = path.join(
      songData.dir,
      songData.format === 'mid' ? 'notes.mid' : 'notes.chart',
    );
    const fileData = fs.readFileSync(notesFile);
    const stickingFile = path.join(songData.dir, 'sticking.json');
    const stickingData = fs
      .statSync(stickingFile, { throwIfNoEntry: false })
      ?.isFile()
      ? JSON.parse(fs.readFileSync(stickingFile, 'utf8'))
      : undefined;

    event.reply('load-song', {
      data: toSong(songData),
      fileData,
      ...(stickingData ? { stickingData } : {}),
    });
  } catch (error) {
    event.reply('load-song', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
