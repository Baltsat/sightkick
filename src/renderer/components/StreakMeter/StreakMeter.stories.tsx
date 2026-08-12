import type { Meta, StoryObj } from '@storybook/react';
import { STREAK_STAGES } from '../../services/streak';
import { StreakMeter } from './StreakMeter';
import { INITIAL_STREAK_UI_STATE } from './useStreakEngine';

const meta: Meta<typeof StreakMeter> = {
  title: 'Song View/Phrase tier',
  component: StreakMeter,
  decorators: [
    (Story) => (
      <div className="relative h-screen overflow-hidden bg-surface-studio">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StreakMeter>;

export const CleanHits: Story = {
  args: {
    ui: {
      ...INITIAL_STREAK_UI_STATE,
      streak: {
        count: STREAK_STAGES[2].threshold,
        best: STREAK_STAGES[2].threshold,
        stage: STREAK_STAGES[2],
        countedNoteIds: new Set(),
      },
    },
    animated: false,
  },
};

export const ReturnToPhrase: Story = {
  args: {
    ui: {
      ...INITIAL_STREAK_UI_STATE,
      returnSeq: 1,
      returnBest: 18,
      streak: {
        count: 0,
        best: 18,
        stage: STREAK_STAGES[2],
        countedNoteIds: new Set(),
      },
    },
    animated: false,
  },
};
