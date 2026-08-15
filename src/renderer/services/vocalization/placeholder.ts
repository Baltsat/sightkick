import { VOCALIZATION_INVENTORY } from './inventory';
import type {
  PcmSample,
  VocalizationBank,
  VocalizationSampleId,
} from './types';

interface SynthesisShape {
  duration: number;
  pitch: number;
  formants: [number, number, number];
  noise: number;
}

const SHAPES: Record<VocalizationSampleId, SynthesisShape> = {
  kick_bum: {
    duration: 0.28,
    pitch: 92,
    formants: [480, 900, 2200],
    noise: 0.08,
  },
  snare_tak: {
    duration: 0.2,
    pitch: 155,
    formants: [720, 1250, 2600],
    noise: 0.34,
  },
  snare_accent_bak: {
    duration: 0.23,
    pitch: 135,
    formants: [650, 1100, 2450],
    noise: 0.48,
  },
  snare_ghost_ki: {
    duration: 0.14,
    pitch: 205,
    formants: [360, 2100, 2850],
    noise: 0.2,
  },
  hihat_closed_tyk: {
    duration: 0.13,
    pitch: 225,
    formants: [380, 1850, 2750],
    noise: 0.5,
  },
  hihat_open_tsa_short: {
    duration: 0.24,
    pitch: 180,
    formants: [720, 1300, 2500],
    noise: 0.72,
  },
  hihat_open_tsaa_long: {
    duration: 0.52,
    pitch: 170,
    formants: [720, 1300, 2500],
    noise: 0.65,
  },
  tom_high_tim: {
    duration: 0.22,
    pitch: 190,
    formants: [390, 1900, 2700],
    noise: 0.1,
  },
  tom_mid_tom: {
    duration: 0.25,
    pitch: 145,
    formants: [500, 1000, 2400],
    noise: 0.08,
  },
  tom_floor_dum: {
    duration: 0.3,
    pitch: 105,
    formants: [430, 900, 2200],
    noise: 0.07,
  },
  crash_ksh_short: {
    duration: 0.25,
    pitch: 180,
    formants: [500, 1700, 2900],
    noise: 0.9,
  },
  crash_kshh_long: {
    duration: 0.6,
    pitch: 165,
    formants: [500, 1700, 2900],
    noise: 0.92,
  },
  ride_din_short: {
    duration: 0.24,
    pitch: 210,
    formants: [360, 2050, 2950],
    noise: 0.25,
  },
  ride_diin_long: {
    duration: 0.55,
    pitch: 195,
    formants: [360, 2050, 2950],
    noise: 0.22,
  },
  breath_h: {
    duration: 0.2,
    pitch: 120,
    formants: [650, 1450, 2600],
    noise: 1,
  },
};

function seedFor(id: string) {
  return [...id].reduce(
    (seed, character) => (seed * 33 + character.charCodeAt(0)) >>> 0,
    5381,
  );
}

function synthesizeSample(
  id: VocalizationSampleId,
  sampleRate: number,
): PcmSample {
  const shape = SHAPES[id];
  const data = new Float32Array(Math.ceil(shape.duration * sampleRate));
  let seed = seedFor(id);

  for (let index = 0; index < data.length; index += 1) {
    const time = index / sampleRate;
    const position = index / data.length;
    const attack = Math.min(1, time / 0.012);
    const release = Math.min(1, (1 - position) / 0.24);
    const envelope = attack * release * (1 - position * 0.3);
    const consonant = Math.exp(-time * 45);

    seed = (seed * 1664525 + 1013904223) >>> 0;

    const noise = (seed / 0xffffffff) * 2 - 1;
    const pitchWobble = shape.pitch * (1 - position * 0.08);
    const voiced =
      Math.sin(2 * Math.PI * pitchWobble * time) * 0.3 +
      Math.sin(2 * Math.PI * shape.formants[0] * time) * 0.28 +
      Math.sin(2 * Math.PI * shape.formants[1] * time) * 0.18 +
      Math.sin(2 * Math.PI * shape.formants[2] * time) * 0.08;
    const noiseMix = shape.noise * (0.25 + consonant * 0.75);

    data[index] =
      envelope * (voiced * (1 - noiseMix * 0.55) + noise * noiseMix * 0.55);
  }

  const peak = data.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const gain = peak > 0 ? 0.68 / peak : 1;

  data.forEach((value, index) => {
    data[index] = value * gain;
  });

  return { sampleRate, data };
}

export function synthesizePlaceholderBank(
  sampleRate: number = 24000,
): VocalizationBank {
  return Object.fromEntries(
    VOCALIZATION_INVENTORY.map(({ sampleId }) => [
      sampleId,
      [synthesizeSample(sampleId, sampleRate)],
    ]),
  ) as VocalizationBank;
}
