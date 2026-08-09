import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTutorState } from '../../services/tutor';
import { TutorHud } from './TutorHud';

describe('TutorHud', () => {
  it('stays absent when the tutor is off', () => {
    render(
      <TutorHud
        state={createTutorState({ enabled: false })}
        message={{ title: 'Off', detail: 'Off', tone: 'steady' }}
      />,
    );

    expect(screen.queryByTestId('tutor-hud')).not.toBeInTheDocument();
  });

  it('shows distance-readable state, speed, and numeric lives', () => {
    render(
      <TutorHud
        state={{
          ...createTutorState(),
          currentSpeed: 0.8,
          livesRemaining: 2,
        }}
        message={{
          title: 'Tutor listening',
          detail: 'Play naturally.',
          tone: 'steady',
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveAccessibleName('Tutor listening');
    expect(screen.getByRole('status')).toHaveAccessibleDescription(
      'Play naturally.',
    );
    expect(screen.getByText('Adaptive tutor')).toBeInTheDocument();
    expect(screen.getByTestId('tutor-speed')).toHaveTextContent('0.8×');
    expect(screen.getByTestId('tutor-lives')).toHaveAccessibleName(
      '2 of 3 lives remaining',
    );
    expect(screen.getByTestId('tutor-lives')).toHaveTextContent('2/ 3');
  });

  it('makes recovery phase and clean-pass progress explicit', () => {
    const state = createTutorState();

    render(
      <TutorHud
        state={{
          ...state,
          phase: 'recovering',
          recovery: {
            id: 'recovery-1',
            trigger: {
              id: 'trigger-1',
              reason: 'three-distinct-errors',
              stats: {
                startMeasure: 1,
                endMeasure: 2,
                expected: 4,
                resolved: 4,
                hits: 1,
                misses: 3,
                wrong: 0,
                distinctErrorIds: ['a', 'b', 'c'],
                timingSampleCount: 1,
                timingSpreadMs: 0,
                timingOutlierCount: 0,
                wrongPadPairs: [],
                accuracy: 0.25,
                distinctMissIds: ['a', 'b', 'c'],
              },
            },
            region: {
              startMeasure: 0,
              endMeasure: 2,
              startTick: 0,
              endTick: 1920,
            },
            repetition: 1,
            cleanRepetitions: 1,
          },
        }}
        message={{
          title: 'Rewind to bar 1',
          detail: 'Play two clean passes, then continue.',
          tone: 'recovery',
        }}
      />,
    );

    expect(screen.getByText('Focused recovery')).toBeInTheDocument();
    expect(screen.getByTestId('tutor-repetition')).toHaveTextContent('1 / 2');
  });
});
