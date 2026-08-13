import { SngStream } from '@eliwhite/parse-sng';
import path from 'path';
import fs from 'fs';
import { appState } from '../AppState';
import { StorageSchema } from '../../types';
import {
  buildSongFromDir,
  isUnderDirectory,
  toSong,
  writeSongIdFile,
} from '../util';

type Props = {
  url: string;
  md5: string;
  name: string;
  artist: string;
  charter: string;
  chartSource?: 'chorus-encore';
  reviewed?: boolean;
};

export async function downloadSong(
  event: Electron.IpcMainEvent,
  { url, md5, name, artist, charter, chartSource, reviewed }: Props,
) {
  let outputDir: string | undefined;
  let outputCreated = false;

  try {
    if (chartSource !== 'chorus-encore' || reviewed !== true) {
      throw new Error(
        'Only quality-reviewed Chorus Encore drum charts can be downloaded',
      );
    }

    if (new URL(url).hostname !== 'files.enchor.us') {
      throw new Error('Download URL is not an approved Chorus Encore package');
    }

    const lastOpenedPath = appState.store.get('lastOpenedPath') as
      | string
      | undefined;

    if (!lastOpenedPath) {
      event.reply('download-song', {
        success: false,
        md5,
        error: 'No folder selected',
      });

      return;
    }

    const folderName = `${artist} - ${name} (${charter})`.replace(
      /[\\/:*?"<>|]/g,
      '',
    );

    outputDir = path.join(lastOpenedPath, folderName);

    const songs = (appState.store.get('songs') as StorageSchema['songs']) ?? {};

    if (songs[md5] || fs.existsSync(outputDir)) {
      event.reply('download-song', {
        success: false,
        md5,
        alreadyExists: true,
      });

      return;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(uint8);
        controller.close();
      },
    });
    const sngStream = new SngStream(stream, { generateSongIni: true });
    const files: { name: string; data: Buffer }[] = [];

    await new Promise<void>((resolve, reject) => {
      sngStream.on('error', reject);
      sngStream.on(
        'file',
        async (
          fileName: string,
          fileStream: ReadableStream<Uint8Array>,
          nextFile: (() => void) | null,
        ) => {
          const reader = fileStream.getReader();
          const chunks: Uint8Array[] = [];
          let result = await reader.read();

          while (!result.done) {
            chunks.push(result.value);
            result = await reader.read();
          }

          const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
          const merged = Buffer.alloc(totalLen);
          let offset = 0;

          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }

          files.push({ name: fileName, data: merged });

          if (nextFile) {
            nextFile();
          } else {
            resolve();
          }
        },
      );
      sngStream.start();
    });

    fs.mkdirSync(outputDir, { recursive: true });
    outputCreated = true;

    for (const file of files) {
      const dest = path.join(outputDir, file.name);

      if (!isUnderDirectory(dest, outputDir)) {
        throw new Error(`Unsafe file path in archive: ${file.name}`);
      }

      fs.writeFileSync(dest, new Uint8Array(file.data));
    }

    writeSongIdFile(outputDir, md5);

    const songData = buildSongFromDir(outputDir, { id: md5 });

    if (!songData) {
      throw new Error('Failed to parse downloaded song');
    }

    if (songData.audio.length === 0) {
      throw new Error('Downloaded chart has no playable audio file');
    }

    if (!songData.drumDifficulties?.length) {
      throw new Error('Downloaded chart has no playable drum part');
    }

    appState.store.set(`songs.${md5}`, songData);
    event.reply('download-song', {
      success: true,
      md5,
      song: toSong({
        ...songData,
        updatedAt: fs.statSync(outputDir).mtime.toISOString(),
      }),
    });
  } catch (err) {
    // A partial/failed unpack must not leave a folder behind: `outputDir`'s
    // mere existence is what the top-of-function `alreadyExists` gate keys
    // on, so an orphaned folder would silently and permanently block every
    // future retry of this exact song without ever re-attempting the fetch.
    if (outputCreated && outputDir && fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }

    event.reply('download-song', {
      success: false,
      md5,
      error: String(err),
    });
  }
}
