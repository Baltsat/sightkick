import { describe, expect, it } from 'vitest';
import { Measure } from '../../../chart-parser/types';
import { buildTutorChartPlan, sectionStartsForChart } from './chart';

function measure(
  notes: Measure['notes'],
  startTick = 0,
  endTick = 768,
): Measure {
  return {
    timeSig: [4, 4],
    sigChange: false,
    hasClef: true,
    isCompound: false,
    startTick,
    endTick,
    notes,
    tuplets: [],
  };
}

describe('buildTutorChartPlan', () => {
  it('counts scoreable drum heads after normalizing decorated VexFlow keys', () => {
    const plan = buildTutorChartPlan([
      measure([
        {
          notes: ['c/5/x3', 'f/4', 'g/5/d0'],
          duration: 'q',
          dots: 0,
          isRest: false,
          tick: 0,
        },
        {
          notes: ['b/6'],
          duration: 'q',
          dots: 0,
          isRest: false,
          tick: 192,
        },
        {
          notes: ['c/5'],
          duration: 'qr',
          dots: 0,
          isRest: true,
          tick: 384,
        },
      ]),
    ]);

    expect(plan.measures[0].expectedKeys).toBe(3);
  });

  it('maps authored section ticks to the matching or next full measure boundary', () => {
    const empty: Measure['notes'] = [];
    const measures = [
      measure(empty, 0, 768),
      measure(empty, 768, 1536),
      measure(empty, 1536, 2304),
      measure(empty, 2304, 3072),
    ];

    expect([...sectionStartsForChart(measures, [0, 800, 2304, 9000])]).toEqual([
      0, 2, 3,
    ]);
  });
});
