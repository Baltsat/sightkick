import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OneKickHomeSession } from '../../services/next-practice';
import { MyWave } from './MyWave';

const session = {
  launch: {
    candidate: {
      id: 'lesson:01.01',
      title: 'Alternating Singles Warm-Up',
      kind: 'lesson',
    },
  },
  launchSpeed: 0.7,
  reason: 'Saved timing evidence makes this the current frontier.',
  focus: {
    title: 'Alternating Singles Warm-Up',
    detail: 'Settle the pulse before adding speed.',
  },
  build: {
    title: 'Build the phrase',
    detail: 'Keep the work to two clean passes.',
  },
  payoff: {
    title: 'Boulevard of Broken Dreams',
    detail: 'Apply the session in your goal song.',
  },
} as OneKickHomeSession;

describe('MyWave', () => {
  it('shows the engine reason and starts its exact composed session', () => {
    const onStart = vi.fn();

    render(
      <MyWave
        session={session}
        onStart={onStart}
        onOpenJourney={vi.fn()}
        onOpenSongs={vi.fn()}
      />,
    );

    expect(screen.getByTestId('my-wave-reason')).toHaveTextContent(
      'Saved timing evidence makes this the current frontier.',
    );
    expect(screen.getByText('Boulevard of Broken Dreams')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('my-wave-start'));

    expect(onStart).toHaveBeenCalledWith(session);
  });

  it('keeps manual song and lesson choices available when no wave is ready', () => {
    const onOpenSongs = vi.fn();
    const onOpenJourney = vi.fn();

    render(
      <MyWave
        onStart={vi.fn()}
        onOpenJourney={onOpenJourney}
        onOpenSongs={onOpenSongs}
      />,
    );

    expect(screen.getByTestId('my-wave')).toHaveAttribute(
      'data-state',
      'empty',
    );

    fireEvent.click(screen.getByText('Browse songs'));
    fireEvent.click(screen.getByText('Open Journey'));

    expect(onOpenSongs).toHaveBeenCalledOnce();
    expect(onOpenJourney).toHaveBeenCalledOnce();
  });
});
