import fs from 'fs';
import path from 'path';
import { IpcMainEvent } from 'electron';
import type { IpcLibraryCandidatesResponse } from '../../types';
import {
  parseYandexPlaylistCandidates,
  YANDEX_DRUMS_SOURCE_FILE,
  YANDEX_FAVORITES_SOURCE_FILE,
} from '../../library-sources/yandex';

export function loadYandexCandidatesFromFiles(
  drumsSourcePath: string,
  favoritesSourcePath: string,
): IpcLibraryCandidatesResponse {
  return {
    yandex: {
      drums: parseYandexPlaylistCandidates(
        JSON.parse(fs.readFileSync(drumsSourcePath, 'utf-8')) as unknown,
      ),
      favorites: parseYandexPlaylistCandidates(
        JSON.parse(fs.readFileSync(favoritesSourcePath, 'utf-8')) as unknown,
      ),
    },
  };
}

/**
 * Returns playlist rows as metadata candidates only. This handler does not
 * fetch media, resolve streams, or create playable Song records.
 */
export function loadLibraryCandidates(
  event: IpcMainEvent,
  sourceDirectory: string,
): void {
  try {
    event.reply(
      'load-library-candidates',
      loadYandexCandidatesFromFiles(
        path.join(sourceDirectory, YANDEX_DRUMS_SOURCE_FILE),
        path.join(sourceDirectory, YANDEX_FAVORITES_SOURCE_FILE),
      ),
    );
  } catch (error) {
    event.reply('load-library-candidates', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
