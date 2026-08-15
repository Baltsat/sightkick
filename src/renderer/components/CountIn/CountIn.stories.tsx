import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ChartParser } from '../../../chart-parser/parser';
import { renderMusic } from '../../../chart-parser/renderer';
import type { RenderData } from '../../../chart-parser/types';
import type { Song } from '../../../types';
import { SHEET_MUSIC_COLORS } from '../../constants';
import { SheetMusic, buildParsedChartFromDsl } from '../SheetMusic';
import { CountIn } from './CountIn';

const scoreDsl = `
res=480 ts=4/4
0 kick yellow
240 yellow
480 snare yellow
720 yellow
960 kick yellow
1200 yellow
1440 snare yellow
1680 yellow

res=480 ts=4/4
0 kick yellow
240 yellow
480 kick snare yellow
720 yellow
960 kick yellow
1200 yellow
1440 snare yellow
1680 blue

res=480 ts=4/4
0 kick yellow
240 yellow
480 snare yellow
720 yellow
960 kick yellow
1200 snare blue
1440 yellow:tom
1680 blue:tom

res=480 ts=4/4
0 kick yellow
240 yellow
480 kick snare yellow
720 yellow
960 kick yellow
1200 yellow
1440 snare green
1680 green
`;
const storySong = {
  name: 'First-bar reading proof',
  artist: 'Drumroll Method',
} as Song;

function ScoreBackdrop({ children }: { children: ReactNode }) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const [renderData, setRenderData] = useState<RenderData[]>([]);
  const parser = useMemo(
    () => new ChartParser(buildParsedChartFromDsl(scoreDsl), false),
    [],
  );

  useEffect(() => {
    if (!scoreRef.current) {
      return;
    }

    setRenderData(
      renderMusic(
        scoreRef.current,
        parser,
        SHEET_MUSIC_COLORS,
        false,
        true,
        true,
      ),
    );
  }, [parser]);

  return (
    <div
      data-testid="count-in-notation-proof"
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: 'var(--surface-canvas)',
      }}
    >
      <div style={{ padding: 'clamp(3rem, 7vw, 7rem) 4vw 2rem' }}>
        <SheetMusic
          engine={undefined}
          songData={storySong}
          renderData={renderData}
          vexflowContainerRef={scoreRef}
          isDev={false}
          onSelectMeasure={() => {}}
          zoom={1.08}
        />
      </div>
      {children}
    </div>
  );
}

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
      <ScoreBackdrop>
        <Story />
      </ScoreBackdrop>
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
