import type { Meta, StoryObj } from '@storybook/react';
import { App as AntdApp } from 'antd';
import type { Song } from '../../../types';
import { multiLaneRunFixture } from '../PracticeStats/test-fixtures';
import { PerformancePostcard } from './PerformancePostcardDialog';

const song = {
  name: 'Daybreak Anthem',
  artist: 'Drumroll Sessions',
} as Song;
const meta: Meta<typeof PerformancePostcard> = {
  title: 'Practice/Private performance postcard',
  component: PerformancePostcard,
  render: () => (
    <AntdApp>
      <PerformancePostcard
        open
        onClose={() => {}}
        onExport={() => {}}
        exporting={false}
        song={song}
        summary={{
          ...multiLaneRunFixture(),
          overallAccuracy: 0.84,
          playbackSpeed: 0.8,
          audition: {
            song_id: 'song:daybreak',
            start_bar: 5,
            end_bar: 8,
            speed: 0.8,
            section_label: 'Bars 5–8',
            test_label: 'Chorus entry',
            required_skill_id: 'pulse.eighth',
          },
        }}
      />
    </AntdApp>
  ),
};

export default meta;

type Story = StoryObj<typeof PerformancePostcard>;

export const ExplicitFields: Story = {};
