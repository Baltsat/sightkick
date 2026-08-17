import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountIn } from './CountIn';

describe('CountIn', () => {
  it('keeps the full count visible while naming the active beat', () => {
    render(<CountIn count={2} total={4} beatMs={500} animated={false} />);

    const overlay = screen.getByTestId('count-in');

    expect(overlay).toHaveAccessibleName('Count in 2 of 4');
    expect(overlay).toHaveAttribute('data-fullscreen-moment', 'count-in');
    expect(overlay).toHaveAttribute('data-total', '4');
    expect(
      overlay.querySelector('.drumroll-count-in__current'),
    ).toHaveAttribute('data-count', '2');
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
    expect(
      screen
        .getByTestId('count-in')
        .querySelectorAll('.drumroll-count-in__beat'),
    ).toHaveLength(2);
  });

  it.each([5, 6, 7])('keeps all %i beats in one visible row', (total) => {
    render(
      <CountIn count={total} total={total} beatMs={500} animated={false} />,
    );

    const overlay = screen.getByTestId('count-in');

    expect(overlay).toHaveAccessibleName(`Count in ${total} of ${total}`);
    expect(overlay).toHaveAttribute('data-total', String(total));
    expect(overlay).toHaveStyle({ '--count-in-columns': String(total) });
    expect(overlay.querySelectorAll('.drumroll-count-in__beat')).toHaveLength(
      total,
    );
  });

  it('stays absent outside an active count-in', () => {
    render(<CountIn count={undefined} total={4} beatMs={500} />);

    expect(screen.queryByTestId('count-in')).not.toBeInTheDocument();
  });
});
