import { fireEvent, render, screen } from '@testing-library/react';
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

  describe('the note-level "why" disclosure', () => {
    it('stays absent when the tutor has no judged evidence yet', () => {
      render(
        <TutorHud
          state={createTutorState()}
          displayState="kit-paused"
          message={{
            title: 'Paused',
            detail: 'Use the kit controls to continue.',
            tone: 'warning',
          }}
        />,
      );

      expect(screen.queryByTestId('tutor-mistake')).not.toBeInTheDocument();
    });

    it('never displaces the resume instruction, and stays collapsed until opened', () => {
      render(
        <TutorHud
          state={{
            ...createTutorState(),
            judgementsByMeasure: {
              3: [
                {
                  id: 'wrong:1',
                  verdict: 'wrong',
                  expectedElement: 'snare',
                  actualElement: 'ride',
                  measureIndex: 3,
                  scoreable: true,
                },
              ],
            },
          }}
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

      expect(caption).toHaveTextContent('Resume from the kit');

      const disclosure = screen.getByTestId('tutor-mistake');

      // Collapsed by default: the disclosure has no `open` attribute, so
      // native <details> chrome keeps its body hidden until the player
      // clicks — the compact summary line is all that's on screen.
      expect(disclosure).not.toHaveAttribute('open');
      expect(screen.getByTestId('tutor-mistake-summary')).toHaveTextContent(
        'Ride instead of Snare',
      );

      fireEvent.click(screen.getByTestId('tutor-mistake-summary'));

      expect(disclosure).toHaveAttribute('open');
      expect(
        screen.getByText('Bar 4 called for Snare; the strike landed on Ride.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Move to the Snare zone next time.'),
      ).toBeInTheDocument();
    });

    it('anchors a miss to the bar number, never a fabricated timing claim', () => {
      render(
        <TutorHud
          state={{
            ...createTutorState(),
            judgementsByMeasure: {
              7: [
                {
                  id: 'note:1:s',
                  verdict: 'miss',
                  expectedElement: 'kick',
                  measureIndex: 7,
                  scoreable: true,
                },
              ],
            },
          }}
          displayState="inactivity-paused"
          message={{
            title: 'Paused — no hits detected',
            detail: 'Hit any pad to resume.',
            tone: 'warning',
          }}
        />,
      );

      fireEvent.click(screen.getByTestId('tutor-mistake-summary'));

      expect(screen.getByTestId('tutor-mistake-summary')).toHaveTextContent(
        'Bar 8: Kick expected',
      );
      expect(
        screen.getByText('No hit landed in the window at Bar 8.'),
      ).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/\d+\s?ms/i);
    });

    it('skips a non-scoreable false hit so a warm-up tap never headlines', () => {
      render(
        <TutorHud
          state={{
            ...createTutorState(),
            judgementsByMeasure: {
              2: [
                {
                  id: 'wrong:2',
                  verdict: 'wrong',
                  actualElement: 'crash',
                  measureIndex: 2,
                  scoreable: false,
                },
              ],
            },
          }}
          displayState="kit-paused"
          message={{
            title: 'Paused',
            detail: 'Use the kit controls to continue.',
            tone: 'warning',
          }}
        />,
      );

      expect(screen.queryByTestId('tutor-mistake')).not.toBeInTheDocument();
    });
  });
});
