import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LaneAccuracyBars } from './LaneAccuracyBars';
import { multiLaneRunFixture, singleLaneRunFixture } from './test-fixtures';

describe('LaneAccuracyBars', () => {
  it('renders a row for every kit lane, with data for the ones struck', () => {
    const { laneAccuracy } = multiLaneRunFixture();

    render(<LaneAccuracyBars laneAccuracy={laneAccuracy} />);

    // kick: 3 hits, 1 miss -> 75%
    expect(screen.getByTestId('lane-row-kick')).toHaveTextContent('75% (4)');
    // snare: 3 hits, 0 misses -> 100%
    expect(screen.getByTestId('lane-row-snare')).toHaveTextContent('100% (3)');
    // hihat: 1 hit, 0 misses (wrong hits don't count here) -> 100%
    expect(screen.getByTestId('lane-row-hihat')).toHaveTextContent('100% (1)');
    // a lane never struck this run shows the honest empty state
    expect(screen.getByTestId('lane-row-crash')).toHaveTextContent(
      'No hits yet',
    );
  });

  it('renders only the struck lane with real data for a single-lane song', () => {
    const { laneAccuracy } = singleLaneRunFixture();

    render(<LaneAccuracyBars laneAccuracy={laneAccuracy} />);

    // kick: 3 hits, 1 miss -> 75%
    expect(screen.getByTestId('lane-row-kick')).toHaveTextContent('75% (4)');
    expect(screen.getByTestId('lane-row-snare')).toHaveTextContent(
      'No hits yet',
    );
  });

  it('shows every lane as untouched for an empty run', () => {
    render(<LaneAccuracyBars laneAccuracy={[]} />);

    expect(screen.getAllByText('No hits yet')).toHaveLength(8);
  });
});
