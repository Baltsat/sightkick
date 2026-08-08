import type { ElectronHandler } from '../../preload';
import type { Channels } from '../../preload';
import type {
  IpcAutoChartJob,
  IpcCreateAutoChartRequest,
  IpcUpdateSongPayload,
  MidiMessage,
  Song,
} from '../../types';
import type { PlatformAdapter } from '../types';
import { webCapabilities } from './capabilities';
import {
  finalizeArchiveSong,
  hydrateStoredSong,
  LessonManifest,
  loadStoredSong,
  loadStoredSongs,
  saveStoredSong,
  StoredWebSong,
} from './library';
import { extractTarGzip } from './tar';
import { WebMidiBridge } from './web-midi';

type Listener = (payload: unknown) => void;

interface PendingImport {
  id: string;
  url: string;
  attempt: number;
  stored?: StoredWebSong;
}

interface UpstreamJob {
  status: 'queued' | 'running' | 'done' | 'error' | 'canceled';
  stage?: string | null;
  percent?: number;
  message?: string;
  error?: string | null;
}

const SCORE_KEY = 'drumroll.web.song-overrides';
const RUNS_KEY = 'drumroll.web.practice-runs';
const DAYS_KEY = 'drumroll.web.practice-days';

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function nextFrame(callback: () => void): void {
  queueMicrotask(callback);
}

export class WebPlatform implements PlatformAdapter {
  readonly kind = 'web' as const;
  readonly capabilities = webCapabilities;
  readonly ipcRenderer: ElectronHandler['ipcRenderer'];

  private listeners = new Map<Channels, Set<Listener>>();
  private midi = new WebMidiBridge();
  private manifest?: Promise<LessonManifest>;
  private pending = new Map<string, PendingImport>();
  private wakeLock?: { release: () => Promise<void> };

  constructor() {
    this.ipcRenderer = {
      sendMessage: (channel, ...args) => {
        void this.handle(channel, args).catch((error) => {
          this.handleError(channel, error);
        });
      },
      on: (channel, func) => this.addListener(channel, func as Listener, false),
      once: (channel, func) =>
        this.addListener(channel, func as Listener, true),
    };
  }

  private addListener(
    channel: Channels,
    listener: Listener,
    once: boolean,
  ): () => void {
    const wrapped: Listener = once
      ? (payload) => {
          this.removeListener(channel, wrapped);
          listener(payload);
        }
      : listener;
    const set = this.listeners.get(channel) ?? new Set<Listener>();

    set.add(wrapped);
    this.listeners.set(channel, set);

    return () => this.removeListener(channel, wrapped);
  }

  private removeListener(channel: Channels, listener: Listener): void {
    this.listeners.get(channel)?.delete(listener);
  }

  private emit(channel: Channels, payload: unknown): void {
    nextFrame(() => {
      [...(this.listeners.get(channel) ?? [])].forEach((listener) => {
        listener(payload);
      });
    });
  }

  private handleError(channel: Channels, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const replyByRequest: Partial<Record<Channels, Channels>> = {
      'load-song-list': 'load-song-list',
      'load-song': 'load-song',
      'rescan-songs': 'rescan-songs',
      'search-youtube': 'search-youtube',
      'select-import-song': 'select-import-song',
      'import-song': 'import-song',
      'export-pdf': 'export-pdf',
    };
    const reply = replyByRequest[channel];

    if (reply) {
      this.emit(reply, { error: message });
    }
  }

  private loadManifest(): Promise<LessonManifest> {
    this.manifest ??= fetch('/library/manifest.json').then(async (response) => {
      if (!response.ok) {
        throw new Error(`Lesson manifest failed to load (${response.status}).`);
      }

      return (await response.json()) as LessonManifest;
    });

    return this.manifest;
  }

  private applyOverrides(song: Song): Song {
    const overrides = readJson<
      Record<string, Pick<Song, 'scoreData' | 'liked'>>
    >(SCORE_KEY, {});
    const current = overrides[song.id];

    return current
      ? {
          ...song,
          ...current,
          scoreData: { ...song.scoreData, ...current.scoreData },
        }
      : song;
  }

  private async allSongs(): Promise<Song[]> {
    const [manifest, stored] = await Promise.all([
      this.loadManifest(),
      loadStoredSongs(),
    ]);

    return [
      ...manifest.lessons.map(({ song }) => this.applyOverrides(song)),
      ...stored.map((song) => this.applyOverrides(hydrateStoredSong(song))),
    ];
  }

  private async emitSongList(channel: 'load-song-list' | 'rescan-songs') {
    this.emit(channel, {
      songs: await this.allSongs(),
      lastOpenedPath: 'Browser library',
      downloadedEncoreMd5s: [],
    });
  }

  private async loadSong(id: string): Promise<void> {
    const manifest = await this.loadManifest();
    const lesson = manifest.lessons.find(({ song }) => song.id === id);

    if (lesson) {
      const response = await fetch(lesson.chart);

      if (!response.ok) {
        throw new Error(`Chart failed to load (${response.status}).`);
      }

      this.emit('load-song', {
        data: this.applyOverrides(lesson.song),
        fileData: new Uint8Array(await response.arrayBuffer()),
      });

      return;
    }

    const stored = await loadStoredSong(id);

    if (!stored) {
      throw new Error(`Song "${id}" not found.`);
    }

    const chart =
      stored.files[stored.song.format === 'mid' ? 'notes.mid' : 'notes.chart'];

    this.emit('load-song', {
      data: this.applyOverrides(hydrateStoredSong(stored)),
      fileData: new Uint8Array(await chart.arrayBuffer()),
    });
  }

  private async updateSong(update: IpcUpdateSongPayload): Promise<void> {
    const songs = await this.allSongs();
    const previous = songs.find(({ id }) => id === update.id);

    if (!previous) {
      throw new Error(`Song "${update.id}" not found.`);
    }

    const next: Song = {
      ...previous,
      ...(typeof update.liked === 'boolean' ? { liked: update.liked } : {}),
      scoreData: { ...previous.scoreData, ...update.scoreData },
    };
    const overrides = readJson<
      Record<string, Pick<Song, 'scoreData' | 'liked'>>
    >(SCORE_KEY, {});

    overrides[next.id] = {
      scoreData: next.scoreData,
      liked: next.liked,
    };
    writeJson(SCORE_KEY, overrides);

    const stored = await loadStoredSong(next.id);

    if (stored) {
      await saveStoredSong({ ...stored, song: next });
    }

    this.emit('update-song', next);
  }

  private saveRun(payload: { songId: string; summary: unknown }): void {
    const runs = readJson<Record<string, unknown[]>>(RUNS_KEY, {});
    const next = [...(runs[payload.songId] ?? []), payload.summary].slice(-50);

    runs[payload.songId] = next;
    writeJson(RUNS_KEY, runs);
    this.emit('save-practice-run', { songId: payload.songId, runs: next });
  }

  private recordPracticeDay(payload: {
    date: string;
    xp: number;
    stars: number;
    minutes: number;
  }): void {
    const days = readJson<
      Record<
        string,
        { runs: number; xp: number; stars: number; minutes: number }
      >
    >(DAYS_KEY, {});
    const previous = days[payload.date];
    const wasFirstRunOfDay = !previous || previous.runs === 0;

    days[payload.date] = {
      runs: (previous?.runs ?? 0) + 1,
      xp: (previous?.xp ?? 0) + payload.xp,
      stars: (previous?.stars ?? 0) + payload.stars,
      minutes: (previous?.minutes ?? 0) + payload.minutes,
    };
    writeJson(DAYS_KEY, days);
    this.emit('record-practice-day', { days, wasFirstRunOfDay });
  }

  private importJob(job: PendingImport, patch: Partial<IpcAutoChartJob>): void {
    const value: IpcAutoChartJob = {
      id: job.id,
      attempt: job.attempt,
      stage: 'queued',
      message: 'Queued by Drumroll web',
      backend: 'remote',
      youtubeUrl: job.url,
      ...patch,
    };

    this.emit('auto-chart-update', value);
  }

  private async createImport(
    request: IpcCreateAutoChartRequest,
  ): Promise<void> {
    if (request.localFile || !request.youtubeUrl) {
      throw new Error(
        'The web app imports YouTube URLs only. Use the desktop app for local files.',
      );
    }

    const response = await fetch('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: request.youtubeUrl }),
    });
    const body = (await response.json()) as { jobId?: string; error?: string };

    if (!response.ok || !body.jobId) {
      throw new Error(
        body.error || `Import request failed (${response.status}).`,
      );
    }

    const job: PendingImport = {
      id: body.jobId,
      url: request.youtubeUrl,
      attempt: 1,
    };

    this.pending.set(job.id, job);
    this.importJob(job, { stage: 'queued', percent: 0 });
    void this.pollImport(job).catch((error) => {
      this.importJob(job, {
        stage: 'failed',
        message: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async pollImport(job: PendingImport): Promise<void> {
    while (this.pending.has(job.id)) {
      const response = await fetch(`/api/import/${encodeURIComponent(job.id)}`);
      const status = (await response.json()) as UpstreamJob;

      if (!response.ok) {
        throw new Error(
          status.error || `Import status failed (${response.status}).`,
        );
      }

      if (status.status === 'error' || status.status === 'canceled') {
        this.importJob(job, {
          stage: status.status === 'canceled' ? 'cancelled' : 'failed',
          message: status.error || status.message || 'Import failed',
          error: status.error || undefined,
        });

        return;
      }

      if (status.status === 'done') {
        const result = await fetch(
          `/api/import/${encodeURIComponent(job.id)}/result`,
        );

        if (!result.ok) {
          throw new Error(`Import result failed (${result.status}).`);
        }

        const files = await extractTarGzip(await result.arrayBuffer());

        job.stored = await finalizeArchiveSong(job.id, files);
        this.importJob(job, {
          stage: 'preview-ready',
          percent: 100,
          message: 'Chart ready to add',
          sourceName: job.stored.song.name,
          preview: {
            sourceDir: job.id,
            name: job.stored.song.name,
            artist: job.stored.song.artist,
            album: job.stored.song.album,
            charter: job.stored.song.charter,
            autoChartTool: 'Drumroll Transcriber',
            chartFormat: job.stored.song.format,
            audioCount: hydrateStoredSong(job.stored).audio.length,
            drumDifficulties: job.stored.song.drumDifficulties ?? ['expert'],
            coverSource: 'none',
          },
        });

        return;
      }

      this.importJob(job, {
        stage:
          status.stage === 'download'
            ? 'downloading'
            : status.status === 'queued'
            ? 'queued'
            : 'processing',
        percent: status.percent,
        message: status.message || 'Processing chart',
      });

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  private async confirmImport(id: string): Promise<void> {
    const job = this.pending.get(id);

    if (!job?.stored) {
      throw new Error('The chart preview is no longer available.');
    }

    this.importJob(job, { stage: 'importing', message: 'Adding to library' });
    await saveStoredSong(job.stored);

    const song = hydrateStoredSong(job.stored);

    this.importJob(job, {
      stage: 'imported',
      message: `"${song.name}" added to your browser library`,
      song,
    });
    this.pending.delete(id);
  }

  private async cancelImport(id: string): Promise<void> {
    const job = this.pending.get(id);

    if (!job) {
      return;
    }

    await fetch(`/api/import/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.pending.delete(id);
    this.importJob(job, { stage: 'cancelled', message: 'Import cancelled' });
  }

  private async handle(channel: Channels, args: unknown[]): Promise<void> {
    switch (channel) {
      case 'check-dev':
        this.emit('check-dev', false);

        break;

      case 'load-song-list':
        await this.emitSongList('load-song-list');

        break;

      case 'rescan-songs':
        this.manifest = undefined;
        await this.emitSongList('rescan-songs');

        break;

      case 'load-song':
        await this.loadSong(String(args[0]));

        break;

      case 'like-song': {
        const [id, liked] = args as [string, boolean];

        await this.updateSong({ id, liked } as IpcUpdateSongPayload);

        break;
      }

      case 'update-song':
        await this.updateSong(args[0] as IpcUpdateSongPayload);

        break;

      case 'save-practice-run':
        this.saveRun(args[0] as { songId: string; summary: unknown });

        break;

      case 'load-practice-runs': {
        const id = String(args[0]);
        const runs = readJson<Record<string, unknown[]>>(RUNS_KEY, {});

        this.emit('load-practice-runs', { songId: id, runs: runs[id] ?? [] });

        break;
      }

      case 'load-all-practice-runs':
        this.emit('load-all-practice-runs', {
          runs: Object.values(
            readJson<Record<string, unknown[]>>(RUNS_KEY, {}),
          ).flat(),
        });

        break;

      case 'load-practice-days':
        this.emit('load-practice-days', {
          days: readJson(DAYS_KEY, {}),
        });

        break;

      case 'record-practice-day':
        this.recordPracticeDay(
          args[0] as {
            date: string;
            xp: number;
            stars: number;
            minutes: number;
          },
        );

        break;

      case 'midi-device-list':
        try {
          this.emit('midi-device-list', await this.midi.listDevices());
        } catch {
          this.emit('midi-device-list', []);
        }

        break;

      case 'listen-midi':
        await this.midi.listen(Number(args[0]), (message: MidiMessage) => {
          this.emit('listen-midi', message);
        });

        break;

      case 'stop-listen-midi':
        this.midi.stop();

        break;

      case 'check-auto-chart-backends':
        this.emit('auto-chart-backends', {
          sightkick: false,
          remote: true,
          octave: false,
          default: 'remote',
        });

        break;

      case 'get-auto-chart-remote-settings':
        this.emit('auto-chart-remote-settings', {
          endpoint: '/api/import',
          tokenConfigured: true,
        });

        break;

      case 'save-test-auto-chart-remote':
        this.emit('auto-chart-remote-test', {
          ok: true,
          message: 'Cloudflare manages the web transcriber connection.',
        });

        break;

      case 'create-auto-chart':
        await this.createImport(args[0] as IpcCreateAutoChartRequest);

        break;

      case 'import-auto-chart':
        await this.confirmImport(String(args[0]));

        break;

      case 'discard-auto-chart-preview':
        this.pending.delete(String(args[0]));

        break;

      case 'cancel-auto-chart':
        await this.cancelImport(String(args[0]));

        break;

      case 'search-youtube':
        this.emit('search-youtube', {
          error:
            'Keyword search is unavailable on web. Paste a YouTube URL into Create chart.',
        });

        break;

      case 'check-stem-tools':
        this.emit('check-stem-tools', { status: 'unsupported' });

        break;

      case 'check-stem-tools-update':
        this.emit('check-stem-tools-update', {
          available: false,
          updateAvailable: false,
        });

        break;

      case 'select-import-song':
        this.emit('select-import-song', {
          error: 'Prepared folder import is available in the desktop app.',
        });

        break;

      case 'my-music-fetch':
        this.emit('my-music-fetch', {
          error: 'YouTube Music likes are available in the desktop app.',
          code: 'unknown',
        });

        break;

      case 'split-song':
        this.emit('split-song', {
          id: String(args[0]),
          success: false,
          error: 'Stem splitting is available in the desktop app.',
        });

        break;

      case 'prevent-sleep': {
        const wakeLock = navigator.wakeLock;

        if (wakeLock) {
          this.wakeLock = await wakeLock.request('screen');
        }

        break;
      }

      case 'resume-sleep':
        await this.wakeLock?.release();
        this.wakeLock = undefined;

        break;

      case 'export-pdf':
        window.print();
        this.emit('export-pdf', { success: true });

        break;

      default:
        break;
    }
  }
}

export function installWebPlatform(): WebPlatform {
  const platform = new WebPlatform();

  window.electron = platform;
  window.drumrollPlatform = {
    kind: platform.kind,
    capabilities: platform.capabilities,
  };

  return platform;
}
