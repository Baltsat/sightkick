import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { IpcMainEvent } from 'electron';
import {
  IpcLibraryMirrorSettings,
  IpcSaveLibraryMirrorSettingsRequest,
  LibraryMirrorSyncState,
  PlayabilityEvidence,
  Song,
} from '../types';

const ENDPOINT_KEY = 'libraryMirror.endpoint';
const TOKEN_KEY = 'libraryMirror.token';
const MAX_CHART_BYTES = 18 * 1024 * 1024;

interface SettingsStore {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

export interface LibraryMirrorRuntime {
  endpoint: string;
  token: string;
}

export interface MirroredSongMetadata {
  id: string;
  name: string;
  artist: string;
  album: string;
  charter: string;
  autoChartTool?: string;
  genre: string;
  year: string;
  fiveLaneDrums: boolean;
  proDrums: boolean;
  delaySeconds: number;
  drumDifficulty: number;
  format: Song['format'];
  drumDifficulties?: Song['drumDifficulties'];
  liked?: boolean;
  updatedAt?: string;
  sourceProvenance?: {
    provider: 'yandex-music';
    collectionId: string;
    collectionName: string;
    trackId: string;
    title: string;
    artists: string[];
    durationSeconds?: number;
  };
  sourceLinked?: boolean;
  playability?: PlayabilityEvidence;
}

export interface LibraryMirrorEntry {
  version: 1;
  id: string;
  mirroredAt: string;
  song: MirroredSongMetadata;
  chart: {
    file: 'notes.mid' | 'notes.chart';
    sha256: string;
    base64: string;
  };
  audio: {
    state: 'local-only';
    names: string[];
    sha256?: string;
  };
}

export interface LibraryMirrorResult {
  state: LibraryMirrorSyncState;
  pendingCount: number;
  error?: string;
}

export interface LibraryMirrorQueueOptions {
  outboxDirectory: string;
  getRuntime: () => LibraryMirrorRuntime | undefined;
  upload?: (
    runtime: LibraryMirrorRuntime,
    entry: LibraryMirrorEntry,
  ) => Promise<void>;
  download?: (
    runtime: LibraryMirrorRuntime,
    id: string,
  ) => Promise<LibraryMirrorEntry | undefined>;
  now?: () => string;
}

function safe_error(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function chart_file(song: Song): 'notes.mid' | 'notes.chart' {
  return song.format === 'mid' ? 'notes.mid' : 'notes.chart';
}

function source_provenance(
  song: Song,
): MirroredSongMetadata['sourceProvenance'] {
  if (!song.sourceProvenance) {
    return undefined;
  }

  return {
    provider: song.sourceProvenance.provider,
    collectionId: song.sourceProvenance.collectionId,
    collectionName: song.sourceProvenance.collectionName,
    trackId: song.sourceProvenance.trackId,
    title: song.sourceProvenance.title,
    artists: [...song.sourceProvenance.artists],
    ...(song.sourceProvenance.durationSeconds !== undefined
      ? { durationSeconds: song.sourceProvenance.durationSeconds }
      : {}),
  };
}

function song_metadata(song: Song): MirroredSongMetadata {
  const provenance = source_provenance(song);

  return {
    id: song.id,
    name: song.name,
    artist: song.artist,
    album: song.album,
    charter: song.charter,
    ...(song.autoChartTool ? { autoChartTool: song.autoChartTool } : {}),
    genre: song.genre,
    year: song.year,
    fiveLaneDrums: song.fiveLaneDrums,
    proDrums: song.proDrums,
    delaySeconds: song.delaySeconds,
    drumDifficulty: song.drumDifficulty,
    format: song.format,
    ...(song.drumDifficulties
      ? { drumDifficulties: song.drumDifficulties }
      : {}),
    ...(song.liked !== undefined ? { liked: song.liked } : {}),
    ...(song.updatedAt ? { updatedAt: song.updatedAt } : {}),
    ...(provenance ? { sourceProvenance: provenance } : {}),
    ...(song.sourceLinked ? { sourceLinked: true } : {}),
    ...(song.playability ? { playability: song.playability } : {}),
  };
}

export async function createLibraryMirrorEntry(
  song: Song,
  mirroredAt = new Date().toISOString(),
): Promise<LibraryMirrorEntry> {
  const file = chart_file(song);
  const bytes = await fs.promises.readFile(path.join(song.dir, file));

  if (bytes.byteLength > MAX_CHART_BYTES) {
    throw new Error('The drum chart is too large to mirror safely');
  }

  return {
    version: 1,
    id: song.id,
    mirroredAt,
    song: song_metadata(song),
    chart: {
      file,
      sha256: createHash('sha256')
        .update(bytes.toString('base64'), 'base64')
        .digest('hex'),
      base64: bytes.toString('base64'),
    },
    audio: {
      state: 'local-only',
      names: song.audio.map(({ name }) => name),
      ...(song.playability?.audio.sha256
        ? { sha256: song.playability.audio.sha256 }
        : {}),
    },
  };
}

function entry_file_name(id: string): string {
  return `${createHash('sha256').update(id).digest('hex')}.json`;
}

async function upload_entry(
  mirrorRuntime: LibraryMirrorRuntime,
  entry: LibraryMirrorEntry,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(
      `${mirrorRuntime.endpoint}/${encodeURIComponent(entry.id)}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${mirrorRuntime.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(entry),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error('Library mirror is offline; this copy will retry later');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Library mirror rejected its token');
  }

  if (!response.ok) {
    throw new Error(`Library mirror upload failed (${response.status})`);
  }
}

async function download_entry(
  mirrorRuntime: LibraryMirrorRuntime,
  id: string,
): Promise<LibraryMirrorEntry | undefined> {
  let response: Response;

  try {
    response = await fetch(
      `${mirrorRuntime.endpoint}/${encodeURIComponent(id)}`,
      {
        headers: { authorization: `Bearer ${mirrorRuntime.token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new Error('Library mirror is offline');
  }

  if (response.status === 404) {
    return undefined;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Library mirror rejected its token');
  }

  if (!response.ok) {
    throw new Error(`Library mirror download failed (${response.status})`);
  }

  return (await response.json()) as LibraryMirrorEntry;
}

export class LibraryMirrorQueue {
  private readonly upload: NonNullable<LibraryMirrorQueueOptions['upload']>;
  private readonly downloadEntry: NonNullable<
    LibraryMirrorQueueOptions['download']
  >;
  private readonly now: NonNullable<LibraryMirrorQueueOptions['now']>;

  constructor(private readonly options: LibraryMirrorQueueOptions) {
    this.upload = options.upload ?? upload_entry;
    this.downloadEntry = options.download ?? download_entry;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async enqueue(song: Song): Promise<LibraryMirrorResult> {
    if (!this.options.getRuntime()) {
      return { state: 'disabled', pendingCount: await this.pendingCount() };
    }

    const entry = await createLibraryMirrorEntry(song, this.now());

    await this.write(entry);

    return this.flush();
  }

  async enqueueAll(songs: readonly Song[]): Promise<LibraryMirrorResult> {
    if (!this.options.getRuntime()) {
      return { state: 'disabled', pendingCount: await this.pendingCount() };
    }

    for (const song of songs) {
      const entry = await createLibraryMirrorEntry(song, this.now());

      await this.write(entry);
    }

    return this.flush();
  }

  async flush(): Promise<LibraryMirrorResult> {
    const mirrorRuntime = this.options.getRuntime();
    const files = await this.outboxFiles();

    if (!mirrorRuntime) {
      return { state: 'disabled', pendingCount: files.length };
    }

    let remaining = files.length;

    for (const file of files) {
      let entry: LibraryMirrorEntry;

      try {
        entry = JSON.parse(
          await fs.promises.readFile(
            path.join(this.options.outboxDirectory, file),
            'utf8',
          ),
        ) as LibraryMirrorEntry;
      } catch {
        return {
          state: 'queued',
          pendingCount: remaining,
          error: 'A queued library copy could not be read',
        };
      }

      try {
        await this.upload(mirrorRuntime, entry);
      } catch (error) {
        return {
          state: 'queued',
          pendingCount: remaining,
          error: safe_error(error),
        };
      }

      await fs.promises.rm(path.join(this.options.outboxDirectory, file));
      remaining -= 1;
    }

    return { state: 'synced', pendingCount: 0 };
  }

  async download(id: string): Promise<LibraryMirrorEntry | undefined> {
    const mirrorRuntime = this.options.getRuntime();

    if (!mirrorRuntime) {
      throw new Error('Configure the library mirror endpoint and token first');
    }

    return this.downloadEntry(mirrorRuntime, id);
  }

  async pendingCount(): Promise<number> {
    return (await this.outboxFiles()).length;
  }

  private async write(entry: LibraryMirrorEntry): Promise<void> {
    await fs.promises.mkdir(this.options.outboxDirectory, {
      recursive: true,
      mode: 0o700,
    });

    const file = path.join(
      this.options.outboxDirectory,
      entry_file_name(entry.id),
    );
    const temporary = `${file}.tmp`;

    await fs.promises.writeFile(temporary, JSON.stringify(entry), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.promises.rename(temporary, file);
  }

  private async outboxFiles(): Promise<string[]> {
    try {
      return (await fs.promises.readdir(this.options.outboxDirectory))
        .filter((file) => file.endsWith('.json'))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }
}

let settingsStore: SettingsStore | undefined;
let queue: LibraryMirrorQueue | undefined;

export function canonicalizeLibraryMirrorEndpoint(value: string): string {
  let endpoint: URL;

  try {
    endpoint = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid library mirror endpoint');
  }

  const loopback = ['localhost', '127.0.0.1', '::1'].includes(
    endpoint.hostname,
  );

  if (
    endpoint.protocol !== 'https:' &&
    !(endpoint.protocol === 'http:' && loopback)
  ) {
    throw new Error('Use HTTPS, or HTTP only for a localhost tunnel');
  }

  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      'Use a library mirror URL without credentials or query parameters',
    );
  }

  return endpoint.toString().replace(/\/$/, '');
}

function runtime(): LibraryMirrorRuntime | undefined {
  if (!settingsStore) {
    return undefined;
  }

  const endpointValue =
    process.env.DRUMROLL_LIBRARY_MIRROR_URL ?? settingsStore.get(ENDPOINT_KEY);
  const tokenValue =
    process.env.DRUMROLL_LIBRARY_MIRROR_TOKEN ?? settingsStore.get(TOKEN_KEY);

  if (typeof endpointValue !== 'string' || typeof tokenValue !== 'string') {
    return undefined;
  }

  const token = tokenValue.trim();

  if (!token) {
    return undefined;
  }

  try {
    return {
      endpoint: canonicalizeLibraryMirrorEndpoint(endpointValue),
      token,
    };
  } catch {
    return undefined;
  }
}

async function probe(runtimeValue: LibraryMirrorRuntime): Promise<void> {
  let response: Response;

  try {
    response = await fetch(runtimeValue.endpoint, {
      headers: { authorization: `Bearer ${runtimeValue.token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Library mirror health check failed');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Library mirror rejected its token');
  }

  if (!response.ok) {
    throw new Error(`Library mirror health check returned ${response.status}`);
  }
}

async function settings_snapshot(
  result?: LibraryMirrorResult,
): Promise<IpcLibraryMirrorSettings> {
  const configured = runtime();
  const pendingCount =
    result?.pendingCount ?? (await queue?.pendingCount()) ?? 0;

  return {
    endpoint: configured?.endpoint ?? '',
    tokenConfigured: Boolean(configured),
    state:
      result?.state ??
      (configured ? (pendingCount > 0 ? 'queued' : 'synced') : 'disabled'),
    pendingCount,
    ...(result?.error ? { error: result.error } : {}),
  };
}

function require_store(): SettingsStore {
  if (!settingsStore) {
    throw new Error('Library mirror settings are unavailable');
  }

  return settingsStore;
}

function require_queue(): LibraryMirrorQueue {
  if (!queue) {
    throw new Error('Library mirror is unavailable');
  }

  return queue;
}

export function configureLibraryMirror(
  store: SettingsStore,
  outboxDirectory: string,
): void {
  settingsStore = store;
  queue = new LibraryMirrorQueue({
    outboxDirectory,
    getRuntime: runtime,
  });
}

export async function queueLibraryMirror(
  song: Song,
): Promise<LibraryMirrorResult> {
  if (!queue) {
    return { state: 'disabled', pendingCount: 0 };
  }

  try {
    return await queue.enqueue(song);
  } catch (error) {
    return {
      state: 'queued',
      pendingCount: await queue.pendingCount(),
      error: safe_error(error),
    };
  }
}

export async function getLibraryMirrorSettings(
  event: IpcMainEvent,
): Promise<void> {
  event.reply('library-mirror-settings', await settings_snapshot());
}

export async function saveLibraryMirrorSettings(
  event: IpcMainEvent,
  request: IpcSaveLibraryMirrorSettingsRequest,
): Promise<void> {
  try {
    const store = require_store();
    const endpoint = canonicalizeLibraryMirrorEndpoint(request?.endpoint ?? '');
    const requestedToken = request?.token?.trim();
    const storedToken = store.get(TOKEN_KEY);
    const token =
      requestedToken ||
      (typeof storedToken === 'string' ? storedToken.trim() : '');

    if (!token) {
      throw new Error('Enter the library mirror token');
    }

    await probe({ endpoint, token });
    store.set(ENDPOINT_KEY, endpoint);
    store.set(TOKEN_KEY, token);
    event.reply('library-mirror-settings', await settings_snapshot());
  } catch (error) {
    event.reply('library-mirror-settings', {
      ...(await settings_snapshot()),
      error: safe_error(error),
    } satisfies IpcLibraryMirrorSettings);
  }
}

export async function syncLibraryMirror(
  event: IpcMainEvent,
  songs: readonly Song[] = [],
): Promise<void> {
  try {
    const mirrorQueue = require_queue();
    const result =
      songs.length > 0
        ? await mirrorQueue.enqueueAll(songs)
        : await mirrorQueue.flush();

    event.reply('library-mirror-sync', await settings_snapshot(result));
  } catch (error) {
    const mirrorQueue = queue;
    const pendingCount = mirrorQueue ? await mirrorQueue.pendingCount() : 0;

    event.reply('library-mirror-sync', {
      ...(await settings_snapshot({
        state: 'queued',
        pendingCount,
        error: safe_error(error),
      })),
    } satisfies IpcLibraryMirrorSettings);
  }
}
