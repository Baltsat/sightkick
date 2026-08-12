import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DRUM_CHART,
  makeLessonSong,
  makeSong,
  setupSongView,
  SINGLE_NOTE_CHART,
} from '../test-support';
import { multiLaneRunFixture } from '../../components/PracticeStats/test-fixtures';
import { computeLessonProgress } from '../../hooks/useLessons/helpers';
import { chartContentRevision } from '../../services/chart-revision';
import { remediationQueueSlotKey } from '../../services/remediation';

const TEST_CHART_REVISION = chartContentRevision({
  songId: 'song-1',
  difficulty: 'expert',
  format: 'chart',
  fileData: new TextEncoder().encode(DRUM_CHART),
});
const TEST_REMEDIATION_STORAGE_KEY = remediationQueueSlotKey(
  'song-1',
  TEST_CHART_REVISION,
);
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
  for (let i = 0; i < 60; i += 1) {
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

function installFrameDriver() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId;

    nextId += 1;
    callbacks.set(id, callback);

    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    callbacks.delete(id);
  });

  return {
    flush(timeMs = 0) {
      const pending = [...callbacks.values()];

      callbacks.clear();
      pending.forEach((callback) => callback(timeMs));
    },
  };
}

function installGestureClock(startMs = 3_000) {
  let now = startMs;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    advance(milliseconds: number) {
      now += milliseconds;
    },
    restore() {
      spy.mockRestore();
    },
  };
}

async function strikeGesture(
  view: ReturnType<typeof setupSongView>,
  clock: ReturnType<typeof installGestureClock>,
  codes: string[],
) {
  for (const [index, code] of codes.entries()) {
    if (index > 0) {
      clock.advance(180);
    }

    await view.pressKey(code);
  }
}

async function settlePlaybackStart() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function playCleanFirstBar(
  view: ReturnType<typeof setupSongView>,
  frames: ReturnType<typeof installFrameDriver>,
  playbackSpeed: number,
) {
  await settlePlaybackStart();

  const startAt = Math.max(
    ...view
      .startedSources()
      .flatMap((source) => source.starts.map((start) => start.at)),
  );

  if (!Number.isFinite(startAt)) {
    throw new Error('remediation loop never scheduled its audio source');
  }

  for (const noteTime of [0, 0.5, 1, 1.5]) {
    view.audio.currentTime = startAt + noteTime / playbackSpeed;
    act(() => frames.flush(view.audio.currentTime * 1000));
    await view.pressKey('KeyJ');
  }

  view.audio.currentTime = startAt + 2.01 / playbackSpeed;
  act(() => frames.flush(view.audio.currentTime * 1000));
  await settlePlaybackStart();
}

describe('practice mode analytics', () => {
  it('keeps a pause command out of checkpoints, Tutor evidence, and completed analytics', async () => {
    vi.useFakeTimers();

    const clock = installGestureClock();
    const frames = installFrameDriver();

    try {
      const view = setupSongView({
        route: '/song-1?gameMode=practice&practiceSpeed=2',
        settings: { countIn: false },
        keyboard: {
          kit: {
            kick: ['keyboard:KeyK'],
            crash: ['keyboard:KeyC'],
            snare: ['keyboard:KeyJ'],
          },
        },
      });

      await view.loadSong(makeSong(), SINGLE_NOTE_CHART);
      view.clickPlay();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      for (const [index, code] of ['KeyK', 'KeyC', 'KeyK', 'KeyC'].entries()) {
        if (index > 0) {
          // Three legal 360 ms gaps put the command at 1080 ms, just inside
          // its 1100 ms wall-clock window. At 2x the chart advances 2.16 s,
          // proving cleanup uses the captured chart boundary rather than a
          // fixed one-second rewind.
          clock.advance(360);
          view.audio.currentTime += 0.36;
          act(() => frames.flush(view.audio.currentTime * 1000));
        }

        await view.pressKey(code);
      }

      await act(async () => Promise.resolve());

      expect(screen.getByTestId('play-toggle')).toHaveAttribute(
        'aria-label',
        'Play',
      );
      act(() => window.dispatchEvent(new Event('pagehide')));

      const checkpoint = view.ipc.sent
        .filter((entry) => entry.channel === 'save-practice-attempt-checkpoint')
        .map((entry) => entry.args[0] as { checkpoint: { records: unknown[] } })
        .at(-1);

      expect(checkpoint?.checkpoint.records).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            verdict: 'wrong',
            element: expect.stringMatching(/kick|crash/),
          }),
        ]),
      );
      expect(
        within(screen.getByTestId('tutor-hud')).queryByText(
          'Phrase needs one more pass',
        ),
      ).not.toBeInTheDocument();

      clock.advance(1_200);
      await strikeGesture(view, clock, ['KeyK', 'KeyC', 'KeyK', 'KeyC']);
      await act(async () => Promise.resolve());
      expect(screen.getByTestId('count-in')).toBeInTheDocument();
      await view.completeCountIn();
      await settlePlaybackStart();

      const resumedAt = Math.max(
        ...view
          .startedSources()
          .flatMap((source) => source.starts.map((start) => start.at)),
      );

      view.audio.currentTime = resumedAt;
      act(() => frames.flush(view.audio.currentTime * 1000));
      await view.pressKey('KeyJ');

      view.openSettings();
      fireEvent.click(screen.getByTestId('setting-hands-free-controls'));
      fireEvent.click(screen.getByTestId('setting-adaptive-tutor'));
      await runToEnd(view);

      const completed = view.ipc.sent
        .filter((entry) => entry.channel === 'save-practice-run')
        .map((entry) => entry.args[0])
        .at(-1) as
        | { summary: { totalWrong: number }; records: unknown[] }
        | undefined;

      expect(completed).toBeDefined();
      expect(completed!).toMatchObject({
        summary: { totalWrong: 0 },
      });
      expect(completed!.records).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            verdict: 'wrong',
            element: expect.stringMatching(/kick|crash/),
          }),
        ]),
      );
    } finally {
      clock.restore();
      vi.useRealTimers();
    }
  });

  it('retires the resumed source checkpoint with the completed live run', async () => {
    vi.useFakeTimers();

    try {
      const view = setupSongView({
        route: '/song-1?gameMode=practice',
        settings: { adaptiveTutorEnabled: false },
        keyboard: { kit: { kick: ['keyboard:KeyK'] } },
      });

      await view.loadSong(makeSong(), DRUM_CHART);
      act(() => {
        view.ipc.emit('load-practice-attempt-checkpoints', {
          songId: 'song-1',
          checkpoints: [
            {
              schemaVersion: 1,
              state: 'in-progress',
              songId: 'song-1',
              sessionId: 'interrupted-source',
              startedAt: '2026-08-10T10:00:00.000Z',
              updatedAt: '2026-08-10T10:02:00.000Z',
              chartRevision: TEST_CHART_REVISION,
              mode: 'practice',
              difficulty: 'expert',
              playbackSpeed: 1,
              positionTick: 0,
              records: [],
            },
          ],
        });
      });

      await view.pressKey('KeyK');
      expect(screen.getByTestId('count-in')).toBeInTheDocument();
      await view.completeCountIn();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(screen.getByTestId('play-toggle')).toHaveAttribute(
        'aria-label',
        'Pause',
      );
      view.openSettings();
      fireEvent.click(screen.getByTestId('setting-hands-free-controls'));
      await runToEnd(view);

      const payload = view.ipc.sent
        .filter((entry) => entry.channel === 'save-practice-run')
        .map((entry) => entry.args[0])
        .at(-1) as
        | {
            songId: string;
            finalizeAttemptSessionIds: string[];
          }
        | undefined;

      expect(payload).toBeDefined();
      expect(payload!).toMatchObject({
        songId: 'song-1',
        finalizeAttemptSessionIds: [expect.any(String), 'interrupted-source'],
      });
      expect(payload!.finalizeAttemptSessionIds[0]).not.toBe(
        'interrupted-source',
      );

      const completedRunIndex = view.ipc.sent
        .map((entry) => entry.channel)
        .lastIndexOf('save-practice-run');
      const checkpointIndices = view.ipc.sent
        .map((entry, index) => ({ channel: entry.channel, index }))
        .filter((entry) => entry.channel === 'save-practice-attempt-checkpoint')
        .map((entry) => entry.index);

      expect(checkpointIndices.some((index) => index < completedRunIndex)).toBe(
        true,
      );
      expect(checkpointIndices.some((index) => index > completedRunIndex)).toBe(
        false,
      );
    } finally {
      vi.useRealTimers();
    }
  });

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
        settings: { countIn: false, handsFreeControlsEnabled: false },
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
          finalizeAttemptSessionIds: [expect.any(String)],
          records: expect.arrayContaining([
            expect.objectContaining({ verdict: 'miss', element: 'snare' }),
          ]),
          summary: expect.objectContaining({
            mode: 'practice',
            playbackSpeed: 1,
            tutor: expect.objectContaining({
              interventions: [],
            }),
            context: expect.objectContaining({
              chartRevision: TEST_CHART_REVISION,
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

  it('persists a full target-speed lesson pass and unlocks the next lesson only after the run save succeeds', async () => {
    vi.useFakeTimers();

    const recordRun = vi.fn();

    outletContextHolder.current = {
      recordRun,
      loadAchievements: vi.fn(),
      todayXp: 0,
      goalXp: 100,
      streak: { current: 0, longest: 0 },
    };

    try {
      const view = setupSongView({
        route: '/lesson-1?gameMode=practice',
        settings: {
          countIn: false,
          adaptiveTutorEnabled: false,
          handsFreeControlsEnabled: false,
        },
        keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
      });

      await view.loadSong(
        makeSong({
          id: 'lesson-1',
          lesson: {
            id: '01.01',
            title: 'Alternating Singles Warm-Up',
            unit: 'Foundations',
            starsToUnlock: 0,
          },
        }),
        SINGLE_NOTE_CHART,
      );
      view.clickPlay();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      await view.pressKey('KeyJ');

      await runToEnd(view);

      expect(view.updateSongPayloads()).toHaveLength(0);
      expect(recordRun).not.toHaveBeenCalled();
      expect(screen.getByTestId('lesson-progression-result')).toHaveTextContent(
        'Learning pass complete',
      );

      await act(async () => {
        view.ipc.emit('save-practice-run', { songId: 'lesson-1' });
      });

      expect(view.updateSongPayloads()).toEqual([
        {
          id: 'lesson-1',
          scoreData: {
            expert: { hitNotes: 1, totalNotes: 1, falseHits: 0 },
          },
        },
      ]);
      expect(recordRun).toHaveBeenCalledWith(
        expect.objectContaining({ starsEarned: 5 }),
        expect.any(Function),
      );
      expect(screen.getByText('Perfect')).toBeInTheDocument();

      const progress = computeLessonProgress([
        makeLessonSong(
          'lesson-1',
          {
            id: '01.01',
            title: 'Alternating Singles Warm-Up',
            starsToUnlock: 0,
          },
          {
            scoreData: {
              expert: { hitNotes: 1, totalNotes: 1, falseHits: 0 },
            },
          },
        ),
        makeLessonSong('lesson-2', {
          id: '01.02',
          title: 'Paired Doubles Warm-Up',
          starsToUnlock: 1,
        }),
      ]);

      expect(progress.totalStars).toBe(5);
      expect(progress.unlockedCount).toBe(2);
      expect(progress.entries[1]).toMatchObject({ unlocked: true });
    } finally {
      vi.useRealTimers();
    }
  }, 30000);

  it('does not unlock a lesson when a run starts below the learning tempo and only finishes at target speed', async () => {
    vi.useFakeTimers();

    const recordRun = vi.fn();

    outletContextHolder.current = {
      recordRun,
      loadAchievements: vi.fn(),
      todayXp: 0,
      goalXp: 100,
      streak: { current: 0, longest: 0 },
    };

    try {
      const view = setupSongView({
        route: '/lesson-1?gameMode=practice',
        settings: {
          countIn: false,
          adaptiveTutorEnabled: false,
          handsFreeControlsEnabled: false,
        },
        keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
      });

      await view.loadSong(
        makeSong({
          id: 'lesson-1',
          lesson: {
            id: '01.01',
            title: 'Alternating Singles Warm-Up',
            unit: 'Foundations',
            starsToUnlock: 0,
          },
        }),
      );

      for (let index = 0; index < 4; index += 1) {
        await view.pressKey('ArrowDown');
      }

      view.clickPlay();
      view.audio.currentTime = 0.5;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      await view.pressKey('KeyJ');

      for (let index = 0; index < 4; index += 1) {
        await view.pressKey('ArrowUp');
      }

      view.audio.currentTime = 1;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      await view.pressKey('KeyJ');
      await runToEnd(view);

      expect(screen.getByTestId('lesson-progression-result')).toHaveTextContent(
        'Finish at 0.7× or faster.',
      );

      await act(async () => {
        view.ipc.emit('save-practice-run', { songId: 'lesson-1' });
      });

      expect(view.updateSongPayloads()).toHaveLength(0);
      expect(recordRun).toHaveBeenCalledWith(
        expect.objectContaining({ starsEarned: 0 }),
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
    }
  }, 30000);

  it('does not unlock a lesson after scrubbing forward to the true end', async () => {
    vi.useFakeTimers();

    const recordRun = vi.fn();

    outletContextHolder.current = {
      recordRun,
      loadAchievements: vi.fn(),
      todayXp: 0,
      goalXp: 100,
      streak: { current: 0, longest: 0 },
    };

    try {
      const view = setupSongView({
        route: '/lesson-1?gameMode=practice',
        settings: {
          countIn: false,
          adaptiveTutorEnabled: false,
          handsFreeControlsEnabled: false,
        },
        keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
      });

      await view.loadSong(
        makeSong({
          id: 'lesson-1',
          lesson: {
            id: '01.01',
            title: 'Alternating Singles Warm-Up',
            unit: 'Foundations',
            starsToUnlock: 0,
          },
        }),
      );
      view.clickPlay();

      for (const time of [0.5, 1]) {
        view.audio.currentTime = time;
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150);
        });
        await view.pressKey('KeyJ');
      }

      view.seekToEnd();
      await runToEnd(view);

      expect(screen.getByTestId('lesson-progression-result')).toHaveTextContent(
        'Start from bar 1',
      );

      await act(async () => {
        view.ipc.emit('save-practice-run', { songId: 'lesson-1' });
      });

      expect(view.updateSongPayloads()).toHaveLength(0);
      expect(recordRun).toHaveBeenCalledWith(
        expect.objectContaining({ starsEarned: 0 }),
        expect.any(Function),
      );
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
        settings: {
          countIn: false,
          adaptiveTutorEnabled: false,
          autoContinueEnabled: true,
          handsFreeControlsEnabled: true,
        },
        keyboard: {
          kit: {
            snare: ['keyboard:KeyJ'],
            kick: ['keyboard:KeyK'],
            crash: ['keyboard:KeyL'],
            ride: ['keyboard:KeyI'],
          },
        },
        onContinuePractice: continuePractice,
      });

      await view.loadSong(makeSong(), SINGLE_NOTE_CHART);
      view.clickPlay();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      await view.pressKey('KeyJ');
      await runToEnd(view);

      expect(screen.getByTestId('score-next')).toHaveTextContent(
        'Continue My Wave',
      );
      expect(screen.getByTestId('score-next')).toBeDisabled();
      expect(
        screen.queryByTestId('score-auto-continue'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('score-persistence-status')).toHaveTextContent(
        'Saving this run',
      );

      for (const code of ['KeyK', 'KeyL', 'KeyK', 'KeyL']) {
        await view.pressKey(code);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
      }

      expect(continuePractice).not.toHaveBeenCalled();
      expect(screen.getByTestId('score-modal')).toBeInTheDocument();

      for (const code of ['KeyI', 'KeyK', 'KeyI', 'KeyL']) {
        await view.pressKey(code);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
      }

      expect(continuePractice).not.toHaveBeenCalled();
      expect(screen.getByTestId('score-modal')).toBeInTheDocument();

      await act(async () => {
        view.ipc.emit('save-practice-run', { songId: 'song-1' });
      });

      expect(screen.getByTestId('score-next')).toBeEnabled();
      expect(screen.getByTestId('score-auto-continue')).toBeInTheDocument();
      expect(screen.getByTestId('score-kit-controls')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_200);
      });

      for (const code of ['KeyK', 'KeyL', 'KeyK', 'KeyL']) {
        await view.pressKey(code);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
      }

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

  it('finishes a stored Coach remediation after two natural clean loop wraps and returns to the same review', async () => {
    vi.useFakeTimers();

    const frames = installFrameDriver();

    try {
      const view = setupSongView({
        route: '/song-1?gameMode=practice',
        settings: {
          countIn: false,
          adaptiveTutorEnabled: false,
          handsFreeControlsEnabled: false,
        },
        keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
      });

      await view.loadSong();
      view.openSettings();
      fireEvent.click(screen.getByTestId('ai-coach-button'));

      const summary = {
        ...multiLaneRunFixture('2026-08-01T00:00:00.000Z'),
        mode: 'practice' as const,
        playbackSpeed: 0.7,
        context: {
          sessionId: 'original-coach-session',
          schemaVersion: 2,
          appVersion: '1.2.0-test',
          scoringPolicyVersion: 'judge-resolved-v2',
          startedAt: '2026-08-01T00:00:00.000Z',
          chartRevision: TEST_CHART_REVISION,
          inputLatencyMs: 0,
          inputMapping: { snare: ['keyboard:KeyJ'] },
        },
      };
      const storedRun = {
        summary,
        records: [
          { tick: 0, deltaMs: 4, element: 'snare', verdict: 'hit' },
          { tick: 192, deltaMs: 0, element: 'snare', verdict: 'miss' },
          { tick: 384, deltaMs: 0, element: 'snare', verdict: 'miss' },
          { tick: 576, deltaMs: 0, element: 'snare', verdict: 'miss' },
        ],
      };

      act(() => {
        view.ipc.emit('load-practice-runs', {
          songId: 'song-1',
          runs: [summary],
          fullRuns: [storedRun],
        });
      });
      await settlePlaybackStart();

      expect(
        screen.getByTestId('coach-finding-trouble-bars'),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('coach-practice-bars'));
      await settlePlaybackStart();

      const storageKey = TEST_REMEDIATION_STORAGE_KEY;
      const startedQueue = JSON.parse(
        window.localStorage.getItem(storageKey) ?? 'null',
      ) as {
        source: unknown;
        status: string;
        tasks: { consecutiveCleanPasses: number }[];
      };
      const originalSource = startedQueue.source;

      expect(screen.getByTestId('practice-mode-indicator')).toHaveAttribute(
        'data-looping',
        'true',
      );
      expect(screen.getByTestId('loop-escape-runway')).toHaveAttribute(
        'data-phase',
        'control',
      );
      expect(screen.getByTestId('tutor-recovery-caption')).toHaveTextContent(
        'Coach loop armed',
      );
      expect(startedQueue).toMatchObject({
        status: 'active',
        source: {
          runId: 'original-coach-session',
          sessionId: 'original-coach-session',
          songId: 'song-1',
          chartRevision: TEST_CHART_REVISION,
          completedAt: '2026-08-01T00:00:00.000Z',
        },
      });

      view.clickPlay();
      await playCleanFirstBar(view, frames, 0.7);

      const afterFirstPass = JSON.parse(
        window.localStorage.getItem(storageKey) ?? 'null',
      ) as {
        status: string;
        tasks: { consecutiveCleanPasses: number }[];
      };

      expect(afterFirstPass).toMatchObject({
        status: 'active',
        tasks: [{ consecutiveCleanPasses: 1 }],
      });
      expect(
        screen.queryByTestId('remediation-repetition'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('loop-escape-runway')).toHaveAttribute(
        'data-phase',
        'lock',
      );
      expect(screen.getByTestId('tutor-recovery-caption')).toHaveTextContent(
        'First anchor acquired',
      );

      await playCleanFirstBar(view, frames, 0.7);

      const completedQueue = JSON.parse(
        window.localStorage.getItem(storageKey) ?? 'null',
      ) as {
        source: unknown;
        status: string;
        activeTaskIndex: number;
        tasks: {
          status: string;
          consecutiveCleanPasses: number;
          attempts: { qualifiesAsCleanPass: boolean }[];
        }[];
      };

      expect(completedQueue).toMatchObject({
        status: 'completed',
        activeTaskIndex: 1,
        tasks: [
          {
            status: 'completed',
            consecutiveCleanPasses: 2,
            attempts: [
              { qualifiesAsCleanPass: true },
              { qualifiesAsCleanPass: true },
            ],
          },
        ],
      });
      expect(completedQueue.source).toEqual(originalSource);
      expect(screen.getByTestId('practice-mode-indicator')).not.toHaveAttribute(
        'data-looping',
      );
      expect(screen.getByTestId('loop-escape-runway')).toHaveAttribute(
        'data-phase',
        'release',
      );
      expect(screen.getByTestId('tutor-recovery-caption')).toHaveTextContent(
        'Loop released',
      );

      const review = screen.getByTestId('remediation-review');

      expect(within(review).getByText('Remediation complete')).toBeVisible();
      expect(review).toHaveTextContent('original-coach-session');

      act(() => {
        view.ipc.emit('load-practice-runs', {
          songId: 'song-1',
          runs: [summary],
          fullRuns: [storedRun],
        });
      });
      await settlePlaybackStart();

      expect(
        screen.getByTestId('coach-finding-trouble-bars'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('remediation-review')).toHaveTextContent(
        'original-coach-session',
      );
    } finally {
      vi.useRealTimers();
    }
  }, 30000);
});
