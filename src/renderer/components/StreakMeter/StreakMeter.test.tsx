import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StreakMeter } from './StreakMeter';
import { INITIAL_STREAK_UI_STATE, StreakUiState } from './useStreakEngine';
import { STREAK_STAGES } from '../../services/streak';

function uiWithStreak(overrides: Partial<StreakUiState> = {}): StreakUiState {
  return { ...INITIAL_STREAK_UI_STATE, ...overrides };
}

describe('StreakMeter', () => {
  it('renders nothing before the run has any activity', () => {
    render(<StreakMeter ui={INITIAL_STREAK_UI_STATE} />);

    expect(screen.queryByTestId('streak-meter')).not.toBeInTheDocument();
  });

  it('hides immediately when the current streak breaks, even when a best streak remains', () => {
    render(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: 0,
            best: 18,
            stage: STREAK_STAGES[1],
            countedNoteIds: new Set(),
          },
          shatterSeq: 1,
        })}
      />,
    );

    expect(screen.queryByTestId('streak-meter')).not.toBeInTheDocument();
  });

  it('shows the current count once the streak has started, even below the first stage', () => {
    render(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: 3,
            best: 3,
            stage: undefined,
            countedNoteIds: new Set(),
          },
        })}
      />,
    );

    expect(screen.getByTestId('streak-count')).toHaveTextContent('3');
    expect(screen.getByTestId('streak-meter-pill')).toHaveAttribute(
      'data-tier',
      '-1',
    );
    expect(screen.queryByTestId('streak-stage-name')).not.toBeInTheDocument();
  });

  it('shows the stage name and tier once a stage is reached', () => {
    const stage = STREAK_STAGES[2];

    render(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: stage.threshold,
            best: stage.threshold,
            stage,
            countedNoteIds: new Set(),
          },
        })}
      />,
    );

    expect(screen.getByTestId('streak-stage-name')).toHaveTextContent(
      stage.name,
    );
    expect(screen.getByTestId('streak-meter-pill')).toHaveAttribute(
      'data-tier',
      String(stage.tier),
    );
  });

  it('shows "best" only when it is ahead of the current count', () => {
    const { rerender } = render(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: 5,
            best: 12,
            stage: undefined,
            countedNoteIds: new Set(),
          },
        })}
      />,
    );

    expect(screen.getByTestId('streak-best')).toHaveTextContent('12');

    rerender(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: 12,
            best: 12,
            stage: undefined,
            countedNoteIds: new Set(),
          },
        })}
      />,
    );

    expect(screen.queryByTestId('streak-best')).not.toBeInTheDocument();
  });

  it('renders particles only from the particle tier threshold up', () => {
    const lowStage = STREAK_STAGES[1]; // tier 1 - below the particle threshold
    const highStage = STREAK_STAGES[6]; // tier 6 - above it
    const { rerender } = render(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: lowStage.threshold,
            best: lowStage.threshold,
            stage: lowStage,
            countedNoteIds: new Set(),
          },
        })}
      />,
    );

    expect(screen.queryByTestId('streak-particles')).not.toBeInTheDocument();

    rerender(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: highStage.threshold,
            best: highStage.threshold,
            stage: highStage,
            countedNoteIds: new Set(),
          },
        })}
      />,
    );

    expect(screen.getByTestId('streak-particles')).toBeInTheDocument();
  });

  it('shows the stage-up announce flash with the crossed stage name', () => {
    const stage = STREAK_STAGES[4];

    render(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: stage.threshold,
            best: stage.threshold,
            stage,
            countedNoteIds: new Set(),
          },
          announceSeq: 1,
          announceStage: stage,
        })}
      />,
    );

    expect(screen.getByTestId('streak-announce')).toHaveTextContent(stage.name);
  });

  it('applies the shatter class only when animated (default true)', () => {
    const ui = uiWithStreak({
      streak: {
        count: 1,
        best: 5,
        stage: undefined,
        countedNoteIds: new Set(),
      },
      shatterSeq: 1,
    });
    const { rerender } = render(<StreakMeter ui={ui} />);

    expect(screen.getByTestId('streak-meter-pill').className).toContain(
      'sk-streak-shatter',
    );

    rerender(<StreakMeter ui={ui} animated={false} />);

    expect(screen.getByTestId('streak-meter-pill').className).not.toContain(
      'sk-streak-shatter',
    );
    expect(screen.getByTestId('streak-meter-pill').className).not.toContain(
      'sk-streak-pulse',
    );
  });

  it('does not apply the announce animation class when animated is false', () => {
    const stage = STREAK_STAGES[0];

    render(
      <StreakMeter
        ui={uiWithStreak({
          streak: {
            count: stage.threshold,
            best: stage.threshold,
            stage,
            countedNoteIds: new Set(),
          },
          announceSeq: 1,
          announceStage: stage,
        })}
        animated={false}
      />,
    );

    const classes = screen.getByTestId('streak-announce').className.split(' ');

    // Exact token match - `sk-streak-announce-text` (the base, always-on
    // class) is a substring of `sk-streak-announce` and must stay present;
    // only the *animation* class `sk-streak-announce` itself is
    // conditional on `animated`.
    expect(classes).not.toContain('sk-streak-announce');
    expect(classes).toContain('sk-streak-announce-text');
  });
});
