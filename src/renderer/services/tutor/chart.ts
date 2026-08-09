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
        (sum, note) =>
          sum +
          (note.isRest
            ? 0
            : note.notes.filter((key) =>
                KIT_ELEMENTS.has(KEY_TO_ELEMENT[keyPrefix(key)] ?? ''),
              ).length),
        0,
      ),
      sectionStart: sectionStarts.has(index),
    })),
  };
}
