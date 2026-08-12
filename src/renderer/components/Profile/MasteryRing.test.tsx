import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MasteryRing } from './MasteryRing';

describe('MasteryRing', () => {
  it('renders the rounded percentage and an accessible label', () => {
    render(<MasteryRing mastery={67.4} />);

    expect(screen.getByTestId('mastery-ring')).toHaveAttribute(
      'aria-label',
      'Mastery 67 percent',
    );
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('clamps below 0 and above 100', () => {
    const { rerender } = render(<MasteryRing mastery={-10} />);

    expect(screen.getByText('0%')).toBeInTheDocument();

    rerender(<MasteryRing mastery={150} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
