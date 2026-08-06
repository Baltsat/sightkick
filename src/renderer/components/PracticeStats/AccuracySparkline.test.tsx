import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccuracySparkline, sparklineCoords } from './AccuracySparkline';
import { computeRunsTrend, RunTrendPoint } from '../../services/practice-stats';
import { runHistoryFixture } from './test-fixtures';

function point(accuracy: number): RunTrendPoint {
  return { completedAt: '2026-01-01', accuracy, biasMeanMs: 0 };
}

describe('sparklineCoords', () => {
  it('maps 0 and 1 accuracy to the bottom and top of the viewbox', () => {
    const coords = sparklineCoords([point(0), point(1)], 100, 40);

    expect(coords[0].y).toBe(37); // height - PADDING
    expect(coords[1].y).toBe(3); // PADDING
    expect(coords[0].x).toBe(0);
    expect(coords[1].x).toBe(100);
  });

  it('centers a single point horizontally', () => {
    const coords = sparklineCoords([point(0.5)], 100, 40);

    expect(coords).toHaveLength(1);
    expect(coords[0].x).toBe(50);
  });

  it('returns no coordinates for an empty trend', () => {
    expect(sparklineCoords([], 100, 40)).toEqual([]);
  });
});

describe('AccuracySparkline', () => {
  it('shows an honest empty state with no run history', () => {
    render(<AccuracySparkline trend={[]} />);

    expect(screen.getByTestId('accuracy-sparkline-empty')).toHaveTextContent(
      'Play a few runs to see your trend.',
    );
  });

  it('renders a polyline with one point per run, capped to the last 10', () => {
    const trend = computeRunsTrend(runHistoryFixture(), 10);

    render(<AccuracySparkline trend={trend} />);

    const svg = screen.getByTestId('accuracy-sparkline');
    const polyline = svg.querySelector('polyline');

    expect(trend).toHaveLength(10);
    expect(polyline?.getAttribute('points')?.trim().split(' ')).toHaveLength(
      10,
    );
  });
});
