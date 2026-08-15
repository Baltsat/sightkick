import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell, ArenaView } from './AppShell';

function ShellHarness({
  initialView = 'home',
  runOpen = false,
}: {
  initialView?: ArenaView;
  runOpen?: boolean;
}) {
  const [view, setView] = useState<ArenaView>(initialView);

  return (
    <AppShell
      view={view}
      onViewChange={setView}
      settingsSlot={<button type="button">Settings</button>}
      onOpenProfile={() => setView('insights')}
      runOpen={runOpen}
    >
      <div>Route content</div>
    </AppShell>
  );
}

describe('AppShell', () => {
  it('keeps every place and settings in one centered navigation group', () => {
    render(<ShellHarness />);

    const navigation = screen.getByRole('navigation', { name: 'Primary' });

    expect(within(navigation).getByTestId('view-home')).toBeInTheDocument();
    expect(within(navigation).getByTestId('view-songs')).toBeInTheDocument();
    expect(within(navigation).getByTestId('view-lessons')).toBeInTheDocument();
    expect(
      within(navigation).getByTestId('open-profile-button'),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('button', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('view-wave')).not.toBeInTheDocument();
    expect(screen.queryByText('Drumroll')).not.toBeInTheDocument();
  });

  it.each([
    ['home', 'Home', 'view-home'],
    ['songs', 'Songs', 'view-songs'],
    ['journey', 'Journey', 'view-lessons'],
    ['insights', 'Profile', 'open-profile-button'],
  ] as const)(
    'renders the %s route on the persistent shell field',
    (view, label, activeTestId) => {
      render(<ShellHarness initialView={view} />);

      expect(document.querySelector('.arena-shell')).toHaveAttribute(
        'data-view',
        view,
      );
      expect(screen.getByLabelText(`${label} content`)).toBeInTheDocument();
      expect(screen.getByTestId(activeTestId)).toHaveAttribute(
        'aria-current',
        'page',
      );
    },
  );

  it('withdraws the rail while a practice run owns the window', () => {
    render(<ShellHarness runOpen />);

    expect(document.querySelector('.arena-shell')).toHaveAttribute(
      'data-run-open',
      'true',
    );
    expect(screen.getByLabelText('Drumroll navigation')).toHaveAttribute(
      'hidden',
    );
  });

  it('keeps the same field mounted through a route change', () => {
    render(<ShellHarness />);

    const field = document.querySelector('.arena-shell');

    expect(field).toHaveAttribute('data-view', 'home');
    fireEvent.click(screen.getByTestId('view-songs'));
    expect(field).toHaveAttribute('data-view', 'songs');
    expect(document.querySelector('.arena-shell')).toBe(field);
  });
});
