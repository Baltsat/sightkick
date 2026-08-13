import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTutorState } from '../../services/tutor';
import { TutorHud } from './TutorHud';

describe('TutorHud', () => {
  it('stays absent when there is no active teaching state', () => {
    render(
      <TutorHud
        state={createTutorState({ enabled: false })}
        message={{ title: 'Off', detail: 'Off', tone: 'steady' }}
      />,
    );

    expect(screen.queryByTestId('tutor-hud')).not.toBeInTheDocument();
  });

  it('uses the shared edge-caption contract for an active correction', () => {
    render(
      <TutorHud
        state={createTutorState()}
        message={{
          title: 'Keep the kick even',
          detail: 'Repeat the phrase once at this speed.',
          tone: 'recovery',
        }}
      />,
    );

    const caption = screen.getByTestId('tutor-hud');

    expect(caption).toHaveAttribute('data-edge-caption', 'tutor');
    expect(caption).toHaveAttribute('data-tone', 'recovery');
    expect(caption).toHaveAccessibleName('Keep the kick even');
    expect(caption).toHaveAccessibleDescription(
      'Repeat the phrase once at this speed.',
    );
  });

  it('keeps a paused kit action in the same caption slot', () => {
    render(
      <TutorHud
        state={createTutorState()}
        displayState="kit-paused"
        controlPrompt={{
          label: 'Resume from the kit',
          steps: ['kick', 'crash', 'kick', 'crash'],
        }}
        message={{
          title: 'Paused',
          detail: 'Use the kit controls to continue.',
          tone: 'warning',
        }}
      />,
    );

    const caption = screen.getByTestId('tutor-hud');

    expect(caption).toHaveTextContent('Paused');
    expect(caption).toHaveTextContent('Resume from the kit');
    expect(caption).toHaveAttribute('data-display-state', 'kit-paused');
  });

  it('keeps Loop Escape recovery local to the caption rail', () => {
    render(
      <TutorHud
        state={createTutorState({ enabled: false })}
        message={{
          title: 'Unused recovery card',
          detail: 'The runway owns this state.',
          tone: 'recovery',
        }}
        recoveryCaption={{
          title: 'Near-clean quality retained',
          detail: '1.0 of 2 passes remains banked.',
        }}
      />,
    );

    const caption = screen.getByTestId('tutor-recovery-caption');

    expect(caption).toHaveAttribute('data-edge-caption', 'tutor');
    expect(caption).toHaveAccessibleName('Near-clean quality retained');
    expect(caption).toHaveAccessibleDescription(
      '1.0 of 2 passes remains banked.',
    );
  });

  it('uses earned green for a completed phrase', () => {
    render(
      <TutorHud
        state={{ ...createTutorState(), phase: 'complete' }}
        message={{
          title: 'Phrase settled',
          detail: 'Return to the song when ready.',
          tone: 'success',
        }}
      />,
    );

    expect(screen.getByTestId('tutor-hud')).toHaveAttribute(
      'data-tone',
      'earned',
    );
  });
});
