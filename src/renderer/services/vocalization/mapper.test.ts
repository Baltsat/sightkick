import { describe, expect, it } from 'vitest';
import type { Measure } from '../../../chart-parser/types';
import type { StickingData } from '../sticking';
import { mapVocalizationTrack } from './mapper';

const chart = {
  resolution: 480,
  tempos: [{ tick: 0, beatsPerMinute: 120, msTime: 0 }],
};

function measure(
  startTick: number,
  endTick: number,
  notes: Measure['notes'],
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

const countIn = measure(0, 1920, [
  {
    notes: ['g/5/x2'],
    duration: 'q',
    dots: 0,
    isRest: false,
    tick: 0,
  },
]);
const lessonMeasure = measure(1920, 3840, [
  {
    notes: ['f/4', 'g/5/x2'],
    duration: '16',
    dots: 0,
    isRest: false,
    tick: 1920,
  },
  { notes: ['c/5'], duration: '16', dots: 0, isRest: false, tick: 2160 },
  { notes: ['c/5'], duration: '16', dots: 0, isRest: false, tick: 2400 },
  { notes: ['c/5'], duration: '16', dots: 0, isRest: false, tick: 2640 },
  { notes: ['g/5/x2'], duration: '16', dots: 0, isRest: false, tick: 2880 },
  { notes: ['e/5'], duration: '16', dots: 0, isRest: false, tick: 3120 },
  { notes: ['a/5/x2'], duration: 'q', dots: 0, isRest: false, tick: 3360 },
  { notes: ['f/5/x2'], duration: '16', dots: 0, isRest: false, tick: 3600 },
]);
const sticking: StickingData = {
  version: 1,
  lessonId: '10.10',
  timeSignature: [4, 4],
  countInBars: 1,
  repeatCount: 1,
  bars: [
    {
      stepCount: 8,
      notes: [
        { step: 0, lane: 'K', symbol: 'X', limb: 'right-foot' },
        { step: 0, lane: 'H', symbol: 'x', limb: 'right-hand' },
        { step: 1, lane: 'S', symbol: 'x', limb: 'left-hand' },
        { step: 2, lane: 'S', symbol: 'X', limb: 'right-hand' },
        { step: 3, lane: 'S', symbol: 'g', limb: 'left-hand' },
        { step: 4, lane: 'H', symbol: 'o', limb: 'right-hand' },
        { step: 5, lane: 'T1', symbol: 'x', limb: 'left-hand' },
        { step: 6, lane: 'C', symbol: 'X', limb: 'right-hand' },
        { step: 7, lane: 'R', symbol: 'x', limb: 'right-hand' },
      ],
    },
  ],
};

describe('mapVocalizationTrack', () => {
  it('maps chart timing plus exact sticking into a deterministic syllable sequence', () => {
    const track = mapVocalizationTrack({
      chart,
      measures: [countIn, lessonMeasure],
      sticking,
    });

    expect(track.events.map((event) => event.syllable)).toEqual([
      'бум',
      'тык',
      'так',
      'бак',
      'ки',
      'ца',
      'тим',
      'кшш',
      'дин',
    ]);
    expect(track.events.map((event) => event.sampleId)).toEqual([
      'kick_bum',
      'hihat_closed_tyk',
      'snare_tak',
      'snare_accent_bak',
      'snare_ghost_ki',
      'hihat_open_tsa_short',
      'tom_high_tim',
      'crash_kshh_long',
      'ride_din_short',
    ]);
    expect(track.events[2]).toMatchObject({
      dynamic: 'normal',
      limb: 'left-hand',
    });
    expect(track.events[3]).toMatchObject({
      dynamic: 'accent',
      articulation: 'accent',
      limb: 'right-hand',
    });
    expect(track.events[4]).toMatchObject({
      dynamic: 'ghost',
      articulation: 'ghost',
      limb: 'left-hand',
    });
    expect(track.events[0].timeSeconds).toBeCloseTo(2);
    expect(track.durationSeconds).toBeCloseTo(4);
  });

  it('uses chart accents and ghosts when sticking metadata is absent', () => {
    const fallback = measure(0, 1920, [
      {
        notes: ['c/5', 'g/5/x2'],
        duration: '8',
        dots: 0,
        isRest: false,
        tick: 0,
        accents: ['c/5'],
      },
      {
        notes: ['c/5'],
        duration: '8',
        dots: 0,
        isRest: false,
        tick: 480,
        ghosts: ['c/5'],
      },
      {
        notes: ['b/4'],
        duration: 'q',
        dots: 0,
        isRest: true,
        tick: 960,
      },
    ]);
    const track = mapVocalizationTrack({
      chart,
      measures: [fallback],
      includeBreaths: true,
    });

    expect(track.events.map((event) => event.sampleId)).toEqual([
      'hihat_closed_tyk',
      'snare_accent_bak',
      'snare_ghost_ki',
      'breath_h',
    ]);
  });
});
