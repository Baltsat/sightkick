import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSong, setupSongView } from '../test-support';

const outletContextHolder = vi.hoisted(() => ({
  current: undefined as unknown,
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );

  return {
    ...actual,
    useOutletContext: () => outletContextHolder.current,
  };
});

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
  outletContextHolder.current = undefined;
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
  it('does not mint a high score or durable rewards when practice evidence fails to save', async () => {
    const recordRun = vi.fn((input: unknown) => {
      window.electron.ipcRenderer.sendMessage('record-practice-day', input);
    });
    const loadAchievements = vi.fn();

    outletContextHolder.current = {
      recordRun,
      loadAchievements,
      todayXp: 0,
      goalXp: 100,
      streak: { current: 0, longest: 0 },
    };

    const view = setupSongView({
      route: '/song-1?gameMode=perform',
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong();
    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    expect(screen.getByTestId('score-modal')).toBeInTheDocument();
    expect(view.updateSongPayloads()).toHaveLength(0);
    expect(recordRun).not.toHaveBeenCalled();
    expect(loadAchievements).not.toHaveBeenCalled();
    expect(view.sentChannels()).not.toContain('record-practice-day');

    await act(async () => {
      view.ipc.emit('save-practice-run', { error: 'Storage quota exceeded' });
    });

    expect(view.updateSongPayloads()).toHaveLength(0);
    expect(recordRun).not.toHaveBeenCalled();
    expect(loadAchievements).not.toHaveBeenCalled();
    expect(view.sentChannels()).not.toContain('record-practice-day');
  });

  it('mints the high score and durable reward exactly once after save success', async () => {
    const recordRun = vi.fn((input: unknown) => {
      // useGamification.recordRun owns the real XP/day/streak IPC write. This
      // focused context double exposes that boundary as the same channel so
      // the test can prove its post-save ordering and exact call count.
      window.electron.ipcRenderer.sendMessage('record-practice-day', input);
    });
    const loadAchievements = vi.fn();

    outletContextHolder.current = {
      recordRun,
      loadAchievements,
      todayXp: 0,
      goalXp: 100,
      streak: { current: 0, longest: 0 },
    };

    const view = setupSongView({
      route: '/song-1?gameMode=perform',
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong();
    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    expect(view.updateSongPayloads()).toHaveLength(0);
    expect(recordRun).not.toHaveBeenCalled();
    expect(view.sentChannels()).not.toContain('record-practice-day');

    await act(async () => {
      view.ipc.emit('save-practice-run', { songId: 'song-1' });
      view.ipc.emit('save-practice-run', { songId: 'song-1' });
    });

    expect(view.updateSongPayloads()).toEqual([
      {
        id: 'song-1',
        scoreData: { expert: { hitNotes: 1, totalNotes: 8, falseHits: 0 } },
      },
    ]);
    expect(recordRun).toHaveBeenCalledOnce();
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        totalHits: 1,
        difficulty: 'expert',
        starsEarned: 0,
      }),
      expect.any(Function),
    );
    expect(loadAchievements).toHaveBeenCalledOnce();
    expect(
      view.ipc.sent.filter(({ channel }) => channel === 'record-practice-day'),
    ).toHaveLength(1);
  });

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
            expect.objectContaining({ verdict: 'miss', element: 'snare' }),
          ]),
          summary: expect.objectContaining({
            mode: 'practice',
            // The adaptive tutor stepped this incomplete run down while it
            // recovered the failed phrase, so persistence must reflect the
            // actual terminal playback speed rather than the requested one.
            playbackSpeed: 0.5,
            tutor: expect.objectContaining({
              interventions: expect.arrayContaining([
                expect.objectContaining({
                  triggerJudgements: expect.arrayContaining([
                    expect.objectContaining({
                      verdict: 'hit',
                      expectedElement: 'snare',
                    }),
                  ]),
                }),
              ]),
            }),
            context: expect.objectContaining({
              chartRevision: 'song-1:expert:unversioned',
            }),
            // The producer saves only Tutor-asserted bars; it never rebuilds
            // a bar map later from this summary's aggregate score.
            learningEvidence: expect.objectContaining({
              bars: expect.any(Object),
            }),
            coachEvidence: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                skillTag: expect.any(String),
                sampleCount: expect.any(Number),
              }),
            ]),
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

  it('continues from Results with the just-completed evidence instead of returning to the library', async () => {
    vi.useFakeTimers();

    const continuePractice = vi.fn();

    outletContextHolder.current = {
      gamification: undefined,
      continuePractice,
    };

    try {
      const view = setupSongView({
        route: '/song-1?gameMode=practice',
        settings: { countIn: false, adaptiveTutorEnabled: false },
        keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
        onContinuePractice: continuePractice,
      });

      await view.loadSong();
      view.clickPlay();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      await view.pressKey('KeyJ');
      await runToEnd(view);

      expect(screen.getByTestId('score-next')).toHaveTextContent(
        'Next practice',
      );
      view.clickTestId('score-next');

      expect(continuePractice).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: 'song-1',
          summary: expect.objectContaining({ mode: 'practice' }),
        }),
      );
      expect(screen.queryByTestId('song-list-stub')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  }, 30000);
});
