import fs from 'fs';
import path from 'path';
import { nativeImage } from 'electron';
import { parseFile } from 'music-metadata';

export type SongCoverSource = 'existing' | 'embedded' | 'remote' | 'none';

const COVER_EXTENSIONS = ['png', 'jpg', 'jpeg'];
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.opus']);
const MAX_REMOTE_IMAGE_BYTES = 10_000_000;

function existingCoverPath(dir: string): string | undefined {
  return COVER_EXTENSIONS.map((extension) =>
    path.join(dir, `album.${extension}`),
  ).find((file) => fs.existsSync(file));
}

// Node's Buffer is a Uint8Array view but is no longer structurally
// assignable to the plain Uint8Array<ArrayBufferLike> type; build an
// explicit zero-copy view instead of widening the type with `as`.
function toUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function imageDataUrl(data: Uint8Array): string | undefined {
  const image = nativeImage.createFromBuffer(Buffer.from(data));

  return image.isEmpty() ? undefined : image.toDataURL();
}

function jpegData(data: Uint8Array): Buffer {
  const image = nativeImage.createFromBuffer(Buffer.from(data));

  if (image.isEmpty()) {
    throw new Error('Artwork is not a supported image');
  }

  return image.toJPEG(90);
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

async function remoteArtwork(url: string): Promise<Uint8Array> {
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error('Artwork URL must use HTTPS');
  }

  const response = await fetch(parsed);

  if (!response.ok) {
    throw new Error(`Artwork download failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error('Artwork URL did not return an image');
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);

  if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error('Artwork image is larger than 10 MB');
  }

  const data = new Uint8Array(await response.arrayBuffer());

  if (data.byteLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error('Artwork image is larger than 10 MB');
  }

  return data;
}

export async function previewSongCover(
  dir: string,
): Promise<{ dataUrl?: string; source: SongCoverSource }> {
  const existing = existingCoverPath(dir);

  if (existing) {
    return {
      dataUrl: imageDataUrl(toUint8Array(fs.readFileSync(existing))),
      source: 'existing',
    };
  }

  const embedded = await embeddedArtwork(dir);

  if (embedded) {
    return { dataUrl: imageDataUrl(embedded), source: 'embedded' };
  }

  return { source: 'none' };
}

export async function ingestSongCover(
  dir: string,
  artworkUrl?: string,
): Promise<SongCoverSource> {
  if (existingCoverPath(dir)) {
    return 'existing';
  }

  const embedded = await embeddedArtwork(dir);

  if (embedded) {
    fs.writeFileSync(
      path.join(dir, 'album.jpg'),
      toUint8Array(jpegData(embedded)),
    );

    return 'embedded';
  }

  if (artworkUrl?.trim()) {
    const remote = await remoteArtwork(artworkUrl.trim());

    fs.writeFileSync(
      path.join(dir, 'album.jpg'),
      toUint8Array(jpegData(remote)),
    );

    return 'remote';
  }

  return 'none';
}
