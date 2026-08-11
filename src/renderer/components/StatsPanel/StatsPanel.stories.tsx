import type { Meta, StoryObj } from '@storybook/react';
import { AchievementViewModel } from '../../hooks/useGamification';
import { ACHIEVEMENTS } from '../../services/achievements';
import { StatsPanel } from './StatsPanel';

const achievements: AchievementViewModel[] = [...ACHIEVEMENTS]
  .reverse()
  .map((achievement) => ({ ...achievement, unlocked: true }));
const meta: Meta<typeof StatsPanel> = {
  title: 'Engagement mechanics/Practice stats',
  component: StatsPanel,
  args: {
    streak: { current: 5, longest: 9 },
    weeklyXp: [18, 24, 0, 32, 42, 0, 0].map((xp, offset) => ({
      date: new Date(2026, 7, 5 + offset),
      xp,
    })),
    goalXp: 50,
    totalStars: 137,
    laneAccuracy: [],
    achievements,
  },
  decorators: [
    (Story) => (
      <div className="h-screen overflow-y-auto bg-background p-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border-soft bg-surface p-6 shadow-sm">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StatsPanel>;

export const MusicalProofOrder: Story = {};
