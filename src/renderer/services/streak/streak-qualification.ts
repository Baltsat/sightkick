import type { Measure } from '../../../chart-parser/types';

export interface StreakQualificationContext {
  resolution: number;
  measures: readonly Measure[];
  playbackSpeed: number;
  timingStandard?: 'target' | 'better' | 'ceiling';
}

const REFERENCE_SPEED = 0.8;
const activeTickCache = new WeakMap<readonly Measure[], number[]>();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function activeTicks(measures: readonly Measure[]): number[] {
  const cached = activeTickCache.get(measures);

  if (cached) {
    return cached;
  }

  const ticks = [
    ...new Set(
      measures.flatMap((measure) =>
        measure.notes.filter((note) => !note.isRest).map((note) => note.tick),
      ),
    ),
  ].sort((left, right) => left - right);

  activeTickCache.set(measures, ticks);

  return ticks;
}

function closestGap(
  ticks: readonly number[],
  tick: number,
): number | undefined {
  const index = ticks.indexOf(tick);
  const earlier = index > 0 ? tick - ticks[index - 1] : undefined;
  const later =
    index >= 0 && index < ticks.length - 1
      ? ticks[index + 1] - tick
      : undefined;
  const candidates = [earlier, later].filter(
    (candidate): candidate is number =>
      candidate !== undefined && candidate > 0,
  );

  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

export function streakCreditForTick(
  context: StreakQualificationContext | undefined,
  tick: number,
): number {
  if (!context || context.timingStandard !== 'target') {
    return 0;
  }

  const gap = closestGap(activeTicks(context.measures), tick);

  if (!gap || !Number.isFinite(context.resolution) || context.resolution <= 0) {
    return 0;
  }

  const density = clamp(context.resolution / (4 * gap), 0.25, 1.5);
  const tempo = clamp(context.playbackSpeed / REFERENCE_SPEED, 0.5, 1.25);

  return density * tempo;
}
