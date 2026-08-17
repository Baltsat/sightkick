import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  InteractionModeArbiter,
  InteractionModeProvider,
  INTERACTION_MODE_IDLE_MS,
} from '../../services/interaction-mode';
import {
  InactivityPauseVeil,
  useInactivityPauseVeil,
} from './InactivityPauseVeil';

describe('useInactivityPauseVeil', () => {
  it('steps aside after pointer activity and returns for a later kit pause', () => {
    const { result, rerender } = renderHook(
      ({ pauseEpoch }: { pauseEpoch: number | undefined }) =>
        useInactivityPauseVeil(pauseEpoch),
      { initialProps: { pauseEpoch: 1 } },
    );

    expect(result.current.visible).toBe(true);

    act(() => result.current.release());
    expect(result.current.visible).toBe(false);

    rerender({ pauseEpoch: 2 });
    expect(result.current.visible).toBe(true);
  });

  it('shows the held bar and exact kit action in a full-bleed veil', () => {
    render(<InactivityPauseVeil visible checkpointMeasure={12} />);

    const veil = screen.getByTestId('inactivity-pause-veil');

    expect(veil).toHaveAttribute('data-fullscreen-moment', 'kit-command');
    expect(veil).toHaveAttribute('data-state', 'inactivity-paused');
    expect(veil).toHaveAttribute('data-primary-element', 'any');
    expect(veil).toHaveAccessibleName(
      'Paused. Hit any pad to return: Any pad. Bar 13 is held · a fresh count-in resumes from here.',
    );
  });

  it('stays absent until inactivity has genuinely parked the run', () => {
    render(<InactivityPauseVeil visible={false} checkpointMeasure={12} />);

    expect(
      screen.queryByTestId('inactivity-pause-veil'),
    ).not.toBeInTheDocument();
  });

  it('steps out of the way during computer input', () => {
    vi.useFakeTimers();

    const arbiter = new InteractionModeArbiter({
      subscribeToDrumStrikes: () => () => {},
    });

    render(
      <InteractionModeProvider arbiter={arbiter}>
        <InactivityPauseVeil visible checkpointMeasure={12} />
      </InteractionModeProvider>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('inactivity-pause-veil')).toHaveAttribute(
      'data-yielding',
      'true',
    );

    act(() => vi.advanceTimersByTime(INTERACTION_MODE_IDLE_MS));
    expect(screen.getByTestId('inactivity-pause-veil')).toBeInTheDocument();
  });
});
