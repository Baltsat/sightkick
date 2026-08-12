import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoachFinding } from '../../services/coach';
import { CoachCard } from './CoachCard';

function padFinding(
  actualElement: 'snare' | 'tom1' | 'tom2' | 'tom3',
  expectedElement: 'tom1' | 'tom2' | 'tom3',
): CoachFinding {
  return {
    id: `${actualElement}-${expectedElement}`,
    kind: 'pad-confusion',
    severity: 'medium',
    title: `${actualElement} is replacing ${expectedElement}`,
    summary: 'Two unambiguous wrong-pad pairs.',
    skillTag: 'pad-accuracy',
    evidence: {
      actualElement,
      expectedElement,
      sampleCount: 2,
      matchedWrongPadPairs: 2,
    },
  };
}

describe('CoachCard pad remediation', () => {
  it('routes T2 to T3 evidence to the matching curriculum exercise', () => {
    const onTrainSkill = vi.fn();

    render(
      <CoachCard
        finding={padFinding('tom2', 'tom3')}
        measures={[]}
        records={[]}
        onPracticeBars={vi.fn()}
        onTrainSkill={onTrainSkill}
      />,
    );

    fireEvent.click(screen.getByTestId('coach-train-skill'));

    expect(onTrainSkill).toHaveBeenCalledWith('07.03');
    expect(screen.getByText(/Mid and Floor Tom Signals/)).toBeInTheDocument();
  });

  it('shows an honest unsupported-route state instead of assigning 07.02', () => {
    render(
      <CoachCard
        finding={padFinding('snare', 'tom1')}
        measures={[]}
        records={[]}
        onPracticeBars={vi.fn()}
        onTrainSkill={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('coach-train-skill')).not.toBeInTheDocument();
    expect(screen.getByTestId('coach-unsupported-route')).toHaveTextContent(
      'No supported targeted route exists for snare → tom1',
    );
  });
});
