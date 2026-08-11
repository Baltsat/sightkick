import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AtomicSkillState } from '../../services/pedagogy';
import { AtomicSkillRadar } from './AtomicSkillRadar';

function state(
  skill_id: string,
  overrides: Partial<AtomicSkillState> = {},
): AtomicSkillState {
  return {
    skill_id,
    alpha: 4,
    beta: 1,
    effective_trials: 3,
    stage: 'provisional',
    evidence_boundary: 'midi',
    ...overrides,
  };
}

describe('AtomicSkillRadar', () => {
  it('uses real atomic nodes and keeps a complete text alternative beside the chart', () => {
    render(
      <AtomicSkillRadar
        states={[
          state('kit.tom_t2_t3'),
          state('pulse.eighth', { stage: 'retained' }),
        ]}
        focusSkillIds={['kit.tom_t2_t3', 'pulse.eighth']}
      />,
    );

    expect(screen.getByTestId('atomic-skill-radar')).toBeInTheDocument();
    expect(
      screen.getByTestId('atomic-skill-text-alternative'),
    ).toHaveTextContent('Mid-to-floor tom movement');
    expect(
      screen.getByTestId('atomic-skill-text-alternative'),
    ).toHaveTextContent('Eighth-note pulse');
    expect(screen.getByText('Provisional')).toBeInTheDocument();
    expect(screen.getByText('Retained')).toBeInTheDocument();
  });

  it('calls an unmeasured state unmeasured instead of presenting a neutral prior as ability', () => {
    render(<AtomicSkillRadar states={[]} focusSkillIds={['pulse.quarter']} />);

    expect(
      screen.getByTestId('atomic-skill-text-alternative'),
    ).toHaveTextContent('Not measured');
  });
});
