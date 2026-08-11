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
    expect(screen.getByText('Score preparing')).toBeInTheDocument();
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
    expect(screen.getByText('Kick to count in')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Hit the kick pad once to start the count-in'),
    ).toBeInTheDocument();
  });

  it('keeps an interrupted attempt in the same one-kick cue', () => {
    render(<PracticeReadinessCue phase="ready" resumeMeasure={3} />);

    expect(screen.getByTestId('practice-readiness-cue')).toHaveTextContent(
      'Resume bar 4 · kick to count in',
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('leaves the notation unblocked while playing', () => {
    render(<PracticeReadinessCue phase="playing" />);

    expect(
      screen.queryByTestId('practice-readiness-cue'),
    ).not.toBeInTheDocument();
  });
});
