import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, dialog, IpcMainEvent } from 'electron';
import {
  AutoChartStage,
  IpcAutoChartJob,
  IpcAutoChartMetadata,
  IpcCreateAutoChartRequest,
  IpcImportSongPreview,
  Song,
} from '../../types';
import { ingestSongCover } from '../songCover';
import { importPreparedSong, previewPreparedSong } from './importSong';

const EVENT_PREFIX = '__OCTAVE_EVENT__';
const MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.ogg', '.opus', '.flac']);
const REQUIRED_CHECKPOINTS = [
  'drums_cymbal_onset/best_union_f1.pt',
  'drums_mc_onset/best.pt',
  'drums_phase3/best.pt',
  'drums_v14/best.pt',
  'fret_mapper_v4.pt',
  'guitar_v2/guitar_v2_onset/best.pt',
  'onset_classifier_v12_clean/best_f1.pt',
  'onset_classifier_v12c_community/best_f1.pt',
  'onset_classifier_v15/best_f1.pt',
  'onset_classifier_v16/best_f1.pt',
  'onset_classifier_v4/best_f1.pt',
  'onset_classifier_v6/best_f1.pt',
  'onset_classifier/best_f1.pt',
  'section_classifier/best.pt',
  'tom_refinement_demucs/best.pt',
];

export interface WorkerEvent {
  kind: 'progress' | 'complete' | 'error';
  runId: string;
  stage?: string;
  message?: string;
  percent?: number;
  success?: boolean;
  outputDir?: string;
  songFolders?: string[];
  errors?: string[];
}

interface WorkerHandle {
  kill: () => void;
  done: Promise<void>;
}

interface OctaveRuntime {
  pythonPath: string;
  workerPath: string;
  cacheDir: string;
  sourceDir: string;
  ffmpegDir: string;
}

export interface AutoChartRunner {
  run: (
    payloadPath: string,
    onEvent: (event: WorkerEvent) => void,
  ) => WorkerHandle;
}

interface AutoChartDependencies {
  selectAudio: () => Promise<string | undefined>;
  resolveMetadata: (
    youtubeUrl?: string,
  ) => Promise<IpcAutoChartMetadata | undefined>;
  validateAudio: (filePath: string) => string;
  createTempDir: (id: string) => Promise<string>;
  preflight: () => OctaveRuntime;
  runner: AutoChartRunner;
  preview: (
    sourceDir: string,
    thumbnailUrl?: string,
  ) => Promise<IpcImportSongPreview>;
  importSong: (sourceDir: string, artworkUrl?: string) => Promise<Song>;
  cleanup: (tempDir?: string) => Promise<void>;
  applyMetadata: (
    sourceDir: string,
    metadata?: IpcAutoChartMetadata,
  ) => Promise<void>;
  makeId: () => string;
}

interface AutoChartJob extends IpcAutoChartJob {
  event: IpcMainEvent;
  audioPath?: string;
  tempDir?: string;
  preparedDir?: string;
  cancelled: boolean;
  worker?: WorkerHandle;
}

function toPublicJob(job: AutoChartJob): IpcAutoChartJob {
  const {
    event: _event,
    audioPath: _audioPath,
    tempDir: _tempDir,
    preparedDir: _preparedDir,
    cancelled: _cancelled,
    worker: _worker,
    ...value
  } = job;

  return value;
}

function isTerminal(stage: AutoChartStage): boolean {
  return ['imported', 'failed', 'cancelled'].includes(stage);
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);

  return (
    Boolean(relative) &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function canonicalizeYoutubeUrl(value: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid youtube.com or youtu.be video URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Use an HTTPS youtube.com or youtu.be video URL');
  }

  const host = parsed.hostname.toLowerCase();
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    const parts = parsed.pathname.split('/').filter(Boolean);

    videoId = parts.length === 1 ? parts[0] : null;
  } else if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
    ].includes(host)
  ) {
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    } else {
      const match = parsed.pathname.match(/^\/shorts\/([^/]+)$/);

      videoId = match?.[1] ?? null;
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error(
      'Use a single YouTube video URL, not a playlist or channel URL',
    );
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

function inferTrackIdentity(
  title: string,
  authorName: string,
): Pick<IpcAutoChartMetadata, 'songName' | 'artistName'> {
  const parts = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);

  if (!parts) {
    return { songName: title, artistName: authorName };
  }

  let songName = parts[2]
    .replace(
      /\s*\((?:official\s+(?:music\s+)?(?:video|audio|lyric\s+video)|official\s+visuali[sz]er|lyric\s+video|official\s+audio)\)\s*$/i,
      '',
    )
    .trim();
  let artistName = parts[1].trim();
  const featured =
    songName.match(/\s+(?:ft\.?|feat\.?|featuring)\s+(.+)$/i) ??
    songName.match(/\s+\((?:ft\.?|feat\.?|featuring)\s+([^)]+)\)$/i);

  if (featured) {
    songName = songName.slice(0, featured.index).trim();
    artistName = `${artistName} feat. ${featured[1].trim()}`;
  }

  return { songName, artistName };
}

export function validateLocalAudioFile(filePath: string): string {
  if (typeof filePath !== 'string' || !filePath) {
    throw new Error('Choose a local audio file');
  }

  const lstat = fs.lstatSync(filePath);

  if (lstat.isSymbolicLink()) {
    throw new Error('Symbolic-link audio files are not supported');
  }

  if (!lstat.isFile()) {
    throw new Error('Choose a regular local audio file');
  }

  const extension = path.extname(filePath).toLowerCase();

  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new Error('Choose a WAV, MP3, OGG, OPUS, or FLAC audio file');
  }

  if (lstat.size > MAX_AUDIO_BYTES) {
    throw new Error('Choose an audio file smaller than 2 GB');
  }

  return fs.realpathSync(filePath);
}

export async function fetchOfficialYoutubeMetadata(
  youtubeUrl?: string,
): Promise<IpcAutoChartMetadata | undefined> {
  if (!youtubeUrl?.trim()) {
    return undefined;
  }

  const canonicalUrl = canonicalizeYoutubeUrl(youtubeUrl);
  let response: Response;

  try {
    response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        canonicalUrl,
      )}&format=json`,
      { signal: AbortSignal.timeout(15_000) },
    );
  } catch {
    throw new Error(
      'YouTube metadata request failed; check your connection or omit the URL',
    );
  }

  if (!response.ok) {
    throw new Error(
      'YouTube could not provide official metadata for this video',
    );
  }

  const value: unknown = await response.json();

  if (!value || typeof value !== 'object') {
    throw new Error('YouTube returned invalid official metadata');
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const authorName =
    typeof record.author_name === 'string' ? record.author_name.trim() : '';
  const thumbnailUrl =
    typeof record.thumbnail_url === 'string' ? record.thumbnail_url : undefined;

  if (!title || !authorName) {
    throw new Error('YouTube returned incomplete official metadata');
  }

  if (thumbnailUrl) {
    let thumbnail: URL;

    try {
      thumbnail = new URL(thumbnailUrl);
    } catch {
      throw new Error('YouTube returned an invalid thumbnail URL');
    }

    if (
      thumbnail.protocol !== 'https:' ||
      thumbnail.hostname !== 'i.ytimg.com'
    ) {
      throw new Error('YouTube returned a non-official thumbnail URL');
    }
  }

  return {
    title,
    authorName,
    ...inferTrackIdentity(title, authorName),
    thumbnailUrl,
  };
}

function resolveOctaveRuntime(): OctaveRuntime {
  const home = app.getPath('home');
  const appRoot = [
    '/Applications/OCTAVE.app',
    path.join(home, 'Applications', 'OCTAVE.app'),
  ].find((candidate) =>
    fs.existsSync(
      path.join(
        candidate,
        'Contents',
        'Resources',
        'app.asar.unpacked',
        'resources',
        'strum',
        'strum_worker.py',
      ),
    ),
  );

  if (!appRoot) {
    throw new Error(
      'OCTAVE for macOS is required. Install OCTAVE in /Applications or ~/Applications before creating a chart',
    );
  }

  const resources = path.join(
    appRoot,
    'Contents',
    'Resources',
    'app.asar.unpacked',
  );
  const cacheCandidates = [
    path.join(
      home,
      'Library',
      'Application Support',
      'octave',
      'Cache',
      'strum',
    ),
    path.join(
      home,
      'Library',
      'Application Support',
      'octave',
      'cache',
      'strum',
    ),
  ];
  const cacheDir = cacheCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );

  if (!cacheDir) {
    throw new Error(
      'OCTAVE local STRUM cache is unavailable; open OCTAVE to restore its local runtime',
    );
  }

  const canonicalCacheDir = fs.realpathSync(cacheDir);

  return {
    pythonPath: path.join(
      home,
      'Library',
      'Application Support',
      'octave',
      'python-runtime',
      'python',
      'bin',
      'python3',
    ),
    workerPath: path.join(resources, 'resources', 'strum', 'strum_worker.py'),
    cacheDir: canonicalCacheDir,
    sourceDir: path.join(canonicalCacheDir, 'strum-source'),
    ffmpegDir: path.join(resources, 'node_modules', 'ffmpeg-static'),
  };
}

function preflightOctaveRuntime(): OctaveRuntime {
  const runtime = resolveOctaveRuntime();

  for (const filePath of [runtime.pythonPath, runtime.workerPath]) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(
        'OCTAVE local Python runtime is unavailable; repair OCTAVE before creating a chart',
      );
    }
  }

  if (
    !fs.existsSync(path.join(runtime.sourceDir, 'scripts', 'batch_pipeline.py'))
  ) {
    throw new Error(
      'OCTAVE local STRUM source is unavailable; open OCTAVE to restore its local runtime',
    );
  }

  const missing = REQUIRED_CHECKPOINTS.filter(
    (checkpoint) =>
      !fs.existsSync(path.join(runtime.sourceDir, 'checkpoints', checkpoint)),
  );

  if (missing.length > 0) {
    throw new Error(
      'OCTAVE local STRUM checkpoints are incomplete; restore them in OCTAVE before creating a chart',
    );
  }

  return runtime;
}

function workerEnvironment(runtime: OctaveRuntime): NodeJS.ProcessEnv {
  const runtimePath = [runtime.ffmpegDir, process.env.PATH]
    .filter(Boolean)
    .join(path.delimiter);

  return {
    ...process.env,
    PYTHONUTF8: '1',
    OCTAVE_PACKAGED: '1',
    OCTAVE_STRUM_DISABLE_ONLINE_LOOKUP: '1',
    OCTAVE_STRUM_FAST_METADATA_LOOKUP: '0',
    OCTAVE_STRUM_SKIP_HARMONIES: '1',
    OCTAVE_STRUM_SOURCE_DIR: runtime.sourceDir,
    OCTAVE_DEMUCS_CPP_BIN: undefined,
    PATH: runtimePath,
  };
}

export function parseWorkerLine(line: string): WorkerEvent | undefined {
  if (!line.startsWith(EVENT_PREFIX)) {
    return undefined;
  }

  try {
    const value = JSON.parse(line.slice(EVENT_PREFIX.length)) as unknown;

    if (
      !value ||
      typeof value !== 'object' ||
      !['progress', 'complete', 'error'].includes(
        (value as Record<string, unknown>).kind as string,
      ) ||
      typeof (value as Record<string, unknown>).runId !== 'string'
    ) {
      return undefined;
    }

    return value as WorkerEvent;
  } catch {
    return undefined;
  }
}

function createChildRunner(): AutoChartRunner {
  return {
    run(payloadPath, onEvent) {
      const runtime = preflightOctaveRuntime();
      const child = spawn(
        runtime.pythonPath,
        [runtime.workerPath, '--payload-file', payloadPath],
        {
          cwd: path.dirname(payloadPath),
          env: workerEnvironment(runtime),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      const processOutput = (chunk: Buffer) => {
        output += chunk.toString('utf8');

        const lines = output.split(/\r?\n/);

        output = lines.pop() ?? '';

        for (const line of lines) {
          const event = parseWorkerLine(line);

          if (event) {
            onEvent(event);
          }
        }
      };

      child.stdout?.on('data', processOutput);
      child.stderr?.pipe(process.stderr);

      return {
        kill: () => child.kill('SIGTERM'),
        done: waitForChild(child, () => {
          const event = parseWorkerLine(output);

          if (event) {
            onEvent(event);
          }
        }),
      };
    },
  };
}

function waitForChild(child: ChildProcess, flush: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => {
      flush();
      resolve();
    });
  });
}

async function createTempDir(id: string): Promise<string> {
  const root = path.join(os.tmpdir(), 'sightkick-auto-chart');

  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });

  return fs.promises.mkdtemp(path.join(root, `${id}-`));
}

async function cleanupTempDir(tempDir?: string): Promise<void> {
  if (tempDir) {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function cleanIniValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function upsertIniField(
  source: string,
  field: 'name' | 'artist',
  value: string,
): string {
  const cleanValue = cleanIniValue(value);
  const expression = new RegExp(`^(\\s*${field}\\s*=\\s*).*$`, 'im');

  if (expression.test(source)) {
    return source.replace(
      expression,
      (_match, prefix: string) => `${prefix}${cleanValue}`,
    );
  }

  const section = /(\[song\]\s*\r?\n)/i;

  if (!section.test(source)) {
    throw new Error('Generated chart has an invalid song.ini file');
  }

  return source.replace(
    section,
    (_match, prefix: string) => `${prefix}${field} = ${cleanValue}\n`,
  );
}

export async function applyOfficialMetadata(
  sourceDir: string,
  metadata?: IpcAutoChartMetadata,
): Promise<void> {
  if (!metadata) {
    return;
  }

  const iniPath = path.join(sourceDir, 'song.ini');
  const source = await fs.promises.readFile(iniPath, 'utf8');
  const updated = upsertIniField(
    upsertIniField(source, 'name', metadata.songName ?? metadata.title),
    'artist',
    metadata.artistName ?? metadata.authorName,
  );

  if (updated !== source) {
    await fs.promises.writeFile(iniPath, updated, 'utf8');
  }

  if (metadata.thumbnailUrl) {
    try {
      await ingestSongCover(sourceDir, metadata.thumbnailUrl);
    } catch {
      metadata.thumbnailUrl = undefined;
    }
  }
}

function defaultDependencies(): AutoChartDependencies {
  return {
    selectAudio: async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: 'Choose local audio you own or are allowed to process',
        filters: [
          {
            name: 'Supported audio',
            extensions: ['wav', 'mp3', 'ogg', 'opus', 'flac'],
          },
        ],
      });

      return result.canceled ? undefined : result.filePaths[0];
    },
    resolveMetadata: fetchOfficialYoutubeMetadata,
    validateAudio: validateLocalAudioFile,
    createTempDir,
    preflight: preflightOctaveRuntime,
    runner: createChildRunner(),
    preview: (sourceDir, thumbnailUrl) =>
      previewPreparedSong(sourceDir, { thumbnailUrl }),
    importSong: (sourceDir, artworkUrl) =>
      importPreparedSong({ sourceDir, artworkUrl }),
    cleanup: cleanupTempDir,
    applyMetadata: applyOfficialMetadata,
    makeId: randomUUID,
  };
}

export class AutoChartQueue {
  private readonly jobs = new Map<string, AutoChartJob>();
  private readonly pending: string[] = [];
  private activeId?: string;

  constructor(
    private readonly dependencies: AutoChartDependencies = defaultDependencies(),
  ) {}

  async create(
    event: IpcMainEvent,
    request: IpcCreateAutoChartRequest,
  ): Promise<void> {
    const job: AutoChartJob = {
      id: this.dependencies.makeId(),
      attempt: 1,
      stage: 'resolving',
      message: 'Checking optional YouTube metadata',
      event,
      cancelled: false,
    };

    this.jobs.set(job.id, job);
    this.notify(job);

    try {
      const youtubeUrl =
        request && typeof request.youtubeUrl === 'string'
          ? request.youtubeUrl
          : undefined;

      job.metadata = await this.dependencies.resolveMetadata(youtubeUrl);

      if (job.cancelled) {
        return;
      }

      job.message = 'Choose local audio you own or are allowed to process';
      this.notify(job);

      const selectedAudio = await this.dependencies.selectAudio();

      if (job.cancelled) {
        return;
      }

      if (!selectedAudio) {
        await this.cancelJob(job);

        return;
      }

      job.audioPath = this.dependencies.validateAudio(selectedAudio);
      job.sourceName = path.basename(job.audioPath);
      job.tempDir = await this.dependencies.createTempDir(job.id);
      this.transition(
        job,
        'queued',
        'Chart queued for local OCTAVE processing',
      );
      this.pending.push(job.id);
      void this.processNext();
    } catch (error) {
      await this.fail(job, safeMessage(error));
    }
  }

  async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id);

    if (!job || isTerminal(job.stage) || job.stage === 'importing') {
      return;
    }

    job.cancelled = true;

    const queuedIndex = this.pending.indexOf(id);

    if (queuedIndex >= 0) {
      this.pending.splice(queuedIndex, 1);
      await this.cancelJob(job);

      return;
    }

    job.worker?.kill();

    if (id !== this.activeId) {
      await this.cancelJob(job);
    }
  }

  async retry(event: IpcMainEvent, id: string): Promise<void> {
    const previous = this.jobs.get(id);

    if (
      !previous ||
      !['failed', 'cancelled'].includes(previous.stage) ||
      !previous.audioPath
    ) {
      return;
    }

    const { audioPath } = previous;
    const job: AutoChartJob = {
      id: this.dependencies.makeId(),
      attempt: previous.attempt + 1,
      stage: 'queued',
      message: 'Chart queued for local OCTAVE processing',
      event,
      audioPath,
      sourceName: previous.sourceName,
      metadata: previous.metadata,
      cancelled: false,
    };

    try {
      job.audioPath = this.dependencies.validateAudio(audioPath);
      job.tempDir = await this.dependencies.createTempDir(job.id);
      this.jobs.set(job.id, job);
      this.notify(job);
      this.pending.push(job.id);
      void this.processNext();
    } catch (error) {
      this.jobs.set(job.id, job);
      await this.fail(job, safeMessage(error));
    }
  }

  async discardPreview(id: string): Promise<void> {
    const job = this.jobs.get(id);

    if (!job || job.stage !== 'preview-ready') {
      return;
    }

    job.cancelled = true;
    await this.cancelJob(job);
  }

  async import(id: string): Promise<void> {
    const job = this.jobs.get(id);

    if (!job || job.stage !== 'preview-ready' || !job.preparedDir) {
      return;
    }

    this.transition(
      job,
      'importing',
      'Adding reviewed chart to the current library',
    );

    try {
      const song = await this.dependencies.importSong(
        job.preparedDir,
        job.metadata?.thumbnailUrl,
      );

      job.preview = undefined;
      job.song = song;
      this.transition(
        job,
        'imported',
        `Added "${song.name}" to the current library`,
      );
      await this.dependencies.cleanup(job.tempDir);
      job.tempDir = undefined;
      job.preparedDir = undefined;
    } catch (error) {
      await this.fail(job, safeMessage(error));
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      [...this.jobs.values()]
        .filter((job) => !isTerminal(job.stage))
        .map(async (job) => {
          job.cancelled = true;
          job.worker?.kill();
          await this.cancelJob(job);
        }),
    );
  }

  private async processNext(): Promise<void> {
    if (this.activeId || this.pending.length === 0) {
      return;
    }

    const id = this.pending.shift()!;
    const job = this.jobs.get(id);

    if (!job || job.cancelled || job.stage !== 'queued') {
      void this.processNext();

      return;
    }

    this.activeId = id;

    try {
      await this.run(job);
    } finally {
      if (this.activeId === id) {
        this.activeId = undefined;
      }

      void this.processNext();
    }
  }

  private async run(job: AutoChartJob): Promise<void> {
    try {
      if (!job.audioPath || !job.tempDir) {
        throw new Error('Auto-chart job has no local audio input');
      }

      job.audioPath = this.dependencies.validateAudio(job.audioPath);

      const runtime = this.dependencies.preflight();
      const payloadPath = path.join(job.tempDir, 'payload.json');
      const payload = {
        runId: job.id,
        cacheDir: runtime.cacheDir,
        outputDir: job.tempDir,
        files: [job.audioPath],
        urls: [],
        includeKeys: false,
        enabledTracks: {
          drums: true,
          bass: false,
          guitar: false,
          keys: false,
          vocals: false,
          proKeys: false,
        },
        keepStems: true,
        autoTempo: true,
        autoTempoDrift: true,
        autoTempoSnap: true,
      };

      await fs.promises.writeFile(payloadPath, JSON.stringify(payload), {
        encoding: 'utf8',
        mode: 0o600,
      });
      this.transition(
        job,
        'processing',
        'OCTAVE is preparing a drum chart locally',
        0,
      );

      let workerEvents = Promise.resolve();

      job.worker = this.dependencies.runner.run(payloadPath, (event) => {
        workerEvents = workerEvents
          .then(() => this.handleWorkerEvent(job, event))
          .catch((error) => this.fail(job, safeMessage(error)));
      });
      await job.worker.done;
      await workerEvents;

      if (job.cancelled && !isTerminal(job.stage)) {
        await this.cancelJob(job);
      } else if (!isTerminal(job.stage) && job.stage !== 'preview-ready') {
        await this.fail(job, 'OCTAVE worker exited before preparing a chart');
      }
    } catch (error) {
      if (job.cancelled) {
        await this.cancelJob(job);
      } else {
        await this.fail(job, safeMessage(error));
      }
    } finally {
      job.worker = undefined;
    }
  }

  private async handleWorkerEvent(
    job: AutoChartJob,
    event: WorkerEvent,
  ): Promise<void> {
    if (event.runId !== job.id || isTerminal(job.stage) || job.cancelled) {
      return;
    }

    if (event.kind === 'progress') {
      const percent =
        typeof event.percent === 'number'
          ? Math.max(
              job.percent ?? 0,
              Math.min(100, Math.max(0, event.percent)),
            )
          : job.percent;

      this.transition(
        job,
        'processing',
        event.message || 'OCTAVE is processing local audio',
        percent,
      );

      return;
    }

    if (event.kind === 'error') {
      await this.fail(job, event.message || 'OCTAVE could not prepare a chart');

      return;
    }

    if (!event.success) {
      await this.fail(
        job,
        event.errors?.[0] || 'OCTAVE could not prepare a chart',
      );

      return;
    }

    const preparedDir = this.validPreparedDir(job, event);

    await this.dependencies.applyMetadata(preparedDir, job.metadata);
    job.preparedDir = preparedDir;
    job.preview = await this.dependencies.preview(
      preparedDir,
      job.metadata?.thumbnailUrl,
    );
    this.transition(
      job,
      'preview-ready',
      'Chart is ready to review before adding it to your library',
      100,
    );
  }

  private validPreparedDir(job: AutoChartJob, event: WorkerEvent): string {
    if (!job.tempDir || !event.outputDir || event.songFolders?.length !== 1) {
      throw new Error('OCTAVE returned an unexpected prepared-chart location');
    }

    const preparedDir = fs.realpathSync(event.songFolders[0]);
    const tempDir = fs.realpathSync(job.tempDir);
    const outputDir = fs.realpathSync(event.outputDir);
    const stat = fs.lstatSync(preparedDir);

    if (
      outputDir !== tempDir ||
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      !isInside(tempDir, preparedDir)
    ) {
      throw new Error('OCTAVE returned an unsafe prepared-chart location');
    }

    return preparedDir;
  }

  private transition(
    job: AutoChartJob,
    stage: AutoChartStage,
    message: string,
    percent?: number,
  ): void {
    job.stage = stage;
    job.message = message;
    job.percent = percent;
    job.error = undefined;
    this.notify(job);
  }

  private async fail(job: AutoChartJob, error: string): Promise<void> {
    if (isTerminal(job.stage)) {
      return;
    }

    job.stage = 'failed';
    job.error = error;
    job.message = 'Chart creation failed';
    this.notify(job);
    await this.dependencies.cleanup(job.tempDir);
    job.tempDir = undefined;
    job.preparedDir = undefined;
  }

  private async cancelJob(job: AutoChartJob): Promise<void> {
    if (isTerminal(job.stage)) {
      return;
    }

    job.stage = 'cancelled';
    job.error = undefined;
    job.message = 'Chart creation cancelled';
    this.notify(job);
    await this.dependencies.cleanup(job.tempDir);
    job.tempDir = undefined;
    job.preparedDir = undefined;
  }

  private notify(job: AutoChartJob): void {
    job.event.reply('auto-chart-update', toPublicJob(job));
  }
}

export const autoChartQueue = new AutoChartQueue();

export function createAutoChart(
  event: IpcMainEvent,
  request: IpcCreateAutoChartRequest,
): void {
  void autoChartQueue.create(event, request);
}

export function cancelAutoChart(_event: IpcMainEvent, id: string): void {
  void autoChartQueue.cancel(id);
}

export function retryAutoChart(event: IpcMainEvent, id: string): void {
  void autoChartQueue.retry(event, id);
}

export function discardAutoChartPreview(
  _event: IpcMainEvent,
  id: string,
): void {
  void autoChartQueue.discardPreview(id);
}

export function importAutoChart(_event: IpcMainEvent, id: string): void {
  void autoChartQueue.import(id);
}
