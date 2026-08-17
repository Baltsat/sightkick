import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STREAK_STAGES } from '../../services/streak';
import { StreakMeter } from './StreakMeter';
import { INITIAL_STREAK_UI_STATE, StreakUiState } from './useStreakEngine';

function uiWithCelebration(stageIndex: number): StreakUiState {
  return {
    ...INITIAL_STREAK_UI_STATE,
    announceSeq: 1,
    announceStage: STREAK_STAGES[stageIndex],
  };
}

describe('StreakMeter', () => {
  it('leaves notation unobstructed while no threshold celebration is active', () => {
    render(<StreakMeter ui={INITIAL_STREAK_UI_STATE} />);

    expect(screen.queryByTestId('streak-meter')).not.toBeInTheDocument();
  });

  it('shows a crossed threshold at the screen centre with no input surface', () => {
    const stage = STREAK_STAGES[2];

    render(<StreakMeter ui={uiWithCelebration(2)} />);

    expect(screen.getByTestId('streak-meter').className).toContain('fixed');
    expect(screen.getByTestId('streak-meter').className).toContain('inset-0');
    expect(screen.getByTestId('streak-meter').className).toContain(
      'pointer-events-none',
    );
    expect(screen.getByTestId('streak-stage-name')).toHaveTextContent(
      stage.name,
    );
    expect(screen.getByTestId('streak-proof')).toHaveTextContent(
      `${stage.threshold} clean 16ths · target window · 0.8×+`,
    );
  });

  it('uses the crossed tier for the visual treatment', () => {
    const stage = STREAK_STAGES[6];

    render(<StreakMeter ui={uiWithCelebration(6)} />);

    expect(screen.getByTestId('streak-meter-pill')).toHaveAttribute(
      'data-tier',
      String(stage.tier),
    );
    expect(screen.getByTestId('streak-particles')).toBeInTheDocument();
  });

  it('does not apply the announce animation class when animated is false', () => {
    render(<StreakMeter ui={uiWithCelebration(0)} animated={false} />);

    const classes = screen.getByTestId('streak-announce').className.split(' ');

    expect(classes).not.toContain('sk-streak-announce');
    expect(classes).toContain('sk-streak-announce-text');
  });
});
