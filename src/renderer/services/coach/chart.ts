import { Measure, ParsedChart } from '../../../chart-parser/types';
import { KEY_TO_ELEMENT } from '../engine/constants';
import { KitElement } from '../practice-stats';
import { CoachChart } from './types';

const KIT_ELEMENTS = new Set<KitElement>([
  'kick',
  'snare',
  'hihat',
  'tom1',
  'tom2',
  'tom3',
  'ride',
  'crash',
]);

function isKitElement(value: string | undefined): value is KitElement {
  return value !== undefined && KIT_ELEMENTS.has(value as KitElement);
}

export function buildCoachChart(
  chart: ParsedChart,
  measures: Measure[],
): CoachChart {
  return {
    resolution: chart.resolution,
    tempos: chart.tempos.map((tempo) => ({
      tick: tempo.tick,
      bpm: tempo.beatsPerMinute,
    })),
    measures: measures.map((measure, index) => ({
      index,
      startTick: measure.startTick,
      endTick: measure.endTick,
      isCompound: measure.isCompound,
      tupletCount: measure.tuplets.length,
      notes: measure.notes.flatMap((note) =>
        note.isRest
          ? []
          : note.notes.flatMap((key) => {
              const element = KEY_TO_ELEMENT[key];

              return isKitElement(element)
                ? [{ tick: note.tick, element }]
                : [];
            }),
      ),
    })),
  };
}
