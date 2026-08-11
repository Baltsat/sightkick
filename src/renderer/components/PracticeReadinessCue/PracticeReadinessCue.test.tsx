import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PracticeReadinessCue } from './PracticeReadinessCue';

describe('PracticeReadinessCue', () => {
  it('keeps the idle score soft while the practice surface is loading', () => {
    render(<PracticeReadinessCue phase="idle" />);

    expect(screen.getByTestId('practice-readiness-cue')).toHaveAttribute(
      'data-phase',
      'idle',
    );
    expect(
      screen.getByText('Your score is getting ready.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Hit the kick pad once to start the count-in'),
    ).not.toBeInTheDocument();
  });

  it('shows the one-kick infographic only when ready to play', () => {
    render(<PracticeReadinessCue phase="ready" />);

    expect(screen.getByTestId('practice-readiness-cue')).toHaveAttribute(
      'data-phase',
      'ready',
    );
    expect(screen.getByText('One kick starts the groove.')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Hit the kick pad once to start the count-in'),
    ).toBeInTheDocument();
  });

  it('leaves the notation unblocked while playing', () => {
    render(<PracticeReadinessCue phase="playing" />);

    expect(
      screen.queryByTestId('practice-readiness-cue'),
    ).not.toBeInTheDocument();
  });
});
