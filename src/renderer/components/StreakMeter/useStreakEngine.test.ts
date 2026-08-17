import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Engine } from '../../services/engine';
import { ResolvedJudgement } from '../../services/engine/types';
import {
  STREAK_STAGES,
  StreakQualificationContext,
} from '../../services/streak';
import {
  INITIAL_STREAK_UI_STATE,
  STREAK_CELEBRATION_DURATION_MS,
  useStreakEngine,
} from './useStreakEngine';

type Listener = (...args: never[]) => void;

const targetSixteenthQualification: StreakQualificationContext = {
  resolution: 4,
  measures: [
    {
      notes: Array.from({ length: 1_000 }, (_, tick) => ({
        tick,
        isRest: false,
      })),
    },
  ] as never,
  playbackSpeed: 0.8,
  timingStandard: 'target',
};

/**
 * A minimal stand-in for Engine exposing only the subscription methods
 * `useStreakEngine` actually calls (`onJudgement`/`onReset`) - real Engine
 * construction needs a live AudioContext/Judge/
 * Transport stack, which is irrelevant to testing this hook's own event
 * -> streak-state wiring.
 */
function fakeEngine() {
  const judgement = new Set<(value: ResolvedJudgement) => void>();
  const reset = new Set<Listener>();

  return {
    engine: {
      onJudgement: (l: (value: ResolvedJudgement) => void) => {
        judgement.add(l);

        return () => judgement.delete(l);
      },
      onReset: (l: Listener) => {
        reset.add(l);

        return () => reset.delete(l);
      },
    } as unknown as Engine,
    emitHit: (pos: { measureIdx: number; noteIdx: number }) =>
      judgement.forEach((l) =>
        l({
          id: `note:${pos.measureIdx}:${pos.noteIdx}`,
          verdict: 'hit',
          expectedTick: pos.noteIdx,
          measureIndex: pos.measureIdx,
          scoreable: true,
        }),
      ),
    emitFalseHit: (scoreable = true) =>
      judgement.forEach((l) =>
        l({ id: 'wrong:1', verdict: 'wrong', scoreable }),
      ),
    emitMiss: () =>
      judgement.forEach((l) =>
        l({ id: 'note:miss', verdict: 'miss', scoreable: true }),
      ),
    emitReset: () => reset.forEach((l) => l()),
    listenerCounts: () => ({
      judgement: judgement.size,
      reset: reset.size,
    }),
  };
}

describe('useStreakEngine', () => {
  it('starts at rest with no engine', () => {
    const { result } = renderHook(() => useStreakEngine(undefined));

    expect(result.current).toEqual(INITIAL_STREAK_UI_STATE);
  });

  it('grows the streak count on each distinct hit', () => {
    const { engine, emitHit } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));

    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));
    act(() => emitHit({ measureIdx: 0, noteIdx: 1 }));

    expect(result.current.streak.count).toBe(2);
    expect(result.current.streak.best).toBe(2);
  });

  it('dedupes a chord: two hit events for the same note only count once', () => {
    const { engine, emitHit } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));

    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));
    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));

    expect(result.current.streak.count).toBe(1);
  });

  it('appears on a qualified threshold, then clears itself', () => {
    vi.useFakeTimers();

    const { engine, emitHit } = fakeEngine();
    const { result } = renderHook(() =>
      useStreakEngine(engine, targetSixteenthQualification),
    );
    const firstThreshold = STREAK_STAGES[0].threshold;

    act(() => {
      for (let i = 0; i < firstThreshold; i += 1) {
        emitHit({ measureIdx: 0, noteIdx: i });
      }
    });

    expect(result.current.streak.stage?.id).toBe(STREAK_STAGES[0].id);
    expect(result.current.announceStage?.id).toBe(STREAK_STAGES[0].id);
    expect(result.current.announceSeq).toBe(1);

    act(() => vi.advanceTimersByTime(STREAK_CELEBRATION_DURATION_MS - 1));
    expect(result.current.announceStage?.id).toBe(STREAK_STAGES[0].id);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.announceStage).toBeUndefined();

    vi.useRealTimers();
  });

  it('does not replay a second threshold celebration inside the cooldown', () => {
    vi.useFakeTimers();

    const { engine, emitHit } = fakeEngine();
    const { result } = renderHook(() =>
      useStreakEngine(engine, targetSixteenthQualification),
    );
    const secondThreshold = STREAK_STAGES[1].threshold;

    act(() => {
      for (let i = 0; i < secondThreshold; i += 1) {
        emitHit({ measureIdx: 0, noteIdx: i });
      }
    });

    expect(result.current.announceSeq).toBe(1);

    vi.useRealTimers();
  });

  it('shatters (resets, bumps shatterSeq) on a miss after a running streak', () => {
    const { engine, emitHit, emitMiss } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));

    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));
    act(() => emitHit({ measureIdx: 0, noteIdx: 1 }));
    act(() => emitMiss());

    expect(result.current.streak.count).toBe(0);
    expect(result.current.streak.best).toBe(2);
    expect(result.current.shatterSeq).toBe(1);
  });

  it('shatters on a wrong hit the same way as a miss', () => {
    const { engine, emitHit, emitFalseHit } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));

    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));
    act(() => emitFalseHit());

    expect(result.current.streak.count).toBe(0);
    expect(result.current.shatterSeq).toBe(1);
  });

  it('does not shatter on an unscoreable warm-up tap', () => {
    const { engine, emitHit, emitFalseHit } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));

    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));
    act(() => emitFalseHit(false));

    expect(result.current.streak.count).toBe(1);
    expect(result.current.shatterSeq).toBe(0);
  });

  it('does not shatter twice for repeated misses while already at zero', () => {
    const { engine, emitHit, emitMiss } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));

    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));
    act(() => emitMiss());
    act(() => emitMiss());

    expect(result.current.shatterSeq).toBe(1);
  });

  it('resets silently (no shatter) on an administrative onReset (seek/restart)', () => {
    const { engine, emitHit, emitReset } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));

    act(() => emitHit({ measureIdx: 0, noteIdx: 0 }));
    act(() => emitHit({ measureIdx: 0, noteIdx: 1 }));
    act(() => emitReset());

    expect(result.current.streak.count).toBe(0);
    // Unlike a failure reset, a seek/restart also zeroes best.
    expect(result.current.streak.best).toBe(0);
    expect(result.current.shatterSeq).toBe(0);
  });

  it('resets the streak when the engine instance changes (song switch)', () => {
    const first = fakeEngine();
    const { result, rerender } = renderHook(
      ({ engine }) => useStreakEngine(engine),
      { initialProps: { engine: first.engine } },
    );

    act(() => first.emitHit({ measureIdx: 0, noteIdx: 0 }));
    expect(result.current.streak.count).toBe(1);

    const second = fakeEngine();

    rerender({ engine: second.engine });

    expect(result.current.streak.count).toBe(0);
    expect(result.current.streak.best).toBe(0);
  });

  it('unsubscribes from all engine events on unmount', () => {
    const { engine, listenerCounts } = fakeEngine();
    const { unmount } = renderHook(() => useStreakEngine(engine));

    expect(listenerCounts()).toEqual({
      judgement: 1,
      reset: 1,
    });

    unmount();

    expect(listenerCounts()).toEqual({
      judgement: 0,
      reset: 0,
    });
  });
});
