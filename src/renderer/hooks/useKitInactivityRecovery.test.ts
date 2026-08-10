import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Measure, Note, ParsedChart } from '../../chart-parser/types';
import { inputBus } from '../input';
import type { Engine } from '../services/engine';
import { TimeStore } from '../services/time-store';
import {
  checkpointForInactivity,
  expectedHeadsBetween,
  INACTIVITY_MIN_EXPECTED_HEADS,
  INACTIVITY_MIN_SECONDS,
  useKitInactivityRecovery,
} from './useKitInactivityRecovery';

function note(tick: number, heads = 1, isRest = false): Note {
  return {
    tick,
    isRest,
    notes: Array.from({ length: heads }, () => 'c/5'),
  } as Note;
}

function measure(startTick: number, notes: Note[]): Measure {
  return {
    startTick,
    endTick: startTick + 1920,
    notes,
  } as Measure;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('kit inactivity recovery', () => {
  const measures = [
    measure(0, [note(0), note(480), note(960), note(1440)]),
    measure(1920, [note(1920), note(2400, 2), note(2880), note(3360)]),
    measure(3840, [note(3840), note(4320), note(4800), note(5280)]),
  ];

  it('uses a quick but musically guarded away threshold', () => {
    expect(INACTIVITY_MIN_SECONDS).toBe(2.25);
    expect(INACTIVITY_MIN_EXPECTED_HEADS).toBe(3);
  });

  it('counts authored heads rather than elapsed empty time', () => {
    expect(expectedHeadsBetween(measures, 1900, 3000)).toBe(4);
    expect(
      expectedHeadsBetween([measure(0, [note(0, 1, true)])], 0, 1900),
    ).toBe(0);
  });

  it('does not count the last exactly-hit head as abandoned', () => {
    const exactHeadMeasures = [
      measure(0, [note(480), note(960), note(1_440), note(1_800)]),
    ];

    expect(expectedHeadsBetween(exactHeadMeasures, 480, 1_500)).toBe(2);
    expect(expectedHeadsBetween(exactHeadMeasures, 480, 1_900)).toBe(3);
  });

  it('rewinds one musical lead-in bar before the last active bar', () => {
    expect(checkpointForInactivity(measures, 2200, 5000)).toEqual({
      phase: 'parked',
      checkpointMeasure: 0,
      checkpointTick: 0,
      abandonedExpectedHeads: 7,
    });
  });

  it('clamps the checkpoint to the chart start', () => {
    expect(checkpointForInactivity(measures, 100, 1600)).toMatchObject({
      checkpointMeasure: 0,
      checkpointTick: 0,
    });
  });

  it('parks after meaningful authored silence and lets any mapped pad resume from the checkpoint', () => {
    const chart = {
      resolution: 192,
      tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
    } as unknown as ParsedChart;
    const timeStore = new TimeStore();
    const onPark = vi.fn();
    const onResume = vi.fn();
    let inputListener:
      | ((event: { controlId: string; value: number }) => void)
      | undefined;

    vi.spyOn(inputBus, 'subscribe').mockImplementation((listener) => {
      inputListener = listener;

      return () => {
        inputListener = undefined;
      };
    });

    const { result } = renderHook(() =>
      useKitInactivityRecovery({
        enabled: true,
        isPlaying: true,
        chart,
        measures,
        delaySeconds: 0,
        mapping: { snare: ['midi:38'], kick: ['midi:36'] },
        timeStore,
        onPark,
        onResume,
      }),
    );

    act(() => timeStore.set(4));

    expect(result.current).toMatchObject({
      phase: 'parked',
      checkpointMeasure: 0,
    });
    expect(onPark).toHaveBeenCalledTimes(1);

    act(() => inputListener?.({ controlId: 'midi:36', value: 96 }));

    expect(onResume).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'parked', checkpointTick: 0 }),
    );
    expect(result.current).toEqual({ phase: 'listening' });
  });

  it('does not park across a real authored rest', () => {
    const chart = {
      resolution: 192,
      tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
    } as unknown as ParsedChart;
    const timeStore = new TimeStore();
    const onPark = vi.fn();

    vi.spyOn(inputBus, 'subscribe').mockImplementation(() => () => {});

    const { result } = renderHook(() =>
      useKitInactivityRecovery({
        enabled: true,
        isPlaying: true,
        chart,
        measures: [measure(0, [note(0, 1, true)])],
        delaySeconds: 0,
        mapping: { snare: ['midi:38'] },
        timeStore,
        onPark,
        onResume: vi.fn(),
      }),
    );

    act(() => timeStore.set(4));

    expect(result.current).toEqual({ phase: 'listening' });
    expect(onPark).not.toHaveBeenCalled();
  });

  it('keeps a resolved authored hit ahead of the later raw-input tick', () => {
    const chart = {
      resolution: 192,
      tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
    } as unknown as ParsedChart;
    const earlyHitMeasures = [
      measure(0, [note(480), note(960), note(1_440), note(1_800)]),
    ];
    const timeStore = new TimeStore();
    const onPark = vi.fn();
    let inputListener:
      | ((event: { controlId: string; value: number }) => void)
      | undefined;
    let hitListener:
      | ((
          position: unknown,
          prefixes: string[],
          meta: { tick: number },
        ) => void)
      | undefined;
    const engine = {
      onHit(listener: typeof hitListener) {
        hitListener = listener;

        return () => {
          hitListener = undefined;
        };
      },
      onSeekStart() {
        return () => {};
      },
      onReset() {
        return () => {};
      },
    } as unknown as Engine;

    vi.spyOn(inputBus, 'subscribe').mockImplementation((listener) => {
      inputListener = listener;

      return () => {
        inputListener = undefined;
      };
    });

    const { result } = renderHook(() =>
      useKitInactivityRecovery({
        enabled: true,
        engine,
        isPlaying: true,
        chart,
        measures: earlyHitMeasures,
        delaySeconds: 0,
        mapping: { snare: ['midi:38'] },
        timeStore,
        onPark,
        onResume: vi.fn(),
      }),
    );

    act(() => {
      // The Judge accepts the early strike for tick 480. InputBus then emits
      // the same physical event while transport is still only at tick 430.
      timeStore.set(430 / 384);
      hitListener?.({}, [], { tick: 480 });
      inputListener?.({ controlId: 'midi:38', value: 96 });
      timeStore.set(1_440 / 384);
    });

    expect(result.current).toEqual({ phase: 'listening' });
    expect(onPark).not.toHaveBeenCalled();

    act(() => timeStore.set(1_800 / 384));

    expect(result.current).toEqual({ phase: 'listening' });
    expect(onPark).not.toHaveBeenCalled();

    act(() => timeStore.set(1_900 / 384));

    expect(result.current).toMatchObject({
      phase: 'parked',
      abandonedExpectedHeads: 3,
    });
    expect(onPark).toHaveBeenCalledTimes(1);
  });

  it('treats a forward scrub as navigation and starts silence detection from the new position', () => {
    const chart = {
      resolution: 192,
      tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
    } as unknown as ParsedChart;
    const timeStore = new TimeStore();
    const onPark = vi.fn();
    const seekStartListeners = new Set<() => void>();
    const resetListeners = new Set<() => void>();
    const engine = {
      onHit() {
        return () => {};
      },
      onSeekStart(listener: () => void) {
        seekStartListeners.add(listener);

        return () => seekStartListeners.delete(listener);
      },
      onReset(listener: () => void) {
        resetListeners.add(listener);

        return () => resetListeners.delete(listener);
      },
    } as unknown as Engine;

    vi.spyOn(inputBus, 'subscribe').mockImplementation(() => () => {});

    const { result } = renderHook(() =>
      useKitInactivityRecovery({
        enabled: true,
        engine,
        isPlaying: true,
        chart,
        measures,
        delaySeconds: 0,
        mapping: { snare: ['midi:38'] },
        timeStore,
        onPark,
        onResume: vi.fn(),
      }),
    );

    act(() => {
      seekStartListeners.forEach((listener) => listener());
      timeStore.set(4);
      resetListeners.forEach((listener) => listener());
    });

    expect(result.current).toEqual({ phase: 'listening' });
    expect(onPark).not.toHaveBeenCalled();

    act(() => timeStore.set(8));

    expect(result.current).toMatchObject({
      phase: 'parked',
      abandonedExpectedHeads: 4,
    });
    expect(onPark).toHaveBeenCalledTimes(1);
  });
});
