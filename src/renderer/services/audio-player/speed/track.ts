import { BaseAudioTrack } from '../base-track';

export class SpeedAudioTrack extends BaseAudioTrack {
  private sources: AudioBufferSourceNode[] = [];

  // Tracks the optional "this chunk is the song's last one" listener
  // scheduleChunk attached per-source, so stopSource can detach it before
  // calling the native .stop() below - which itself fires 'ended'. Without
  // this, an ordinary pause/seek/restart on the final scheduled chunk would
  // masquerade as a genuine end-of-song.
  private finalChunkListeners = new Map<AudioBufferSourceNode, () => void>();

  scheduleChunk(
    fileIndex: number,
    buffer: AudioBuffer,
    at: number,
    onEnded?: () => void,
  ) {
    const source = this.context.createBufferSource();

    source.buffer = buffer;
    source.connect(this.gainNodes[fileIndex]);
    source.start(at);
    source.addEventListener('ended', this.endedEventListener);

    if (onEnded) {
      this.finalChunkListeners.set(source, onEnded);
      source.addEventListener('ended', onEnded, { once: true });
    }

    this.sources.push(source);
  }

  stop() {
    this.sources.forEach((source) => this.stopSource(source));
    this.sources = [];
  }

  endedEventListener = (event: Event) => {
    const source = event.currentTarget as AudioBufferSourceNode;

    source.disconnect();

    const idx = this.sources.indexOf(source);

    if (idx !== -1) {
      this.sources.splice(idx, 1);
    }
  };

  stopSource(source: AudioBufferSourceNode) {
    const finalChunkListener = this.finalChunkListeners.get(source);

    if (finalChunkListener) {
      source.removeEventListener('ended', finalChunkListener);
      this.finalChunkListeners.delete(source);
    }

    source.stop();
    source.removeEventListener('ended', this.endedEventListener);
    source.disconnect();
  }
}
