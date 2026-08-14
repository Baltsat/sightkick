import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Stave, StaveNote } from 'vexflow';
import { Measure, ParsedChart, RenderData } from '../../../chart-parser/types';
import type { ResolvedJudgement } from '../../services/engine';
import { describeMistake } from '../../services/pedagogy';
import { TimeStore } from '../../services/time-store';
import { secondsToTicks } from '../../../chart-parser/timing';
import { getXForTick } from '../../services/engine/cursor-geometry';
import {
  KIT_ELEMENT_COLOR_VAR,
  KIT_ELEMENT_LABEL,
} from '../../services/pedagogy';
import { HOME_KIT_ZONE_LANES } from '../HomeCockpit/kit-zone-map';
import { notationElementForTarget } from '../NotationGlossary';
import {
  flowBeatCount,
  flowFixedPlayheadGeometry,
  flowLocationForTick,
  flowMeterBars,
  flowPlayheadOffset,
  flowScrollStep,
  flowViewportPlayheadGeometry,
  horizontalScrollParent,
  LoopEscapeRunway,
  loopEscapeEnergy,
  loopEscapePhase,
  NotationLocationReadout,
  PatternBands,
  repeatCueSegments,
  repeatedNotationPatterns,
} from './ContinuousNotation';

function measureData(
  startTick: number,
  endTick: number,
  x: number,
  width: number,
  timeSig: [number, number] = [4, 4],
  isCompound = false,
  notes: Measure['notes'] = [],
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
      notes,
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

  it.each([
    { surfaceLeft: -40, horizontalScrollDelta: 0, scale: 1 },
    { surfaceLeft: -265.5, horizontalScrollDelta: 0, scale: 1.15 },
    { surfaceLeft: -900, horizontalScrollDelta: 14, scale: 1.3 },
  ])(
    'keeps the fixed playhead anchored from a zoomed surface at $surfaceLeft',
    ({ surfaceLeft, horizontalScrollDelta, scale }) => {
      const geometry = flowFixedPlayheadGeometry({
        viewportLeft: 0,
        surfaceLeft,
        horizontalScrollDelta,
        anchor: 272,
        scoreTop: 219,
        scoreBottom: 518,
        beatY: 320,
        visualScale: scale,
        verticalScale: scale,
      });
      const projectedSurfaceLeft = surfaceLeft - horizontalScrollDelta;

      expect(projectedSurfaceLeft + geometry.left * scale).toBeCloseTo(272);
      expect(geometry.top * scale).toBeCloseTo(219);
      expect(geometry.height * scale).toBeCloseTo(299);
      expect(219 + geometry.beatOffset * scale).toBeCloseTo(320);
    },
  );

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

  it('keeps the transport, bar label, and viewport playhead aligned through speed changes and a rewind', () => {
    const chart = {
      resolution: 100,
      tempos: [{ tick: 0, beatsPerMinute: 60, msTime: 0 }],
    } as unknown as ParsedChart;
    const data = [measureData(0, 400, 0, 400), measureData(400, 800, 400, 400)];
    const samples = [
      { phase: 'playing', speed: 0.5, seconds: 2.99, bar: 1, beat: 3 },
      { phase: 'paused', speed: 0.5, seconds: 2.99, bar: 1, beat: 3 },
      { phase: 'resumed', speed: 0.7, seconds: 4, bar: 2, beat: 1 },
      { phase: 'playing', speed: 1, seconds: 5, bar: 2, beat: 2 },
      { phase: 'remediation rewind', speed: 0.7, seconds: 1, bar: 1, beat: 2 },
    ];
    const viewportLeft = 48;
    const anchor = 220;
    const scoreLeft = 500;
    const zoom = 1.15;

    samples.forEach(({ seconds, bar, beat }) => {
      const tick = secondsToTicks(seconds, chart.resolution, chart.tempos);
      const location = flowLocationForTick(data, tick)!;
      const x = getXForTick(tick, data[location.measureIndex]);
      const target = scoreLeft + x * zoom - anchor;
      const geometry = flowViewportPlayheadGeometry({
        viewportLeft,
        anchor,
        scoreTop: 120,
        scoreBottom: 420,
        beatY: 200,
      });

      expect(location).toMatchObject({ barNumber: bar, beatNumber: beat });
      expect(geometry).toEqual({
        left: viewportLeft + anchor,
        top: 120,
        height: 300,
        beatOffset: 80,
      });
      expect(target + anchor).toBeCloseTo(scoreLeft + x * zoom);
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

  it('marks consecutive matching figures as one calm repeat passage', () => {
    const figure = [
      {
        notes: ['C/5'],
        duration: '8',
        dots: 0,
        isRest: false,
        tick: 0,
      },
      {
        notes: ['D/5'],
        duration: '8',
        dots: 0,
        isRest: false,
        tick: 200,
      },
    ] as Measure['notes'];
    const data = Array.from({ length: 4 }, (_, measureIndex) => {
      const startTick = measureIndex * 400;

      return measureData(
        startTick,
        startTick + 400,
        measureIndex * 400,
        400,
        [4, 4],
        false,
        figure.map((note) => ({ ...note, tick: note.tick + startTick })),
      );
    });

    expect(repeatedNotationPatterns(data)).toEqual([
      { startIndex: 0, endIndex: 3, count: 4 },
    ]);

    render(createElement(PatternBands, { renderData: data }));

    expect(screen.getByTestId('notation-pattern-0-3')).toHaveAttribute(
      'data-repeat-count',
      '4',
    );
    expect(screen.getByTestId('notation-pattern-0-3')).toHaveTextContent(
      'repeat ×4',
    );
  });

  it('bounds repeat cues to their own stave rows without covering noteheads', () => {
    const figure = [
      {
        notes: ['C/5'],
        duration: '8',
        dots: 0,
        isRest: false,
        tick: 0,
      },
    ] as Measure['notes'];
    const data = Array.from({ length: 4 }, (_, measureIndex) => {
      const startTick = measureIndex * 400;
      const item = measureData(
        startTick,
        startTick + 400,
        (measureIndex % 2) * 400,
        400,
        [4, 4],
        false,
        figure.map((note) => ({ ...note, tick: note.tick + startTick })),
      );

      return {
        ...item,
        yOffset: measureIndex < 2 ? 0 : 180,
      };
    });
    const segments = repeatCueSegments(data, {
      startIndex: 0,
      endIndex: 3,
      count: 4,
    });
    const notehead = { left: 160, right: 180, top: 18, bottom: 78 };

    expect(segments).toEqual([
      {
        startIndex: 0,
        endIndex: 1,
        left: 0,
        top: 90,
        width: 800,
        height: 16,
      },
      {
        startIndex: 2,
        endIndex: 3,
        left: 0,
        top: 270,
        width: 800,
        height: 16,
      },
    ]);
    expect(
      segments.some(
        (segment) =>
          segment.left < notehead.right &&
          segment.left + segment.width > notehead.left &&
          segment.top < notehead.bottom &&
          segment.top + segment.height > notehead.top,
      ),
    ).toBe(false);

    render(createElement(PatternBands, { renderData: data }));

    expect(screen.getByTestId('notation-pattern-0-3')).toHaveStyle({
      top: '90px',
      width: '800px',
      height: '16px',
    });
    expect(screen.getByTestId('notation-pattern-0-3')).toHaveAttribute(
      'data-repeat-label',
      'true',
    );
    expect(screen.getByTestId('notation-pattern-0-3-2-3')).toHaveStyle({
      top: '270px',
      width: '800px',
      height: '16px',
    });

    const notationCss = readFileSync(
      'src/renderer/components/ContinuousNotation/ContinuousNotation.css',
      'utf8',
    );
    const rule = notationCss.match(
      /\.drumroll-pattern-band\s*\{([^}]*)\}/,
    )?.[1];

    expect(rule).toContain('background: transparent');
    expect(rule).not.toContain('bottom:');
  });

  it('keeps every notehead colour aligned with its matching kit zone', () => {
    const noteHead = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    );

    noteHead.classList.add('vf-note-missed', 'vf-note-hihat');
    document.body.append(noteHead);

    const element = notationElementForTarget(noteHead);

    expect(element).toBe('hihat');
    expect(
      describeMistake({
        id: 'note:0:hihat',
        verdict: 'miss',
        expectedElement: element,
        measureIndex: 0,
        scoreable: true,
      } satisfies ResolvedJudgement)?.title,
    ).toBe('Bar 1: Hi-hat expected');

    const notationCss = readFileSync(
      'src/renderer/styles/sheet-music.css',
      'utf8',
    );

    (
      Object.keys(KIT_ELEMENT_LABEL) as Array<keyof typeof KIT_ELEMENT_LABEL>
    ).forEach((kitElement) => {
      const kitColour = `var(--color-${HOME_KIT_ZONE_LANES[kitElement]})`;

      expect(KIT_ELEMENT_COLOR_VAR[kitElement]).toBe(kitColour);
      expect(notationCss).toMatch(
        new RegExp(
          `\\.vf-note-${kitElement}\\s*\\{\\s*--vf-note-lane-color:\\s*${kitColour.replace(
            /[()]/g,
            '\\$&',
          )};`,
        ),
      );
    });
    expect(notationCss).toContain(
      'fill: var(--vf-note-lane-color, var(--color-red-dark, #8b1c1c));',
    );
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

describe('Loop Escape runway', () => {
  it('holds near-clean quality while placing the first clean pass at lock', () => {
    expect(
      loopEscapeEnergy({ qualityProgress: 0.5, requiredCleanPasses: 2 }),
    ).toBeCloseTo(0.45);
    expect(
      loopEscapeEnergy({ qualityProgress: 1, requiredCleanPasses: 2 }),
    ).toBeCloseTo(0.72);
    expect(
      loopEscapeEnergy({ qualityProgress: 2, requiredCleanPasses: 2 }),
    ).toBe(1);
    expect(
      loopEscapePhase({ qualityProgress: 0.5, requiredCleanPasses: 2 }),
    ).toBe('control');
    expect(
      loopEscapePhase({ qualityProgress: 1, requiredCleanPasses: 2 }),
    ).toBe('lock');
    expect(
      loopEscapePhase({ qualityProgress: 2, requiredCleanPasses: 2 }),
    ).toBe('release');
  });

  it('renders retained quality and the real speed ladder above its phrase', () => {
    render(
      createElement(LoopEscapeRunway, {
        renderData: [
          measureData(0, 400, 100, 400),
          measureData(400, 800, 500, 400),
        ],
        model: {
          barStart: 1,
          barEnd: 2,
          qualityProgress: 1,
          requiredCleanPasses: 2,
          currentSpeed: 0.7,
          targetSpeed: 0.9,
          retainedQuality: true,
        },
      }),
    );

    expect(screen.getByTestId('loop-escape-runway')).toHaveAttribute(
      'data-phase',
      'lock',
    );
    expect(screen.getByTestId('loop-escape-runway')).toHaveAttribute(
      'data-retained-quality',
      'true',
    );
    expect(screen.getByText('Quality retained')).toBeInTheDocument();
    expect(screen.getByText('0.7× → 0.9×')).toBeInTheDocument();
    expect(screen.getByTestId('loop-escape-runway')).toHaveAccessibleName(
      'Loop escape, bars 1 through 2: lock; 1.0 of 2 clean passes, 0.7× → 0.9×; near-clean quality retained',
    );
  });
});
