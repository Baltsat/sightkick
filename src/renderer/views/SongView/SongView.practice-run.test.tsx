import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSong, setupSongView } from '../test-support';

// Practice mode always resolves to the speed-controllable player
// (MODE_POLICIES.practice.player === 'speed' - see ../../modes.ts), which
// schedules audio through StretchStream's real FFT time-stretch pipeline
// instead of DefaultAudioPlayer's plain buffer-source 'ended' event.
// Driving that pipeline to a genuine end-of-song against the shared test
// harness's artificial ~8s fixture buffer is prohibitively slow (thousands
// of ~1.5ms real chunks). Exactly like speed/player.test.ts already does
// for the player's own unit tests, this file mocks StretchStream to
// produce large synthetic chunks so a run reaches its end in a handful of
// scheduler ticks. That keeps Transport/Engine/SongView's real (unmocked)
// onEnded wiring under test - only the expensive DSP internals are
// swapped out - and the mock lives in its own file so it can never affect
// SongView.test.tsx's other suites.
vi.mock('../../services/audio-player/speed/stretch-stream', () => {
  class StretchStream {
    private channels: Float32Array[] = [];

    init(channels: Float32Array[]) {
      this.channels = channels;
    }

    setSpeed() {}

    seek() {}

    produce(frames: number) {
      return Promise.resolve(
        this.channels.map(() => new Float32Array(frames * 512)),
      );
    }

    destroy() {}
  }

  return { StretchStream };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function runToEnd(view: ReturnType<typeof setupSongView>) {
  // The mocked stream still schedules through the real setInterval-driven
  // pump loop in speed/player.ts, which only produces (and only completes)
  // once the fake context's currentTime actually advances past each
  // chunk's scheduled end - so this has to step both the timers *and* the
  // fake clock together, the same way completeCountIn() does for the
  // count-in scheduler elsewhere in this test suite.
  for (let i = 0; i < 30; i += 1) {
    view.audio.currentTime += 1.5;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    if (screen.queryByTestId('score-modal')) {
      return;
    }
  }

  throw new Error('practice run never reached its end within the probe budget');
}

describe('practice mode analytics', () => {
  it('captures analytics, saves a run, and shows practice stats for a completed run - without star scoring or high-score submission', async () => {
    vi.useFakeTimers();

    try {
      const view = setupSongView({
        route: '/song-1?gameMode=practice',
        settings: { countIn: false },
        keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
      });

      await view.loadSong(
        makeSong({
          scoreData: { expert: { hitNotes: 8, totalNotes: 8, falseHits: 0 } },
        }),
      );

      // Looping now defaults off (a practice run must be able to reach
      // onEnded without an explicit opt-in), so this run reaches the end
      // and fires onEnded with no toggle needed.
      view.clickPlay();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      view.audio.currentTime = 0.5;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      await act(async () => {
        await view.pressKey('KeyJ');
      });

      await runToEnd(view);

      const modal = screen.getByTestId('score-modal');

      expect(within(modal).getByTestId('practice-stats')).toBeInTheDocument();
      expect(within(modal).queryByText(/accuracy$/)).not.toBeInTheDocument();
      expect(within(modal).queryByText('Perfect')).not.toBeInTheDocument();

      const practiceRunPayloads = view.ipc.sent
        .filter((s) => s.channel === 'save-practice-run')
        .map((s) => s.args[0]);

      expect(practiceRunPayloads).toEqual([
        {
          songId: 'song-1',
          records: expect.arrayContaining([
            expect.objectContaining({ verdict: 'hit', element: 'snare' }),
            expect.objectContaining({ verdict: 'miss', element: 'snare' }),
          ]),
          summary: expect.objectContaining({
            mode: 'practice',
            playbackSpeed: 1,
          }),
        },
      ]);
      // Perform-only side effects never fire for a Practice run, even
      // one that would have beaten the stored high score.
      expect(view.sentChannels()).not.toContain('update-song');
    } finally {
      vi.useRealTimers();
    }
  }, 30000);
});
