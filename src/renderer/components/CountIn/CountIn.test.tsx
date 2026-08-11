import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountIn } from './CountIn';

describe('CountIn', () => {
  it('keeps the full count visible while naming the active beat', () => {
    render(<CountIn count={2} total={4} beatMs={500} animated={false} />);

    const overlay = screen.getByTestId('count-in');

    expect(overlay).toHaveAccessibleName('Count in 2 of 4');
    expect(screen.getByText('Count in')).toBeInTheDocument();
    expect(
      [...overlay.querySelectorAll('.drumroll-count-in__beat')].map((beat) =>
        beat.getAttribute('data-state'),
      ),
    ).toEqual(['passed', 'active', 'next', 'next']);
    expect(overlay).toHaveStyle({ '--count-in-progress': '0.5' });
  });

  it('respects compound-meter count-ins instead of hard-coding four', () => {
    render(<CountIn count={2} total={2} beatMs={750} animated={false} />);

    expect(screen.getByTestId('count-in')).toHaveAccessibleName(
      'Count in 2 of 2',
    );
    expect(screen.getByText('Count in')).toBeInTheDocument();
    expect(
      screen
        .getByTestId('count-in')
        .querySelectorAll('.drumroll-count-in__beat'),
    ).toHaveLength(2);
  });

  it('stays absent outside an active count-in', () => {
    render(<CountIn count={undefined} total={4} beatMs={500} />);

    expect(screen.queryByTestId('count-in')).not.toBeInTheDocument();
  });
});
