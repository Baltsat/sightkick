import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell, ArenaView } from './AppShell';

function ShellHarness() {
  const [view, setView] = useState<ArenaView>('home');

  return (
    <AppShell
      view={view}
      onViewChange={setView}
      settingsSlot={<span>Settings</span>}
      onOpenProfile={() => setView('insights')}
    >
      <div>Route content</div>
    </AppShell>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AppShell', () => {
  it('keeps only places in the rail', () => {
    render(<ShellHarness />);

    expect(screen.getByTestId('view-home')).toBeInTheDocument();
    expect(screen.getByTestId('view-songs')).toBeInTheDocument();
    expect(screen.getByTestId('view-lessons')).toBeInTheDocument();
    expect(screen.getByTestId('open-profile-button')).toBeInTheDocument();
    expect(screen.queryByTestId('view-wave')).not.toBeInTheDocument();
  });

  it('keeps the field mounted and marks a route change once', () => {
    vi.useFakeTimers();
    render(<ShellHarness />);

    const field = document.querySelector('.arena-shell');

    expect(field).toHaveAttribute('data-view', 'home');
    fireEvent.click(screen.getByTestId('view-songs'));
    expect(field).toHaveAttribute('data-view', 'songs');
    expect(field).toHaveClass('arena-shell--transitioning');

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(field).not.toHaveClass('arena-shell--transitioning');
  });
});
