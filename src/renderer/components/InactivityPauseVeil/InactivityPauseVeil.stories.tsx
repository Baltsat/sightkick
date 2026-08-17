import type { Meta, StoryObj } from '@storybook/react';
import { InactivityPauseVeil } from './InactivityPauseVeil';

function WaitingForKitInput() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '12vh 10vw',
        background:
          'repeating-linear-gradient(#f4efe5 0 84px, #d9cebd 85px 86px)',
        color: '#2c2824',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <p style={{ color: '#b65338', fontWeight: 800, letterSpacing: '0.13em' }}>
        alternation warm-up
      </p>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>alternating singles</h1>
      <p style={{ maxWidth: 460, color: '#6d6258', lineHeight: 1.55 }}>
        1 &amp; 2 &amp; 3 &amp; 4 &amp;
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
