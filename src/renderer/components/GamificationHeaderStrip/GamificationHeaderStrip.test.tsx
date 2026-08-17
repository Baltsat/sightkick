import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GamificationHeaderStrip } from './GamificationHeaderStrip';

const baseProps = {
  isLoaded: true,
  streak: { current: 0, longest: 0 },
  todayXp: 0,
  goalXp: 50,
  goalOption: 'regular' as const,
  onChangeGoal: vi.fn(),
  weekActivity: [false, false, false, false, false, false, false],
  totalStars: 0,
  onOpenStats: vi.fn(),
};

describe('GamificationHeaderStrip', () => {
  it('renders a loading placeholder and nothing else when data has not arrived yet', () => {
    render(<GamificationHeaderStrip {...baseProps} isLoaded={false} />);

    const strip = screen.getByTestId('gamification-header-strip');

    expect(strip).toHaveAttribute('data-loaded', 'false');
    expect(screen.queryByTestId('streak-flame')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-xp-label')).not.toBeInTheDocument();
  });

  it('renders the no-data state with one calm daily progress control', () => {
    render(<GamificationHeaderStrip {...baseProps} />);

    expect(screen.getByTestId('streak-flame')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(screen.getByTestId('streak-count')).toHaveTextContent('0');
    expect(screen.getByTestId('today-xp-label')).toHaveTextContent(
      'Today’s set · 0 / 50 XP',
    );
  });

  it('renders an active streak without a header chip cluster', () => {
    render(
      <GamificationHeaderStrip
        {...baseProps}
        streak={{ current: 4, longest: 6 }}
        todayXp={20}
        weekActivity={[false, true, true, true, false, true, true]}
        totalStars={42}
      />,
    );

    expect(screen.getByTestId('streak-flame')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByTestId('streak-count')).toHaveTextContent('4');
    expect(screen.queryByTestId('week-dots')).not.toBeInTheDocument();
    expect(screen.queryByTestId('total-stars')).not.toBeInTheDocument();
  });

  it('renders the goal-crossed state: ring reads goal-crossed, XP label reflects it', () => {
    render(
      <GamificationHeaderStrip
        {...baseProps}
        streak={{ current: 3, longest: 3 }}
        todayXp={60}
        goalXp={50}
      />,
    );

    expect(screen.getByTestId('streak-flame')).toHaveAttribute(
      'data-goal-crossed',
      'true',
    );
    expect(screen.getByTestId('today-xp-label')).toHaveTextContent(
      'Today’s set · 60 / 50 XP',
    );
  });

  it('does not mark the ring goal-crossed before the goal is reached', () => {
    render(<GamificationHeaderStrip {...baseProps} todayXp={30} goalXp={50} />);

    expect(screen.getByTestId('streak-flame')).toHaveAttribute(
      'data-goal-crossed',
      'false',
    );
  });

  it('calls onOpenStats when the strip is clicked', () => {
    const onOpenStats = vi.fn();

    render(
      <GamificationHeaderStrip {...baseProps} onOpenStats={onOpenStats} />,
    );
    fireEvent.click(screen.getByTestId('gamification-header-strip'));

    expect(onOpenStats).toHaveBeenCalledTimes(1);
  });

  it('opens the goal popover without triggering onOpenStats', () => {
    const onOpenStats = vi.fn();

    render(
      <GamificationHeaderStrip {...baseProps} onOpenStats={onOpenStats} />,
    );
    fireEvent.click(screen.getByTestId('goal-popover-trigger'));

    expect(screen.getByTestId('goal-popover-menu')).toBeInTheDocument();
    expect(onOpenStats).not.toHaveBeenCalled();
  });

  it('calls onChangeGoal with the selected option and closes the popover', () => {
    const onChangeGoal = vi.fn();

    render(
      <GamificationHeaderStrip {...baseProps} onChangeGoal={onChangeGoal} />,
    );
    fireEvent.click(screen.getByTestId('goal-popover-trigger'));
    fireEvent.click(screen.getByTestId('goal-option-intense'));

    expect(onChangeGoal).toHaveBeenCalledWith('intense');
  });

  it('shows the hi-hat binding for insights when that kit control is active', () => {
    render(<GamificationHeaderStrip {...baseProps} kitConnected />);

    const chip = screen.getByTestId('kit-action-chip-open-coach');

    expect(chip).toHaveAttribute('data-pad', 'hihat');
    expect(chip).toHaveTextContent('Hi-hat');
  });
});
