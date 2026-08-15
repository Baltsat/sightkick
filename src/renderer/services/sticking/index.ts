export type StickingLimb =
  | 'right-hand'
  | 'left-hand'
  | 'right-foot'
  | 'left-foot';

export interface StickingNote {
  step: number;
  lane: 'K' | 'S' | 'H' | 'O' | 'R' | 'C' | 'T1' | 'T2' | 'T3';
  symbol: string;
  limb: StickingLimb;
}

export interface StickingBar {
  stepCount: number;
  notes: StickingNote[];
}

export interface StickingData {
  version: 1;
  lessonId: string;
  timeSignature: [number, number];
  countInBars: number;
  repeatCount: number;
  patternFamily?: string;
  bars: StickingBar[];
}

const lanes = new Set(['K', 'S', 'H', 'O', 'R', 'C', 'T1', 'T2', 'T3']);
const limbs = new Set(['right-hand', 'left-hand', 'right-foot', 'left-foot']);
const symbols = new Set(['x', 'X', 'o', 'g', '1', '2', '3', '4', '5', '6']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNote(value: unknown, stepCount: number): value is StickingNote {
  if (!isRecord(value)) {
    return false;
  }

  const isKick = value.lane === 'K';
  const isFoot = value.limb === 'right-foot' || value.limb === 'left-foot';

  return (
    Number.isInteger(value.step) &&
    Number(value.step) >= 0 &&
    Number(value.step) < stepCount &&
    typeof value.lane === 'string' &&
    lanes.has(value.lane) &&
    typeof value.symbol === 'string' &&
    symbols.has(value.symbol) &&
    typeof value.limb === 'string' &&
    limbs.has(value.limb) &&
    isKick === isFoot
  );
}

export function parseStickingData(value: unknown): StickingData | undefined {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.lessonId !== 'string' ||
    !/^\d{2}\.\d{2}$/.test(value.lessonId) ||
    !Array.isArray(value.timeSignature) ||
    value.timeSignature.length !== 2 ||
    !value.timeSignature.every(
      (part) => Number.isInteger(part) && Number(part) > 0,
    ) ||
    !Number.isInteger(value.countInBars) ||
    Number(value.countInBars) < 0 ||
    !Number.isInteger(value.repeatCount) ||
    Number(value.repeatCount) <= 0 ||
    (value.patternFamily !== undefined &&
      (typeof value.patternFamily !== 'string' || !value.patternFamily)) ||
    !Array.isArray(value.bars) ||
    value.bars.length === 0
  ) {
    return undefined;
  }

  for (const bar of value.bars) {
    if (
      !isRecord(bar) ||
      !Number.isInteger(bar.stepCount) ||
      Number(bar.stepCount) <= 0 ||
      !Array.isArray(bar.notes) ||
      !bar.notes.every((note) => isNote(note, Number(bar.stepCount)))
    ) {
      return undefined;
    }

    const positions = bar.notes.map(
      (note) => `${(note as StickingNote).step}:${(note as StickingNote).lane}`,
    );

    if (new Set(positions).size !== positions.length) {
      return undefined;
    }

    for (let step = 0; step < Number(bar.stepCount); step += 1) {
      const handLimbs = bar.notes
        .filter(
          (note) =>
            (note as StickingNote).step === step &&
            (note as StickingNote).limb.endsWith('-hand'),
        )
        .map((note) => (note as StickingNote).limb);

      if (new Set(handLimbs).size !== handLimbs.length) {
        return undefined;
      }
    }
  }

  return value as unknown as StickingData;
}
