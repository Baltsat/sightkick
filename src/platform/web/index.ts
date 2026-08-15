import type { ElectronHandler } from '../../preload';
import type { Channels } from '../../preload';
import type { Difficulty } from 'scan-chart';
import type {
  IpcAutoChartJob,
  IpcCreateAutoChartRequest,
  IpcLibraryCandidatesResponse,
  IpcUpdateSongPayload,
  LibrarySourceTrackProvenance,
  MidiMessage,
  Song,
} from '../../types';
import {
  parseYandexPlaylistCandidates,
  YANDEX_DRUMS_SOURCE_FILE,
  YANDEX_FAVORITES_SOURCE_FILE,
} from '../../library-sources/yandex';
import { normalizeLibrarySourceProvenance } from '../../library-sources/provenance';
import type { PlatformAdapter } from '../types';
import type {
  HitRecord,
  PracticeAttemptCheckpoint,
  PracticeAttemptCheckpointBySong,
  PracticeRunArchive,
  PracticeRunArchiveBySong,
  RunSummary,
  StoredHitRecord,
  StoredPracticeRun,
} from '../../renderer/services/practice-stats';
import {
  archiveRunSummaries,
  emptyPracticeRunArchive,
  MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG,
  MAX_PRACTICE_ATTEMPT_RECORDS,
  MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG,
  MAX_RECENT_PRACTICE_SUMMARIES_PER_SONG,
  PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION,
  readPracticeRunArchive,
} from '../../renderer/services/practice-stats';
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
  sourceProvenance?: LibrarySourceTrackProvenance;
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
const ATTEMPT_CHECKPOINTS_KEY = 'drumroll.web.practice-attempt-checkpoints';
const DAYS_KEY = 'drumroll.web.practice-days';
const GOALS_KEY = 'drumroll.web.goals';
const MAX_STORED_GOALS = 50;

interface WebGoal {
  id: string;
  songId: string;
  difficulty: Difficulty;
  targetDate?: string;
  createdAt: string;
  isPrimary: boolean;
}

interface SaveWebGoalPayload {
  id?: string;
  songId: string;
  difficulty: Difficulty;
  targetDate?: string;
  isPrimary?: boolean;
}

interface WebPracticeRun {
  summary: RunSummary;
  /** Undefined means this is a legacy summary-only record. */
  records?: StoredHitRecord[];
}

/**
 * The web adapter previously stored a bare song-to-runs map. Keep reading
 * that shape, but write this single versioned envelope so adding archive
 * evidence cannot partially succeed separately from the retained summaries.
 */
interface WebPracticeHistory {
  schemaVersion: 1;
  runs: Record<string, WebPracticeRun[]>;
  archiveBySong: PracticeRunArchiveBySong;
}

const WEB_PRACTICE_HISTORY_SCHEMA_VERSION = 1 as const;

interface WebPracticeAttemptHistory {
  schemaVersion: 1;
  checkpointsBySong: PracticeAttemptCheckpointBySong;
}

const WEB_PRACTICE_ATTEMPT_HISTORY_SCHEMA_VERSION = 1 as const;

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

function isDifficulty(value: unknown): value is Difficulty {
  return (
    value === 'easy' ||
    value === 'medium' ||
    value === 'hard' ||
    value === 'expert'
  );
}

function isWebGoal(value: unknown): value is WebGoal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const goal = value as Partial<WebGoal>;

  return (
    typeof goal.id === 'string' &&
    Boolean(goal.id) &&
    typeof goal.songId === 'string' &&
    Boolean(goal.songId) &&
    isDifficulty(goal.difficulty) &&
    (goal.targetDate === undefined || typeof goal.targetDate === 'string') &&
    typeof goal.createdAt === 'string' &&
    Boolean(goal.createdAt) &&
    typeof goal.isPrimary === 'boolean'
  );
}

function readGoals(): WebGoal[] {
  const raw = readJson<unknown>(GOALS_KEY, []);

  return Array.isArray(raw)
    ? raw.filter(isWebGoal).slice(-MAX_STORED_GOALS)
    : [];
}

function storeGoals(goals: WebGoal[]): WebGoal[] {
  const capped = goals.slice(-MAX_STORED_GOALS);

  writeJson(GOALS_KEY, capped);

  return capped;
}

function createGoalId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const random = new Uint32Array(4);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(random);
  } else {
    for (let index = 0; index < random.length; index += 1) {
      random[index] = Math.floor(Math.random() * 0x1_0000_0000);
    }
  }

  return `web-goal-${Date.now().toString(36)}-${[...random]
    .map((part) => part.toString(36))
    .join('-')}`;
}

function withPrimarySetTo(goals: WebGoal[], id: string): WebGoal[] {
  return goals.map((goal) => ({ ...goal, isPrimary: goal.id === id }));
}

function saveWebGoal(payload: SaveWebGoalPayload): WebGoal[] {
  if (!payload?.songId) {
    throw new Error('songId is required');
  }

  if (!isDifficulty(payload.difficulty)) {
    throw new Error('difficulty is required');
  }

  const existing = readGoals();
  const existingIndex = payload.id
    ? existing.findIndex(({ id }) => id === payload.id)
    : -1;
  const isFirstGoalEver = existing.length === 0 && existingIndex === -1;
  const resolvedIsPrimary = payload.isPrimary ?? isFirstGoalEver;
  let next: WebGoal[];

  if (existingIndex >= 0) {
    next = [...existing];
    next[existingIndex] = {
      ...existing[existingIndex],
      songId: payload.songId,
      difficulty: payload.difficulty,
      targetDate: payload.targetDate,
    };
  } else {
    next = [
      ...existing,
      {
        id: createGoalId(),
        songId: payload.songId,
        difficulty: payload.difficulty,
        targetDate: payload.targetDate,
        createdAt: new Date().toISOString(),
        isPrimary: false,
      },
    ];
  }

  const targetId =
    existingIndex >= 0 ? existing[existingIndex].id : next[next.length - 1].id;

  return storeGoals(
    resolvedIsPrimary ? withPrimarySetTo(next, targetId) : next,
  );
}

function deleteWebGoal(id: string): WebGoal[] {
  if (!id) {
    throw new Error('id is required');
  }

  return storeGoals(readGoals().filter((goal) => goal.id !== id));
}

function setPrimaryWebGoal(id: string): WebGoal[] {
  if (!id) {
    throw new Error('id is required');
  }

  const existing = readGoals();

  if (!existing.some((goal) => goal.id === id)) {
    throw new Error(`no stored goal with id ${id}`);
  }

  return storeGoals(withPrimarySetTo(existing, id));
}

function compactRecord(record: HitRecord): StoredHitRecord {
  return {
    tick: record.tick,
    deltaMs: record.deltaMs,
    element: record.element,
    verdict: record.verdict,
    ...(record.velocity === undefined ? {} : { velocity: record.velocity }),
  };
}

function isWebPracticeRun(value: unknown): value is WebPracticeRun {
  return (
    typeof value === 'object' &&
    value !== null &&
    'summary' in value &&
    typeof (value as { summary?: unknown }).summary === 'object'
  );
}

/**
 * The first web release stored an array of RunSummary values. Read those
 * records unchanged as summary-only evidence, while new entries carry the
 * compact full hit history used by the desktop Coach.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readWebPracticeRuns(raw: unknown): Record<string, WebPracticeRun[]> {
  if (!isRecord(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).flatMap(([songId, entries]) =>
      Array.isArray(entries)
        ? [
            [
              songId,
              entries.map((entry) =>
                isWebPracticeRun(entry)
                  ? entry
                  : { summary: entry as RunSummary },
              ),
            ],
          ]
        : [],
    ),
  );
}

function readArchiveBySong(raw: unknown): PracticeRunArchiveBySong {
  if (!isRecord(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([songId, archive]) => [
      songId,
      readPracticeRunArchive(archive),
    ]),
  );
}

function readPracticeHistory(): WebPracticeHistory {
  const raw = readJson<unknown>(RUNS_KEY, {});

  if (
    isRecord(raw) &&
    raw.schemaVersion === WEB_PRACTICE_HISTORY_SCHEMA_VERSION &&
    isRecord(raw.runs)
  ) {
    return {
      schemaVersion: WEB_PRACTICE_HISTORY_SCHEMA_VERSION,
      runs: readWebPracticeRuns(raw.runs),
      archiveBySong: readArchiveBySong(raw.archiveBySong),
    };
  }

  return {
    schemaVersion: WEB_PRACTICE_HISTORY_SCHEMA_VERSION,
    runs: readWebPracticeRuns(raw),
    archiveBySong: {},
  };
}

function writePracticeHistory(history: WebPracticeHistory): void {
  writeJson(RUNS_KEY, history);
}

function isPracticeAttemptCheckpoint(
  value: unknown,
): value is PracticeAttemptCheckpoint {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.state === 'in-progress' &&
    typeof value.songId === 'string' &&
    Boolean(value.songId) &&
    typeof value.sessionId === 'string' &&
    Boolean(value.sessionId) &&
    typeof value.startedAt === 'string' &&
    Boolean(value.startedAt) &&
    typeof value.updatedAt === 'string' &&
    Boolean(value.updatedAt) &&
    typeof value.chartRevision === 'string' &&
    Boolean(value.chartRevision) &&
    (value.mode === 'practice' || value.mode === 'perform') &&
    isDifficulty(value.difficulty) &&
    typeof value.playbackSpeed === 'number' &&
    Number.isFinite(value.playbackSpeed) &&
    typeof value.positionTick === 'number' &&
    Number.isFinite(value.positionTick) &&
    Array.isArray(value.records)
  );
}

function readAttemptCheckpoints(raw: unknown): PracticeAttemptCheckpoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isPracticeAttemptCheckpoint)
    .map((checkpoint) => ({
      ...checkpoint,
      schemaVersion: PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION,
      records: checkpoint.records.slice(-MAX_PRACTICE_ATTEMPT_RECORDS),
    }))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .slice(-MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG);
}

function readPracticeAttemptHistory(): WebPracticeAttemptHistory {
  const raw = readJson<unknown>(ATTEMPT_CHECKPOINTS_KEY, {});

  if (
    isRecord(raw) &&
    raw.schemaVersion === WEB_PRACTICE_ATTEMPT_HISTORY_SCHEMA_VERSION &&
    isRecord(raw.checkpointsBySong)
  ) {
    return {
      schemaVersion: WEB_PRACTICE_ATTEMPT_HISTORY_SCHEMA_VERSION,
      checkpointsBySong: Object.fromEntries(
        Object.entries(raw.checkpointsBySong).map(([songId, checkpoints]) => [
          songId,
          readAttemptCheckpoints(checkpoints),
        ]),
      ),
    };
  }

  return {
    schemaVersion: WEB_PRACTICE_ATTEMPT_HISTORY_SCHEMA_VERSION,
    checkpointsBySong: {},
  };
}

function writePracticeAttemptHistory(history: WebPracticeAttemptHistory): void {
  writeJson(ATTEMPT_CHECKPOINTS_KEY, history);
}

function responseForRuns(
  songId: string,
  entries: WebPracticeRun[],
  archive: PracticeRunArchive = emptyPracticeRunArchive(),
) {
  const fullRuns: StoredPracticeRun[] = entries.flatMap((entry) =>
    entry.records === undefined
      ? []
      : [{ summary: entry.summary, records: entry.records }],
  );

  return {
    songId,
    runs: entries.map(({ summary }) => summary),
    fullRuns: fullRuns.slice(-MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG),
    archive,
  };
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
  private yandexCandidates?: Promise<IpcLibraryCandidatesResponse>;
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
      'load-library-candidates': 'load-library-candidates',
      'search-youtube': 'search-youtube',
      'select-import-song': 'select-import-song',
      'import-song': 'import-song',
      'export-pdf': 'export-pdf',
      'save-practice-run': 'save-practice-run',
      'load-practice-runs': 'load-practice-runs',
      'save-practice-attempt-checkpoint': 'save-practice-attempt-checkpoint',
      'load-practice-attempt-checkpoints': 'load-practice-attempt-checkpoints',
      'finalize-practice-attempt-checkpoint':
        'finalize-practice-attempt-checkpoint',
      'load-all-practice-runs': 'load-all-practice-runs',
      'load-retired-lessons': 'load-retired-lessons',
      'record-practice-day': 'record-practice-day',
      'load-goals': 'load-goals',
      'save-goal': 'save-goal',
      'delete-goal': 'delete-goal',
      'set-primary-goal': 'set-primary-goal',
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

  private loadYandexCandidates(): Promise<IpcLibraryCandidatesResponse> {
    this.yandexCandidates ??= Promise.all([
      this.loadYandexCandidateSource(YANDEX_DRUMS_SOURCE_FILE),
      this.loadYandexCandidateSource(YANDEX_FAVORITES_SOURCE_FILE),
    ]).then(([drums, favorites]) => ({ yandex: { drums, favorites } }));

    return this.yandexCandidates;
  }

  private async loadYandexCandidateSource(
    sourceFile: string,
  ): Promise<IpcLibraryCandidatesResponse['yandex']['drums']> {
    const response = await fetch(`/library-sources/${sourceFile}`);

    if (!response.ok) {
      throw new Error(
        `Yandex playlist source failed to load (${response.status}).`,
      );
    }

    return parseYandexPlaylistCandidates(await response.json());
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
      const [response, stickingResponse] = await Promise.all([
        fetch(lesson.chart),
        lesson.sticking ? fetch(lesson.sticking) : Promise.resolve(undefined),
      ]);

      if (!response.ok) {
        throw new Error(`Chart failed to load (${response.status}).`);
      }

      const stickingData = stickingResponse?.ok
        ? await stickingResponse.json()
        : undefined;

      this.emit('load-song', {
        data: this.applyOverrides(lesson.song),
        fileData: new Uint8Array(await response.arrayBuffer()),
        ...(stickingData ? { stickingData } : {}),
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

  private saveRun(payload: {
    songId: string;
    summary: RunSummary;
    records?: HitRecord[];
    finalizeAttemptSessionId?: string;
    finalizeAttemptSessionIds?: string[];
  }): void {
    const history = readPracticeHistory();
    const allEntries = [
      ...(history.runs[payload.songId] ?? []),
      {
        summary: payload.summary,
        ...(payload.records === undefined
          ? {}
          : { records: payload.records.map(compactRecord) }),
      },
    ];
    const firstRetainedIndex = Math.max(
      0,
      allEntries.length - MAX_RECENT_PRACTICE_SUMMARIES_PER_SONG,
    );
    const evicted = allEntries.slice(0, firstRetainedIndex);
    const retained = allEntries.slice(firstRetainedIndex);
    const fullResolutionIndexes = retained
      .map((entry, index) => (entry.records === undefined ? -1 : index))
      .filter((index) => index >= 0);
    const recordsToTrim = Math.max(
      0,
      fullResolutionIndexes.length - MAX_RECENT_FULL_PRACTICE_RUNS_PER_SONG,
    );

    for (const index of fullResolutionIndexes.slice(0, recordsToTrim)) {
      delete retained[index].records;
    }

    const archive = archiveRunSummaries(
      history.archiveBySong[payload.songId] ?? emptyPracticeRunArchive(),
      evicted.map(({ summary }) => summary),
    );
    const nextHistory: WebPracticeHistory = {
      ...history,
      runs: { ...history.runs, [payload.songId]: retained },
      archiveBySong:
        evicted.length === 0
          ? history.archiveBySong
          : { ...history.archiveBySong, [payload.songId]: archive },
    };

    writePracticeHistory(nextHistory);

    // localStorage cannot atomically span the completed-history and draft
    // keys. Persist the completed run first: a cleanup failure can leave a
    // harmless stale draft, while clearing first could lose real evidence.
    const finalizedSessionIds = new Set(
      [
        payload.finalizeAttemptSessionId,
        ...(payload.finalizeAttemptSessionIds ?? []),
      ].filter((sessionId): sessionId is string => Boolean(sessionId)),
    );

    if (finalizedSessionIds.size > 0) {
      try {
        const attemptHistory = readPracticeAttemptHistory();

        writePracticeAttemptHistory({
          ...attemptHistory,
          checkpointsBySong: {
            ...attemptHistory.checkpointsBySong,
            [payload.songId]: readAttemptCheckpoints(
              attemptHistory.checkpointsBySong[payload.songId],
            ).filter(
              (checkpoint) => !finalizedSessionIds.has(checkpoint.sessionId),
            ),
          },
        });
      } catch {
        // The completed run is already durable. Retaining its draft is safer
        // than reporting a false failed completion or losing the draft early.
      }
    }

    this.emit(
      'save-practice-run',
      responseForRuns(payload.songId, retained, archive),
    );
  }

  /**
   * Mirrors the desktop checkpoint contract. This persistence remains local
   * to the browser and never contributes to completed-run analytics.
   */
  private saveAttemptCheckpoint(payload: {
    checkpoint: Omit<
      PracticeAttemptCheckpoint,
      'schemaVersion' | 'state' | 'records'
    > & { records: HitRecord[] };
  }): void {
    const checkpoint = payload?.checkpoint;

    if (!checkpoint?.songId) {
      throw new Error('checkpoint.songId is required');
    }

    if (!checkpoint.sessionId) {
      throw new Error('checkpoint.sessionId is required');
    }

    const history = readPracticeAttemptHistory();
    const normalized: PracticeAttemptCheckpoint = {
      schemaVersion: PRACTICE_ATTEMPT_CHECKPOINT_SCHEMA_VERSION,
      state: 'in-progress',
      songId: checkpoint.songId,
      sessionId: checkpoint.sessionId,
      startedAt: checkpoint.startedAt,
      updatedAt: checkpoint.updatedAt,
      chartRevision: checkpoint.chartRevision,
      mode: checkpoint.mode,
      difficulty: checkpoint.difficulty,
      playbackSpeed: checkpoint.playbackSpeed,
      positionTick: checkpoint.positionTick,
      records: checkpoint.records
        .map(compactRecord)
        .slice(-MAX_PRACTICE_ATTEMPT_RECORDS),
    };
    const checkpoints = [
      ...(history.checkpointsBySong[normalized.songId] ?? []).filter(
        (candidate) => candidate.sessionId !== normalized.sessionId,
      ),
      normalized,
    ]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(-MAX_PRACTICE_ATTEMPT_CHECKPOINTS_PER_SONG);

    writePracticeAttemptHistory({
      ...history,
      checkpointsBySong: {
        ...history.checkpointsBySong,
        [normalized.songId]: checkpoints,
      },
    });
    this.emit('save-practice-attempt-checkpoint', {
      songId: normalized.songId,
      checkpoints,
    });
  }

  private finalizeAttemptCheckpoint(payload: {
    songId: string;
    sessionId: string;
  }): void {
    if (!payload?.songId) {
      throw new Error('songId is required');
    }

    if (!payload.sessionId) {
      throw new Error('sessionId is required');
    }

    const history = readPracticeAttemptHistory();
    const checkpoints = readAttemptCheckpoints(
      history.checkpointsBySong[payload.songId],
    ).filter((checkpoint) => checkpoint.sessionId !== payload.sessionId);

    writePracticeAttemptHistory({
      ...history,
      checkpointsBySong: {
        ...history.checkpointsBySong,
        [payload.songId]: checkpoints,
      },
    });
    this.emit('finalize-practice-attempt-checkpoint', {
      songId: payload.songId,
      checkpoints,
    });
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
      sourceProvenance: job.sourceProvenance,
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

    const sourceProvenance = normalizeLibrarySourceProvenance(
      request.sourceProvenance,
    );
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
      sourceProvenance,
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

        if (job.sourceProvenance) {
          job.stored = {
            ...job.stored,
            song: {
              ...job.stored.song,
              sourceProvenance: {
                ...job.sourceProvenance,
                artists: [...job.sourceProvenance.artists],
              },
            },
          };
        }

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

      case 'load-library-candidates':
        this.emit('load-library-candidates', await this.loadYandexCandidates());

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
        this.saveRun(
          args[0] as {
            songId: string;
            summary: RunSummary;
            records?: HitRecord[];
            finalizeAttemptSessionId?: string;
            finalizeAttemptSessionIds?: string[];
          },
        );

        break;

      case 'save-practice-attempt-checkpoint':
        this.saveAttemptCheckpoint(
          args[0] as {
            checkpoint: Omit<
              PracticeAttemptCheckpoint,
              'schemaVersion' | 'state' | 'records'
            > & { records: HitRecord[] };
          },
        );

        break;

      case 'load-practice-attempt-checkpoints': {
        const songId = String(args[0]);
        const history = readPracticeAttemptHistory();

        this.emit('load-practice-attempt-checkpoints', {
          songId,
          checkpoints: readAttemptCheckpoints(
            history.checkpointsBySong[songId],
          ),
        });

        break;
      }

      case 'finalize-practice-attempt-checkpoint':
        this.finalizeAttemptCheckpoint(
          args[0] as { songId: string; sessionId: string },
        );

        break;

      case 'load-practice-runs': {
        const id = String(args[0]);
        const history = readPracticeHistory();

        this.emit(
          'load-practice-runs',
          responseForRuns(
            id,
            history.runs[id] ?? [],
            history.archiveBySong[id] ?? emptyPracticeRunArchive(),
          ),
        );

        break;
      }

      case 'load-all-practice-runs': {
        const history = readPracticeHistory();
        const runsBySong = Object.fromEntries(
          Object.entries(history.runs).map(([songId, entries]) => [
            songId,
            entries.map(({ summary }) => summary),
          ]),
        );

        this.emit('load-all-practice-runs', {
          runs: Object.values(runsBySong).flat(),
          runsBySong,
          archiveBySong: history.archiveBySong,
        });

        break;
      }

      case 'load-retired-lessons':
        // Browser storage has never shipped the legacy 118-lesson desktop
        // schema, so it has no retired migration archive to expose.
        this.emit('load-retired-lessons', { lessons: [] });

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

      case 'load-goals':
        this.emit('load-goals', { goals: readGoals() });

        break;

      case 'save-goal':
        this.emit('save-goal', {
          goals: saveWebGoal(args[0] as SaveWebGoalPayload),
        });

        break;

      case 'delete-goal':
        this.emit('delete-goal', {
          goals: deleteWebGoal(String(args[0] ?? '')),
        });

        break;

      case 'set-primary-goal':
        this.emit('set-primary-goal', {
          goals: setPrimaryWebGoal(String(args[0] ?? '')),
        });

        break;

      case 'midi-device-list':
        try {
          this.emit('midi-device-list', await this.midi.listDevices());
        } catch {
          this.emit('midi-device-list', []);
        }

        break;

      case 'listen-midi':
        try {
          const port = Number(args[0]);

          await this.midi.listen(port, (message: MidiMessage) => {
            this.emit('listen-midi', message);
          });
          this.emit('midi-ready', { port });
        } catch (error) {
          this.emit('midi-error', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        break;

      case 'stop-listen-midi':
        this.midi.stop();

        break;

      case 'check-auto-chart-backends':
        this.emit('auto-chart-backends', {
          sightkick: false,
          remote: false,
          octave: false,
          default: 'remote',
        });

        break;

      case 'get-auto-chart-remote-settings':
        this.emit('auto-chart-remote-settings', {
          endpoint: '',
          tokenConfigured: false,
        });

        break;

      case 'save-test-auto-chart-remote':
        this.emit('auto-chart-remote-test', {
          ok: false,
          message:
            'Chart creation is available in the desktop app; this browser deployment has no transcriber connection.',
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
