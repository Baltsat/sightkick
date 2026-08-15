import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EvidencePracticeCards } from './EvidencePracticeCards';

const cards = [
  {
    kind: 'review' as const,
    label: 'Review',
    options: [
      {
        id: 'review:one',
        kind: 'review' as const,
        candidate_id: 'lesson:one',
        title: 'Delayed pulse recall',
        speed: 0.7,
        source_label: 'Saved review queue · Eighth-note pulse',
        completion_label: 'One saved review run',
      },
      {
        id: 'review:two',
        kind: 'review' as const,
        candidate_id: 'lesson:two',
        title: 'Alternate pulse recall',
        speed: 0.65,
        source_label: 'Saved review queue · Eighth-note pulse',
        completion_label: 'One saved review run',
      },
    ],
  },
];

describe('EvidencePracticeCards', () => {
  it('starts only its evidence-backed candidate and swaps to the next valid option', () => {
    const onStart = vi.fn();

    render(<EvidencePracticeCards cards={cards} onStart={onStart} />);

    expect(screen.getByTestId('practice-card-review')).toHaveTextContent(
      'Saved review queue',
    );

    fireEvent.click(screen.getByTestId('practice-card-review-start'));
    expect(onStart).toHaveBeenCalledWith(cards[0].options[0]);

    fireEvent.click(screen.getByTestId('practice-card-review-swap'));
    expect(screen.getByTestId('practice-card-review')).toHaveTextContent(
      'Alternate pulse recall',
    );
  });

  it('leaves a card for later without erasing its evidence source', () => {
    render(<EvidencePracticeCards cards={cards} onStart={vi.fn()} />);

    fireEvent.click(screen.getByTestId('practice-card-review-later'));

    expect(screen.getByTestId('practice-card-review')).toHaveTextContent(
      'Left for later',
    );
    expect(screen.getByTestId('practice-card-review')).toHaveTextContent(
      'Saved review queue',
    );
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('shows the crash binding on the primary action when a kit is connected', () => {
    render(
      <EvidencePracticeCards cards={cards} onStart={vi.fn()} kitConnected />,
    );

    const start = screen.getByTestId('practice-card-review-start');
    const chip = screen.getByTestId('kit-action-chip-continue');

    expect(start).toContainElement(chip);
    expect(chip).toHaveAttribute('data-pad', 'crash');
    expect(chip).toHaveTextContent('Crash');
  });
});
