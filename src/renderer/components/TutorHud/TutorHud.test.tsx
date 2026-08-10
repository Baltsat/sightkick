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

  it('keeps a mastered loop terminal state visible after the song resumes', () => {
    render(
      <TutorHud
        state={{
          ...createTutorState(),
          lastRecoveryOutcome: {
            recoveryId: 'recovery-1',
            status: 'mastered',
            startMeasure: 2,
            endMeasure: 4,
            cleanRepetitions: 2,
          },
        }}
        message={{
          title: 'Phrase locked',
          detail: 'Returning to the full song.',
          tone: 'success',
        }}
      />,
    );

    expect(screen.getByText('Mastered')).toBeInTheDocument();
    expect(screen.getByTestId('tutor-repetition')).toHaveTextContent('2 / 2');
  });

  it('shows a truthful checkpoint refill after a bounded recovery deferral', () => {
    render(
      <TutorHud
        state={{
          ...createTutorState(),
          livesRemaining: 3,
          lastRecoveryOutcome: {
            recoveryId: 'recovery-1',
            status: 'deferred',
            startMeasure: 2,
            endMeasure: 4,
            cleanRepetitions: 0,
          },
        }}
        message={{
          title: 'Phrase saved for focus work',
          detail: 'Checkpoint lives refilled to 3.',
          tone: 'warning',
        }}
      />,
    );

    expect(screen.getByText('Lives reset')).toBeInTheDocument();
    expect(screen.getByTestId('tutor-lives')).toHaveAccessibleName(
      '3 of 3 lives available after checkpoint reset',
    );
    expect(screen.getByTestId('tutor-lives')).toHaveTextContent('3/ 3');
  });

  it('labels inactivity pause and its resume instruction explicitly', () => {
    render(
      <TutorHud
        state={createTutorState()}
        displayState="inactivity-paused"
        message={{
          title: 'Paused — no hits detected',
          detail: 'Rewound to bar 8. Hit any pad to count in and resume.',
          tone: 'warning',
        }}
      />,
    );

    expect(screen.getByTestId('tutor-hud')).toHaveAttribute(
      'data-display-state',
      'inactivity-paused',
    );
    expect(screen.getByText('Paused — no hits')).toBeInTheDocument();
  });

  it('keeps finite Coach remediation visible even when adaptive tutor is off', () => {
    render(
      <TutorHud
        state={{
          ...createTutorState({ enabled: false }),
          currentSpeed: 0.8,
        }}
        displayState="remediation"
        remediation={{
          currentTask: 2,
          totalTasks: 3,
          cleanRepetitions: 1,
          requiredCleanRepetitions: 2,
        }}
        message={{
          title: 'Coach loop · bars 17–20',
          detail: '1/2 clean reps. Zero misses and zero wrong pads.',
          tone: 'success',
        }}
      />,
    );

    expect(screen.getByText('Coach remediation')).toBeInTheDocument();
    expect(screen.getByTestId('remediation-task')).toHaveTextContent('2 / 3');
    expect(screen.getByTestId('remediation-repetition')).toHaveTextContent(
      '1 / 2',
    );
    expect(screen.queryByTestId('tutor-lives')).not.toBeInTheDocument();
  });
});
