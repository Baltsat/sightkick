import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../services/achievements';
import { AchievementViewModel } from '../../hooks/useGamification';
import { StatsPanel } from './StatsPanel';

function viewModels(unlockedIds: string[] = []): AchievementViewModel[] {
  return ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: unlockedIds.includes(def.id),
  }));
}

const weeklyXp = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(2026, 7, i + 1),
  xp: i === 6 ? 60 : 0,
}));

describe('StatsPanel', () => {
  it('renders totals, the weekly chart, and a loading achievement grid before achievements load', () => {
    render(
      <StatsPanel
        streak={{ current: 3, longest: 5 }}
        weeklyXp={weeklyXp}
        goalXp={50}
        totalStars={12}
        laneAccuracy={[]}
        achievements={undefined}
      />,
    );

    expect(screen.getByTestId('stat-current-streak')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-longest-streak')).toHaveTextContent('5');
    expect(screen.getByTestId('stat-total-stars')).toHaveTextContent('12');
    expect(screen.getByTestId('today-set-definition')).toHaveTextContent(
      'qualifying saved practice days',
    );
    expect(screen.getByTestId('weekly-xp-chart')).toBeInTheDocument();
    expect(screen.getByTestId('achievement-grid-loading')).toBeInTheDocument();
    expect(screen.getByTestId('lane-accuracy-empty')).toBeInTheDocument();
  });

  it('renders the full achievement grid, locked and unlocked, once achievements load', () => {
    render(
      <StatsPanel
        streak={{ current: 0, longest: 0 }}
        weeklyXp={weeklyXp}
        goalXp={50}
        totalStars={0}
        laneAccuracy={[]}
        achievements={viewModels(['first-blood'])}
      />,
    );

    expect(screen.getByTestId('achievement-grid')).toBeInTheDocument();
    expect(screen.getByTestId('achievement-first-blood')).toHaveAttribute(
      'data-unlocked',
      'true',
    );
    expect(screen.getByTestId('achievement-archive')).toBeInTheDocument();
    expect(screen.getByTestId('achievement-century')).toHaveAttribute(
      'data-unlocked',
      'false',
    );
  });

  it('keeps a lapsed streak separate from the new daily set', () => {
    render(
      <StatsPanel
        streak={{ current: 0, longest: 4 }}
        weeklyXp={weeklyXp}
        goalXp={50}
        totalStars={0}
        laneAccuracy={[]}
        achievements={undefined}
      />,
    );

    expect(screen.getByTestId('streak-reentry')).toHaveTextContent(
      'New set, same progress',
    );
  });

  it('marks the bar for a day that met goal', () => {
    render(
      <StatsPanel
        streak={{ current: 1, longest: 1 }}
        weeklyXp={weeklyXp}
        goalXp={50}
        totalStars={0}
        laneAccuracy={[]}
        achievements={undefined}
      />,
    );

    expect(screen.getByTestId('weekly-xp-bar-6')).toHaveAttribute(
      'data-met-goal',
      'true',
    );
    expect(screen.getByTestId('weekly-xp-bar-0')).toHaveAttribute(
      'data-met-goal',
      'false',
    );
  });

  it('renders real lane accuracy bars once there is run history', () => {
    render(
      <StatsPanel
        streak={{ current: 0, longest: 0 }}
        weeklyXp={weeklyXp}
        goalXp={50}
        totalStars={0}
        laneAccuracy={[{ element: 'kick', hits: 8, misses: 2, accuracy: 0.8 }]}
        achievements={undefined}
      />,
    );

    expect(screen.getByTestId('lane-accuracy-bars')).toBeInTheDocument();
    expect(screen.queryByTestId('lane-accuracy-empty')).not.toBeInTheDocument();
  });

  it('shows the ride binding for leaving stats when a kit is connected', () => {
    render(
      <StatsPanel
        streak={{ current: 3, longest: 5 }}
        weeklyXp={weeklyXp}
        goalXp={50}
        totalStars={12}
        laneAccuracy={[]}
        achievements={undefined}
        kitConnected
      />,
    );

    expect(screen.getByTestId('kit-action-chip-end')).toHaveAttribute(
      'data-pad',
      'ride',
    );
  });
});
