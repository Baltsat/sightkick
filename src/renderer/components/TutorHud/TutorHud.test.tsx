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

  it('shows interpretable speed and lives', () => {
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

    expect(screen.getByTestId('tutor-hud')).toHaveTextContent('80%');
    expect(screen.getByTestId('tutor-lives')).toHaveAccessibleName(
      '2 lives remaining',
    );
  });
});
