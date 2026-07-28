import fs from 'fs';
import path from 'path';
import { nativeImage } from 'electron';
import { parseFile } from 'music-metadata';

export type SongCoverSource = 'existing' | 'embedded' | 'none';

const COVER_EXTENSIONS = ['png', 'jpg', 'jpeg'];
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.opus']);

function existingCoverPath(dir: string): string | undefined {
  return COVER_EXTENSIONS.map((extension) =>
    path.join(dir, `album.${extension}`),
  ).find((file) => fs.existsSync(file));
}

function imageDataUrl(data: Uint8Array<ArrayBufferLike>): string | undefined {
  const image = nativeImage.createFromBuffer(Buffer.from(data));

  return image.isEmpty() ? undefined : image.toDataURL();
}

function jpegData(data: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const image = nativeImage.createFromBuffer(Buffer.from(data));

  if (image.isEmpty()) {
    throw new Error('Artwork is not a supported image');
  }

  return Uint8Array.from(image.toJPEG(90));
}

function audioFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => {
      const aSong = path.parse(a).name === 'song' ? 0 : 1;
      const bSong = path.parse(b).name === 'song' ? 0 : 1;

      return aSong - bSong || a.localeCompare(b);
    })
    .map((file) => path.join(dir, file));
}

async function embeddedArtwork(dir: string): Promise<Uint8Array | undefined> {
  for (const file of audioFiles(dir)) {
    try {
      const metadata = await parseFile(file, { duration: false });
      const picture = metadata.common.picture?.[0];

      if (picture?.data?.length) {
        return picture.data;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function previewSongCover(
  dir: string,
): Promise<{ dataUrl?: string; source: SongCoverSource }> {
  const existing = existingCoverPath(dir);

  if (existing) {
    return {
      dataUrl: imageDataUrl(Uint8Array.from(fs.readFileSync(existing))),
      source: 'existing',
    };
  }

  const embedded = await embeddedArtwork(dir);

  if (embedded) {
    return { dataUrl: imageDataUrl(embedded), source: 'embedded' };
  }

  return { source: 'none' };
}

export async function ingestSongCover(dir: string): Promise<SongCoverSource> {
  if (existingCoverPath(dir)) {
    return 'existing';
  }

  const embedded = await embeddedArtwork(dir);

  if (embedded) {
    fs.writeFileSync(path.join(dir, 'album.jpg'), jpegData(embedded));

    return 'embedded';
  }

  return 'none';
}
