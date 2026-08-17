import { describe, expect, it } from 'vitest';
import { parseStickingData, stickingNotesForMeasure } from '.';

describe('parseStickingData', () => {
  it('accepts exact generated hand and foot assignments', () => {
    expect(
      parseStickingData({
        version: 1,
        lessonId: '03.01',
        timeSignature: [4, 4],
        countInBars: 1,
        repeatCount: 4,
        bars: [
          {
            stepCount: 4,
            notes: [
              { step: 0, lane: 'K', symbol: 'x', limb: 'right-foot' },
              { step: 0, lane: 'S', symbol: 'x', limb: 'right-hand' },
              { step: 1, lane: 'S', symbol: 'x', limb: 'left-hand' },
            ],
          },
        ],
      }),
    ).toEqual({
      version: 1,
      lessonId: '03.01',
      timeSignature: [4, 4],
      countInBars: 1,
      repeatCount: 4,
      bars: [
        {
          stepCount: 4,
          notes: [
            { step: 0, lane: 'K', symbol: 'x', limb: 'right-foot' },
            { step: 0, lane: 'S', symbol: 'x', limb: 'right-hand' },
            { step: 1, lane: 'S', symbol: 'x', limb: 'left-hand' },
          ],
        },
      ],
    });
  });

  it('rejects malformed or out-of-range events', () => {
    expect(
      parseStickingData({
        version: 1,
        lessonId: '03.01',
        timeSignature: [4, 4],
        countInBars: 1,
        repeatCount: 4,
        bars: [
          {
            stepCount: 4,
            notes: [{ step: 4, lane: 'S', symbol: 'x', limb: 'right-hand' }],
          },
        ],
      }),
    ).toBeUndefined();
    expect(
      parseStickingData({
        version: 2,
        lessonId: '03.01',
        timeSignature: [4, 4],
        countInBars: 1,
        repeatCount: 4,
        bars: [],
      }),
    ).toBeUndefined();
  });

  it('rejects impossible limb assignments', () => {
    expect(
      parseStickingData({
        version: 1,
        lessonId: '03.01',
        timeSignature: [4, 4],
        countInBars: 1,
        repeatCount: 4,
        bars: [
          {
            stepCount: 4,
            notes: [{ step: 0, lane: 'K', symbol: 'x', limb: 'right-hand' }],
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('aligns authored bars after count-in and across repeats', () => {
    const sticking = parseStickingData({
      version: 1,
      lessonId: '03.01',
      timeSignature: [4, 4],
      countInBars: 1,
      repeatCount: 2,
      bars: [
        {
          stepCount: 4,
          notes: [{ step: 1, lane: 'S', symbol: 'x', limb: 'left-hand' }],
        },
      ],
    });

    expect(sticking).toBeDefined();
    expect(stickingNotesForMeasure(sticking!, 0, 0, 768, [4, 4])).toEqual([]);
    expect(stickingNotesForMeasure(sticking!, 1, 768, 1536, [4, 4])).toEqual([
      {
        step: 1,
        lane: 'S',
        symbol: 'x',
        limb: 'left-hand',
        tick: 960,
      },
    ]);
    expect(stickingNotesForMeasure(sticking!, 2, 1536, 2304, [4, 4])).toEqual([
      {
        step: 1,
        lane: 'S',
        symbol: 'x',
        limb: 'left-hand',
        tick: 1728,
      },
    ]);
    expect(stickingNotesForMeasure(sticking!, 3, 2304, 3072, [4, 4])).toEqual(
      [],
    );
    expect(stickingNotesForMeasure(sticking!, 1, 768, 1536, [3, 4])).toEqual(
      [],
    );
  });
});
