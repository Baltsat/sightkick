import { encodePcm16Wav } from './wav';
import type {
  PcmSample,
  RenderedVocalizationTrack,
  VocalizationBank,
  VocalizationTrack,
} from './types';

function sampleAtRate(sample: PcmSample, sampleRate: number): Float32Array {
  if (sample.sampleRate === sampleRate) {
    return sample.data;
  }

  const output = new Float32Array(
    Math.max(
      1,
      Math.round((sample.data.length * sampleRate) / sample.sampleRate),
    ),
  );

  for (let index = 0; index < output.length; index += 1) {
    const sourcePosition = (index * sample.sampleRate) / sampleRate;
    const before = Math.floor(sourcePosition);
    const after = Math.min(sample.data.length - 1, before + 1);
    const fraction = sourcePosition - before;

    output[index] =
      sample.data[before] * (1 - fraction) + sample.data[after] * fraction;
  }

  return output;
}

export function renderVocalizationTrack(
  track: VocalizationTrack,
  bank: VocalizationBank,
  sampleRate: number = 24000,
): RenderedVocalizationTrack {
  const eventSamples = track.events.map((event, index) => {
    const variants = bank[event.sampleId];

    if (variants.length === 0) {
      throw new Error(`voice bank has no samples for ${event.sampleId}`);
    }

    const variant = variants[Math.abs(event.tick + index) % variants.length];

    return {
      event,
      data: sampleAtRate(variant, sampleRate),
    };
  });
  const lastSample = eventSamples.reduce(
    (end, { event, data }) =>
      Math.max(end, Math.round(event.timeSeconds * sampleRate) + data.length),
    Math.round(track.durationSeconds * sampleRate),
  );
  const data = new Float32Array(Math.max(1, lastSample));

  eventSamples.forEach(({ event, data: eventData }) => {
    const start = Math.max(0, Math.round(event.timeSeconds * sampleRate));

    eventData.forEach((value, offset) => {
      if (start + offset < data.length) {
        data[start + offset] += value * event.gain;
      }
    });
  });

  const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const limiter = peak > 0.96 ? 0.96 / peak : 1;

  if (limiter < 1) {
    data.forEach((value, index) => {
      data[index] = value * limiter;
    });
  }

  const wavBytes = encodePcm16Wav({ sampleRate, data });

  return { sampleRate, data, wavBytes };
}
