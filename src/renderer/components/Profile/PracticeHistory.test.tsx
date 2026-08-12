import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LongitudinalProgress } from '../../services/practice-stats';
import {
  buildPracticeHistoryChartData,
  PracticeHistory,
} from './PracticeHistory';

function progress(
  overrides: Partial<LongitudinalProgress> = {},
): LongitudinalProgress {
  return {
    allTime: {
      runCount: 7,
      scoredNoteCount: 1200,
      wrongHitCount: 9,
      accuracy: 0.875,
      meanTimingMs: -6.2,
      timingSampleCount: 900,
    },
    months: [
      {
        month: '2026-07',
        runCount: 3,
        scoredNoteCount: 500,
        wrongHitCount: 5,
        accuracy: 0.8,
        meanTimingMs: -10,
        timingSampleCount: 360,
      },
      {
        month: '2026-08',
        runCount: 4,
        scoredNoteCount: 700,
        wrongHitCount: 4,
        accuracy: 0.93,
        meanTimingMs: 2,
        timingSampleCount: 540,
      },
    ],
    archivedRunCount: 2,
    recentRunCount: 5,
    aggregateOnlyArchivedRunCount: 2,
    unknownDateRunCount: 0,
    omittedActiveMonthCount: 0,
    firstEvidenceDate: '2026-07-02',
    lastEvidenceDate: '2026-08-08',
    ...overrides,
  };
}

describe('PracticeHistory', () => {
  it('shows interpretable all-history totals and the aggregate-only warning', () => {
    render(<PracticeHistory progress={progress()} />);

    const section = screen.getByTestId('profile-practice-history');

    expect(section).toHaveTextContent('7');
    expect(section).toHaveTextContent('1,200');
    expect(section).toHaveTextContent('88%');
    expect(section).toHaveTextContent('6 ms early');
    expect(
      screen.getByTestId('historical-detail-unavailable'),
    ).toHaveTextContent(
      'exact bar and skill diagnosis was not retained for 2 archived runs',
    );
    expect(
      screen.getByTestId('profile-practice-history-definition'),
    ).toHaveTextContent(
      'adds the evicted archive and currently retained recent summaries once each',
    );
  });

  it('provides a readable monthly table in addition to the chart', () => {
    render(<PracticeHistory progress={progress()} />);

    fireEvent.click(screen.getByText('Monthly progress table'));

    expect(screen.getByRole('table')).toHaveTextContent('Jul 26');
    expect(screen.getByRole('table')).toHaveTextContent('Aug 26');
    expect(
      screen.getByRole('columnheader', { name: 'Accuracy' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /monthly practice runs/i }),
    ).toBeInTheDocument();
  });

  it('renders honest loading and empty states', () => {
    const view = render(<PracticeHistory progress={undefined} />);

    expect(
      screen.getByTestId('profile-practice-history-loading'),
    ).toHaveTextContent('Loading your saved practice…');

    view.rerender(
      <PracticeHistory
        progress={progress({
          allTime: {
            runCount: 0,
            scoredNoteCount: 0,
            wrongHitCount: 0,
            timingSampleCount: 0,
          },
          months: [],
          archivedRunCount: 0,
          recentRunCount: 0,
          aggregateOnlyArchivedRunCount: 0,
        })}
      />,
    );

    expect(
      screen.getByTestId('profile-practice-history-empty'),
    ).toHaveTextContent('Finish a practice run');
  });
});

describe('buildPracticeHistoryChartData', () => {
  it('maps accuracy to a percentage without inventing missing evidence', () => {
    const data = buildPracticeHistoryChartData([
      progress().months[0],
      { ...progress().months[1], accuracy: undefined },
    ]);

    expect(data[0]).toMatchObject({ runs: 3, accuracy: 80 });
    expect(data[1].accuracy).toBeUndefined();
  });
});
