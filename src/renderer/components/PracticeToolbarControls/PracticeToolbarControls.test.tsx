import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PracticeToolbarControls,
  tutorRunSettings,
} from './PracticeToolbarControls';

function renderControls(overrides = {}) {
  const props = {
    playbackSpeed: 1,
    onPlaybackSpeedChange: vi.fn(),
    notationLayout: 'flow' as const,
    onNotationLayoutChange: vi.fn(),
    difficulty: 'medium' as const,
    availableDifficulties: ['easy', 'medium', 'hard', 'expert'] as const,
    onDifficultyChange: vi.fn(),
    tutorEnabled: true,
    onTutorEnabledChange: vi.fn(),
    ...overrides,
  };

  render(<PracticeToolbarControls {...props} />);

  return props;
}

describe('PracticeToolbarControls', () => {
  it('uses discrete speed stops with a keyboard-accessible range', () => {
    const props = renderControls();
    const slider = screen.getByRole('slider', { name: 'Playback speed' });

    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '17');
    expect(slider).toHaveValue('7');

    fireEvent.change(slider, { target: { value: '4' } });

    expect(props.onPlaybackSpeedChange).toHaveBeenCalledWith(0.7);
  });

  it('keeps layout as one visible two-state control', () => {
    const props = renderControls();

    expect(screen.getByTestId('notation-flow-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByTestId('notation-classic-toggle'));

    expect(props.onNotationLayoutChange).toHaveBeenCalledWith('classic');
  });

  it('uses the charted difficulty stops and gives Expert its own tier', () => {
    const props = renderControls({ difficulty: 'expert' as const });
    const slider = screen.getByRole('slider', { name: 'Difficulty' });

    expect(slider).toHaveAttribute('max', '3');
    expect(document.querySelector('[data-tier="expert"]')).toHaveAttribute(
      'data-tier',
      'expert',
    );
    fireEvent.change(slider, { target: { value: '2' } });

    expect(props.onDifficultyChange).toHaveBeenCalledWith('hard');
  });

  it('maps tutor off to the settings that stop adaptive teaching', () => {
    expect(tutorRunSettings(false, true)).toEqual({
      adaptiveTimingEnabled: false,
      autoRewind: false,
      recursiveDrillingEnabled: false,
    });

    const props = renderControls();

    fireEvent.click(screen.getByTestId('practice-tutor-toggle'));

    expect(props.onTutorEnabledChange).toHaveBeenCalledWith(false);
  });
});
