import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AchievementDef } from '../../services/achievements';
import { AchievementToastQueue } from './AchievementToastQueue';

function badge(id: string, title: string): AchievementDef {
  return {
    id: id as AchievementDef['id'],
    title,
    description: `${title}!`,
    hint: 'hint',
    evidenceEvent: 'saved test evidence',
    proofRank: 1,
  };
}

describe('AchievementToastQueue', () => {
  it('renders nothing for an empty queue', () => {
    render(<AchievementToastQueue queue={[]} autoAdvanceMs={0} />);

    expect(screen.queryByTestId('achievement-toast')).not.toBeInTheDocument();
  });

  it('shows only the first achievement, not a wall of every unlock', () => {
    render(
      <AchievementToastQueue
        queue={[
          badge('first-blood', 'First Blood'),
          badge('century', 'Century'),
        ]}
        autoAdvanceMs={0}
      />,
    );

    expect(screen.getByTestId('achievement-toast')).toHaveTextContent(
      'First Blood',
    );
    expect(screen.queryByText('Century')).not.toBeInTheDocument();
  });

  it('advances to the next achievement on dismiss, then disappears', () => {
    render(
      <AchievementToastQueue
        queue={[
          badge('first-blood', 'First Blood'),
          badge('century', 'Century'),
        ]}
        autoAdvanceMs={0}
      />,
    );

    fireEvent.click(screen.getByTestId('achievement-toast-dismiss'));
    expect(screen.getByTestId('achievement-toast')).toHaveTextContent(
      'Century',
    );

    fireEvent.click(screen.getByTestId('achievement-toast-dismiss'));
    expect(screen.queryByTestId('achievement-toast')).not.toBeInTheDocument();
  });

  it('resets to the front when a new (fresh) queue arrives', () => {
    const { rerender } = render(
      <AchievementToastQueue
        queue={[
          badge('first-blood', 'First Blood'),
          badge('century', 'Century'),
        ]}
        autoAdvanceMs={0}
      />,
    );

    fireEvent.click(screen.getByTestId('achievement-toast-dismiss'));
    expect(screen.getByTestId('achievement-toast')).toHaveTextContent(
      'Century',
    );

    rerender(
      <AchievementToastQueue
        queue={[badge('perfect-10', 'Perfect 10')]}
        autoAdvanceMs={0}
      />,
    );

    expect(screen.getByTestId('achievement-toast')).toHaveTextContent(
      'Perfect 10',
    );
  });

  describe('auto-advance', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('advances on its own after the configured delay', () => {
      render(
        <AchievementToastQueue
          queue={[
            badge('first-blood', 'First Blood'),
            badge('century', 'Century'),
          ]}
          autoAdvanceMs={1000}
        />,
      );

      expect(screen.getByTestId('achievement-toast')).toHaveTextContent(
        'First Blood',
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId('achievement-toast')).toHaveTextContent(
        'Century',
      );
    });

    it('never auto-advances when autoAdvanceMs is 0', () => {
      render(
        <AchievementToastQueue
          queue={[
            badge('first-blood', 'First Blood'),
            badge('century', 'Century'),
          ]}
          autoAdvanceMs={0}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(60000);
      });

      expect(screen.getByTestId('achievement-toast')).toHaveTextContent(
        'First Blood',
      );
    });
  });
});
