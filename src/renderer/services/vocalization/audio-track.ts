import type { TrackConfig } from '../audio-player';
import type { RenderedVocalizationTrack } from './types';

export function createVocalizationTrackConfig(
  track: RenderedVocalizationTrack,
  name: string = 'rhythm voice',
): TrackConfig {
  const buffer = track.wavBytes.buffer.slice(
    track.wavBytes.byteOffset,
    track.wavBytes.byteOffset + track.wavBytes.byteLength,
  ) as ArrayBuffer;

  return { name, urls: [], buffers: [buffer] };
}
