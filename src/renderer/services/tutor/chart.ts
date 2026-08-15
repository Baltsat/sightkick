import { Measure } from '../../../chart-parser/types';
import { KEY_TO_ELEMENT } from '../engine/constants';
import { keyPrefix } from '../engine/helpers';
import { TutorChartPlan } from './types';

const KIT_ELEMENTS = new Set([
  'kick',
  'snare',
  'hihat',
  'tom1',
  'tom2',
  'tom3',
  'ride',
  'crash',
]);

function expectedKeys(notes: Measure['notes'][number]['notes']): number {
  return notes.filter((key) =>
    KIT_ELEMENTS.has(KEY_TO_ELEMENT[keyPrefix(key)] ?? ''),
  ).length;
}

function beatCount(measure: Measure): number {
  const numerator = measure.timeSig?.[0] ?? 4;

  return measure.isCompound ? numerator / 3 : numerator;
}

function strongOnsets(measure: Measure): number[] {
  const numerator = measure.timeSig?.[0] ?? 4;
  const denominator = measure.timeSig?.[1] ?? 4;
  const span = measure.endTick - measure.startTick;
  const groupCount = Math.max(1, Math.round((numerator * 8) / denominator));
  const beats = beatCount(measure);
  const beatTicks = span / Math.max(1, beats);
  const playedOnsets = new Set(
    measure.notes.filter((note) => !note.isRest).map((note) => note.tick),
  );

  return Array.from(
    { length: groupCount },
    (_, index) => measure.startTick + Math.round((span * index) / groupCount),
  ).filter(
    (tick, index, ticks) =>
      (index === 0 || tick !== ticks[index - 1]) &&
      (playedOnsets.has(tick) ||
        Math.abs(
          (tick - measure.startTick) / beatTicks -
            Math.round((tick - measure.startTick) / beatTicks),
        ) < 0.001),
  );
}

export function sectionStartsForChart(
  measures: Measure[],
  sectionTicks: readonly number[],
): ReadonlySet<number> {
  const starts = new Set<number>(measures.length > 0 ? [0] : []);

  sectionTicks.forEach((tick) => {
    const boundary = measures.findIndex((measure) => measure.startTick >= tick);

    if (boundary >= 0) {
      starts.add(boundary);
    }
  });

  return starts;
}

export function buildTutorChartPlan(
  measures: Measure[],
  sectionStarts: ReadonlySet<number> = new Set([0]),
): TutorChartPlan {
  return {
    measures: measures.map((measure, index) => ({
      index,
      startTick: measure.startTick,
      endTick: measure.endTick,
      expectedKeys: measure.notes.reduce(
        (sum, note) => sum + (note.isRest ? 0 : expectedKeys(note.notes)),
        0,
      ),
      sectionStart: sectionStarts.has(index),
      beatCount: beatCount(measure),
      strongOnsets: strongOnsets(measure),
      noteOnsets: measure.notes
        .filter((note) => !note.isRest)
        .map((note) => ({
          tick: note.tick,
          expectedKeys: expectedKeys(note.notes),
        }))
        .filter(({ expectedKeys: count }) => count > 0),
    })),
  };
}
