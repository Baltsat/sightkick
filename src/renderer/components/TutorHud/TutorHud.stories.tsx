import type { Meta, StoryObj } from '@storybook/react';
import { createTutorState } from '../../services/tutor';
import { TutorHud } from './TutorHud';

function PausedWithMidiTelemetry() {
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
        input readback
      </p>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>
        the kit has a paper trail
      </h1>
      <TutorHud
        state={createTutorState()}
        displayState="inactivity-paused"
        message={{
          title: 'Paused — no hits detected',
          detail: 'Rewound to bar 8. Hit any pad to count in and resume.',
          tone: 'warning',
        }}
        midiTelemetry={{
          rawMessageCount: 3,
          lastMidiTimestamp: 1_786_060_800_000,
          selectedPortEpoch: 2,
          lastMappedLane: 'snare',
        }}
      />
    </main>
  );
}

const meta: Meta<typeof PausedWithMidiTelemetry> = {
  title: 'Song View/Tutor HUD',
  component: PausedWithMidiTelemetry,
};

export default meta;

type Story = StoryObj<typeof PausedWithMidiTelemetry>;

export const PausedTelemetry: Story = {};
