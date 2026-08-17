import fs from 'fs';
import { StorageSchema } from '../../types';
import { isUnderDirectory, buildSongFromDir, toSong } from '../util';
import { appState } from '../AppState';
import { backfillSongCovers } from '../songCover';

function isLessonDirectory(dir: string): boolean {
  return dir.split(/[\\/]/).at(-1)?.startsWith('SightKick Method - ') ?? false;
}

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
    const storedSongs = allSongs
      ? Object.values(allSongs)
          .filter((s) =>
            readableRoots.some((root) => isUnderDirectory(s.dir, root)),
          )
          .filter((s) => fs.existsSync(s.dir))
      : [];
    const updatedDirectories = await backfillSongCovers(
      storedSongs
        .filter((song) => !isLessonDirectory(song.dir))
        .map((song) => ({
          dir: song.dir,
          artist: song.artist,
          title: song.name,
          album: song.album,
        })),
    );
    const refreshedSongs = new Map<string, StorageSchema['songs'][string]>();

    for (const song of storedSongs) {
      if (updatedDirectories.has(song.dir) || !song.albumCover) {
        const rebuilt = buildSongFromDir(song.dir, song);

        if (rebuilt) {
          refreshedSongs.set(song.dir, rebuilt);
        }
      }
    }

    if (refreshedSongs.size > 0 && allSongs) {
      const updatedSongs = { ...allSongs };

      for (const song of storedSongs) {
        const rebuilt = refreshedSongs.get(song.dir);

        if (!rebuilt) {
          continue;
        }

        updatedSongs[song.id] = rebuilt;
      }

      appState.store.set('songs', updatedSongs);
    }

    const songs = storedSongs.map((song) =>
      toSong(refreshedSongs.get(song.dir) ?? song),
    );

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
