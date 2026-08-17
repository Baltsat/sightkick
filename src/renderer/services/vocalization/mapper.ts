import type { Measure, Note, ParsedChart } from '../../../chart-parser/types';
import { ticksToSeconds } from '../../../chart-parser/timing';
import {
  stickingNotesForMeasure,
  type PositionedStickingNote,
  type StickingData,
  type StickingNote,
} from '../sticking';
import { SYLLABLE_BY_SAMPLE } from './inventory';
import type {
  VocalizationArticulation,
  VocalizationEvent,
  VocalizationSampleId,
  VocalizationTrack,
  VocalizationVoice,
} from './types';

type TimingChart = Pick<ParsedChart, 'resolution' | 'tempos'>;

type Dynamic = VocalizationEvent['dynamic'];

type Length = VocalizationEvent['length'];

export interface VocalizationMappingInput {
  chart: TimingChart;
  measures: Measure[];
  sticking?: StickingData;
  delaySeconds?: number;
  includeBreaths?: boolean;
}

const VOICE_ORDER: Record<VocalizationVoice, number> = {
  kick: 0,
  hihat: 1,
  ride: 2,
  crash: 3,
  snare: 4,
  tom1: 5,
  tom2: 6,
  tom3: 7,
  breath: 8,
};
const KEYS_BY_LANE: Record<StickingNote['lane'], string[]> = {
  K: ['f/4', 'e/4'],
  S: ['c/5'],
  H: ['g/5/x2', 'g/5'],
  O: ['g/5/x2', 'g/5'],
  R: ['f/5/x2', 'f/5'],
  C: ['a/5/x2', 'a/5'],
  T1: ['e/5'],
  T2: ['d/5'],
  T3: ['a/4'],
};
const LANE_BY_KEY: Record<string, StickingNote['lane']> = {
  'e/4': 'K',
  'f/4': 'K',
  'c/5': 'S',
  'g/5': 'H',
  'g/5/x2': 'H',
  'f/5': 'R',
  'f/5/x2': 'R',
  'a/5': 'C',
  'a/5/x2': 'C',
  'e/5': 'T1',
  'd/5': 'T2',
  'a/4': 'T3',
};
const VOICE_BY_LANE: Record<StickingNote['lane'], VocalizationVoice> = {
  K: 'kick',
  S: 'snare',
  H: 'hihat',
  O: 'hihat',
  R: 'ride',
  C: 'crash',
  T1: 'tom1',
  T2: 'tom2',
  T3: 'tom3',
};

function dynamicForSymbol(symbol: string): Dynamic {
  if (symbol === 'X' || symbol === '5' || symbol === '6') {
    return 'accent';
  }

  if (symbol === 'g' || symbol === '1' || symbol === '2') {
    return 'ghost';
  }

  return 'normal';
}

function isSustained(note: Note | undefined): boolean {
  return Boolean(note && ['w', 'h', 'q'].includes(note.duration));
}

function sampleFor(
  lane: StickingNote['lane'],
  symbol: string,
  length: Length,
): VocalizationSampleId {
  if (lane === 'S') {
    const dynamic = dynamicForSymbol(symbol);

    if (dynamic === 'accent') {
      return 'snare_accent_bak';
    }

    if (dynamic === 'ghost') {
      return 'snare_ghost_ki';
    }

    return 'snare_tak';
  }

  if (lane === 'K') {
    return 'kick_bum';
  }

  if (lane === 'H' || lane === 'O') {
    const isOpen = lane === 'O' || symbol === 'o';

    if (!isOpen) {
      return 'hihat_closed_tyk';
    }

    return length === 'sustained'
      ? 'hihat_open_tsaa_long'
      : 'hihat_open_tsa_short';
  }

  if (lane === 'T1') {
    return 'tom_high_tim';
  }

  if (lane === 'T2') {
    return 'tom_mid_tom';
  }

  if (lane === 'T3') {
    return 'tom_floor_dum';
  }

  if (lane === 'C') {
    return length === 'sustained' ? 'crash_kshh_long' : 'crash_ksh_short';
  }

  return length === 'sustained' ? 'ride_diin_long' : 'ride_din_short';
}

function articulationFor(
  lane: StickingNote['lane'],
  symbol: string,
  length: Length,
): VocalizationArticulation {
  const dynamic = dynamicForSymbol(symbol);

  if (lane === 'S' && dynamic !== 'normal') {
    return dynamic;
  }

  if ((lane === 'H' || lane === 'O') && (lane === 'O' || symbol === 'o')) {
    return 'open';
  }

  if (lane === 'C' || lane === 'R') {
    return length;
  }

  return dynamic;
}

function gainForDynamic(dynamic: Dynamic): number {
  if (dynamic === 'accent') {
    return 1;
  }

  if (dynamic === 'ghost') {
    return 0.42;
  }

  return 0.76;
}

function noteForLane(
  measure: Measure,
  tick: number,
  lane: StickingNote['lane'],
) {
  return measure.notes.find(
    (note) =>
      !note.isRest &&
      note.tick === tick &&
      note.notes.some((key) => KEYS_BY_LANE[lane].includes(key)),
  );
}

function eventForStickingNote(
  note: PositionedStickingNote,
  measure: Measure,
  chart: TimingChart,
  delaySeconds: number,
): VocalizationEvent {
  const chartNote = noteForLane(measure, note.tick, note.lane);
  const length: Length = isSustained(chartNote) ? 'sustained' : 'staccato';
  const dynamic = dynamicForSymbol(note.symbol);
  const sampleId = sampleFor(note.lane, note.symbol, length);

  return {
    tick: note.tick,
    timeSeconds:
      ticksToSeconds(note.tick, chart.resolution, chart.tempos) + delaySeconds,
    voice: VOICE_BY_LANE[note.lane],
    articulation: articulationFor(note.lane, note.symbol, length),
    dynamic,
    length,
    sampleId,
    syllable: SYLLABLE_BY_SAMPLE[sampleId],
    gain: gainForDynamic(dynamic),
    limb: note.limb,
  };
}

function fallbackEvents(
  measure: Measure,
  chart: TimingChart,
  delaySeconds: number,
): VocalizationEvent[] {
  return measure.notes.flatMap((note) => {
    if (note.isRest) {
      return [];
    }

    return note.notes.flatMap((key) => {
      const lane = LANE_BY_KEY[key];

      if (!lane) {
        return [];
      }

      const symbol = note.ghosts?.includes(key)
        ? 'g'
        : note.accents?.includes(key)
        ? 'X'
        : 'x';
      const positioned: PositionedStickingNote = {
        step: 0,
        lane,
        symbol,
        limb: lane === 'K' ? 'right-foot' : 'right-hand',
        tick: note.tick,
      };

      return [eventForStickingNote(positioned, measure, chart, delaySeconds)];
    });
  });
}

function breathEvents(
  measure: Measure,
  chart: TimingChart,
  delaySeconds: number,
): VocalizationEvent[] {
  return measure.notes
    .filter((note) => note.isRest && ['w', 'h', 'q'].includes(note.duration))
    .map((note) => ({
      tick: note.tick,
      timeSeconds:
        ticksToSeconds(note.tick, chart.resolution, chart.tempos) +
        delaySeconds,
      voice: 'breath' as const,
      articulation: 'breath' as const,
      dynamic: 'ghost' as const,
      length: 'staccato' as const,
      sampleId: 'breath_h' as const,
      syllable: SYLLABLE_BY_SAMPLE.breath_h,
      gain: 0.32,
    }));
}

function isAuthoredMeasure(sticking: StickingData, measureIndex: number) {
  const authoredIndex = measureIndex - sticking.countInBars;

  return (
    authoredIndex >= 0 &&
    authoredIndex < sticking.bars.length * sticking.repeatCount
  );
}

export function mapVocalizationTrack({
  chart,
  measures,
  sticking,
  delaySeconds = 0,
  includeBreaths = false,
}: VocalizationMappingInput): VocalizationTrack {
  const events = measures.flatMap((measure, measureIndex) => {
    if (sticking && !isAuthoredMeasure(sticking, measureIndex)) {
      return [];
    }

    const voiceEvents = sticking
      ? stickingNotesForMeasure(
          sticking,
          measureIndex,
          measure.startTick,
          measure.endTick,
          measure.timeSig,
        ).map((note) =>
          eventForStickingNote(note, measure, chart, delaySeconds),
        )
      : fallbackEvents(measure, chart, delaySeconds);

    return includeBreaths
      ? [...voiceEvents, ...breathEvents(measure, chart, delaySeconds)]
      : voiceEvents;
  });

  events.sort(
    (left, right) =>
      left.tick - right.tick ||
      VOICE_ORDER[left.voice] - VOICE_ORDER[right.voice],
  );

  const endTick = measures.at(-1)?.endTick ?? 0;

  return {
    events,
    durationSeconds:
      ticksToSeconds(endTick, chart.resolution, chart.tempos) + delaySeconds,
  };
}
