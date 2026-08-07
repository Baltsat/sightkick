import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WrongHitTable } from './WrongHitTable';
import { multiLaneRunFixture, singleLaneRunFixture } from './test-fixtures';

describe('WrongHitTable', () => {
  it('lists wrong-hit lanes sorted by count, most first', () => {
    const { wrongHitCounts } = multiLaneRunFixture();

    render(<WrongHitTable wrongHitCounts={wrongHitCounts} />);

    const rows = screen.getAllByRole('row').slice(1); // drop header row

    expect(rows.map((row) => row.textContent)).toEqual(['Hi-Hat2', 'Kick1']);
  });

  it('shows an honest empty state when there were no wrong hits', () => {
    const { wrongHitCounts } = singleLaneRunFixture();

    render(<WrongHitTable wrongHitCounts={wrongHitCounts} />);

    expect(screen.getByTestId('wrong-hit-table-empty')).toHaveTextContent(
      'No wrong hits this run.',
    );
  });
});
