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
  sk_skills?: string;
  /** Comma-separated authored lesson IDs which must be mastered first. */
  sk_prerequisite_ids?: string;
  /** Comma-separated, weighted kit-lane targets (`kick:0.5,snare:0.5`). */
  sk_target_lanes?: string;
  /** Authored BPM floor and destination for a lesson tempo ladder. */
  sk_bpm_start?: string;
  sk_bpm_target?: string;
  /** Short, displayable practice dose and completion contract. */
  sk_dose_rule?: string;
  sk_mastery_rule?: string;
  /** The authored musical/sticking cue — guidance, never sensor output. */
  sk_cue?: string;
  /** Explicit capability boundary paired with authored technique cues. */
  sk_assessment_boundary?: string;
  /** Schema-compatible source-to-chart provenance written by reviewed imports. */
  sk_source_provider?: string;
  sk_source_collection_id?: string;
  sk_source_collection_name?: string;
  sk_source_track_id?: string;
  sk_source_title?: string;
  sk_source_artists?: string;
  sk_source_duration?: string;
  sk_source_url?: string;
  sk_playability?: string;
  playability?: PlayabilityEvidence;
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
  /** Discovery metadata linked to this playable local chart, when available. */
  sourceProvenance?: LibrarySourceTrackProvenance;
  sourceLinked?: boolean;
  playability?: PlayabilityEvidence;
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
  /** Curriculum tags used to match coaching findings to focused practice. */
  skills?: string[];
  /** Authored IDs that must be mastered before this lesson is reachable. */
  prerequisiteIds?: string[];
  /** The kit lanes this exercise intentionally trains, with normalized demand. */
  targetLanes?: LessonTargetLane[];
  /** Tempo ladder endpoints from the authored curriculum, in BPM. */
  bpmStart?: number;
  bpmTarget?: number;
  /** A concrete dose the player can follow before judging the result. */
  doseRule?: string;
  /** The authored rule that marks the lesson complete. */
  masteryRule?: string;
  /** A short authored cue. This is instruction, not observed technique. */
  cue?: string;
  /** Always states exactly what the MIDI system can and cannot assess. */
  assessmentBoundary?: string;
}

export interface LessonTargetLane {
  element:
    | 'kick'
    | 'snare'
    | 'hihat'
    | 'ride'
    | 'crash'
    | 'tom1'
    | 'tom2'
    | 'tom3';
  /** Relative hit demand; values are normalized at generation time. */
  weight: number;
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

export interface MidiReadyResponse {
  port: number;
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

export type CoachProvider = 'codex' | 'huggingface' | 'anthropic';

export const DEFAULT_COACH_PROVIDER: CoachProvider = 'codex';

export const DEFAULT_HUGGING_FACE_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';

export interface IpcCoachSettings {
  provider: CoachProvider;
  apiKeyConfigured: boolean;
  huggingFaceTokenConfigured: boolean;
  huggingFaceModel: string;
}

export interface IpcSaveCoachSettingsRequest {
  provider?: CoachProvider;
  apiKey?: string;
  huggingFaceToken?: string;
  huggingFaceModel?: string;
}

export interface IpcCoachSettingsSaved {
  ok: boolean;
  provider: CoachProvider;
  apiKeyConfigured: boolean;
  huggingFaceTokenConfigured: boolean;
  huggingFaceModel: string;
}

export interface IpcCoachingNotesResponse {
  notes?: string;
  error?: string;
  apiKeyMissing?: boolean;
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
  playability?: PlayabilityEvidence;
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

export interface IpcYoutubeCandidate {
  videoId: string;
  title: string;
  uploader?: string;
  durationSeconds?: number;
  watchUrl: string;
}

export interface IpcCreateAutoChartRequest {
  youtubeUrl?: string;
  localFile?: boolean;
  backend?: AutoChartBackend;
  autoImport?: boolean;
  sourceProvenance?: LibrarySourceTrackProvenance;
  youtubeCandidate?: IpcYoutubeCandidate;
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

export type LibraryMirrorSyncState = 'disabled' | 'synced' | 'queued';

export interface IpcLibraryMirrorSettings {
  endpoint: string;
  tokenConfigured: boolean;
  state: LibraryMirrorSyncState;
  pendingCount: number;
  error?: string;
}

export interface IpcSaveLibraryMirrorSettingsRequest {
  endpoint: string;
  token?: string;
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
  autoImport?: boolean;
  /** Reviewed discovery row that this generated chart will resolve. */
  sourceProvenance?: LibrarySourceTrackProvenance;
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

/**
 * A source-list row is discovery metadata only. It is never an audio stream,
 * a chart, or a claim that the track can be practised in Drumroll.
 */
export type LibrarySourceAvailability = 'available' | 'unavailable' | 'private';

export type LibraryCandidateLocalStatus = 'candidate' | 'reference';

export type LibrarySourceReferenceStatus =
  | 'stable-link'
  | 'not-visible'
  | 'private-only';

export type LibraryCandidatePracticeStatus =
  | 'needs-local-chart'
  | 'unavailable';

export interface YandexPlaylistSource {
  id: string;
  name: string;
  url: string;
  capturedOn: string;
  capturedAt: string;
  captureMethod: 'authenticated-visible-dom';
  captureSurface: 'Yandex Music playlist track rows';
  metadataScope: string;
  rightsScope: 'metadata-only';
}

export interface YandexPlaylistCompleteness {
  declaredTrackCount: number;
  renderedTrackCount: number;
  stableSourceTrackUrlCount: number;
  noVisibleStableSourceTrackUrlOrdinals: number[];
  privateOnlyOrdinals: number[];
}

export interface YandexPlaylistIntegrity {
  canonicalization: string;
  canonicalSha256: string;
}

export interface YandexPlaylistCandidate {
  /** Stable source ID; intentionally not a Song ID and never playable. */
  id: string;
  ordinal: number;
  title: string;
  artists: string[];
  durationSeconds: number | null;
  sourceTrackUrl: string | null;
  sourceAvailability: LibrarySourceAvailability;
  sourceReferenceStatus: LibrarySourceReferenceStatus;
  localStatus: LibraryCandidateLocalStatus;
  practiceStatus: LibraryCandidatePracticeStatus;
}

/**
 * Immutable discovery identity carried into a generated local chart. This is
 * metadata only: it never grants download, streaming, or playback rights.
 */
export interface LibrarySourceTrackProvenance {
  provider: 'yandex-music';
  collectionId: string;
  collectionName: string;
  trackId: string;
  title: string;
  artists: string[];
  durationSeconds?: number;
  sourceUrl?: string;
}

export type PlayabilityAudioSource =
  | 'local-user-attested'
  | 'youtube-fetched'
  | 'public-chart-package';

export interface YoutubeFetchedAudioProvenance {
  provider: 'youtube';
  videoId: string;
  watchUrl: string;
  title: string;
  uploader?: string;
  durationSeconds: number;
  downloader: 'yt-dlp';
  downloaderVersion: '2026.7.4';
  fetchedAt: string;
}

export type PlayabilityChartSource =
  | 'local-auto-chart'
  | 'chorus-encore'
  | 'rhythmverse';

export interface PlayabilityEvidence {
  identity: {
    title: string;
    artists: string[];
    durationSeconds: number;
  };
  audio: {
    source: PlayabilityAudioSource;
    sha256: string;
    youtube?: YoutubeFetchedAudioProvenance;
  };
  chart: {
    source: PlayabilityChartSource;
    id: string;
    sha256: string;
    reviewed: true;
  };
  scan: {
    passed: true;
    format: 'mid' | 'chart';
    drumDifficulties: Difficulty[];
  };
  launch: {
    passed: true;
    mode: 'headless-load';
    verifiedAt: string;
  };
}

export type PlayabilityBlocker =
  | 'identity'
  | 'lawful-audio'
  | 'chart-provenance'
  | 'scan-chart'
  | 'launch-proof';

export interface PublicDrumChartCandidate {
  source: Exclude<PlayabilityChartSource, 'local-auto-chart'>;
  id: string;
  title: string;
  artists: string[];
  durationSeconds?: number;
  hasDrums: boolean;
  reviewed: boolean;
  sourceUrl: string;
  downloadUrl?: string;
}

export interface ChartMatchRejection {
  candidate: PublicDrumChartCandidate;
  reason: 'title' | 'artist' | 'duration' | 'no-drums' | 'unreviewed';
}

export interface LibraryCandidateResolution {
  trackId: string;
  status:
    | 'exact-reviewed-chart'
    | 'no-exact-reviewed-chart'
    | 'identity-incomplete';
  match?: PublicDrumChartCandidate;
  rejected: ChartMatchRejection[];
  blockers: string[];
}

export interface IpcResolveLibraryCandidatesRequest {
  sources: LibrarySourceTrackProvenance[];
}

export interface IpcResolveLibraryCandidatesResponse {
  results: LibraryCandidateResolution[];
}

export interface YandexPlaylistCandidateCollection {
  schemaVersion: 2;
  source: 'yandex-music';
  playlist: YandexPlaylistSource;
  completeness: YandexPlaylistCompleteness;
  integrity: YandexPlaylistIntegrity;
  tracks: YandexPlaylistCandidate[];
}

export interface YandexLibraryCandidateSources {
  drums: YandexPlaylistCandidateCollection;
  favorites: YandexPlaylistCandidateCollection;
}

export interface IpcLibraryCandidatesResponse {
  yandex: YandexLibraryCandidateSources;
}

/** User-readable evidence retained when an authored lesson is superseded. */
export interface RetiredLessonEvidence {
  /** Every historical song/storage ID which can still own saved evidence. */
  legacySongIds: string[];
  lessonId?: string;
  name: string;
  bestStars: number;
  recentRunCount: number;
  fullRunCount: number;
  archivedRunCount: number;
  goalCount: number;
}

export interface IpcRetiredLessonsResponse {
  lessons: RetiredLessonEvidence[];
}

export interface StorageSchema {
  songs: {
    [key: string]: SongData;
  };
}
