import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeAudioContext,
  installFetchByByteLength,
  installWebAudio,
} from '../test-support';
import { SpeedAudioPlayer } from './player';
import { TrackConfig } from '../types';

const trimSpy = vi.hoisted(() => vi.fn((buffer: unknown) => buffer));

vi.mock('../helpers', () => ({ trimTrailingSilence: trimSpy }));

interface MockStream {
  channels: Float32Array[];
  init: ReturnType<typeof vi.fn>;
  setSpeed: ReturnType<typeof vi.fn>;
  seek: ReturnType<typeof vi.fn>;
  produce: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const { streams } = vi.hoisted(() => ({ streams: [] as MockStream[] }));

vi.mock('./stretch-stream', () => {
  class StretchStream {
    channels: Float32Array[] = [];

    init = vi.fn((channels: Float32Array[]) => {
      this.channels = channels;
    });

    setSpeed = vi.fn();

    seek = vi.fn();

    produce = vi.fn((frames: number) =>
      Promise.resolve(this.channels.map(() => new Float32Array(frames * 512))),
    );

    destroy = vi.fn();

    constructor() {
      streams.push(this as unknown as MockStream);
    }
  }

  return { StretchStream };
});

let context: FakeAudioContext;
const TRACKS: TrackConfig[] = [{ name: 'drums', urls: ['d.ogg'] }];

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

async function makePlayer(onEnded = vi.fn()) {
  const player = new SpeedAudioPlayer(TRACKS, onEnded);

  await player.ready;
  await flush();

  return { player, onEnded, stream: streams[0] };
}

beforeEach(() => {
  streams.length = 0;
  context = installWebAudio();
  installFetchByByteLength(() => 100);
  trimSpy.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SpeedAudioPlayer', () => {
  it('initialises the stream with one voice per channel and the speed', async () => {
    const { stream } = await makePlayer();

    expect(stream.init).toHaveBeenCalledTimes(1);
    expect(stream.init.mock.calls[0][0]).toHaveLength(1);
    expect(stream.init.mock.calls[0][1]).toBe(1);
  });

  it('seeks to the output sample and schedules a first chunk on start', async () => {
    const { player, stream } = await makePlayer();

    await player.start(10);

    expect(stream.seek).toHaveBeenCalledWith(
      Math.round(10 * context.sampleRate),
    );
    expect(player.isInitialised).toBe(true);
    expect(context.bufferSources.length).toBeGreaterThan(0);
  });

  it('reports currentTime scaled by speed, floored at offset and capped at duration', async () => {
    const { player } = await makePlayer();

    player.setPlaybackSpeed(0.5);
    await flush();
    await player.start(4);

    context.currentTime = 10;
    expect(player.currentTime).toBeCloseTo(8.95, 5);

    context.currentTime = 0.05;
    expect(player.currentTime).toBe(4);

    context.currentTime = 1000;
    expect(player.currentTime).toBe(100);
  });

  it('sets the stream speed when changed while stopped', async () => {
    const { player, stream } = await makePlayer();

    stream.setSpeed.mockClear();
    player.setPlaybackSpeed(0.5);
    await flush();

    expect(stream.setSpeed).toHaveBeenCalledWith(0.5);
    expect(stream.seek).not.toHaveBeenCalled();
  });

  it('restarts from the current position when speed changes mid-playback', async () => {
    const { player, stream } = await makePlayer();

    await player.start(0);
    stream.seek.mockClear();
    stream.setSpeed.mockClear();

    player.setPlaybackSpeed(0.5);
    await flush();

    expect(stream.setSpeed).toHaveBeenCalledWith(0.5);
    expect(stream.seek).toHaveBeenCalled();
  });

  it('restarts when speed changes while a loop restart is awaiting its first chunk', async () => {
    const { player, stream } = await makePlayer();
    const pending = player.start(0);

    player.setPlaybackSpeed(0.8);
    await pending;
    await flush();

    expect(stream.setSpeed).toHaveBeenCalledWith(0.8);
    expect(player.isInitialised).toBe(true);
    expect(context.bufferSources.at(-1)?.stopped).toBe(false);
  });

  it('keeps the deferred start when speed changes before playback begins', async () => {
    const { player } = await makePlayer();
    const deferredStart = context.currentTime + 5;

    await player.start(0, deferredStart);
    await flush();

    const before = context.bufferSources.length;

    player.setPlaybackSpeed(0.5);
    await flush();

    const scheduled = context.bufferSources
      .slice(before)
      .flatMap((source) => source.starts.map((start) => start.at));

    expect(scheduled.length).toBeGreaterThan(0);
    scheduled.forEach((at) => expect(at).toBeCloseTo(deferredStart, 5));
  });

  it('stops tracks and clears initialisation on stop', async () => {
    const { player } = await makePlayer();

    await player.start(0);
    player.stop();

    expect(player.isInitialised).toBe(false);
    context.bufferSources.forEach((source) =>
      expect(source.stopped).toBe(true),
    );
  });

  it('does not resume audio or lose the paused position when pause lands mid speed-change restart', async () => {
    const { player } = await makePlayer();

    await player.start(4);
    context.currentTime = 6;

    const positionBeforeSpeedChange = player.currentTime;
    const sourcesBeforePause = context.bufferSources.length;

    // setPlaybackSpeed synchronously stops the player and kicks off an
    // async restart (still awaiting its stretch-stream re-init) before
    // yielding - pausing right here reproduces the exact race a real
    // Transport.pause() call right after a speed change can win.
    player.setPlaybackSpeed(0.5);

    // The mid-restart position must still read as the real paused
    // position, not collapse to 0 - Transport reads this before calling
    // pause() itself, and would otherwise snap the displayed playhead back
    // to bar one.
    expect(player.currentTime).toBeCloseTo(positionBeforeSpeedChange, 5);

    player.pause();

    await flush();

    expect(player.currentTime).toBeCloseTo(positionBeforeSpeedChange, 5);
    // The stale restart must not un-suspend the context the user just
    // paused, nor schedule any new audio behind the paused UI.
    expect(context.resume).not.toHaveBeenCalled();
    expect(context.bufferSources.length).toBe(sourcesBeforePause);
  });

  it('destroys the stream and closes the context on destroy', async () => {
    const { player, stream } = await makePlayer();

    player.destroy();

    expect(stream.destroy).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('fires onEnded once the whole song has been scheduled and played', async () => {
    installFetchByByteLength(() => 1);

    const onEnded = vi.fn();
    const { player } = await makePlayer(onEnded);

    player.setPlaybackSpeed(2);
    await flush();
    await player.start(0);

    context.currentTime = 5;
    await vi.advanceTimersByTimeAsync(150);

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(player.isInitialised).toBe(false);
  });

  // Regression coverage for a real, observed failure mode: `pump`'s own
  // currentTime/scheduledUntil poll only runs once its `stream.produce()`
  // worker round-trip resolves, and that poll is what used to be the ONLY
  // way onEnded ever fired. A slow/stalled produce() response (ordinary
  // under real CPU contention - GC pause, a busy machine) blocked that poll
  // indefinitely even though the already-scheduled audio kept playing and
  // genuinely finished on the real audio clock - the practice run just
  // never got a ScoreSummary. The last scheduled chunk's native
  // AudioBufferSourceNode 'ended' event is a second, independent path to
  // onEnded that doesn't depend on `pump` ever running again, so it isn't
  // affected by that stall. These two tests never advance fake timers /
  // never let `pump`'s own poll run at all - only the native event does.
  it('fires onEnded from the final chunk native ended event alone, without pump ever polling', async () => {
    installFetchByByteLength(() => 1);

    const onEnded = vi.fn();
    const { player } = await makePlayer(onEnded);

    player.setPlaybackSpeed(2);
    await flush();
    await player.start(0);

    const finalChunkSource = context.bufferSources.at(-1);

    finalChunkSource?.emitEnded();

    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(player.isInitialised).toBe(false);
  });

  it('does not fire onEnded from a stale final-chunk ended event once that chunk has been manually stopped', async () => {
    installFetchByByteLength(() => 1);

    const onEnded = vi.fn();
    const { player } = await makePlayer(onEnded);

    player.setPlaybackSpeed(2);
    await flush();
    await player.start(0);

    const finalChunkSource = context.bufferSources.at(-1);

    player.stop();
    finalChunkSource?.emitEnded();

    expect(onEnded).not.toHaveBeenCalled();
  });
});
