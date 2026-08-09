import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Engine } from '../../services/engine';
import { STREAK_STAGES } from '../../services/streak';
import { INITIAL_STREAK_UI_STATE, useStreakEngine } from './useStreakEngine';

type Listener = (...args: never[]) => void;

/**
 * A minimal stand-in for Engine exposing only the 4 subscription methods
 * `useStreakEngine` actually calls (`onHit`/`onFalseHit`/`onMiss`/
 * `onReset`) - real Engine construction needs a live AudioContext/Judge/
 * Transport stack, which is irrelevant to testing this hook's own event
 * -> streak-state wiring.
 */
function fakeEngine() {
  const hit = new Set<Listener>();
  const falseHit = new Set<Listener>();
  const miss = new Set<Listener>();
  const reset = new Set<Listener>();

  return {
    engine: {
      onHit: (l: Listener) => {
        hit.add(l);

        return () => hit.delete(l);
      },
      onFalseHit: (l: Listener) => {
        falseHit.add(l);

        return () => falseHit.delete(l);
      },
      onMiss: (l: Listener) => {
        miss.add(l);

        return () => miss.delete(l);
      },
      onReset: (l: Listener) => {
        reset.add(l);

        return () => reset.delete(l);
      },
    } as unknown as Engine,
    emitHit: (pos: { measureIdx: number; noteIdx: number }) =>
      hit.forEach((l) => l(pos as never)),
    emitFalseHit: () => falseHit.forEach((l) => l()),
    emitMiss: () => miss.forEach((l) => l()),
    emitReset: () => reset.forEach((l) => l()),
    listenerCounts: () => ({
      hit: hit.size,
      falseHit: falseHit.size,
      miss: miss.size,
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

  it('announces a stage-up exactly on the hit that crosses a threshold', () => {
    const { engine, emitHit } = fakeEngine();
    const { result } = renderHook(() => useStreakEngine(engine));
    const firstThreshold = STREAK_STAGES[0].threshold;

    act(() => {
      for (let i = 0; i < firstThreshold; i += 1) {
        emitHit({ measureIdx: 0, noteIdx: i });
      }
    });

    expect(result.current.streak.stage?.id).toBe(STREAK_STAGES[0].id);
    expect(result.current.announceStage?.id).toBe(STREAK_STAGES[0].id);
    expect(result.current.announceSeq).toBe(1);

    act(() => emitHit({ measureIdx: 0, noteIdx: firstThreshold }));

    // Still within the same stage - no second announce.
    expect(result.current.announceSeq).toBe(1);
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

  it('unsubscribes from all four engine events on unmount', () => {
    const { engine, listenerCounts } = fakeEngine();
    const { unmount } = renderHook(() => useStreakEngine(engine));

    expect(listenerCounts()).toEqual({
      hit: 1,
      falseHit: 1,
      miss: 1,
      reset: 1,
    });

    unmount();

    expect(listenerCounts()).toEqual({
      hit: 0,
      falseHit: 0,
      miss: 0,
      reset: 0,
    });
  });
});
