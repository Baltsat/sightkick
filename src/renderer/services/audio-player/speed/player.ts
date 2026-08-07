import { SpeedAudioTrack } from './track';
import { StretchStream } from './stretch-stream';
import { VoiceGroup } from './build-units';
import { BaseAudioPlayer } from '../base-player';
import {
  SampleBlock,
  SpeedControllableAudioPlayer,
  TrackConfig,
} from '../types';

const FRAMES_PER_CHUNK = 64;
const LOOKAHEAD_SECONDS = 2;
const SCHEDULER_INTERVAL_MS = 100;
const START_LEAD_SECONDS = 0.1;
const DRUM_TRACK_NAME = 'drums';

interface ChunkTarget {
  track: SpeedAudioTrack;
  fileIndex: number;
  channels: number;
  voiceStart: number;
  sampleRate: number;
}

export class SpeedAudioPlayer
  extends BaseAudioPlayer<SpeedAudioTrack>
  implements SpeedControllableAudioPlayer
{
  prepared: Promise<void> = Promise.resolve();
  onEnded: (() => void) | undefined;
  private _playbackSpeed: number = 1;
  private stream: StretchStream = new StretchStream();
  private voices: Float32Array[] = [];
  private targets: ChunkTarget[] = [];
  private groups: VoiceGroup[] = [];
  private voicesBuilt: boolean = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private scheduledUntil: number = 0;
  private outputProducedSeconds: number = 0;
  private totalOutputSeconds: number = 0;
  private pumping: boolean = false;
  private epoch: number = 0;

  constructor(
    trackConfigs: TrackConfig[],
    onEnded: () => void,
    getMinDurationSeconds: () => number = () => 0,
  ) {
    super(trackConfigs, getMinDurationSeconds);
    this.onEnded = onEnded;
    this.prepare();
  }

  protected createTrack(buffers: AudioBuffer[], name: string): SpeedAudioTrack {
    return new SpeedAudioTrack(buffers, name, this.context, this.masterGain);
  }

  contextTimeForSongTime(songTime: number): number {
    if (this.startedAt < 0) {
      return this.context.currentTime;
    }

    return this.startedAt + (songTime - this.offset) / this._playbackSpeed;
  }

  get playbackSpeed() {
    return this._playbackSpeed;
  }

  setPlaybackSpeed(speed: number) {
    if (speed === this._playbackSpeed) {
      return;
    }

    const running = this.isInitialised && this.context.state === 'running';
    const resumeAt = running ? this.currentTime : undefined;
    const deferredStart =
      running && this.startedAt > this.context.currentTime
        ? this.startedAt
        : undefined;

    this._playbackSpeed = speed;
    this.prepare();

    if (resumeAt !== undefined) {
      void this.start(resumeAt, deferredStart);
    }
  }

  private prepare() {
    const speed = this._playbackSpeed;

    this.prepared = this.ready
      .then((tracks) => {
        if (!this.voicesBuilt) {
          this.buildVoices(tracks);
          this.stream.init(
            this.voices,
            speed,
            this.groups,
            this.context.sampleRate,
          );
          this.voicesBuilt = true;
        } else {
          this.stream.setSpeed(speed);
        }
      })
      .catch(() => {});
  }

  private buildVoices(tracks: SpeedAudioTrack[]) {
    this.voices = [];
    this.targets = [];
    this.groups = [];

    tracks.forEach((track) => {
      track.buffers.forEach((buffer, fileIndex) => {
        const voiceStart = this.voices.length;

        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          this.voices.push(buffer.getChannelData(channel));
        }

        this.targets.push({
          track,
          fileIndex,
          channels: buffer.numberOfChannels,
          voiceStart,
          sampleRate: buffer.sampleRate,
        });

        this.groups.push({
          start: voiceStart,
          count: buffer.numberOfChannels,
          kind: track.name === DRUM_TRACK_NAME ? 'transient' : 'vocoder',
        });
      });
    });
  }

  async start(offset: number = 0, requestedStartAt?: number) {
    if (this.isInitialised) {
      this.stop();
    }

    this.offset = offset;
    this.epoch += 1;

    const epoch = this.epoch;

    await this.prepared;

    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => {});
    }

    if (epoch !== this.epoch) {
      return;
    }

    const speed = this._playbackSpeed;
    const { sampleRate } = this.context;

    this.totalOutputSeconds = this.duration / speed;

    const outputStartSeconds = offset / speed;

    this.stream.seek(Math.round(outputStartSeconds * sampleRate));
    this.outputProducedSeconds = outputStartSeconds;

    const firstBlocks = await this.stream.produce(FRAMES_PER_CHUNK);

    if (epoch !== this.epoch) {
      return;
    }

    const leadStartAt = this.context.currentTime + START_LEAD_SECONDS;
    const startAt = Math.max(requestedStartAt ?? leadStartAt, leadStartAt);

    this.startedAt = startAt;
    this.scheduledUntil = startAt;
    this.isInitialised = true;

    if (firstBlocks.length > 0) {
      const chunkDuration = firstBlocks[0].length / sampleRate;
      const isFinalChunk =
        this.outputProducedSeconds + chunkDuration >= this.totalOutputSeconds;

      this.scheduleBlocks(
        firstBlocks,
        this.scheduledUntil,
        isFinalChunk ? epoch : undefined,
      );

      this.scheduledUntil += chunkDuration;
      this.outputProducedSeconds += chunkDuration;
    }

    this.timer = setInterval(this.pump, SCHEDULER_INTERVAL_MS);
  }

  /**
   * Schedules one chunk of already-time-stretched audio per track/file.
   * `endEpoch`, when passed, marks this as the LAST chunk the song will
   * ever need (the one that pushes `outputProducedSeconds` up to
   * `totalOutputSeconds`) - once every track's native AudioBufferSourceNode
   * for that chunk has genuinely finished playing (the browser's own
   * hardware-clocked 'ended' event, not anything polled from JS),
   * `handleFinalChunkEnded` fires. That's a deliberate second, independent
   * path to onEnded alongside pump()'s own currentTime/scheduledUntil poll
   * below - see the comment on `pump` for why the poll alone isn't enough.
   */
  private scheduleBlocks(blocks: SampleBlock[], at: number, endEpoch?: number) {
    let remaining = this.targets.length;
    const onChunkEnded =
      endEpoch === undefined
        ? undefined
        : () => {
            remaining -= 1;

            if (remaining <= 0) {
              this.handleFinalChunkEnded(endEpoch);
            }
          };

    this.targets.forEach((target) => {
      const length = blocks[target.voiceStart].length;
      const buffer = this.context.createBuffer(
        target.channels,
        length,
        target.sampleRate,
      );

      for (let channel = 0; channel < target.channels; channel += 1) {
        buffer.copyToChannel(blocks[target.voiceStart + channel], channel);
      }

      target.track.scheduleChunk(target.fileIndex, buffer, at, onChunkEnded);
    });
  }

  /**
   * Fires once the actual, already-scheduled audio for the song's last
   * chunk has finished playing on every track - confirmed by the browser's
   * native 'ended' event, not by anything this class computed. `stop()`
   * detaches this listener on every OTHER stop/seek/restart path (see
   * SpeedAudioTrack.stopSource), so this only ever runs for a genuine,
   * un-interrupted run to the end. `endEpoch` guards against a chunk
   * scheduled by a since-superseded `start()` call still firing late.
   */
  private handleFinalChunkEnded(endEpoch: number): void {
    if (endEpoch !== this.epoch || !this.isInitialised) {
      return;
    }

    this.stop();
    this.onEnded?.();
  }

  /**
   * Keeps the stretched-audio buffer topped up to `LOOKAHEAD_SECONDS` and,
   * as a FALLBACK, detects the end of the song by polling
   * `context.currentTime` against the last chunk's scheduled end. This poll
   * is not the only way onEnded fires - `handleFinalChunkEnded` (wired in
   * `scheduleBlocks`) is the primary path, driven by the browser's own
   * native 'ended' event on the last scheduled AudioBufferSourceNode
   * instead of anything computed here.
   *
   * That split matters: `stream.produce()` is a worker round-trip, and this
   * whole function is guarded by the `pumping` flag against re-entrancy.
   * One slow/delayed worker response (GC pause, CPU contention from other
   * processes, a busy machine - all ordinary, not exotic) stalls this
   * function for as long as that response takes, and every 100ms timer
   * tick in between is a no-op (`if (this.pumping) return`). The actual
   * audio keeps playing and audibly finishes on schedule regardless - it
   * was already scheduled on the real audio clock - but nothing in this
   * function runs again to notice until the stalled produce() call
   * resolves. In practice that has been observed to take upwards of ten
   * seconds under load, which reads as "the run doesn't end" even though
   * the recording is done. The native 'ended' listener doesn't depend on
   * this function ever running again, so it isn't affected by that stall.
   */
  private pump = async () => {
    if (this.pumping || !this.isInitialised) {
      return;
    }

    this.pumping = true;

    const epoch = this.epoch;

    try {
      while (
        epoch === this.epoch &&
        this.isInitialised &&
        this.scheduledUntil < this.context.currentTime + LOOKAHEAD_SECONDS &&
        this.outputProducedSeconds < this.totalOutputSeconds
      ) {
        const blocks = await this.stream.produce(FRAMES_PER_CHUNK);

        if (
          epoch !== this.epoch ||
          !this.isInitialised ||
          blocks.length === 0
        ) {
          break;
        }

        const chunkDuration = blocks[0].length / this.context.sampleRate;
        const isFinalChunk =
          this.outputProducedSeconds + chunkDuration >= this.totalOutputSeconds;

        this.scheduleBlocks(
          blocks,
          this.scheduledUntil,
          isFinalChunk ? epoch : undefined,
        );

        this.scheduledUntil += chunkDuration;
        this.outputProducedSeconds += chunkDuration;
      }
    } finally {
      this.pumping = false;
    }

    if (
      epoch === this.epoch &&
      this.isInitialised &&
      this.outputProducedSeconds >= this.totalOutputSeconds &&
      this.context.currentTime >= this.scheduledUntil
    ) {
      this.stop();
      this.onEnded?.();
    }
  };

  stop() {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.audioTracks.forEach((track) => track.stop());
    this.isInitialised = false;
    this.startedAt = -1;
    this.epoch += 1;
  }

  get currentTime() {
    if (this.startedAt < 0) {
      return 0;
    }

    const latency = this.context.state === 'running' ? this.outputLatency : 0;

    return Math.min(
      this.duration,
      Math.max(
        this.offset,
        (this.context.currentTime - this.startedAt) * this._playbackSpeed +
          this.offset -
          latency * this._playbackSpeed,
      ),
    );
  }

  destroy() {
    this.stop();
    super.destroy();
    this.onEnded = undefined;
    this.stream.destroy();
  }
}
