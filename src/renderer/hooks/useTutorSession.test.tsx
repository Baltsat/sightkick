import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Measure, ParsedChart } from '../../chart-parser/types';
import { Engine, ResolvedJudgement } from '../services/engine';
import { TimeStore } from '../services/time-store';
import { DEFAULT_TUTOR_SETTINGS, TutorCommand } from '../services/tutor';
import {
  messageForTutorCommand,
  RECOVERY_PREVIEW_MS,
  useTutorSession,
} from './useTutorSession';

afterEach(() => {
  vi.useRealTimers();
});

class TutorEngineProbe {
  readonly timeStore = new TimeStore();
  readonly pause = vi.fn();
  readonly setLoopRegion = vi.fn();
  readonly setPlaybackSpeed = vi.fn();
  readonly playFromTick = vi.fn();
  private judgementListeners = new Set<(value: ResolvedJudgement) => void>();
  private runEndingListeners = new Set<() => boolean>();
  private loopRestartListeners = new Set<() => void>();

  onJudgement(listener: (value: ResolvedJudgement) => void) {
    this.judgementListeners.add(listener);

    return () => this.judgementListeners.delete(listener);
  }

  onRunEnding(listener: () => boolean) {
    this.runEndingListeners.add(listener);

    return () => this.runEndingListeners.delete(listener);
  }

  onLoopRestart(listener: () => void) {
    this.loopRestartListeners.add(listener);

    return () => this.loopRestartListeners.delete(listener);
  }

  getSnapshot() {
    return { isPlaying: false };
  }

  emit(judgement: ResolvedJudgement) {
    this.judgementListeners.forEach((listener) => listener(judgement));
  }

  finish(): boolean {
    return [...this.runEndingListeners].every((listener) => listener());
  }

  restartLoop() {
    this.loopRestartListeners.forEach((listener) => listener());
  }
}

const chart = {
  resolution: 192,
  tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
} as unknown as ParsedChart;
const measures: Measure[] = [
  {
    startTick: 0,
    endTick: 768,
    notes: [
      { tick: 0, notes: ['c/5'], isRest: false },
      { tick: 192, notes: ['c/5'], isRest: false },
    ],
  } as Measure,
  {
    startTick: 768,
    endTick: 1536,
    notes: [
      { tick: 768, notes: ['c/5'], isRest: false },
      { tick: 960, notes: ['c/5'], isRest: false },
    ],
  } as Measure,
];

function outcome(
  verdict: 'hit' | 'miss',
  measureIndex: number,
  tick: number,
): ResolvedJudgement {
  return {
    id: `note:${tick}:c/5`,
    verdict,
    expectedTick: tick,
    expectedElement: 'snare',
    measureIndex,
    scoreable: true,
  };
}

function emitPass(engine: TutorEngineProbe, verdict: 'hit' | 'miss') {
  engine.emit(outcome(verdict, 0, 0));
  engine.emit(outcome(verdict, 0, 192));
  engine.emit(outcome(verdict, 1, 768));
  engine.emit(outcome(verdict, 1, 960));
}

describe('useTutorSession run-ending handshake', () => {
  it('leaves an identical failed run untouched when the tutor is disabled', () => {
    const probe = new TutorEngineProbe();
    const { result } = renderHook(() =>
      useTutorSession({
        engine: probe as unknown as Engine,
        runKey: 'perform-run',
        chart,
        measures,
        delaySeconds: 0,
        enabled: false,
        targetSpeed: 1,
      }),
    );
    let mayCommit = false;

    act(() => {
      emitPass(probe, 'miss');
      mayCommit = probe.finish();
    });

    expect(mayCommit).toBe(true);
    expect(result.current.state.phase).toBe('off');
    expect(probe.pause).not.toHaveBeenCalled();
    expect(probe.setLoopRegion).not.toHaveBeenCalled();
    expect(probe.playFromTick).not.toHaveBeenCalled();
    expect(probe.setPlaybackSpeed).not.toHaveBeenCalled();
  });

  it('retargets an unplayed run before accepting the first judgement', async () => {
    const probe = new TutorEngineProbe();
    const { result, rerender } = renderHook(
      ({ targetSpeed }) =>
        useTutorSession({
          engine: probe as unknown as Engine,
          runKey: 'recommended-run',
          chart,
          measures,
          delaySeconds: 0,
          enabled: true,
          targetSpeed,
        }),
      { initialProps: { targetSpeed: 1 } },
    );

    rerender({ targetSpeed: 0.7 });

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        phase: 'observing',
        targetSpeed: 0.7,
        currentSpeed: 0.7,
      });
    });
  });

  it('recovers a final-bar failure, repeats cleanly, and commits Results exactly once after release - without ever touching playback speed', () => {
    vi.useFakeTimers();

    const probe = new TutorEngineProbe();
    const { result } = renderHook(() =>
      useTutorSession({
        engine: probe as unknown as Engine,
        runKey: 'run-final-bars',
        chart,
        measures,
        delaySeconds: 0,
        enabled: true,
        targetSpeed: 1,
      }),
    );
    let firstCommit = true;

    act(() => {
      emitPass(probe, 'miss');
      firstCommit = probe.finish();
    });

    expect(firstCommit).toBe(false);
    expect(result.current.state.phase).toBe('recovering');
    expect(probe.playFromTick).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(RECOVERY_PREVIEW_MS));

    expect(probe.playFromTick).toHaveBeenLastCalledWith(0, 'force');

    let firstCleanCommit = true;

    act(() => {
      emitPass(probe, 'hit');
      firstCleanCommit = probe.finish();
    });

    expect(firstCleanCommit).toBe(false);
    expect(result.current.state.phase).toBe('recovering');
    expect(probe.playFromTick).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(RECOVERY_PREVIEW_MS));

    expect(probe.playFromTick).toHaveBeenCalledTimes(2);

    let releasedCommit = false;

    act(() => {
      emitPass(probe, 'hit');
      releasedCommit = probe.finish();
    });

    expect(releasedCommit).toBe(true);
    expect(result.current.state.phase).toBe('complete');
    expect(probe.playFromTick).toHaveBeenCalledTimes(2);
    // Learner-owned tempo: material-failure, begin-recovery, repeat-recovery
    // and resume-main all fired across this run, and none of them may ever
    // command the engine's playback speed.
    expect(probe.setPlaybackSpeed).not.toHaveBeenCalled();
  });

  it('drives a full failing-and-recovering run at a learner-chosen 0.7x and never moves the speed on its own, including a mid-run manual change', () => {
    vi.useFakeTimers();

    const probe = new TutorEngineProbe();
    const { result, rerender } = renderHook(
      ({ targetSpeed }) =>
        useTutorSession({
          engine: probe as unknown as Engine,
          runKey: 'learner-owned-tempo',
          chart,
          measures,
          delaySeconds: 0,
          enabled: true,
          targetSpeed,
        }),
      { initialProps: { targetSpeed: 0.7 } },
    );

    expect(result.current.state.currentSpeed).toBe(0.7);

    // Fail the first phrase: material-failure -> begin-recovery.
    act(() => {
      emitPass(probe, 'miss');
      probe.finish();
    });

    expect(result.current.state.phase).toBe('recovering');
    act(() => vi.advanceTimersByTime(RECOVERY_PREVIEW_MS));
    expect(probe.playFromTick).toHaveBeenCalledTimes(1);

    // Mid-run: he reaches over and slows down further himself, on the real
    // speed control - not through the tutor. His choice must land and stick.
    rerender({ targetSpeed: 0.5 });
    expect(result.current.state.currentSpeed).toBe(0.5);

    // First recovery attempt fails again -> repeat-recovery.
    act(() => {
      emitPass(probe, 'miss');
      probe.finish();
    });

    expect(result.current.state.phase).toBe('recovering');
    act(() => vi.advanceTimersByTime(RECOVERY_PREVIEW_MS));
    expect(probe.playFromTick).toHaveBeenCalledTimes(2);

    // Two clean passes release him back to the song (resume-main), then the
    // song completes.
    act(() => {
      emitPass(probe, 'hit');
      probe.finish();
    });
    act(() => vi.advanceTimersByTime(RECOVERY_PREVIEW_MS));

    let finalCommit = false;

    act(() => {
      emitPass(probe, 'hit');
      finalCommit = probe.finish();
    });

    expect(finalCommit).toBe(true);
    expect(result.current.state.phase).toBe('complete');
    // The whole run failed, recovered twice, and released - and his speed
    // control (mocked here as the `rerender`d targetSpeed prop) is the only
    // thing that ever moved. The engine's own setPlaybackSpeed must never
    // have been called by any of it.
    expect(probe.setPlaybackSpeed).not.toHaveBeenCalled();
    expect(result.current.state.currentSpeed).toBe(0.5);
  });

  it('lets natural chunk-loop wraps qualify the hard spot and apply the next engine-selected window', async () => {
    vi.useFakeTimers();

    const probe = new TutorEngineProbe();
    const { result } = renderHook(() =>
      useTutorSession({
        engine: probe as unknown as Engine,
        runKey: 'recursive-lesson',
        chart,
        measures,
        delaySeconds: 0,
        enabled: true,
        targetSpeed: 0.8,
        settings: {
          recursiveChunkGrowthEnabled: true,
          minimumResolvedEvents: 4,
          minimumDistinctErrors: 3,
        },
      }),
    );

    act(() => {
      emitPass(probe, 'miss');
      probe.finish();
    });

    expect(result.current.state.recovery).toMatchObject({
      region: { startTick: 0, endTick: 192, stage: 'seed' },
      chunkGrowth: { activeWindowIndex: 0 },
    });
    expect(result.current.message).toMatchObject({
      title: 'Start at the hard spot',
      tone: 'recovery',
    });
    expect(result.current.message.detail).toContain('bar 1 · beat 1 → beat 2');
    expect(probe.setLoopRegion).toHaveBeenLastCalledWith({
      startTick: 0,
      endTick: 192,
    });

    for (let pass = 0; pass < 2; pass += 1) {
      act(() => probe.emit(outcome('hit', 0, 0)));
      await act(async () => {
        probe.restartLoop();
        await Promise.resolve();
      });
    }

    expect(result.current.state.recovery?.chunkGrowth?.activeWindowIndex).toBe(
      1,
    );
    expect(result.current.message.title).toBe('Grow the phrase');
    expect(probe.setLoopRegion).toHaveBeenLastCalledWith(
      expect.objectContaining({ startTick: 0 }),
    );
    expect(
      result.current.state.recoveryAttempts.map(
        ({ chunkTransition }) => chunkTransition,
      ),
    ).toEqual(['repeat', 'expand']);
    expect(probe.setPlaybackSpeed).not.toHaveBeenCalled();
  });

  it('joins the final full phrase and releases the real run-ending handshake', async () => {
    const probe = new TutorEngineProbe();
    const { result } = renderHook(() =>
      useTutorSession({
        engine: probe as unknown as Engine,
        runKey: 'recursive-final-phrase',
        chart,
        measures,
        delaySeconds: 0,
        enabled: true,
        targetSpeed: 1,
        settings: {
          recursiveChunkGrowthEnabled: true,
          minimumResolvedEvents: 4,
          minimumDistinctErrors: 3,
        },
      }),
    );

    act(() => {
      emitPass(probe, 'miss');
      probe.finish();
    });

    let mayCommit = false;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const growth = result.current.state.recovery?.chunkGrowth;

      if (!growth) {
        break;
      }

      const window = growth.plan.windows[growth.activeWindowIndex];

      act(() => {
        measures.forEach((measure, measureIndex) => {
          measure.notes.forEach((note) => {
            if (note.tick >= window.startTick && note.tick < window.endTick) {
              probe.emit(outcome('hit', measureIndex, note.tick));
            }
          });
        });
      });

      if (
        growth.activeWindowIndex === growth.plan.windows.length - 1 &&
        window.endTick === measures.at(-1)?.endTick
      ) {
        act(() => {
          mayCommit = probe.finish();
        });
      } else {
        await act(async () => {
          probe.restartLoop();
          await Promise.resolve();
        });
      }
    }

    expect(mayCommit).toBe(true);
    expect(result.current.state.phase).toBe('complete');
    expect(result.current.state.lastRecoveryOutcome).toMatchObject({
      status: 'mastered',
      startMeasure: 0,
      endMeasure: 1,
    });
    expect(probe.setLoopRegion).toHaveBeenLastCalledWith(undefined);
    expect(probe.setPlaybackSpeed).not.toHaveBeenCalled();
  });

  it('replaces a completed run store after commit without updating state during render', async () => {
    const probe = new TutorEngineProbe();
    const { result, rerender } = renderHook(
      ({ runKey }) =>
        useTutorSession({
          engine: probe as unknown as Engine,
          runKey,
          chart,
          measures,
          delaySeconds: 0,
          enabled: true,
          targetSpeed: 1,
        }),
      {
        initialProps: { runKey: 'first-run' },
        wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
      },
    );

    act(() => {
      emitPass(probe, 'hit');
      probe.finish();
    });

    expect(result.current.state.phase).toBe('complete');

    rerender({ runKey: 'retry-run' });

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        phase: 'observing',
        livesRemaining: 3,
        interventions: [],
        recoveryAttempts: [],
      });
    });
  });

  it('cancels a staged recovery when the session unmounts', () => {
    vi.useFakeTimers();

    const probe = new TutorEngineProbe();
    const { unmount } = renderHook(() =>
      useTutorSession({
        engine: probe as unknown as Engine,
        runKey: 'leaving-run',
        chart,
        measures,
        delaySeconds: 0,
        enabled: true,
        targetSpeed: 1,
      }),
    );

    act(() => {
      emitPass(probe, 'miss');
      probe.finish();
    });

    expect(probe.playFromTick).not.toHaveBeenCalled();
    unmount();
    act(() => vi.advanceTimersByTime(RECOVERY_PREVIEW_MS));
    expect(probe.playFromTick).not.toHaveBeenCalled();
  });
});

describe('Tutor HUD evidence messages', () => {
  const trigger = {
    id: 'trigger:1',
    reason: 'three-distinct-errors' as const,
    stats: {
      startMeasure: 3,
      endMeasure: 4,
      expected: 8,
      resolved: 8,
      hits: 5,
      misses: 3,
      wrong: 2,
      distinctErrorIds: ['miss:1', 'miss:2', 'miss:3', 'wrong:1', 'wrong:2'],
      timingSampleCount: 5,
      timingSpreadMs: 12,
      timingOutlierCount: 0,
      wrongPadPairs: [],
      accuracy: 0.625,
      distinctMissIds: ['miss:1', 'miss:2', 'miss:3'],
    },
  };
  const recovery = {
    id: 'recovery:1',
    trigger,
    region: {
      startMeasure: 2,
      endMeasure: 5,
      startTick: 200,
      endTick: 600,
      resumeMeasure: 6,
      resumeTick: 600,
    },
    repetition: 2,
    cleanRepetitions: 1,
    qualityProgress: 1,
    bestQuality: 0.9,
  };

  it('names the trigger counts and checkpoint lead-in, and never claims an automatic speed change', () => {
    const material: TutorCommand = {
      type: 'material-failure',
      trigger,
      livesRemaining: 2,
    };
    const rewind: TutorCommand = {
      type: 'begin-recovery',
      recovery,
      speed: 0.8,
    };

    expect(
      messageForTutorCommand(material, DEFAULT_TUTOR_SETTINGS)?.detail,
    ).toContain('8 resolved notes, 63% accuracy, 3 misses, and 2 wrong hits');
    expect(
      messageForTutorCommand(material, {
        ...DEFAULT_TUTOR_SETTINGS,
        livesEnabled: false,
      })?.detail,
    ).not.toMatch(/life/i);
    expect(
      messageForTutorCommand(rewind, DEFAULT_TUTOR_SETTINGS)?.detail,
    ).toContain('Checkpoint bar 3 gives 1 lead-in bar before failed bars 4–5');
    expect(
      messageForTutorCommand(rewind, DEFAULT_TUTOR_SETTINGS)?.detail,
    ).toContain('played at your own speed');
    expect(
      messageForTutorCommand(rewind, DEFAULT_TUTOR_SETTINGS)?.detail,
    ).not.toMatch(/80%/);
    expect(
      messageForTutorCommand(rewind, DEFAULT_TUTOR_SETTINGS)?.detail,
    ).toContain('listen for the count-in before playing');
  });

  it('explains the configured clean predicate and configurable deferral limit', () => {
    const settings = {
      ...DEFAULT_TUTOR_SETTINGS,
      cleanMinimumAccuracy: 0.95,
      cleanMinimumResolvedEvents: 6,
      cleanMaximumMisses: 1,
      cleanMaximumWrongHits: 1,
      requiredCleanRepetitions: 3,
      maximumFailedRecoveryAttempts: 3,
    };
    const retry: TutorCommand = {
      type: 'repeat-recovery',
      recovery,
      speed: 0.7,
      attempt: {
        id: 'attempt:1',
        recoveryId: recovery.id,
        repetition: 1,
        speed: 0.8,
        result: 'retry',
        stats: trigger.stats,
      },
    };
    const deferred: TutorCommand = {
      type: 'resume-main',
      recoveryId: recovery.id,
      speed: 1,
      reason: 'maximum-failed-attempts',
      failedAttempts: 3,
      maximumFailedAttempts: 3,
      attempt: {
        id: 'attempt:3',
        recoveryId: recovery.id,
        repetition: 3,
        speed: 0.6,
        result: 'deferred',
        deferralReason: 'maximum-failed-attempts',
        stats: trigger.stats,
      },
    };

    expect(messageForTutorCommand(retry, settings)?.detail).toContain(
      '95% or better across 6 resolved notes, no more than 1 miss, and no more than 1 wrong hit',
    );
    expect(messageForTutorCommand(deferred, settings)?.detail).toContain(
      '3 failed recovery attempts reached the configured 3-attempt safety limit',
    );
    expect(messageForTutorCommand(deferred, settings)?.detail).toContain(
      'without trapping you here',
    );
    expect(messageForTutorCommand(deferred, settings)?.detail).not.toContain(
      'Six',
    );
  });
});
