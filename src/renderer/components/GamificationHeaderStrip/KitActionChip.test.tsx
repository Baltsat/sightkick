import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KitActionChip } from './KitActionChip';

describe('KitActionChip', () => {
  it.each([
    ['continue', 'crash', 'Crash'],
    ['retry', 'snare', 'Snare'],
    ['end', 'ride', 'Ride'],
    ['open-coach', 'hihat', 'Hi-hat'],
  ] as const)('uses the shared result binding for %s', (action, pad, label) => {
    render(<KitActionChip action={action} />);

    const chip = screen.getByTestId(`kit-action-chip-${action}`);

    expect(chip).toHaveAttribute('data-pad', pad);
    expect(chip).toHaveTextContent(label);
  });
});
