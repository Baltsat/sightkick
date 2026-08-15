import type { Meta, StoryObj } from '@storybook/react';
import { CountIn } from './CountIn';

const meta: Meta<typeof CountIn> = {
  title: 'Song View/Count In',
  component: CountIn,
  args: { count: 3, total: 4, beatMs: 800, animated: false },
  argTypes: {
    count: { control: { type: 'number' } },
    beatMs: { control: { type: 'number' } },
    animated: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          position: 'relative',
          minHeight: '100vh',
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

type Story = StoryObj<typeof CountIn>;

export const FourthBeat: Story = { args: { count: 4 } };

export const Animated: Story = { args: { count: 3, animated: true } };

export const SevenBeatMeasure: Story = {
  args: { count: 7, total: 7, beatMs: 640 },
};
