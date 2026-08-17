import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Difficulty } from 'scan-chart';
import { PracticeToolbarControls } from './PracticeToolbarControls';

function PracticeToolbarStory() {
  const [speed, setSpeed] = useState(0.7);
  const [layout, setLayout] = useState<'flow' | 'classic'>('flow');
  const [difficulty, setDifficulty] = useState<Difficulty>('expert');
  const [tutorEnabled, setTutorEnabled] = useState(true);

  return (
    <header className="drumroll-practice-toolbar flex h-12 items-center gap-3 px-4 py-1">
      <button type="button">Back</button>
      <button type="button">Play</button>
      <div className="drumroll-practice-toolbar__identity min-w-0">
        <strong>Alternating Singles</strong>
        <span>Warm up · 8 bars</span>
      </div>
      <div className="grow border-b border-[var(--dr-line)]" />
      <PracticeToolbarControls
        playbackSpeed={speed}
        onPlaybackSpeedChange={setSpeed}
        notationLayout={layout}
        onNotationLayoutChange={setLayout}
        difficulty={difficulty}
        availableDifficulties={['easy', 'medium', 'hard', 'expert']}
        onDifficultyChange={setDifficulty}
        tutorEnabled={tutorEnabled}
        onTutorEnabledChange={setTutorEnabled}
      />
      <button type="button">Inspector</button>
    </header>
  );
}

const meta: Meta<typeof PracticeToolbarStory> = {
  title: 'Song View/Practice Toolbar',
  component: PracticeToolbarStory,
};

export default meta;

type Story = StoryObj<typeof PracticeToolbarStory>;

export const Default: Story = {};
