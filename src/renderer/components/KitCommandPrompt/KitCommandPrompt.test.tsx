import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KitCommandPrompt } from './KitCommandPrompt';

describe('KitCommandPrompt', () => {
  it('shows and names a full hands-free sequence', () => {
    render(
      <KitCommandPrompt
        model={{
          label: 'Resume from the kit',
          steps: ['kick', 'crash', 'kick', 'crash'],
        }}
      />,
    );

    expect(screen.getByTestId('kit-command-prompt')).toHaveAccessibleName(
      'Resume from the kit: Kick, then Crash, then Kick, then Crash',
    );
    expect(screen.getAllByText('Kick')).toHaveLength(2);
    expect(screen.getAllByText('Crash')).toHaveLength(2);
  });

  it('describes directional pads as alternatives rather than a sequence', () => {
    render(
      <KitCommandPrompt
        model={{
          label: 'Move',
          steps: ['tom1', 'tom2'],
          relationship: 'alternatives',
          stepHints: ['Previous', 'Next'],
        }}
      />,
    );

    expect(screen.getByTestId('kit-command-prompt')).toHaveAccessibleName(
      'Move: Tom 1 for previous, or Tom 2 for next',
    );
    expect(screen.getByText('or')).toBeVisible();
    expect(screen.getByText('Previous')).toBeVisible();
    expect(screen.getByText('Next')).toBeVisible();
  });
});
