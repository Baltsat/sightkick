import type { Meta, StoryObj } from '@storybook/react';
import { KitCommandVeil } from './KitCommandPrompt';

const meta: Meta<typeof KitCommandVeil> = {
  title: 'Song View/Kit command veil',
  component: KitCommandVeil,
  decorators: [
    (Story) => (
      <main
        style={{
          minHeight: '100vh',
          padding: '12vh 8vw',
          color: 'var(--ink-strong)',
          background:
            'repeating-linear-gradient(#f4efe5 0 84px, #d9cebd 85px 86px)',
        }}
      >
        <h1 style={{ fontSize: '4rem' }}>Alternating singles</h1>
        <Story />
      </main>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof KitCommandVeil>;

export const ResumeSequence: Story = {
  args: {
    kicker: 'Paused',
    title: 'Resume from the kit',
    model: {
      label: 'Resume from the kit',
      steps: ['kick', 'crash', 'kick', 'crash'],
    },
    detail: 'The score stays held at bar 8.',
    animated: false,
  },
};

export const ConfirmWithSnare: Story = {
  args: {
    kicker: 'Confirm',
    title: 'Strike snare to choose',
    model: { label: 'Choose', steps: ['snare'] },
    detail: 'Crash goes back without changing the selection.',
    animated: false,
  },
};
