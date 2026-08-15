import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultAudioPlayer } from './default/player';
import { installFetchByByteLength, installWebAudio } from './test-support';

beforeEach(() => {
  installWebAudio();
  installFetchByByteLength(() => 7);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('in-memory audio tracks', () => {
  it('decodes generated buffers beside fetched stems', async () => {
    const generated = new ArrayBuffer(11);
    const player = new DefaultAudioPlayer(
      [
        { name: 'drums', urls: ['drums.ogg'] },
        { name: 'voice', urls: [], buffers: [generated] },
      ],
      vi.fn(),
      () => 11,
    );

    await player.ready;

    expect(fetch).toHaveBeenCalledOnce();
    expect(player.audioTracks.map((track) => track.name)).toEqual([
      'drums',
      'voice',
    ]);
    expect(player.audioTracks[1].duration).toBe(11);
    expect(generated.byteLength).toBe(11);
  });
});
