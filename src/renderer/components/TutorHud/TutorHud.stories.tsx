import type { Meta, StoryObj } from '@storybook/react';
import { createTutorState } from '../../services/tutor';
import { TutorHud } from './TutorHud';

function PausedWithKitRecovery() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '12vh 10vw',
        background: '#f4efe5',
        color: '#2c2824',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <p style={{ color: '#b65338', fontWeight: 800, letterSpacing: '0.13em' }}>
        recovery
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
      />
    </main>
  );
}

function PausedWithMistakeEvidence() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '12vh 10vw',
        background: '#f4efe5',
        color: '#2c2824',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <p style={{ color: '#b65338', fontWeight: 800, letterSpacing: '0.13em' }}>
        why this was wrong
      </p>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>
        one wrong note, one concrete correction
      </h1>
      <p style={{ maxWidth: '38ch' }}>
        Click the quiet &ldquo;Why&rdquo; chip in the caption below — it stays
        collapsed until the player looks, and never displaces the resume
        instruction next to it.
      </p>
      <TutorHud
        state={{
          ...createTutorState(),
          judgementsByMeasure: {
            11: [
              {
                id: 'wrong:9',
                verdict: 'wrong',
                expectedElement: 'snare',
                actualElement: 'ride',
                measureIndex: 11,
                scoreable: true,
              },
            ],
          },
        }}
        displayState="kit-paused"
        controlPrompt={{
          label: 'Resume from the kit',
          steps: ['kick', 'crash', 'kick', 'crash'],
        }}
        message={{
          title: 'Paused',
          detail: 'Use the kit controls to continue.',
          tone: 'warning',
        }}
      />
    </main>
  );
}

const meta: Meta<typeof PausedWithKitRecovery> = {
  title: 'Song View/Tutor HUD',
  component: PausedWithKitRecovery,
};

export default meta;

type Story = StoryObj<typeof PausedWithKitRecovery>;

export const PausedTelemetry: Story = {};

export const PausedWithMistakeWhy: StoryObj<typeof PausedWithMistakeEvidence> =
  {
    render: () => <PausedWithMistakeEvidence />,
  };
