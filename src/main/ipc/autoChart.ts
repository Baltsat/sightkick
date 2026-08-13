import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app, dialog, IpcMainEvent } from 'electron';
import {
  AutoChartBackend,
  AutoChartStage,
  IpcAutoChartBackendsResponse,
  IpcAutoChartJob,
  IpcAutoChartMetadata,
  IpcCreateAutoChartRequest,
  IpcImportSongPreview,
  LibrarySourceTrackProvenance,
  PlayabilityEvidence,
  Song,
} from '../../types';
import { caCertEnv, getBinaryPath } from '../stemTools';
import { ingestSongCover } from '../songCover';
import { normalizeLibrarySourceProvenance } from '../../library-sources/provenance';
import { createLocalAutoChartEvidence } from '../playability';
import { importPreparedSong, previewPreparedSong } from './importSong';
import {
  createRemoteAutoChartRunner,
  getRemoteAutoChartRuntime,
  isRemoteAutoChartAvailable,
  RemoteAutoChartRunner,
} from './remoteAutoChart';

const EVENT_PREFIX = '__OCTAVE_EVENT__';
const SK_EVENT_PREFIX = '__SK_EVENT__ ';
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

// OCTAVE's local STRUM worker protocol: one child process handles a batch
// of runIds, so every event names the run it belongs to.
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

// resources/transcriber/run.sh's protocol: one process per job, so there is
// no runId to correlate against.
export interface SkWorkerEvent {
  kind: 'progress' | 'complete' | 'error';
  stage?: 'download' | 'separate' | 'beats' | 'transcribe' | 'write';
  message?: string;
  percent?: number;
  success?: boolean;
  songDir?: string;
  code?: string;
}

export interface WorkerHandle {
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

interface AutoChartBackends {
  sightkick: boolean;
  remote?: boolean;
  octave: boolean;
}

interface SightkickRunInput {
  tempDir: string;
  youtubeUrl?: string;
  audioPath?: string;
  difficulty?: string;
  runtime: SightkickRuntime;
}

export interface SightkickRuntime {
  runnerPath: string;
  ffmpegPath: string;
  dataDir: string;
  uvPath?: string;
  pythonPath?: string;
}

export interface FfmpegRuntimeCandidateOptions {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  platform?: NodeJS.Platform;
  architecture?: string;
}

export interface AutoChartRunner {
  run: (
    payloadPath: string,
    onEvent: (event: WorkerEvent) => void,
  ) => WorkerHandle;
}

export interface SightkickRunner {
  run: (
    input: SightkickRunInput,
    onEvent: (event: SkWorkerEvent) => void,
  ) => WorkerHandle;
}

interface AutoChartDependencies {
  selectAudio: () => Promise<string | undefined>;
  resolveMetadata: (
    youtubeUrl?: string,
  ) => Promise<IpcAutoChartMetadata | undefined>;
  validateAudio: (filePath: string) => string;
  createTempDir: (id: string) => Promise<string>;
  detectBackends: () => AutoChartBackends | Promise<AutoChartBackends>;
  preflightOctave: () => OctaveRuntime;
  preflightSightkick: () => SightkickRuntime;
  preflightRemote: typeof getRemoteAutoChartRuntime;
  octaveRunner: AutoChartRunner;
  sightkickRunner: SightkickRunner;
  remoteRunner: RemoteAutoChartRunner;
  preview: (
    sourceDir: string,
    thumbnailUrl?: string,
  ) => Promise<IpcImportSongPreview>;
  importSong: (
    sourceDir: string,
    artworkUrl?: string,
    playability?: PlayabilityEvidence,
  ) => Promise<Song>;
  cleanup: (tempDir?: string) => Promise<void>;
  applyMetadata: (
    sourceDir: string,
    metadata?: IpcAutoChartMetadata,
    sourceProvenance?: LibrarySourceTrackProvenance,
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

// `youtubeUrl` is deliberately kept (it's part of IpcAutoChartJob, safe to
// expose to the renderer) — only the private, main-process-only fields are
// stripped. `jobs` is never carried on the internal job object itself, so
// there's nothing to strip there; notify() attaches it separately on the
// outer envelope only.
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

function backendLabel(backend: AutoChartBackend): string {
  if (backend === 'octave') {
    return 'local OCTAVE';
  }

  return backend === 'remote' ? 'remote Drumroll' : 'Drumroll';
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
      const match = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)$/);

      videoId = match?.[1] ?? null;
    }
  } else if (
    ['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)
  ) {
    const match = parsed.pathname.match(/^\/embed\/([^/]+)$/);

    videoId = match?.[1] ?? null;
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

  if (process.env.SIGHTKICK_DISABLE_YOUTUBE_METADATA === '1') {
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
    return undefined;
  }

  if (!response.ok) {
    return undefined;
  }

  let value: unknown;

  try {
    value = await response.json();
  } catch {
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const authorName =
    typeof record.author_name === 'string' ? record.author_name.trim() : '';
  const thumbnailUrl =
    typeof record.thumbnail_url === 'string' ? record.thumbnail_url : undefined;

  if (!title || !authorName) {
    return undefined;
  }

  if (thumbnailUrl) {
    let thumbnail: URL;

    try {
      thumbnail = new URL(thumbnailUrl);
    } catch {
      return {
        title,
        authorName,
        ...inferTrackIdentity(title, authorName),
      };
    }

    if (
      thumbnail.protocol !== 'https:' ||
      thumbnail.hostname !== 'i.ytimg.com'
    ) {
      return {
        title,
        authorName,
        ...inferTrackIdentity(title, authorName),
      };
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
  const ffmpegPath = resolveDrumrollFfmpegPath();

  if (!ffmpegPath) {
    throw new Error(
      'OCTAVE charting requires Drumroll FFmpeg, SK_FFMPEG, or ffmpeg on PATH',
    );
  }

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
    ffmpegDir: path.dirname(ffmpegPath),
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

function isOctaveAvailable(): boolean {
  try {
    resolveOctaveRuntime();

    return true;
  } catch {
    return false;
  }
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

// resources/transcriber/run.sh streams "__SK_EVENT__ {json}\n" lines on
// stdout. Only lines carrying that exact prefix (with its trailing space)
// and a well-formed event object are treated as events; everything else on
// stdout is ignored so stray tool output can never be misparsed.
export function parseSkEventLine(line: string): SkWorkerEvent | undefined {
  if (!line.startsWith(SK_EVENT_PREFIX)) {
    return undefined;
  }

  try {
    const value = JSON.parse(line.slice(SK_EVENT_PREFIX.length)) as unknown;

    if (
      !value ||
      typeof value !== 'object' ||
      !['progress', 'complete', 'error'].includes(
        (value as Record<string, unknown>).kind as string,
      )
    ) {
      return undefined;
    }

    return value as SkWorkerEvent;
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

function resolveSightkickRunnerPath(): string {
  if (process.env.SIGHTKICK_TRANSCRIBER_PATH) {
    return process.env.SIGHTKICK_TRANSCRIBER_PATH;
  }

  return app.isPackaged
    ? path.join(process.resourcesPath, 'transcriber', 'run.sh')
    : path.join(__dirname, '../../resources/transcriber', 'run.sh');
}

function executableFile(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }

  try {
    fs.accessSync(filePath, fs.constants.X_OK);

    return fs.statSync(filePath).isFile() ? filePath : undefined;
  } catch {
    return undefined;
  }
}

function executableOnPath(name: string): string | undefined {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = executableFile(path.join(directory, name));

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

export function drumrollFfmpegRuntimeCandidates({
  isPackaged,
  resourcesPath,
  appPath,
  platform = process.platform,
  architecture = process.arch,
}: FfmpegRuntimeCandidateOptions): string[] {
  if (platform !== 'darwin' || architecture !== 'arm64') {
    return [];
  }

  if (isPackaged) {
    return [path.join(resourcesPath, 'ffmpeg-runtime', 'bin', 'ffmpeg')];
  }

  return [
    path.join(
      appPath,
      'node_modules',
      '.cache',
      'drumroll-ffmpeg',
      'macos-arm64',
      'bin',
      'ffmpeg',
    ),
  ];
}

function resolveDrumrollFfmpegPath(): string | undefined {
  const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  return [
    process.env.SK_FFMPEG,
    ...drumrollFfmpegRuntimeCandidates({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    }),
    executableOnPath(ffmpegName),
  ].find(executableFile);
}

export function validateSightkickRuntime(
  runtime: Partial<SightkickRuntime>,
): SightkickRuntime {
  const runnerPath = executableFile(runtime.runnerPath);

  if (!runnerPath) {
    throw new Error(
      'The bundled Drumroll transcriber is missing or is not executable; reinstall Drumroll or switch to the OCTAVE backend',
    );
  }

  const ffmpegPath = executableFile(runtime.ffmpegPath);

  if (!ffmpegPath) {
    throw new Error(
      'The Drumroll FFmpeg runtime is unavailable; reinstall Drumroll, set SK_FFMPEG, or add ffmpeg to PATH before creating a chart',
    );
  }

  const uvPath = executableFile(runtime.uvPath);
  const pythonPath = executableFile(runtime.pythonPath);

  if (!uvPath && !pythonPath) {
    throw new Error(
      'Drumroll auto-chart requires bundled uv or Python 3.12+; reinstall Drumroll or install Python 3.12',
    );
  }

  if (!runtime.dataDir) {
    throw new Error('Drumroll transcriber data directory is unavailable');
  }

  return {
    runnerPath,
    ffmpegPath,
    dataDir: runtime.dataDir,
    uvPath,
    pythonPath,
  };
}

function preflightSightkickRuntime(): SightkickRuntime {
  const ffmpegPath = resolveDrumrollFfmpegPath();
  const uvPath = executableFile(process.env.SK_UV) ?? executableOnPath('uv');
  const pythonName = process.platform === 'win32' ? 'python.exe' : 'python3';
  const pythonPath = executableOnPath(pythonName);

  return validateSightkickRuntime({
    runnerPath: resolveSightkickRunnerPath(),
    ffmpegPath,
    dataDir: path.join(app.getPath('userData'), 'transcriber'),
    uvPath,
    pythonPath,
  });
}

function isSightkickRunnerAvailable(): boolean {
  try {
    preflightSightkickRuntime();

    return true;
  } catch {
    return false;
  }
}

function sightkickArgs(input: SightkickRunInput): string[] {
  const args: string[] = [];

  if (input.audioPath) {
    args.push('--audio', input.audioPath);
  } else if (input.youtubeUrl) {
    args.push('--url', input.youtubeUrl);
  } else {
    throw new Error(
      'Drumroll auto-chart requires a YouTube URL or local audio file',
    );
  }

  args.push('--out', input.tempDir);

  const stemsBin = getBinaryPath();

  if (fs.existsSync(stemsBin)) {
    args.push('--stems-bin', stemsBin);
  }

  args.push('--difficulty', input.difficulty ?? 'expert');

  return args;
}

interface SkEventReader {
  push: (chunk: string) => void;
  flush: () => void;
}

// stdout arrives from the child process in arbitrary OS-level chunks, so a
// "__SK_EVENT__ {...}\n" line can be split anywhere: mid-prefix, mid-JSON,
// or with several events landing in one chunk. This reader buffers between
// pushes and only ever hands parseSkEventLine complete, newline-terminated
// lines, so a chunk boundary can never corrupt an event.
export function createSkEventReader(
  onEvent: (event: SkWorkerEvent) => void,
): SkEventReader {
  let buffer = '';

  return {
    push(chunk: string) {
      buffer += chunk;

      const lines = buffer.split(/\r?\n/);

      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = parseSkEventLine(line);

        if (event) {
          onEvent(event);
        }
      }
    },
    flush() {
      const event = parseSkEventLine(buffer);

      if (event) {
        onEvent(event);
      }

      buffer = '';
    },
  };
}

function createSightkickRunner(): SightkickRunner {
  return {
    run(input, onEvent) {
      const runtimePath = [
        path.dirname(input.runtime.ffmpegPath),
        input.runtime.uvPath ? path.dirname(input.runtime.uvPath) : undefined,
        input.runtime.pythonPath
          ? path.dirname(input.runtime.pythonPath)
          : undefined,
        process.env.PATH,
      ]
        .filter(Boolean)
        .join(path.delimiter);
      const child = spawn(input.runtime.runnerPath, sightkickArgs(input), {
        cwd: input.tempDir,
        env: {
          ...process.env,
          ...caCertEnv(),
          PATH: runtimePath,
          SK_FFMPEG: input.runtime.ffmpegPath,
          SK_TRANSCRIBER_DATA: input.runtime.dataDir,
          ...(input.runtime.uvPath ? { SK_UV: input.runtime.uvPath } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const reader = createSkEventReader(onEvent);

      child.stdout?.on('data', (chunk: Buffer) =>
        reader.push(chunk.toString('utf8')),
      );
      child.stderr?.pipe(process.stderr);

      return {
        kill: () => child.kill('SIGTERM'),
        done: waitForChild(child, () => reader.flush()),
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
  field:
    | 'name'
    | 'artist'
    | 'sk_source_provider'
    | 'sk_source_collection_id'
    | 'sk_source_collection_name'
    | 'sk_source_track_id'
    | 'sk_source_title'
    | 'sk_source_artists'
    | 'sk_source_duration'
    | 'sk_source_url',
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
  sourceProvenance?: LibrarySourceTrackProvenance,
): Promise<void> {
  if (!metadata && !sourceProvenance) {
    return;
  }

  const iniPath = path.join(sourceDir, 'song.ini');
  const source = await fs.promises.readFile(iniPath, 'utf8');
  let updated = source;

  if (metadata) {
    updated = upsertIniField(
      upsertIniField(updated, 'name', metadata.songName ?? metadata.title),
      'artist',
      metadata.artistName ?? metadata.authorName,
    );
  }

  if (sourceProvenance) {
    const fields = [
      ['sk_source_provider', sourceProvenance.provider],
      ['sk_source_collection_id', sourceProvenance.collectionId],
      ['sk_source_collection_name', sourceProvenance.collectionName],
      ['sk_source_track_id', sourceProvenance.trackId],
      ['sk_source_title', sourceProvenance.title],
      ['sk_source_artists', JSON.stringify(sourceProvenance.artists)],
      ...(sourceProvenance.durationSeconds
        ? ([
            ['sk_source_duration', String(sourceProvenance.durationSeconds)],
          ] as const)
        : []),
      ...(sourceProvenance.sourceUrl
        ? ([['sk_source_url', sourceProvenance.sourceUrl]] as const)
        : []),
    ] as const;

    for (const [field, value] of fields) {
      updated = upsertIniField(updated, field, value);
    }
  }

  if (updated !== source) {
    await fs.promises.writeFile(iniPath, updated, 'utf8');
  }

  // The inferred songName/artistName (never the raw oEmbed title/authorName,
  // which still carries "Official Video"/"ft. X" cruft) is what lets
  // ingestSongCover try a real iTunes cover before falling back to the
  // YouTube thumbnail. Only build an identity when *both* are present —
  // fetchOfficialYoutubeMetadata always sets them together via
  // inferTrackIdentity, so this is really just a defensive narrowing.
  const identity =
    metadata?.songName && metadata.artistName
      ? { artist: metadata.artistName, title: metadata.songName }
      : undefined;

  if (metadata?.thumbnailUrl || identity) {
    try {
      await ingestSongCover(sourceDir, metadata?.thumbnailUrl, identity);
    } catch {
      if (metadata) {
        metadata.thumbnailUrl = undefined;
      }
    }
  }
}

async function detectBackends(): Promise<AutoChartBackends> {
  return {
    sightkick: isSightkickRunnerAvailable(),
    remote: await isRemoteAutoChartAvailable(),
    octave: isOctaveAvailable(),
  };
}

function preferredBackend(backends: AutoChartBackends): AutoChartBackend {
  if (backends.sightkick) {
    return 'sightkick';
  }

  return backends.remote ? 'remote' : 'octave';
}

export function checkAutoChartBackends(event: IpcMainEvent): void {
  void detectBackends().then((backends) => {
    event.reply('auto-chart-backends', {
      sightkick: backends.sightkick,
      remote: Boolean(backends.remote),
      octave: backends.octave,
      default: preferredBackend(backends),
    } satisfies IpcAutoChartBackendsResponse);
  });
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
    detectBackends,
    preflightOctave: preflightOctaveRuntime,
    preflightSightkick: preflightSightkickRuntime,
    preflightRemote: getRemoteAutoChartRuntime,
    octaveRunner: createChildRunner(),
    sightkickRunner: createSightkickRunner(),
    remoteRunner: createRemoteAutoChartRunner(),
    preview: (sourceDir, thumbnailUrl) =>
      previewPreparedSong(sourceDir, { thumbnailUrl }),
    importSong: (sourceDir, artworkUrl, playability) =>
      importPreparedSong({ sourceDir, artworkUrl, playability }),
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
      backend: 'sightkick',
      event,
      cancelled: false,
      autoImport: request?.autoImport === true,
    };

    try {
      job.sourceProvenance = normalizeLibrarySourceProvenance(
        request?.sourceProvenance,
      );

      if (job.sourceProvenance && !request?.localFile) {
        throw new Error(
          'Source-linked charts require lawful local audio; YouTube search cannot establish that proof',
        );
      }

      if (job.sourceProvenance && !job.sourceProvenance.durationSeconds) {
        throw new Error(
          'Source-linked charts require a known duration before auto-charting',
        );
      }

      job.backend = this.resolveBackend(
        request?.backend,
        await this.dependencies.detectBackends(),
      );
    } catch (error) {
      this.jobs.set(job.id, job);
      await this.fail(job, safeMessage(error));

      return;
    }

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

      const wantsLocalFile =
        Boolean(request?.localFile) || !youtubeUrl || job.backend === 'octave';

      if (wantsLocalFile) {
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
      } else {
        job.youtubeUrl = canonicalizeYoutubeUrl(youtubeUrl!);
        job.sourceName = job.metadata?.title ?? job.youtubeUrl;
      }

      job.tempDir = await this.dependencies.createTempDir(job.id);
      this.transition(
        job,
        'queued',
        `Chart queued for ${backendLabel(job.backend)} processing`,
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
      (!previous.audioPath && !previous.youtubeUrl)
    ) {
      return;
    }

    const job: AutoChartJob = {
      id: this.dependencies.makeId(),
      attempt: previous.attempt + 1,
      stage: 'queued',
      message: `Chart queued for ${backendLabel(previous.backend)} processing`,
      event,
      audioPath: previous.audioPath,
      youtubeUrl: previous.youtubeUrl,
      sourceName: previous.sourceName,
      metadata: previous.metadata,
      autoImport: previous.autoImport,
      sourceProvenance: previous.sourceProvenance
        ? {
            ...previous.sourceProvenance,
            artists: [...previous.sourceProvenance.artists],
          }
        : undefined,
      backend: previous.backend,
      cancelled: false,
    };

    try {
      if (job.audioPath) {
        job.audioPath = this.dependencies.validateAudio(job.audioPath);
      }

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
      const playability = job.sourceProvenance
        ? createLocalAutoChartEvidence(
            job.preparedDir,
            job.sourceProvenance,
            job.id,
          )
        : undefined;
      const song = playability
        ? await this.dependencies.importSong(
            job.preparedDir,
            job.metadata?.thumbnailUrl,
            playability,
          )
        : await this.dependencies.importSong(
            job.preparedDir,
            job.metadata?.thumbnailUrl,
          );

      job.preview = undefined;
      job.song = song;
      // Same ordering fix as fail()/cancelJob(): clean up the working
      // directory before announcing the terminal 'imported' stage, so a
      // listener never observes "done" while the temp dir cleanup is still
      // in flight.
      await this.dependencies.cleanup(job.tempDir);
      job.tempDir = undefined;
      job.preparedDir = undefined;
      this.transition(
        job,
        'imported',
        `Added "${song.name}" to the current library`,
      );
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

  private resolveBackend(
    requested: AutoChartBackend | undefined,
    backends: AutoChartBackends,
  ): AutoChartBackend {
    if (requested === 'octave' && backends.octave) {
      return 'octave';
    }

    if (requested === 'sightkick' && backends.sightkick) {
      return 'sightkick';
    }

    if (requested === 'remote' && backends.remote) {
      return 'remote';
    }

    if (backends.sightkick) {
      return 'sightkick';
    }

    if (backends.remote) {
      return 'remote';
    }

    if (backends.octave) {
      return 'octave';
    }

    throw new Error(
      'No auto-chart backend is available. Bundle the Drumroll transcriber (resources/transcriber) or install OCTAVE.app',
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
      if (!job.tempDir) {
        throw new Error('Auto-chart job has no working directory');
      }

      if (job.backend === 'octave') {
        if (!job.audioPath) {
          throw new Error('OCTAVE auto-chart requires a local audio file');
        }

        job.audioPath = this.dependencies.validateAudio(job.audioPath);
        await this.runOctave(job);
      } else if (job.backend === 'sightkick') {
        if (job.audioPath) {
          job.audioPath = this.dependencies.validateAudio(job.audioPath);
        } else if (!job.youtubeUrl) {
          throw new Error(
            'Drumroll auto-chart requires a YouTube URL or local audio file',
          );
        }

        await this.runSightkick(job);
      } else {
        if (job.audioPath) {
          job.audioPath = this.dependencies.validateAudio(job.audioPath);
        } else if (!job.youtubeUrl) {
          throw new Error(
            'Remote auto-chart requires a YouTube URL or local audio file',
          );
        }

        await this.runRemote(job);
      }

      if (job.cancelled && !isTerminal(job.stage)) {
        await this.cancelJob(job);
      } else if (!isTerminal(job.stage) && job.stage !== 'preview-ready') {
        await this.fail(
          job,
          'Auto-chart worker exited before preparing a chart',
        );
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

  private async runOctave(job: AutoChartJob): Promise<void> {
    if (!job.tempDir || !job.audioPath) {
      throw new Error('Auto-chart job has no local audio input');
    }

    const runtime = this.dependencies.preflightOctave();
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

    job.worker = this.dependencies.octaveRunner.run(payloadPath, (event) => {
      workerEvents = workerEvents
        .then(() => this.handleOctaveEvent(job, event))
        .catch((error) => this.fail(job, safeMessage(error)));
    });
    await job.worker.done;
    await workerEvents;
  }

  private async runSightkick(job: AutoChartJob): Promise<void> {
    if (!job.tempDir) {
      throw new Error('Auto-chart job has no working directory');
    }

    const runtime = this.dependencies.preflightSightkick();
    const downloading = !job.audioPath;

    this.transition(
      job,
      downloading ? 'downloading' : 'processing',
      downloading
        ? 'Downloading audio from YouTube'
        : 'Drumroll is preparing a drum chart',
      0,
    );

    let workerEvents = Promise.resolve();

    job.worker = this.dependencies.sightkickRunner.run(
      {
        tempDir: job.tempDir,
        youtubeUrl: job.youtubeUrl,
        audioPath: job.audioPath,
        runtime,
      },
      (event) => {
        workerEvents = workerEvents
          .then(() => this.handleSightkickEvent(job, event))
          .catch((error) => this.fail(job, safeMessage(error)));
      },
    );
    await job.worker.done;
    await workerEvents;
  }

  private async runRemote(job: AutoChartJob): Promise<void> {
    if (!job.tempDir) {
      throw new Error('Auto-chart job has no working directory');
    }

    const runtime = this.dependencies.preflightRemote();
    const downloading = !job.audioPath;

    this.transition(
      job,
      downloading ? 'downloading' : 'processing',
      downloading
        ? 'Sending the YouTube URL to the remote transcriber'
        : 'Uploading audio to the remote transcriber',
      0,
    );

    let workerEvents = Promise.resolve();

    job.worker = this.dependencies.remoteRunner.run(
      {
        tempDir: job.tempDir,
        youtubeUrl: job.youtubeUrl,
        audioPath: job.audioPath,
        runtime,
      },
      (event) => {
        workerEvents = workerEvents
          .then(() => this.handleSightkickEvent(job, event))
          .catch((error) => this.fail(job, safeMessage(error)));
      },
    );
    await job.worker.done;
    await workerEvents;
  }

  private async handleOctaveEvent(
    job: AutoChartJob,
    event: WorkerEvent,
  ): Promise<void> {
    if (event.runId !== job.id || isTerminal(job.stage) || job.cancelled) {
      return;
    }

    if (event.kind === 'progress') {
      this.applyProgress(job, event.message, event.percent, false);

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

    const preparedDir = this.validOctavePreparedDir(job, event);

    await this.completeWithPreparedDir(job, preparedDir);
  }

  private async handleSightkickEvent(
    job: AutoChartJob,
    event: SkWorkerEvent,
  ): Promise<void> {
    if (isTerminal(job.stage) || job.cancelled) {
      return;
    }

    if (event.kind === 'progress') {
      this.applyProgress(
        job,
        event.message,
        event.percent,
        event.stage === 'download',
      );

      return;
    }

    if (event.kind === 'error') {
      await this.fail(
        job,
        event.message ||
          `${backendLabel(job.backend)} could not prepare a chart`,
        event.code,
      );

      return;
    }

    if (!event.success || !event.songDir) {
      await this.fail(
        job,
        event.message ||
          `${backendLabel(job.backend)} could not prepare a chart`,
      );

      return;
    }

    const preparedDir = this.validSightkickPreparedDir(job, event.songDir);

    await this.completeWithPreparedDir(job, preparedDir);
  }

  private applyProgress(
    job: AutoChartJob,
    message: string | undefined,
    rawPercent: number | undefined,
    downloading: boolean,
  ): void {
    const percent =
      typeof rawPercent === 'number'
        ? Math.max(job.percent ?? 0, Math.min(100, Math.max(0, rawPercent)))
        : job.percent;

    this.transition(
      job,
      downloading ? 'downloading' : 'processing',
      message ||
        (downloading
          ? 'Downloading audio from YouTube'
          : `${backendLabel(job.backend)} is processing audio`),
      percent,
    );
  }

  private async completeWithPreparedDir(
    job: AutoChartJob,
    preparedDir: string,
  ): Promise<void> {
    await this.dependencies.applyMetadata(
      preparedDir,
      job.metadata,
      job.sourceProvenance,
    );
    job.preparedDir = preparedDir;
    job.preview = await this.dependencies.preview(
      preparedDir,
      job.metadata?.thumbnailUrl,
    );
    this.transition(
      job,
      'preview-ready',
      job.autoImport
        ? 'Chart checked. Adding it to your library'
        : 'Chart is ready to review before adding it to your library',
      100,
    );

    if (job.autoImport) {
      await this.import(job.id);
    }
  }

  private validOctavePreparedDir(
    job: AutoChartJob,
    event: WorkerEvent,
  ): string {
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

  private validSightkickPreparedDir(
    job: AutoChartJob,
    songDir: string,
  ): string {
    if (!job.tempDir) {
      throw new Error(
        'Drumroll returned an unexpected prepared-chart location',
      );
    }

    const preparedDir = fs.realpathSync(songDir);
    const tempDir = fs.realpathSync(job.tempDir);
    const stat = fs.lstatSync(preparedDir);

    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      !isInside(tempDir, preparedDir)
    ) {
      throw new Error('Drumroll returned an unsafe prepared-chart location');
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
    job.errorCode = undefined;
    this.notify(job);
  }

  private async fail(
    job: AutoChartJob,
    error: string,
    errorCode?: string,
  ): Promise<void> {
    if (isTerminal(job.stage)) {
      return;
    }

    job.stage = 'failed';
    job.error = error;
    job.errorCode = errorCode;
    job.message =
      errorCode === 'no-drums' ? 'No drums detected' : 'Chart creation failed';
    // Clean up (and clear tempDir/preparedDir) before notifying: a listener
    // reacting to the terminal 'failed' stage — including this queue's own
    // tests — must be able to rely on the working directory already being
    // gone, not racing the async fs cleanup below.
    await this.dependencies.cleanup(job.tempDir);
    job.tempDir = undefined;
    job.preparedDir = undefined;
    this.notify(job);
  }

  private async cancelJob(job: AutoChartJob): Promise<void> {
    if (isTerminal(job.stage)) {
      return;
    }

    job.stage = 'cancelled';
    job.error = undefined;
    job.errorCode = undefined;
    job.message = 'Chart creation cancelled';
    // Same ordering as fail(): cleanup completes before notify so the
    // 'cancelled' stage is only ever observed once the temp dir is gone.
    await this.dependencies.cleanup(job.tempDir);
    job.tempDir = undefined;
    job.preparedDir = undefined;
    this.notify(job);
  }

  // Every non-terminal job the queue currently knows about (queued or
  // active), as public DTOs — attached to every notify() so a listener can
  // always reconcile the full queue, not just the one job that changed.
  private queueSnapshot(): IpcAutoChartJob[] {
    return [...this.jobs.values()]
      .filter((candidate) => !isTerminal(candidate.stage))
      .map((candidate) => toPublicJob(candidate));
  }

  private notify(job: AutoChartJob): void {
    job.event.reply('auto-chart-update', {
      ...toPublicJob(job),
      jobs: this.queueSnapshot(),
    });
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
