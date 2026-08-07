import { describe, it, expect } from 'vitest';
import { ChartParser } from '../../../chart-parser/parser';
import {
  AUTO_SCROLL_EDGE_MARGIN,
  AUTO_SCROLL_MAX_SPEED,
  autoScrollSpeed,
  parseDsl,
  buildParsedChartFromDsl,
  serializeMeasureToDsl,
} from './helpers';

function keysOf(parser: ChartParser): string[] {
  return parser.measures.flatMap((m) =>
    m.notes.filter((n) => !n.isRest).flatMap((n) => n.notes),
  );
}

describe('parseDsl', () => {
  it('reads resolution, time signature, and cells; ignores comments', () => {
    const blocks = parseDsl(`
# a labelled block
res=192 ts=3/4
0 kick snare
64 yellow:tom
`);

    expect(blocks).toEqual([
      {
        resolution: 192,
        timeSig: [3, 4],
        hits: [
          {
            tick: 0,
            cells: [
              { lane: 'kick', tom: false },
              { lane: 'snare', tom: false },
            ],
          },
          { tick: 64, cells: [{ lane: 'yellow', tom: true }] },
        ],
      },
    ]);
  });

  it('throws when a block has no resolution', () => {
    expect(() => parseDsl('ts=4/4\n0 snare')).toThrow(/missing res=/);
  });
});

describe('buildParsedChartFromDsl', () => {
  it('scales every block to the lcm of resolutions', () => {
    const chart = buildParsedChartFromDsl(`
res=192 ts=4/4
16 snare

res=480 ts=4/4
0 snare
`);

    expect(chart.resolution).toBe(960);

    const ticks = chart.trackData[0].noteEventGroups.map((g) => g[0].tick);

    expect(ticks).toContain(80);
    expect(ticks).toContain(960 * 4);
  });

  it('renders a bare cymbal lane as a cymbal and :tom as a tom', () => {
    const cymbal = new ChartParser(
      buildParsedChartFromDsl('res=480 ts=4/4\n0 yellow'),
      false,
    );
    const tomHit = new ChartParser(
      buildParsedChartFromDsl('res=480 ts=4/4\n0 yellow:tom'),
      false,
    );

    expect(keysOf(cymbal)).toContain('g/5/x2');
    expect(keysOf(tomHit)).toContain('e/5');
  });
});

describe('autoScrollSpeed', () => {
  const edge = { top: 100, bottom: 500 };

  it('is zero comfortably inside the container', () => {
    expect(autoScrollSpeed(300, edge)).toBe(0);
  });

  it('is zero exactly at the margin boundary', () => {
    expect(autoScrollSpeed(edge.top + AUTO_SCROLL_EDGE_MARGIN, edge)).toBe(0);
    expect(autoScrollSpeed(edge.bottom - AUTO_SCROLL_EDGE_MARGIN, edge)).toBe(
      0,
    );
  });

  it('scrolls up (negative) at max speed right at the top edge', () => {
    expect(autoScrollSpeed(edge.top, edge)).toBe(-AUTO_SCROLL_MAX_SPEED);
  });

  it('scrolls down (positive) at max speed right at the bottom edge', () => {
    expect(autoScrollSpeed(edge.bottom, edge)).toBe(AUTO_SCROLL_MAX_SPEED);
  });

  it('stays at max speed once the pointer has left the container above or below', () => {
    expect(autoScrollSpeed(edge.top - 200, edge)).toBe(-AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed(edge.bottom + 200, edge)).toBe(
      AUTO_SCROLL_MAX_SPEED,
    );
  });

  it('ramps up linearly between the margin boundary and the edge', () => {
    const halfway = edge.top + AUTO_SCROLL_EDGE_MARGIN / 2;

    expect(autoScrollSpeed(halfway, edge)).toBeCloseTo(
      -AUTO_SCROLL_MAX_SPEED / 2,
    );
  });
});

describe('round-trip', () => {
  it('serializes each parsed measure back to its source block', () => {
    const dsl = [
      'res=480 ts=4/4',
      '0 snare',
      '160 snare',
      '320 snare',
      '',
      'res=480 ts=3/4',
      '0 kick',
      '240 snare blue',
    ].join('\n');
    const chart = buildParsedChartFromDsl(dsl);
    const parser = new ChartParser(chart, false);
    const emitted = parser.measures.map((m) => serializeMeasureToDsl(chart, m));

    expect(emitted).toEqual([
      'res=480 ts=4/4\n0 snare\n160 snare\n320 snare',
      'res=480 ts=3/4\n0 kick\n240 snare blue',
    ]);
  });
});
