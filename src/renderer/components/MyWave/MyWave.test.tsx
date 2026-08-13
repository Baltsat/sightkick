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
    candidateId: 'lesson:01.01',
  },
  build: {
    title: 'Build the phrase',
    detail: 'Keep the work to two clean passes.',
    candidateId: 'lesson:01.01',
  },
  payoff: {
    title: 'Boulevard of Broken Dreams',
    detail: 'Apply the session in your goal song.',
    candidateId: 'song:boulevard',
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

  it('never claims a dead-end payoff as an equal, numbered step', () => {
    const noPayoff = {
      ...session,
      payoff: {
        title: 'No musical payoff yet',
        detail: 'No playable favourite-song section is currently ranked.',
        // No candidateId — home-session.ts's payoffReceipt only omits this
        // on its final, honest "nothing ranked" fallback.
      },
    } as OneKickHomeSession;

    render(
      <MyWave
        session={noPayoff}
        onStart={vi.fn()}
        onOpenJourney={vi.fn()}
        onOpenSongs={vi.fn()}
      />,
    );

    const payoffItem = screen.getByText('No musical payoff yet').closest('li');

    expect(payoffItem).toHaveAttribute('data-placeholder', 'true');
    expect(payoffItem).toHaveTextContent('—');

    // The real, ranked focus step next to it keeps its numbered treatment.
    const focusItem = screen
      .getByText('Settle the pulse before adding speed.')
      .closest('li');

    expect(focusItem).not.toHaveAttribute('data-placeholder');
    expect(focusItem).toHaveTextContent('01');
  });

  it('says so honestly when the recommendation confidence is low', () => {
    const thin = {
      ...session,
      launch: {
        ...session.launch,
        confidence: {
          value: 0.2,
          level: 'low',
          evidenceRuns: 1,
          detail: '1 item-specific run plus 3 library runs.',
        },
      },
    } as OneKickHomeSession;

    render(
      <MyWave
        session={thin}
        onStart={vi.fn()}
        onOpenJourney={vi.fn()}
        onOpenSongs={vi.fn()}
      />,
    );

    expect(screen.getByTestId('my-wave-thin-evidence')).toHaveTextContent(
      '1 item-specific run plus 3 library runs.',
    );
  });

  it('stays quiet about evidence honesty when confidence is not low', () => {
    const confident = {
      ...session,
      launch: {
        ...session.launch,
        confidence: {
          value: 0.9,
          level: 'high',
          evidenceRuns: 12,
          detail: '12 item-specific runs plus 40 library runs.',
        },
        factors: [
          {
            key: 'zone-fit',
            label: 'Zone fit',
            value: 1,
            weight: 1,
            contribution: 40,
            detail: '',
          },
        ],
      },
    } as OneKickHomeSession;

    render(
      <MyWave
        session={confident}
        onStart={vi.fn()}
        onOpenJourney={vi.fn()}
        onOpenSongs={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId('my-wave-thin-evidence'),
    ).not.toBeInTheDocument();
  });

  it('says so honestly when no scoring factor actually contributed, even at nominal confidence', () => {
    const generic = {
      ...session,
      launch: {
        ...session.launch,
        confidence: {
          value: 0.55,
          level: 'medium',
          evidenceRuns: 4,
          detail: '4 item-specific runs plus 10 library runs.',
        },
        factors: [
          {
            key: 'fatigue',
            label: 'Fatigue',
            value: 0,
            weight: 0.1,
            contribution: 0,
            detail: '',
          },
        ],
      },
    } as unknown as OneKickHomeSession;

    render(
      <MyWave
        session={generic}
        onStart={vi.fn()}
        onOpenJourney={vi.fn()}
        onOpenSongs={vi.fn()}
      />,
    );

    expect(screen.getByTestId('my-wave-thin-evidence')).toHaveTextContent(
      '4 item-specific runs plus 10 library runs.',
    );
  });

  it('names the deliberate slower starting speed instead of a bare number', () => {
    const scaffolded = {
      ...session,
      launch: {
        ...session.launch,
        decisionReceipt: {
          scaffold: { speed: 0.6, steps: ['slower_tempo'] },
        },
      },
    } as unknown as OneKickHomeSession;

    render(
      <MyWave
        session={scaffolded}
        onStart={vi.fn()}
        onOpenJourney={vi.fn()}
        onOpenSongs={vi.fn()}
      />,
    );

    expect(screen.getByText(/starts slower on purpose/)).toBeInTheDocument();
  });
});
