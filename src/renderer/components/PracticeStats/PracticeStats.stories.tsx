import type { Meta, StoryObj } from '@storybook/react';
import { computeRunsTrend } from '../../services/practice-stats';
import { PracticeStats } from './PracticeStats';
import { multiLaneRunFixture, runHistoryFixture } from './test-fixtures';

const meta: Meta<typeof PracticeStats> = {
  title: 'Practice/Drum-first run evidence',
  component: PracticeStats,
  args: {
    summary: multiLaneRunFixture(),
    trend: computeRunsTrend(runHistoryFixture()),
    kitConnected: true,
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-canvas p-8">
        <div className="mx-auto max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PracticeStats>;

export const MeasuredRun: Story = {};
