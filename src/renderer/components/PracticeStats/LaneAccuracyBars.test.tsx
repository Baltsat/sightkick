import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LaneAccuracyBars } from './LaneAccuracyBars';
import { multiLaneRunFixture, singleLaneRunFixture } from './test-fixtures';

describe('LaneAccuracyBars', () => {
  it('renders only measured lanes as large named bars', () => {
    const { laneAccuracy } = multiLaneRunFixture();

    render(<LaneAccuracyBars laneAccuracy={laneAccuracy} />);

    expect(screen.getByTestId('lane-row-kick')).toHaveTextContent('Kick75%');
    expect(screen.getByTestId('lane-row-snare')).toHaveTextContent('Snare100%');
    expect(screen.getByTestId('lane-row-hihat')).toHaveTextContent(
      'Hi-Hat100%',
    );
    expect(screen.queryByTestId('lane-row-crash')).not.toBeInTheDocument();
    expect(screen.getByTestId('lane-accuracy-evidence')).toHaveTextContent(
      '8 matched notes',
    );
  });

  it('renders only the struck lane with real data for a single-lane song', () => {
    const { laneAccuracy } = singleLaneRunFixture();

    render(<LaneAccuracyBars laneAccuracy={laneAccuracy} />);

    expect(screen.getByTestId('lane-row-kick')).toHaveTextContent('Kick75%');
    expect(screen.queryByTestId('lane-row-snare')).not.toBeInTheDocument();
  });

  it('shows one honest empty line instead of eight untouched lanes', () => {
    render(<LaneAccuracyBars laneAccuracy={[]} />);

    expect(screen.getByTestId('lane-accuracy-empty')).toHaveTextContent(
      'No matched notes by pad',
    );
  });
});
