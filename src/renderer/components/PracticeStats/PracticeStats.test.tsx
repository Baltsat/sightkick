import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PracticeStats } from './PracticeStats';
import { computeRunsTrend } from '../../services/practice-stats';
import {
  emptyRunFixture,
  multiLaneRunFixture,
  runHistoryFixture,
} from './test-fixtures';

describe('PracticeStats', () => {
  it('shows the honest empty state when there is no run yet', () => {
    render(<PracticeStats summary={undefined} />);

    expect(screen.getByTestId('practice-stats-empty')).toHaveTextContent(
      'Play a run to see your stats.',
    );
  });

  it('shows the honest empty state for a run with zero attempts', () => {
    render(<PracticeStats summary={emptyRunFixture()} />);

    expect(screen.getByTestId('practice-stats-empty')).toBeInTheDocument();
  });

  it('renders every stats section for a real run', () => {
    const summary = multiLaneRunFixture();
    const trend = computeRunsTrend(runHistoryFixture());

    render(<PracticeStats summary={summary} trend={trend} />);

    expect(screen.getByTestId('practice-stats')).toBeInTheDocument();
    expect(screen.getByTestId('lane-accuracy-bars')).toBeInTheDocument();
    expect(screen.getByTestId('bias-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('wrong-hit-table')).toBeInTheDocument();
    expect(screen.getByTestId('accuracy-sparkline')).toBeInTheDocument();
  });

  it('tags the mounted variant for styling hooks without changing content', () => {
    const summary = multiLaneRunFixture();

    render(<PracticeStats summary={summary} variant="inline" />);

    expect(screen.getByTestId('practice-stats')).toHaveAttribute(
      'data-variant',
      'inline',
    );
  });

  it('defaults to the panel variant', () => {
    render(<PracticeStats summary={multiLaneRunFixture()} />);

    expect(screen.getByTestId('practice-stats')).toHaveAttribute(
      'data-variant',
      'panel',
    );
  });
});
