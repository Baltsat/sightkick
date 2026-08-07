import { Difficulty } from 'scan-chart';

export interface SongData {
  id: string;
  dir: string;
  albumCover: string | null;
  album: string;
  album_track: string;
  artist: string;
  auto_chart: string;
  auto_chart_tool: string;
  banner_link_a: string;
  banner_link_b: string;
  charter: string;
  delay: string;
  diff_band: string;
  diff_bass: string;
  diff_bass_real: string;
  diff_bass_real_22: string;
  diff_bassghl: string;
  diff_dance: string;
  diff_drums: string;
  diff_drums_real: string;
  diff_drums_real_ps: string;
  diff_guitar: string;
  diff_guitar_coop: string;
  diff_guitar_real: string;
  diff_guitar_real_22: string;
  diff_guitarghl: string;
  diff_keys: string;
  diff_keys_real: string;
  diff_keys_real_ps: string;
  diff_rhythm: string;
  diff_vocals: string;
  diff_vocals_harm: string;
  drum_fallback_blue: string;
  five_lane_drums: string;
  genre: string;
  icon: string;
  link_name_a: string;
  link_name_b: string;
  loading_phrase: string;
  multiplier_note: string;
  name: string;
  playlist_track: string;
  preview_start_time: string;
  pro_drums: string;
  song_length: string;
  sysex_high_hat_ctrl: string;
  sysex_open_bass: string;
  sysex_rimshot: string;
  sysex_slider: string;
  video: string;
  video_start_time: string;
  year: string;
  liked?: boolean;
  updatedAt?: string;
  format: 'mid' | 'chart';
  audio: AudioData[];
  drumDifficulties?: Difficulty[];
  scoreData?: Partial<Record<Difficulty, ScoreData>>;
  // Lessons curriculum fields (raw ini strings), see SongLessonInfo below.
  sk_lesson_id?: string;
  sk_stars_to_unlock?: string;
  sk_next?: string;
  sk_unit?: string;
  sk_lesson_title?: string;
}

export interface Song {
  id: string;
  dir: string;
  albumCover?: string;
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
  format: 'mid' | 'chart';
  audio: AudioData[];
  drumDifficulties?: Difficulty[];
  liked?: boolean;
  updatedAt?: string;
  scoreData?: Partial<Record<Difficulty, ScoreData>>;
  // Present only for SightKick Method lesson songs.
  lesson?: SongLessonInfo;
}

/**
 * Parsed view of a lesson song's sk_* song.ini fields (the Lessons unlock
 * chain data contract). Absent on regular (non-lesson) songs.
 */
export interface SongLessonInfo {
  /** e.g. "04.02" */
  id: string;
  /** 0-based cumulative-star position in the unlock chain. */
  starsToUnlock: number;
  /** Next exercise id in the chain, if any. */
  next?: string;
  unit: string;
  title: string;
}

export interface ScoreData {
  hitNotes?: number;
  totalNotes: number;
  falseHits: number;
}

export interface AudioData {
  src: string;
  name: string;
}

export type StemToolsStatus = 'ready' | 'download' | 'unsupported';

export type StemToolsPhase = 'downloading' | 'extracting';

export interface StemToolsManifest {
  version: string;
  fileCount: number;
  downloadSize: number;
  uncompressedSize: number;
}

export interface IpcCheckStemToolsResponse {
  status: StemToolsStatus;
  installedVersion?: string;
}

export interface IpcStemToolsRemoteResponse {
  available: boolean;
  latestVersion?: string;
  downloadSize?: number;
  uncompressedSize?: number;
  updateAvailable: boolean;
}

export interface IpcDownloadStemToolsResponse {
  phase?: StemToolsPhase;
  progress?: number;
  success?: boolean;
  cancelled?: boolean;
  error?: string;
}

export interface IpcDeleteStemToolsResponse {
  success: boolean;
  error?: string;
}

export interface IpcUpdateAvailable {
  phase: 'available';
  version: string;
  releaseUrl: string;
  releaseNotes?: string;
}

export type IpcUpdateStatus =
  | IpcUpdateAvailable
  | { phase: 'downloading'; percent: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string };

export interface IpcSplitSongResponse {
  id: string;
  progress?: number;
  success?: boolean;
  song?: Song;
  error?: string;
  cancelled?: boolean;
}

export interface MidiDevice {
  port: number;
  name: string;
}

export enum MidiMessageType {
  NoteOn = 144,
  NoteOff = 128,
}

export interface MidiMessage {
  type: MidiMessageType;
  note: number;
  velocity: number;
  channel?: number;
}

export interface InputMapping {
  hihat?: string[];
  ride?: string[];
  crash?: string[];
  kick?: string[];
  snare?: string[];
  tom1?: string[];
  tom2?: string[];
  tom3?: string[];
}

export interface ControlMapping {
  up?: string[];
  down?: string[];
  left?: string[];
  right?: string[];
  confirm?: string[];
  back?: string[];
  difficulty?: string[];
  library?: string[];
  sort?: string[];
  pause?: string[];
  faster?: string[];
  slower?: string[];
}

export type InputElement = keyof InputMapping | keyof ControlMapping;

export type ElementMapping = Partial<Record<InputElement, string[]>>;

export type IpcUpdateSongPayload = Pick<SongData, 'id'> &
  Partial<Omit<SongData, 'id'>>;

export interface IpcErrorResponse {
  error: string;
}

export type IpcResult<T> = T | IpcErrorResponse;

export function isIpcError<T extends object>(
  payload: IpcResult<T>,
): payload is IpcErrorResponse {
  return 'error' in payload && typeof payload.error === 'string';
}

export interface IpcLoadSongResponse {
  data: Song;
  fileData: Buffer;
}

export interface IpcLoadSongListResponse {
  songs: Song[];
  lastOpenedPath: string | null;
  downloadedEncoreMd5s: string[];
}

export interface IpcScanProgressResponse {
  current: number;
  total: number;
}

export interface IpcImportSongPreview {
  sourceDir: string;
  name: string;
  artist: string;
  album: string;
  charter: string;
  autoChartTool?: string;
  chartFormat: 'mid' | 'chart';
  audioCount: number;
  drumDifficulties: Difficulty[];
  albumCoverDataUrl?: string;
  thumbnailUrl?: string;
  coverSource: 'existing' | 'embedded' | 'remote' | 'none';
}

export interface IpcSelectImportSongResponse {
  preview?: IpcImportSongPreview;
  cancelled?: boolean;
  error?: string;
}

export interface IpcImportSongRequest {
  sourceDir: string;
  artworkUrl?: string;
}

export interface IpcImportSongResponse {
  success: boolean;
  song?: Song;
  error?: string;
}

export type AutoChartStage =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'processing'
  | 'preview-ready'
  | 'importing'
  | 'imported'
  | 'failed'
  | 'cancelled';

export type AutoChartBackend = 'sightkick' | 'remote' | 'octave';

export interface IpcCreateAutoChartRequest {
  youtubeUrl?: string;
  localFile?: boolean;
  backend?: AutoChartBackend;
}

export interface IpcAutoChartBackendsResponse {
  sightkick: boolean;
  remote: boolean;
  octave: boolean;
  default: AutoChartBackend;
}

export interface IpcAutoChartRemoteSettings {
  endpoint: string;
  tokenConfigured: boolean;
}

export interface IpcSaveAutoChartRemoteSettingsRequest {
  endpoint: string;
  token?: string;
}

export interface IpcAutoChartRemoteTestResponse {
  ok: boolean;
  message: string;
}

export interface IpcAutoChartMetadata {
  title: string;
  authorName: string;
  songName?: string;
  artistName?: string;
  thumbnailUrl?: string;
}

export interface IpcAutoChartJob {
  id: string;
  attempt: number;
  stage: AutoChartStage;
  message: string;
  backend: AutoChartBackend;
  percent?: number;
  sourceName?: string;
  metadata?: IpcAutoChartMetadata;
  preview?: IpcImportSongPreview;
  song?: Song;
  error?: string;
  errorCode?: string;
  // The YouTube URL a job was created from (undefined for local-file jobs).
  // Exposed so a surface that queues jobs itself (e.g. My Music's bulk add)
  // can recognize its own in-flight jobs by watch URL without a separate
  // lookup channel.
  youtubeUrl?: string;
  // A snapshot of every currently non-terminal job the queue knows about —
  // not just this one — attached to every 'auto-chart-update' event so any
  // listener can render the full pending/active queue and cancel any job by
  // id, instead of only ever seeing the single job it happened to trigger.
  // Only ever populated one level deep (entries in this array never carry
  // their own nested `jobs`).
  jobs?: IpcAutoChartJob[];
}

export interface IpcSearchYoutubeRequest {
  query: string;
  limit?: number;
}

export interface IpcYoutubeSearchResult {
  videoId: string;
  title: string;
  uploader?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  watchUrl: string;
}

export interface IpcSearchYoutubeResponse {
  results: IpcYoutubeSearchResult[];
}

export interface IpcMyMusicRequest {
  limit?: number;
}

export interface MyMusicSong {
  videoId: string;
  title: string;
  artist?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  watchUrl: string;
}

export interface IpcMyMusicResponse {
  songs: MyMusicSong[];
}

export type MyMusicErrorCode =
  | 'chrome-cookie-locked'
  | 'chrome-cookies-unavailable'
  | 'not-signed-in'
  | 'yt-dlp-missing'
  | 'timeout'
  | 'unknown';

export interface IpcMyMusicError {
  error: string;
  code: MyMusicErrorCode;
}

export type IpcMyMusicReply = IpcMyMusicResponse | IpcMyMusicError;

export interface StorageSchema {
  songs: {
    [key: string]: SongData;
  };
}
