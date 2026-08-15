import { describe, expect, it } from 'vitest';
import { parseStickingData } from '.';

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
});
