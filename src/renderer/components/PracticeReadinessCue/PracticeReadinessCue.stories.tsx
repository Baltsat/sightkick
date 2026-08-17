import type { Meta, StoryObj } from '@storybook/react';
import { PracticeReadinessCue } from './PracticeReadinessCue';

const meta: Meta<typeof PracticeReadinessCue> = {
  title: 'Song View/Practice readiness cue',
  component: PracticeReadinessCue,
  decorators: [
    (Story) => (
      <div
        className="relative h-screen overflow-hidden"
        style={{
          background:
            'repeating-linear-gradient(#f4efe5 0 84px, #d9cebd 85px 86px)',
        }}
      >
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PracticeReadinessCue>;

export const ReadyToStart: Story = {
  args: { phase: 'ready' },
};

export const SectionAuditionReady: Story = {
  args: {
    phase: 'ready',
    audition: {
      song_id: 'song:favourite',
      start_bar: 5,
      end_bar: 8,
      speed: 0.7,
      section_label: 'Bars 5–8',
      test_label: 'Eighth-note pulse in this section',
      required_skill_id: 'pulse.eighth',
    },
  },
};
