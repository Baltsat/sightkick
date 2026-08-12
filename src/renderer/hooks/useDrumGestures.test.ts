import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inputBus } from '../input';
import { useDrumGestures } from './useDrumGestures';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDrumGestures', () => {
  it('uses the newly committed guard and action for the first following hit', () => {
    let listener:
      | ((event: { controlId: string; value: number }) => void)
      | undefined;
    const oldAction = vi.fn();
    const newAction = vi.fn();

    vi.spyOn(inputBus, 'subscribePriority').mockImplementation((next) => {
      listener = next;

      return () => {
        listener = undefined;
      };
    });
    vi.spyOn(performance, 'now').mockReturnValue(2_000);

    const { rerender } = renderHook(
      ({ enabled, onAction }) =>
        useDrumGestures({
          enabled,
          surface: 'ready',
          mapping: { kick: ['midi:36'] },
          onAction,
        }),
      { initialProps: { enabled: true, onAction: oldAction } },
    );

    rerender({ enabled: false, onAction: newAction });
    act(() => listener?.({ controlId: 'midi:36', value: 100 }));

    expect(oldAction).not.toHaveBeenCalled();
    expect(newAction).not.toHaveBeenCalled();

    rerender({ enabled: true, onAction: newAction });
    act(() => listener?.({ controlId: 'midi:36', value: 100 }));

    expect(oldAction).not.toHaveBeenCalled();
    expect(newAction).toHaveBeenCalledWith('start');
  });

  it('drops a partial gesture when the committed surface changes', () => {
    let listener:
      | ((event: { controlId: string; value: number }) => void)
      | undefined;
    const onAction = vi.fn();
    let now = 2_000;

    vi.spyOn(inputBus, 'subscribePriority').mockImplementation((next) => {
      listener = next;

      return () => {
        listener = undefined;
      };
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const { rerender } = renderHook(
      ({ surface }: { surface: 'playing' | 'result' }) =>
        useDrumGestures({
          enabled: true,
          surface,
          mapping: { kick: ['midi:36'], crash: ['midi:49'] },
          onAction,
        }),
      {
        initialProps: {
          surface: 'playing',
        } as { surface: 'playing' | 'result' },
      },
    );

    act(() => listener?.({ controlId: 'midi:36', value: 100 }));
    rerender({ surface: 'result' });
    now += 180;
    act(() => listener?.({ controlId: 'midi:49', value: 100 }));
    now += 180;
    act(() => listener?.({ controlId: 'midi:36', value: 100 }));
    now += 180;
    act(() => listener?.({ controlId: 'midi:49', value: 100 }));

    expect(onAction).not.toHaveBeenCalled();
  });
});
