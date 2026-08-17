import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  InteractionModeArbiter,
  InteractionModeProvider,
  INTERACTION_MODE_IDLE_MS,
  useInteractionMode,
} from '.';

function makeArbiter() {
  let strike = () => {};
  const unsubscribe = vi.fn();
  const arbiter = new InteractionModeArbiter({
    subscribeToDrumStrikes(listener) {
      strike = listener;

      return unsubscribe;
    },
  });

  return { arbiter, strike: () => strike(), unsubscribe };
}

describe('InteractionModeArbiter', () => {
  it('switches to computer mode on mouse activity', () => {
    vi.useFakeTimers();

    const { arbiter } = makeArbiter();

    arbiter.start();

    window.dispatchEvent(new MouseEvent('mousemove'));

    expect(arbiter.getSnapshot()).toBe('computer');
    arbiter.stop();
  });

  it('switches to computer mode on keyboard activity', () => {
    vi.useFakeTimers();

    const { arbiter } = makeArbiter();

    arbiter.start();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(arbiter.getSnapshot()).toBe('computer');
    arbiter.stop();
  });

  it('returns to kit mode after the idle window', () => {
    vi.useFakeTimers();

    const { arbiter } = makeArbiter();

    arbiter.start();
    window.dispatchEvent(new WheelEvent('wheel'));

    vi.advanceTimersByTime(2_000);
    window.dispatchEvent(new MouseEvent('mousemove'));
    vi.advanceTimersByTime(INTERACTION_MODE_IDLE_MS - 1);
    expect(arbiter.getSnapshot()).toBe('computer');

    vi.advanceTimersByTime(1);
    expect(arbiter.getSnapshot()).toBe('kit');
    arbiter.stop();
  });

  it('returns to kit mode as soon as the drum is struck', () => {
    vi.useFakeTimers();

    const { arbiter, strike } = makeArbiter();

    arbiter.start();
    window.dispatchEvent(new MouseEvent('mousedown'));

    strike();

    expect(arbiter.getSnapshot()).toBe('kit');
    arbiter.stop();
  });

  it('removes listeners and its pending timer when the provider unmounts', () => {
    vi.useFakeTimers();

    const { arbiter, unsubscribe } = makeArbiter();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <InteractionModeProvider arbiter={arbiter}>
        {children}
      </InteractionModeProvider>
    );
    const { result, unmount } = renderHook(() => useInteractionMode(), {
      wrapper,
    });

    act(() => window.dispatchEvent(new MouseEvent('mousemove')));
    expect(result.current).toBe('computer');

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(arbiter.getSnapshot()).toBe('computer');
  });
});
