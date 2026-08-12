import type { Meta, StoryObj } from '@storybook/react';
import { PracticePresenceSettings } from './PracticePresenceSettings';

const meta: Meta<typeof PracticePresenceSettings> = {
  title: 'Settings/Practice presence',
  component: PracticePresenceSettings,
  render: () => (
    <div className="min-h-screen bg-bg p-6">
      <div className="w-96 rounded-2xl border border-border-soft bg-bg p-4 shadow-panel">
        <PracticePresenceSettings />
      </div>
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof PracticePresenceSettings>;

export const DefaultOff: Story = {};
