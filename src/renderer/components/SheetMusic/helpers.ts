import { noteFlags } from 'scan-chart';
import { clamp } from 'es-toolkit';
import { ParsedChart, Measure } from '../../../chart-parser/types';
import { Cell, DslBlock, Lane, NoteEvent } from './types';
import { CYMBAL_LANES, LANE_BY_TYPE, TYPE_BY_LANE } from './constants';

// How close to a scroll container's top/bottom edge (in px) a drag needs to
// get before it starts auto-scrolling, and the fastest it'll scroll (in
// px/frame) once the pointer is right at or past that edge.
export const AUTO_SCROLL_EDGE_MARGIN = 56;

export const AUTO_SCROLL_MAX_SPEED = 18;

export interface ScrollEdge {
  top: number;
  bottom: number;
}

function edgeSpeed(distanceFromEdge: number): number {
  const depth = clamp(
    AUTO_SCROLL_EDGE_MARGIN - distanceFromEdge,
    0,
    AUTO_SCROLL_EDGE_MARGIN,
  );

  return (depth / AUTO_SCROLL_EDGE_MARGIN) * AUTO_SCROLL_MAX_SPEED;
}

/**
 * How fast (px/frame) and which way to auto-scroll a container while
 * dragging a practice-section selection past its top/bottom edge. Ramps up
 * linearly from 0 right at the margin boundary to AUTO_SCROLL_MAX_SPEED at
 * the container's own edge (and beyond, once the pointer has left the
 * container entirely) - negative scrolls up, positive scrolls down, 0 means
 * the pointer is comfortably inside the container and nothing should
 * auto-scroll.
 */
export function autoScrollSpeed(clientY: number, edge: ScrollEdge): number {
  const up = edgeSpeed(clientY - edge.top);

  if (up > 0) {
    return -up;
  }

  const down = edgeSpeed(edge.bottom - clientY);

  return down > 0 ? down : 0;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

function cellToken({ lane, tom }: Cell): string {
  return CYMBAL_LANES.has(lane) && tom ? `${lane}:tom` : lane;
}

function parseCell(token: string): Cell | undefined {
  const [lane, flag] = token.split(':') as [Lane, string | undefined];

  if (!(lane in TYPE_BY_LANE)) {
    return undefined;
  }

  return { lane, tom: flag === 'tom' };
}

function cellFlags({ lane, tom }: Cell): number {
  return CYMBAL_LANES.has(lane) && !tom ? noteFlags.cymbal : 0;
}

function measureTicks([numerator, denominator]: [number, number], ppq: number) {
  return numerator * ((ppq * 4) / denominator);
}

export function parseDsl(text: string): DslBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#')),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const [header, ...noteLines] = lines;
      const resMatch = header.match(/res=(\d+)/);
      const tsMatch = header.match(/ts=(\d+)\/(\d+)/);

      if (!resMatch) {
        throw new Error(`DSL block missing res=: "${header}"`);
      }

      return {
        resolution: Number(resMatch[1]),
        timeSig: tsMatch
          ? ([Number(tsMatch[1]), Number(tsMatch[2])] as [number, number])
          : undefined,
        hits: noteLines.map((line) => {
          const [tick, ...tokens] = line.split(/\s+/);

          return {
            tick: Number(tick),
            cells: tokens
              .map(parseCell)
              .filter((cell): cell is Cell => cell !== undefined),
          };
        }),
      };
    });
}

export function buildParsedChartFromDsl(text: string): ParsedChart {
  const blocks = parseDsl(text);
  const target = blocks.reduce((acc, block) => lcm(acc, block.resolution), 1);
  const noteEventGroups: NoteEvent[][] = [];
  const timeSignatures: {
    tick: number;
    numerator: number;
    denominator: number;
  }[] = [];
  let absStart = 0;
  let prevSig: [number, number] = [4, 4];

  blocks.forEach((block, index) => {
    const scale = target / block.resolution;
    const sig = block.timeSig ?? prevSig;

    if (index === 0 || sig[0] !== prevSig[0] || sig[1] !== prevSig[1]) {
      timeSignatures.push({
        tick: absStart,
        numerator: sig[0],
        denominator: sig[1],
      });
    }

    block.hits.forEach(({ tick, cells }) => {
      if (cells.length === 0) {
        return;
      }

      const at = absStart + tick * scale;

      noteEventGroups.push(
        cells.map((cell) => ({
          tick: at,
          type: TYPE_BY_LANE[cell.lane],
          flags: cellFlags(cell),
          length: 0,
        })),
      );
    });
    absStart += measureTicks(sig, target);
    prevSig = sig;
  });

  noteEventGroups.sort((a, b) => a[0].tick - b[0].tick);

  return {
    resolution: target,
    timeSignatures,
    tempos: [],
    trackData: [
      {
        instrument: 'drums',
        difficulty: 'expert',
        noteEventGroups,
      },
    ],
  } as unknown as ParsedChart;
}

function eventToCell(type: number, flags: number): Cell | undefined {
  const lane = LANE_BY_TYPE[type];

  if (!lane) {
    return undefined;
  }

  return {
    lane,
    tom: CYMBAL_LANES.has(lane) && (flags & noteFlags.cymbal) === 0,
  };
}

export function serializeMeasureToDsl(
  chart: ParsedChart,
  measure: Measure,
): string {
  const drum = chart.trackData.find(
    (t) => t.instrument === 'drums' && t.difficulty === 'expert',
  );
  const byTick = new Map<number, string[]>();

  (drum?.noteEventGroups.flat() ?? [])
    .filter((e) => e.tick >= measure.startTick && e.tick < measure.endTick)
    .forEach((e) => {
      const cell = eventToCell(e.type, e.flags);

      if (!cell) {
        return;
      }

      const rel = e.tick - measure.startTick;
      const tokens = byTick.get(rel) ?? [];

      tokens.push(cellToken(cell));
      byTick.set(rel, tokens);
    });

  const header = `res=${chart.resolution} ts=${measure.timeSig[0]}/${measure.timeSig[1]}`;
  const lines = [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, tokens]) => `${tick} ${tokens.join(' ')}`);

  return [header, ...lines].join('\n');
}
