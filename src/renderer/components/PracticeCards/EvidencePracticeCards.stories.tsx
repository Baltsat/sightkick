import type { Meta, StoryObj } from '@storybook/react';
import { EvidencePracticeCards } from './EvidencePracticeCards';

const cards = [
  {
    kind: 'review' as const,
    label: 'Review',
    options: [
      {
        id: 'review:eighth-note-pulse',
        kind: 'review' as const,
        candidate_id: 'lesson:02.03',
        title: 'Eighth-note pulse recall',
        speed: 0.7,
        source_label: 'Saved review queue · last played 3 days ago',
        completion_label: 'One clean saved run',
      },
    ],
  },
  {
    kind: 'build' as const,
    label: 'Build',
    options: [
      {
        id: 'build:backbeat',
        kind: 'build' as const,
        candidate_id: 'lesson:03.02',
        title: 'Backbeat placement',
        speed: 0.8,
        source_label: 'Snare timing led the latest saved run',
        completion_label: 'Reach the end once at 0.8×',
      },
    ],
  },
  {
    kind: 'apply' as const,
    label: 'Apply',
    options: [
      {
        id: 'apply:goal-section',
        kind: 'apply' as const,
        candidate_id: 'song:goal',
        title: 'Goal-song chorus',
        speed: 0.75,
        source_label: 'Uses the same backbeat in your saved goal song',
        completion_label: 'One saved chorus pass',
      },
    ],
  },
];
const meta: Meta<typeof EvidencePracticeCards> = {
  title: 'Insights/Drum-first practice cards',
  component: EvidencePracticeCards,
  args: {
    cards,
    onStart: () => {},
    kitConnected: true,
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-canvas p-8">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EvidencePracticeCards>;

export const KitReady: Story = {};
