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
      announceSeq: 1,
      announceStage: STREAK_STAGES[2],
      streak: {
        count: STREAK_STAGES[2].threshold,
        credit: STREAK_STAGES[2].threshold,
        best: STREAK_STAGES[2].threshold,
        bestCredit: STREAK_STAGES[2].threshold,
        stage: STREAK_STAGES[2],
        countedNoteIds: new Set(),
      },
    },
    animated: false,
  },
};

export const HigherThreshold: Story = {
  args: {
    ui: {
      ...INITIAL_STREAK_UI_STATE,
      announceSeq: 1,
      announceStage: STREAK_STAGES[6],
      streak: {
        count: STREAK_STAGES[6].threshold,
        credit: STREAK_STAGES[6].threshold,
        best: STREAK_STAGES[6].threshold,
        bestCredit: STREAK_STAGES[6].threshold,
        stage: STREAK_STAGES[6],
        countedNoteIds: new Set(),
      },
    },
    animated: false,
  },
};
