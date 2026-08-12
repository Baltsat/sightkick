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

  it('names the section, scaffold, and tested skill before an audition starts', () => {
    render(
      <PracticeReadinessCue
        phase="ready"
        audition={{
          song_id: 'song:favourite',
          start_bar: 5,
          end_bar: 8,
          speed: 0.7,
          section_label: 'Bars 5–8',
          test_label: 'Eighth-note pulse in this section',
          required_skill_id: 'pulse.eighth',
        }}
      />,
    );

    expect(screen.getByTestId('practice-readiness-cue')).toHaveTextContent(
      'Bars 5–8 audition · kick to count in',
    );
    expect(screen.getByTestId('practice-readiness-cue')).toHaveTextContent(
      'Tests Eighth-note pulse in this section at 0.7×',
    );
  });

  it('leaves the notation unblocked while playing', () => {
    render(<PracticeReadinessCue phase="playing" />);

    expect(
      screen.queryByTestId('practice-readiness-cue'),
    ).not.toBeInTheDocument();
  });
});
