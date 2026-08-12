import type { Meta, StoryObj } from '@storybook/react';
import { InactivityPauseVeil } from './InactivityPauseVeil';

function WaitingForKitInput() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '12vh 10vw',
        background: 'linear-gradient(135deg, #f7f0e5, #dce7e2)',
        color: '#2c2824',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <p style={{ color: '#b65338', fontWeight: 800, letterSpacing: '0.13em' }}>
        alternation warm-up
      </p>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>
        your practice stays put
      </h1>
      <p style={{ maxWidth: 460, color: '#6d6258', lineHeight: 1.55 }}>
        the score and controls remain underneath the pause state so screen input
        can take over at once.
      </p>
      <InactivityPauseVeil visible checkpointMeasure={12} />
    </main>
  );
}

const meta: Meta<typeof WaitingForKitInput> = {
  title: 'Song View/Inactivity Pause Veil',
  component: WaitingForKitInput,
};

export default meta;

type Story = StoryObj<typeof WaitingForKitInput>;

export const Visible: Story = {};
