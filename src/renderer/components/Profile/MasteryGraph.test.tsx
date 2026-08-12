import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MasteryTimelinePoint,
  MasteryTrendProjection,
} from '../../services/mastery';
import { buildChartData, MasteryGraph } from './MasteryGraph';

function point(
  overrides: Partial<MasteryTimelinePoint> = {},
): MasteryTimelinePoint {
  return {
    completedAt: '2026-01-01T00:00:00.000Z',
    mastery: 40,
    accuracy: 50,
    speedFactor: 0.5,
    runIndex: 0,
    ...overrides,
  };
}

describe('buildChartData', () => {
  it('is empty with no timeline points', () => {
    expect(buildChartData([], undefined)).toEqual([]);
  });

  it('maps each point through, scaling speedFactor to 0..100', () => {
    const data = buildChartData([point({ speedFactor: 0.75 })], undefined);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      mastery: 40,
      accuracy: 50,
      speedFactor: 75,
    });
    expect(data[0].projected).toBeUndefined();
  });

  it('appends a projected point and seeds the last real point when a trend projects forward', () => {
    const timeline = [
      point({ completedAt: '2026-01-01T00:00:00.000Z', mastery: 40 }),
      point({ completedAt: '2026-01-02T00:00:00.000Z', mastery: 60 }),
    ];
    const trend: MasteryTrendProjection = {
      slopePerDay: 20,
      projectedMasteryDate: '2026-01-04',
    };
    const data = buildChartData(timeline, trend);

    expect(data).toHaveLength(3);
    expect(data[1].projected).toBe(60);
    expect(data[2].projected).toBe(100);
    expect(data[2].mastery).toBeUndefined();
  });

  it('does not append a projected point when the trend has no projected date', () => {
    const timeline = [point()];
    const trend: MasteryTrendProjection = {
      slopePerDay: 0,
      projectedMasteryDate: null,
    };

    expect(buildChartData(timeline, trend)).toHaveLength(1);
  });
});

describe('MasteryGraph', () => {
  it('renders an empty state with no timeline data', () => {
    render(<MasteryGraph timeline={[]} />);

    expect(screen.getByTestId('mastery-graph-empty')).toBeInTheDocument();
  });

  it('renders the chart container when there is timeline data', () => {
    render(
      <MasteryGraph
        timeline={[point(), point({ runIndex: 1, mastery: 55 })]}
      />,
    );

    expect(screen.getByTestId('mastery-graph')).toBeInTheDocument();
  });
});
