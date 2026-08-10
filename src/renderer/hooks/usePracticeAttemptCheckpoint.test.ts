import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HitRecord } from '../services/practice-stats';
import {
  createPracticeAttemptCheckpointController,
  PRACTICE_ATTEMPT_CHECKPOINT_INTERVAL_MS,
} from './usePracticeAttemptCheckpoint';

afterEach(() => {
  vi.useRealTimers();
});

function hit(tick: number): HitRecord {
  return {
    tick,
    timeSeconds: tick / 480,
    deltaMs: -8,
    element: 'snare',
    verdict: 'hit',
    velocity: 96,
  };
}

function setup() {
  const lifecycleTarget = new EventTarget();
  const visibilityTarget = new EventTarget();
  const send = vi.fn();
  const records: HitRecord[] = [hit(480)];
  let positionTick = 960;
  const controller = createPracticeAttemptCheckpointController({
    readSeed: () => ({
      songId: 'song-1',
      sessionId: 'attempt-1',
      startedAt: '2026-08-10T00:00:00.000Z',
      chartRevision: 'chart-revision-1',
      mode: 'practice',
      difficulty: 'expert',
      playbackSpeed: 0.8,
      positionTick: () => positionTick,
    }),
    evidence: {
      getAttemptRecords: () => records.map((record) => ({ ...record })),
    },
    send,
    now: () => new Date('2026-08-10T00:00:04.000Z'),
    lifecycleTarget: lifecycleTarget as unknown as Window,
    visibilityTarget: visibilityTarget as unknown as Document,
  });

  return {
    controller,
    lifecycleTarget,
    visibilityTarget,
    send,
    records,
    setPositionTick: (value: number) => {
      positionTick = value;
    },
  };
}

describe('createPracticeAttemptCheckpointController', () => {
  it('autosaves an in-progress evidence snapshot on start and at a bounded interval', () => {
    vi.useFakeTimers();

    const { controller, records, send, setPositionTick } = setup();

    controller.start();

    expect(send).toHaveBeenCalledWith('save-practice-attempt-checkpoint', {
      checkpoint: expect.objectContaining({
        songId: 'song-1',
        sessionId: 'attempt-1',
        positionTick: 960,
        records,
      }),
    });

    records.push(hit(960));
    setPositionTick(1_440);
    vi.advanceTimersByTime(PRACTICE_ATTEMPT_CHECKPOINT_INTERVAL_MS);

    expect(send).toHaveBeenLastCalledWith('save-practice-attempt-checkpoint', {
      checkpoint: expect.objectContaining({
        positionTick: 1_440,
        records: [hit(480), hit(960)],
      }),
    });

    controller.dispose();
  });

  it('flushes on lifecycle exit and preserves the draft unless explicitly finalized', () => {
    vi.useFakeTimers();

    const { controller, lifecycleTarget, send } = setup();

    controller.start();
    lifecycleTarget.dispatchEvent(new Event('pagehide'));

    expect(send).toHaveBeenCalledTimes(2);
    expect(
      send.mock.calls.every(
        ([channel]) => channel === 'save-practice-attempt-checkpoint',
      ),
    ).toBe(true);

    controller.dispose();

    expect(send).toHaveBeenCalledTimes(3);
    expect(
      send.mock.calls.some(
        ([channel]) => channel === 'finalize-practice-attempt-checkpoint',
      ),
    ).toBe(false);
  });

  it('clears only through the explicit post-completion finalization path', () => {
    vi.useFakeTimers();

    const { controller, lifecycleTarget, send } = setup();

    controller.start();
    send.mockClear();

    expect(controller.finalize()).toBe(true);
    expect(controller.flush()).toBe(false);
    expect(controller.finalize()).toBe(false);
    controller.dispose();
    lifecycleTarget.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(PRACTICE_ATTEMPT_CHECKPOINT_INTERVAL_MS * 2);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('finalize-practice-attempt-checkpoint', {
      songId: 'song-1',
      sessionId: 'attempt-1',
    });
  });

  it('flushes once and seals teardown while the atomic completed-run save owns deletion', () => {
    vi.useFakeTimers();

    const { controller, lifecycleTarget, records, send } = setup();

    controller.start();
    send.mockClear();
    records.push(hit(960));

    expect(controller.prepareForCompletion()).toBe(true);
    expect(controller.flush()).toBe(false);
    expect(controller.prepareForCompletion()).toBe(false);
    controller.dispose();
    lifecycleTarget.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(PRACTICE_ATTEMPT_CHECKPOINT_INTERVAL_MS * 2);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('save-practice-attempt-checkpoint', {
      checkpoint: expect.objectContaining({
        sessionId: 'attempt-1',
        records: [hit(480), hit(960)],
      }),
    });
  });
});
