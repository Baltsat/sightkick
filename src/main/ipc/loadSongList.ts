import fs from 'fs';
import { StorageSchema } from '../../types';
import { isUnderDirectory, toSong } from '../util';
import { appState } from '../AppState';

export async function loadSongList(event: Electron.IpcMainEvent) {
  try {
    const lastOpenedPath = appState.store.get('lastOpenedPath') as
      | string
      | undefined;
    const readableRoots = appState
      .getLibraryRoots()
      .filter((root) => fs.existsSync(root));

    if (readableRoots.length === 0) {
      event.reply('load-song-list', { songs: [], lastOpenedPath: null });

      return;
    }

    const allSongs = appState.store.get('songs') as
      | StorageSchema['songs']
      | undefined;
    const songs = allSongs
      ? Object.values(allSongs)
          .filter((s) =>
            readableRoots.some((root) => isUnderDirectory(s.dir, root)),
          )
          .filter((s) => fs.existsSync(s.dir))
          .map((s) => toSong(s))
      : [];

    event.reply('load-song-list', {
      songs,
      lastOpenedPath:
        lastOpenedPath && fs.existsSync(lastOpenedPath)
          ? lastOpenedPath
          : readableRoots[0],
    });
  } catch (error) {
    event.reply('load-song-list', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
