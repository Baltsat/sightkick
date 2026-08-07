import { render, screen, within } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { Song } from '../../../types';
import { multiLaneRunFixture } from '../PracticeStats/test-fixtures';
import { ScoreSummary } from './ScoreSummary';

const songData = {
  name: 'Master of Puppets',
  artist: 'Metallica',
} as Song;

function renderSummary(
  props: Partial<Parameters<typeof ScoreSummary>[0]> = {},
) {
  render(
    <AntdApp>
      <ScoreSummary
        isOpen
        onRetry={vi.fn()}
        onNextSong={vi.fn()}
        songData={songData}
        difficulty="expert"
        {...props}
      />
    </AntdApp>,
  );

  const modalEl = screen.getByTestId('score-modal');

  return { modalEl, modal: within(modalEl) };
}

describe('ScoreSummary', () => {
  it('renders the star/accuracy chrome and the note-count grid for a Perform run', () => {
    // calculateAccuracy is hitNotes / (totalNotes + falseHits) - 70/105
    // rounds to 67%, not the naive hitNotes/totalNotes 70%.
    const { modal } = renderSummary({
      scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
    });

    expect(modal.getByText('67% accuracy')).toBeInTheDocument();
    expect(modal.getByText('70 notes hit')).toBeInTheDocument();
    expect(modal.getByText('30 notes missed')).toBeInTheDocument();
    expect(modal.getByText('5 false hits')).toBeInTheDocument();
  });

  it('celebrates a flawless Perform run with Perfect and five stars', () => {
    const { modal, modalEl } = renderSummary({
      scoreData: { hitNotes: 100, totalNotes: 100, falseHits: 0 },
    });

    expect(modal.getByText('Perfect')).toBeInTheDocument();
    expect(modalEl.querySelectorAll('[data-filled]')).toHaveLength(5);
  });

  it('renders real practice stats for a Perform run that also carries a practice summary', () => {
    const summary = multiLaneRunFixture();
    const { modal } = renderSummary({
      scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
      practiceSummary: summary,
    });

    expect(modal.getByTestId('practice-stats')).toBeInTheDocument();
    expect(modal.getByTestId('lane-accuracy-bars')).toBeInTheDocument();
  });

  it('drops the star/accuracy chrome for a Practice run (no scoreData) and shows the practice stats instead', () => {
    const summary: ReturnType<typeof multiLaneRunFixture> = {
      ...multiLaneRunFixture(),
      mode: 'practice',
      playbackSpeed: 0.7,
    };
    const { modal } = renderSummary({
      scoreData: undefined,
      practiceSummary: summary,
    });

    expect(screen.queryByText(/accuracy$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Perfect')).not.toBeInTheDocument();
    expect(modal.getByText('Nice reps')).toBeInTheDocument();
    expect(modal.getByTestId('practice-stats')).toBeInTheDocument();
    expect(modal.getByTestId('practice-run-mode')).toHaveTextContent(
      'Practice run at 0.7x',
    );
  });

  it('omits the run-mode label for a Practice run at the default 1x speed', () => {
    const summary: ReturnType<typeof multiLaneRunFixture> = {
      ...multiLaneRunFixture(),
      mode: 'practice',
      playbackSpeed: 1,
    };
    const { modal } = renderSummary({
      scoreData: undefined,
      practiceSummary: summary,
    });

    expect(modal.getByTestId('practice-run-mode')).toHaveTextContent(
      'Practice run',
    );
    expect(modal.getByTestId('practice-run-mode')).not.toHaveTextContent('x');
  });

  it('shows the honest empty practice-stats state when the run had no attempts', () => {
    const { modal } = renderSummary({
      scoreData: { hitNotes: 0, totalNotes: 8, falseHits: 0 },
    });

    expect(modal.getByTestId('practice-stats-empty')).toBeInTheDocument();
  });
});
