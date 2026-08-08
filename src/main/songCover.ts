import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import log from 'electron-log';
import { nativeImage } from 'electron';
import { parseFile } from 'music-metadata';
import { findItunesArtwork } from './albumArtResolver';

export type SongCoverSource =
  | 'existing'
  | 'itunes'
  | 'embedded'
  | 'remote'
  | 'none';

// previewSongCover never performs a network lookup (it only inspects what's
// already on disk), so its result can never be 'itunes' — narrowing the
// type here (rather than in IpcImportSongPreview's coverSource, which is
// outside this file's ownership) is what keeps that field's assignment
// type-checking without widening it.
export type PreviewCoverSource = Exclude<SongCoverSource, 'itunes'>;

const COVER_EXTENSIONS = ['png', 'jpg', 'jpeg'];
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.opus']);
const MAX_REMOTE_IMAGE_BYTES = 10_000_000;
const REMOTE_FETCH_TIMEOUT_MS = 8_000;

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

  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Artwork download failed: ${response.status}`);
  }

  // fetch follows redirects transparently; a server that starts on https
  // but hands back a redirect to a plain-http (or otherwise untrusted)
  // location would otherwise have its response silently accepted here, so
  // the final, post-redirect URL is checked too, not just the one we asked
  // for.
  if (response.url) {
    let finalUrl: URL;

    try {
      finalUrl = new URL(response.url);
    } catch {
      throw new Error('Artwork response reported an invalid URL');
    }

    if (finalUrl.protocol !== 'https:') {
      throw new Error('Artwork request redirected off HTTPS');
    }
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

// Writes album.jpg via a sanitized temp file + rename so a reader can never
// observe a partially-written cover, and a failure mid-write never leaves a
// corrupt album.jpg behind. The temp file lives in `dir` itself (not the OS
// tmp dir) so the rename is an atomic same-filesystem move rather than a
// cross-device copy.
function writeCoverAtomically(dir: string, data: Uint8Array): void {
  const finalPath = path.join(dir, 'album.jpg');
  const tempPath = path.join(dir, `.album.jpg.${randomUUID()}.tmp`);

  fs.writeFileSync(tempPath, data);

  try {
    fs.renameSync(tempPath, finalPath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });

    throw error;
  }
}

interface SongIdentity {
  artist?: string;
  title?: string;
}

// Looks up real album art on iTunes for `identity` and, on a confident
// match, downloads and writes it as album.jpg. Returns whether it won so
// the caller can skip the embedded/thumbnail fallbacks; any failure
// (no match, network error, bad download) resolves to false rather than
// throwing, since this is always just the first link in a fallback chain.
async function tryItunesCover(
  dir: string,
  identity: SongIdentity | undefined,
): Promise<boolean> {
  if (!identity?.artist?.trim() || !identity?.title?.trim()) {
    return false;
  }

  const artworkUrl = await findItunesArtwork(identity.artist, identity.title);

  if (!artworkUrl) {
    log.info(
      `[songCover] no confident iTunes match for "${identity.artist} - ${identity.title}"; falling back`,
    );

    return false;
  }

  try {
    const artwork = await remoteArtwork(artworkUrl);

    writeCoverAtomically(dir, toUint8Array(jpegData(artwork)));
    log.info(
      `[songCover] cover source=itunes for "${identity.artist} - ${identity.title}"`,
    );

    return true;
  } catch (error) {
    log.warn(
      `[songCover] iTunes artwork download failed for "${identity.artist} - ${identity.title}":`,
      error,
    );

    return false;
  }
}

// Preview never performs a network lookup — it only reports what's already
// on disk (or embedded in the audio) — so a review screen can show
// something before committing to write anything. The iTunes lookup only
// ever runs from ingestSongCover, at actual import time.
export async function previewSongCover(
  dir: string,
): Promise<{ dataUrl?: string; source: PreviewCoverSource }> {
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

// Resolves and writes album.jpg for a song folder, in priority order:
//   1. existing  — a cover is already there; never overwritten.
//   2. itunes    — a confident iTunes Search API match for `identity`, when
//                  given (real album art; see albumArtResolver.ts).
//   3. embedded  — cover art embedded in the song's own audio file.
//   4. remote    — `artworkUrl` as given (typically the YouTube thumbnail
//                  for auto-charted imports, or a user-pasted URL).
// `identity` is optional so callers without a known artist/title (e.g. a
// manually imported prepared song folder) keep the pre-iTunes behavior
// unchanged.
export async function ingestSongCover(
  dir: string,
  artworkUrl?: string,
  identity?: SongIdentity,
): Promise<SongCoverSource> {
  if (existingCoverPath(dir)) {
    return 'existing';
  }

  if (await tryItunesCover(dir, identity)) {
    return 'itunes';
  }

  const embedded = await embeddedArtwork(dir);

  if (embedded) {
    writeCoverAtomically(dir, toUint8Array(jpegData(embedded)));
    log.info('[songCover] cover source=embedded');

    return 'embedded';
  }

  if (artworkUrl?.trim()) {
    const remote = await remoteArtwork(artworkUrl.trim());

    writeCoverAtomically(dir, toUint8Array(jpegData(remote)));
    log.info('[songCover] cover source=remote (thumbnail)');

    return 'remote';
  }

  log.info('[songCover] no cover art found (source=none)');

  return 'none';
}
