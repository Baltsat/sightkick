import { describe, expect, it } from 'vitest';
import { createVocalizationTrackConfig } from './audio-track';
import { synthesizePlaceholderBank } from './placeholder';
import { renderVocalizationTrack } from './render';
import { decodeWav } from './wav';

describe('vocalization rendering', () => {
  it('renders an audible PCM track accepted by the audio-player stem model', () => {
    const rendered = renderVocalizationTrack(
      {
        durationSeconds: 1,
        events: [
          {
            tick: 0,
            timeSeconds: 0,
            voice: 'hihat',
            articulation: 'normal',
            dynamic: 'normal',
            length: 'staccato',
            sampleId: 'hihat_closed_tyk',
            syllable: 'тык',
            gain: 0.76,
          },
          {
            tick: 480,
            timeSeconds: 0.5,
            voice: 'snare',
            articulation: 'accent',
            dynamic: 'accent',
            length: 'staccato',
            sampleId: 'snare_accent_bak',
            syllable: 'бак',
            gain: 1,
          },
        ],
      },
      synthesizePlaceholderBank(8000),
      8000,
    );
    const decoded = decodeWav(rendered.wavBytes);
    const config = createVocalizationTrackConfig(rendered);

    expect(new TextDecoder().decode(rendered.wavBytes.slice(0, 4))).toBe(
      'RIFF',
    );
    expect(decoded.sampleRate).toBe(8000);
    expect(decoded.data.some((value) => Math.abs(value) > 0.05)).toBe(true);
    expect(config).toMatchObject({ name: 'rhythm voice', urls: [] });
    expect(config.buffers?.[0].byteLength).toBe(rendered.wavBytes.byteLength);
  });
});
