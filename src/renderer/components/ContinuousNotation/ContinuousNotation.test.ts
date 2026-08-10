import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Stave, StaveNote } from 'vexflow';
import { Measure, ParsedChart, RenderData } from '../../../chart-parser/types';
import { TimeStore } from '../../services/time-store';
import {
  flowBeatCount,
  flowLocationForTick,
  flowMeterBars,
  flowPlayheadOffset,
  flowScrollStep,
  horizontalScrollParent,
  NotationLocationReadout,
} from './ContinuousNotation';

function measureData(
  startTick: number,
  endTick: number,
  x: number,
  width: number,
  timeSig: [number, number] = [4, 4],
  isCompound = false,
): RenderData {
  const note = {
    isRest: () => true,
  } as unknown as StaveNote;
  const stave = {
    getX: () => x,
    getWidth: () => width,
    getY: () => 0,
    getHeight: () => 80,
  } as unknown as Stave;

  return {
    measure: {
      startTick,
      endTick,
      timeSig,
      isCompound,
    } as Measure,
    stave,
    renderedNotes: [{ tick: startTick, note }],
    yOffset: 0,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('ContinuousNotation camera viewport', () => {
  it('keeps the fixed playhead viewport for a short score that does not overflow', () => {
    const viewport = document.createElement('div');
    const stage = document.createElement('div');
    const notation = document.createElement('div');

    viewport.className = 'drumroll-flow-viewport';
    viewport.style.overflowX = 'hidden';
    stage.style.overflowX = 'hidden';
    stage.append(notation);
    viewport.append(stage);
    document.body.append(viewport);
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 800 },
      scrollWidth: { configurable: true, value: 400 },
    });

    expect(horizontalScrollParent(notation)).toBe(viewport);
  });

  it('keeps the playhead in a stable reading zone across viewport sizes', () => {
    expect(flowPlayheadOffset(500)).toBe(160);
    expect(flowPlayheadOffset(1000)).toBe(220);
    expect(flowPlayheadOffset(1600)).toBe(272);
  });

  it('settles a paused seek all the way to the labelled bar', () => {
    let scrollLeft = 0;
    let continueSettling = true;

    for (let frame = 0; frame < 60 && continueSettling; frame += 1) {
      const step = flowScrollStep(scrollLeft, 2400, false);

      scrollLeft = step.nextScrollLeft;
      continueSettling = step.continueSettling;
    }

    expect(Math.abs(2400 - scrollLeft)).toBeLessThanOrEqual(0.5);
    expect(continueSettling).toBe(false);
    expect(flowScrollStep(0, 2400, true)).toEqual({
      nextScrollLeft: 2400,
      continueSettling: false,
    });
  });
});

describe('Flow meter and current location', () => {
  it('reports the exact bar and beat at boundaries and chart end', () => {
    const data = [measureData(0, 400, 0, 400), measureData(400, 800, 400, 400)];

    expect(flowLocationForTick(data, 0)).toMatchObject({
      barNumber: 1,
      beatNumber: 1,
      beatCount: 4,
    });
    expect(flowLocationForTick(data, 299)).toMatchObject({
      barNumber: 1,
      beatNumber: 3,
    });
    expect(flowLocationForTick(data, 400)).toMatchObject({
      barNumber: 2,
      beatNumber: 1,
    });
    expect(flowLocationForTick(data, 800)).toMatchObject({
      barNumber: 2,
      beatNumber: 4,
      totalBars: 2,
    });
  });

  it('groups compound meter into the natural drummer pulse', () => {
    const compound = measureData(0, 600, 0, 600, [6, 8], true);

    expect(flowBeatCount(compound.measure)).toBe(2);
    expect(flowLocationForTick([compound], 299)?.beatNumber).toBe(1);
    expect(flowLocationForTick([compound], 300)?.beatNumber).toBe(2);
  });

  it('aligns numbered beat guides with the score coordinate system', () => {
    const bars = flowMeterBars([
      measureData(0, 400, 100, 400),
      measureData(400, 800, 500, 400),
    ]);

    expect(bars[0]).toMatchObject({
      barNumber: 1,
      x: 100,
      width: 400,
    });
    expect(bars[0].beats.map(({ beatNumber, x }) => [beatNumber, x])).toEqual([
      [1, 100],
      [2, 200],
      [3, 300],
      [4, 400],
    ]);
    expect(bars[1].beats[0].x).toBe(500);
  });

  it('keeps a live bar/total and beat readout for Classic notation', () => {
    const timeStore = new TimeStore();
    const chart = {
      resolution: 100,
      tempos: [{ tick: 0, beatsPerMinute: 60, msTime: 0 }],
    } as unknown as ParsedChart;
    const data = [measureData(0, 400, 0, 400), measureData(400, 800, 400, 400)];

    render(
      createElement(NotationLocationReadout, {
        timeStore,
        chart,
        renderData: data,
        delaySeconds: 0,
      }),
    );

    expect(screen.getByTestId('notation-location')).toHaveAccessibleName(
      'Bar 1 of 2, beat 1 of 4',
    );

    act(() => timeStore.set(4.5));

    expect(screen.getByTestId('notation-location')).toHaveAccessibleName(
      'Bar 2 of 2, beat 1 of 4',
    );
    expect(screen.getByTestId('notation-location')).toHaveAttribute(
      'data-location-key',
      '1:0',
    );
  });
});
