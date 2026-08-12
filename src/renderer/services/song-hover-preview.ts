import { Difficulty, parseChartFile } from 'scan-chart';
import { ChartParser } from '../../chart-parser/parser';
import { Measure, ParsedChart } from '../../chart-parser/types';
import { ticksToSeconds } from '../../chart-parser/timing';
import { IpcLoadSongResponse, IpcResult, isIpcError, Song } from '../../types';
import { isPlayableEvidence } from '../../library-sources/playability';

export const HOVER_PREVIEW_INTENT_MS = 240;

export const HOVER_PREVIEW_FADE_MS = 180;

const PREVIEW_MIN_SECONDS = 10;
const PREVIEW_TARGET_SECONDS = 12;
const PREVIEW_MAX_SECONDS = 15;
const PREVIEW_VOLUME = 0.62;
const PREVIEW_REQUEST_TIMEOUT_MS = 5000;

export interface SongPreviewWindow {
  startSeconds: number;
  endSeconds: number;
  startBar: number;
  endBar: number;
  noteCount: number;
}

export interface SongPreviewSource extends SongPreviewWindow {
  src: string;
  label: string;
}

export interface SongHoverPreviewState {
  songId: string;
  label: string;
}

export interface PreviewAudio {
  src: string;
  preload: string;
  currentTime: number;
  volume: number;
  onended: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
}

interface ActivePreview {
  songId: string;
  audio: PreviewAudio;
  source: SongPreviewSource;
  token: number;
  stopTimer?: ReturnType<typeof setTimeout>;
}

interface SongHoverPreviewControllerOptions {
  enabled?: boolean;
  intentDelayMs?: number;
  load?: (
    song: Song,
    difficulty: Difficulty,
  ) => Promise<SongPreviewSource | undefined>;
  createAudio?: (src: string) => PreviewAudio;
  onChange?: (state: SongHoverPreviewState | undefined) => void;
}

function previewAudioSource(song: Song): string | undefined {
  if (
    (song.sourceLinked || song.sourceProvenance) &&
    !isPlayableEvidence(song.playability)
  ) {
    return undefined;
  }

  const audio =
    song.audio.find(({ name }) => /^(song|mix|master|full)$/i.test(name)) ??
    song.audio.find(
      ({ name }) =>
        !/(drums?|kick|snare|bass|vocals?|guitar|other)/i.test(name),
    ) ??
    song.audio[0];

  return audio?.src;
}

function chartTrack(chart: ParsedChart, difficulty?: Difficulty) {
  const tracks = chart.trackData.filter(
    (track) => track.instrument === 'drums',
  );

  return tracks.find((track) => track.difficulty === difficulty) ?? tracks[0];
}

function windowForStart(
  measures: Measure[],
  chart: ParsedChart,
  startIndex: number,
): { endIndex: number; startSeconds: number; endSeconds: number } | undefined {
  const startTick = measures[startIndex]?.startTick;

  if (startTick === undefined) {
    return undefined;
  }

  const startSeconds = ticksToSeconds(
    startTick,
    chart.resolution,
    chart.tempos,
  );
  let closest:
    | { endIndex: number; startSeconds: number; endSeconds: number }
    | undefined;
  let fallback:
    | { endIndex: number; startSeconds: number; endSeconds: number }
    | undefined;

  for (
    let endIndex = startIndex + 1;
    endIndex <= measures.length;
    endIndex += 1
  ) {
    const endTick = measures[endIndex - 1]?.endTick;

    if (endTick === undefined) {
      continue;
    }

    const endSeconds = ticksToSeconds(endTick, chart.resolution, chart.tempos);
    const candidate = { endIndex, startSeconds, endSeconds };
    const duration = endSeconds - startSeconds;

    if (
      !fallback ||
      Math.abs(duration - PREVIEW_TARGET_SECONDS) <
        Math.abs(
          fallback.endSeconds - fallback.startSeconds - PREVIEW_TARGET_SECONDS,
        )
    ) {
      fallback = candidate;
    }

    if (duration >= PREVIEW_MIN_SECONDS && duration <= PREVIEW_MAX_SECONDS) {
      if (
        !closest ||
        Math.abs(duration - PREVIEW_TARGET_SECONDS) <
          Math.abs(
            closest.endSeconds - closest.startSeconds - PREVIEW_TARGET_SECONDS,
          )
      ) {
        closest = candidate;
      }
    }

    if (duration > PREVIEW_MAX_SECONDS && closest) {
      break;
    }
  }

  return closest ?? fallback;
}

export function selectDrumPreviewWindow(
  chart: ParsedChart,
  difficulty?: Difficulty,
  fiveLaneDrums = false,
): SongPreviewWindow | undefined {
  const track = chartTrack(chart, difficulty);

  if (!track || track.noteEventGroups.length === 0) {
    return undefined;
  }

  let measures: Measure[];

  try {
    measures = new ChartParser(chart, fiveLaneDrums, track.difficulty).measures;
  } catch {
    return undefined;
  }

  if (measures.length === 0) {
    return undefined;
  }

  const noteTicks = track.noteEventGroups.flat().map((event) => event.tick);
  const candidates = measures.flatMap((measure, startIndex) => {
    const window = windowForStart(measures, chart, startIndex);

    if (!window || window.endSeconds <= window.startSeconds) {
      return [];
    }

    const endTick = measures[window.endIndex - 1]?.endTick;

    if (endTick === undefined) {
      return [];
    }

    const noteCount = noteTicks.filter(
      (tick) => tick >= measure.startTick && tick < endTick,
    ).length;

    return [
      {
        startSeconds: window.startSeconds,
        endSeconds: window.endSeconds,
        startBar: startIndex + 1,
        endBar: window.endIndex,
        noteCount,
      },
    ];
  });

  if (candidates.length === 0) {
    return undefined;
  }

  const fullLength = candidates.filter((candidate) => {
    const duration = candidate.endSeconds - candidate.startSeconds;

    return duration >= PREVIEW_MIN_SECONDS && duration <= PREVIEW_MAX_SECONDS;
  });
  const eligible = fullLength.length > 0 ? fullLength : candidates;
  const afterIntro = eligible.filter(
    (candidate) => candidate.startSeconds >= 8,
  );
  const pool = afterIntro.length > 0 ? afterIntro : eligible;

  return [...pool].sort(
    (left, right) =>
      right.noteCount / (right.endSeconds - right.startSeconds) -
        left.noteCount / (left.endSeconds - left.startSeconds) ||
      Math.abs(right.endSeconds - right.startSeconds - PREVIEW_TARGET_SECONDS) -
        Math.abs(
          left.endSeconds - left.startSeconds - PREVIEW_TARGET_SECONDS,
        ) ||
      left.startBar - right.startBar,
  )[0];
}

function loadSong(id: string): Promise<IpcLoadSongResponse | undefined> {
  return new Promise((resolve) => {
    let removeListener = () => {};
    let settled = false;
    const settle = (result: IpcLoadSongResponse | undefined) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      removeListener();
      resolve(result);
    };
    const timeout = setTimeout(
      () => settle(undefined),
      PREVIEW_REQUEST_TIMEOUT_MS,
    );

    removeListener = window.electron.ipcRenderer.on<
      IpcResult<IpcLoadSongResponse>
    >('load-song', (payload) => {
      if (isIpcError(payload)) {
        settle(undefined);

        return;
      }

      if (payload.data.id === id) {
        settle(payload);
      }
    });
    window.electron.ipcRenderer.sendMessage('load-song', id);
  });
}

export async function loadSongPreview(
  song: Song,
  difficulty: Difficulty,
): Promise<SongPreviewSource | undefined> {
  if (!previewAudioSource(song)) {
    return undefined;
  }

  const loaded = await loadSong(song.id);

  if (!loaded) {
    return undefined;
  }

  const src = previewAudioSource(loaded.data);

  if (!src) {
    return undefined;
  }

  try {
    const chart = parseChartFile(
      new Uint8Array(loaded.fileData),
      loaded.data.format,
      {
        pro_drums: loaded.data.proDrums,
        five_lane_drums: loaded.data.fiveLaneDrums,
      },
    );
    const window = selectDrumPreviewWindow(
      chart,
      difficulty,
      loaded.data.fiveLaneDrums,
    );

    if (!window) {
      return undefined;
    }

    const startSeconds = Math.max(
      0,
      window.startSeconds + loaded.data.delaySeconds,
    );
    const endSeconds = Math.max(
      startSeconds + 0.1,
      window.endSeconds + loaded.data.delaySeconds,
    );

    return {
      ...window,
      src,
      startSeconds,
      endSeconds,
      label: `Drum peak · bars ${window.startBar}–${window.endBar}`,
    };
  } catch {
    return undefined;
  }
}

export class SongHoverPreviewController {
  private enabled: boolean;
  private readonly intentDelayMs: number;
  private readonly load: (
    song: Song,
    difficulty: Difficulty,
  ) => Promise<SongPreviewSource | undefined>;
  private readonly createAudio: (src: string) => PreviewAudio;
  private readonly onChange: (state: SongHoverPreviewState | undefined) => void;
  private readonly cache = new Map<
    string,
    Promise<SongPreviewSource | undefined>
  >();
  private readonly fadeTimers = new Map<
    PreviewAudio,
    ReturnType<typeof setInterval>
  >();
  private intentTimer?: ReturnType<typeof setTimeout>;
  private pendingSongId?: string;
  private loadingSongId?: string;
  private active?: ActivePreview;
  private token = 0;

  constructor({
    enabled = true,
    intentDelayMs = HOVER_PREVIEW_INTENT_MS,
    load = loadSongPreview,
    createAudio = (src) => new Audio(src) as unknown as PreviewAudio,
    onChange = () => {},
  }: SongHoverPreviewControllerOptions = {}) {
    this.enabled = enabled;
    this.intentDelayMs = intentDelayMs;
    this.load = load;
    this.createAudio = createAudio;
    this.onChange = onChange;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      this.token += 1;
      this.cancelIntent();
      this.loadingSongId = undefined;
      this.stopActive();
    }
  }

  hover(song: Song, difficulty: Difficulty): void {
    if (!this.enabled || !previewAudioSource(song)) {
      return;
    }

    if (this.pendingSongId === song.id || this.active?.songId === song.id) {
      return;
    }

    this.token += 1;

    const token = this.token;

    this.cancelIntent();
    this.stopActive();
    this.pendingSongId = song.id;
    this.intentTimer = setTimeout(() => {
      this.intentTimer = undefined;
      this.pendingSongId = undefined;
      this.loadingSongId = song.id;
      void this.start(song, difficulty, token);
    }, this.intentDelayMs);
  }

  leave(songId: string): void {
    if (
      this.pendingSongId !== songId &&
      this.loadingSongId !== songId &&
      this.active?.songId !== songId
    ) {
      return;
    }

    this.token += 1;
    this.cancelIntent();

    if (this.loadingSongId === songId) {
      this.loadingSongId = undefined;
    }

    this.stopActive();
  }

  dispose(): void {
    this.token += 1;
    this.cancelIntent();
    this.loadingSongId = undefined;
    this.stopActive();
    this.fadeTimers.forEach((timer) => clearInterval(timer));
    this.fadeTimers.clear();
  }

  private async start(song: Song, difficulty: Difficulty, token: number) {
    const source = await this.previewFor(song, difficulty);

    if (this.loadingSongId === song.id) {
      this.loadingSongId = undefined;
    }

    if (!source || !this.enabled || token !== this.token) {
      return;
    }

    const audio = this.createAudio(source.src);

    try {
      audio.src = source.src;
      audio.preload = 'auto';
      audio.currentTime = source.startSeconds;
      audio.volume = 0;
      await audio.play();
    } catch {
      return;
    }

    if (!this.enabled || token !== this.token) {
      this.stopAudio(audio);

      return;
    }

    const active: ActivePreview = { songId: song.id, audio, source, token };

    this.active = active;
    audio.onended = () => {
      if (this.active === active) {
        this.active = undefined;
        this.onChange(undefined);
      }
    };
    this.onChange({ songId: song.id, label: source.label });
    this.fadeAudio(audio, PREVIEW_VOLUME, HOVER_PREVIEW_FADE_MS);
    active.stopTimer = setTimeout(
      () => this.stopIfActive(active),
      Math.max(
        0,
        (source.endSeconds - source.startSeconds) * 1000 -
          HOVER_PREVIEW_FADE_MS,
      ),
    );
  }

  private previewFor(
    song: Song,
    difficulty: Difficulty,
  ): Promise<SongPreviewSource | undefined> {
    const key = `${song.id}:${difficulty}`;
    const existing = this.cache.get(key);

    if (existing) {
      return existing;
    }

    const preview = this.load(song, difficulty).catch(() => undefined);

    this.cache.set(key, preview);

    return preview;
  }

  private cancelIntent(): void {
    if (this.intentTimer) {
      clearTimeout(this.intentTimer);
      this.intentTimer = undefined;
    }

    this.pendingSongId = undefined;
  }

  private stopIfActive(active: ActivePreview): void {
    if (this.active === active) {
      this.stopActive();
    }
  }

  private stopActive(): void {
    const active = this.active;

    if (!active) {
      return;
    }

    this.active = undefined;
    clearTimeout(active.stopTimer);
    active.audio.onended = null;
    this.onChange(undefined);
    this.fadeAudio(active.audio, 0, HOVER_PREVIEW_FADE_MS, () =>
      this.stopAudio(active.audio),
    );
  }

  private stopAudio(audio: PreviewAudio): void {
    this.cancelFade(audio);
    audio.pause();
    audio.currentTime = 0;
  }

  private fadeAudio(
    audio: PreviewAudio,
    targetVolume: number,
    duration: number,
    onComplete?: () => void,
  ): void {
    this.cancelFade(audio);

    const startVolume = audio.volume;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);

      audio.volume = startVolume + (targetVolume - startVolume) * progress;

      if (progress === 1) {
        clearInterval(timer);
        this.fadeTimers.delete(audio);
        onComplete?.();
      }
    }, 16);

    this.fadeTimers.set(audio, timer);
  }

  private cancelFade(audio: PreviewAudio): void {
    const timer = this.fadeTimers.get(audio);

    if (timer) {
      clearInterval(timer);
      this.fadeTimers.delete(audio);
    }
  }
}
