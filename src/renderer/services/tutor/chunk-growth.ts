import { REQUIRED_CONSECUTIVE_CLEAN_PASSES } from '../remediation/types';
import type {
  TutorChartPlan,
  TutorChunkAttemptQuality,
  TutorChunkGrowthPlan,
  TutorChunkGrowthState,
  TutorChunkStage,
  TutorChunkTransition,
  TutorChunkWindow,
  TutorRecoveryRegion,
} from './types';

export const MAX_TUTOR_CHUNK_WINDOWS = 8;

interface ChunkGrowthSettings {
  requiredQualifyingPasses?: number;
  maximumAttemptsPerWindow?: number;
  regressionFailureThreshold?: number;
  maximumTotalAttempts?: number;
}

interface ChunkGrowthResult {
  state: TutorChunkGrowthState;
  transition: TutorChunkTransition;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.trunc(value))
    : fallback;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function strongBoundaries(
  chart: TutorChartPlan,
  phrase: TutorRecoveryRegion,
): number[] {
  return uniqueSorted([
    phrase.startTick,
    ...chart.measures.flatMap(
      (measure) => measure.strongOnsets ?? [measure.startTick],
    ),
    ...chart.measures.map((measure) => measure.endTick),
    phrase.endTick,
  ]).filter((tick) => tick >= phrase.startTick && tick <= phrase.endTick);
}

function hardInterval(
  boundaries: readonly number[],
  hardTicks: readonly number[],
): { index: number; hardTick: number } {
  const usable = hardTicks
    .filter(
      (tick) =>
        Number.isFinite(tick) &&
        tick >= boundaries[0] &&
        tick <= boundaries.at(-1)!,
    )
    .sort((left, right) => left - right);
  const fallback = usable.at(Math.floor(usable.length / 2)) ?? boundaries[0];
  const counts = Array.from(
    { length: Math.max(1, boundaries.length - 1) },
    () => 0,
  );

  usable.forEach((tick) => {
    const nextBoundaryIndex = boundaries.findIndex(
      (boundary) => boundary > tick,
    );
    const index =
      nextBoundaryIndex === -1
        ? counts.length - 1
        : Math.max(0, Math.min(counts.length - 1, nextBoundaryIndex - 1));

    counts[index] += 1;
  });

  const maximum = Math.max(...counts);
  const index = Math.max(
    0,
    counts.findIndex((count) => count === maximum),
  );

  return {
    index,
    hardTick:
      usable.find(
        (tick) => tick >= boundaries[index] && tick < boundaries[index + 1],
      ) ?? fallback,
  };
}

function measureIndexForTick(
  chart: TutorChartPlan,
  tick: number,
  endBoundary: boolean,
): number {
  const index = chart.measures.findIndex((measure) =>
    endBoundary
      ? tick > measure.startTick && tick <= measure.endTick
      : tick >= measure.startTick && tick < measure.endTick,
  );

  return index >= 0 ? index : Math.max(0, chart.measures.length - 1);
}

function expectedKeys(
  chart: TutorChartPlan,
  startTick: number,
  endTick: number,
): number {
  return chart.measures.reduce((sum, measure) => {
    if (measure.endTick <= startTick || measure.startTick >= endTick) {
      return sum;
    }

    if (measure.noteOnsets) {
      return (
        sum +
        measure.noteOnsets
          .filter(({ tick }) => tick >= startTick && tick < endTick)
          .reduce((subtotal, onset) => subtotal + onset.expectedKeys, 0)
      );
    }

    return startTick <= measure.startTick && endTick >= measure.endTick
      ? sum + measure.expectedKeys
      : sum;
  }, 0);
}

function boundaryLabel(
  chart: TutorChartPlan,
  tick: number,
  endBoundary: boolean,
): string {
  const measureIndex = measureIndexForTick(chart, tick, endBoundary);
  const measure = chart.measures[measureIndex];

  if (!measure || tick === measure.endTick) {
    return `bar ${measureIndex + 1} end`;
  }

  const boundaries = measure.strongOnsets ?? [measure.startTick];
  const boundaryIndex = Math.max(0, boundaries.indexOf(tick));
  const beats = Math.max(1, measure.beatCount ?? 4);
  const groupsPerBeat = Math.max(1, boundaries.length / beats);
  const beatIndex = Math.floor(boundaryIndex / groupsPerBeat);
  const offset = boundaryIndex - beatIndex * groupsPerBeat;
  const beat = beatIndex + 1;
  const offsetLabel =
    Math.abs(groupsPerBeat - 2) < 0.001 && Math.abs(offset - 1) < 0.001
      ? `${beat}-and`
      : Math.abs(offset) < 0.001
      ? `${beat}`
      : `${beat}.${Math.round(offset) + 1}`;

  return `bar ${measureIndex + 1} beat ${offsetLabel}`;
}

function windowLabel(
  chart: TutorChartPlan,
  startTick: number,
  endTick: number,
): string {
  const startMeasure = measureIndexForTick(chart, startTick, false);
  const endMeasure = measureIndexForTick(chart, endTick, true);
  const startsAtBar = chart.measures[startMeasure]?.startTick === startTick;
  const endsAtBar = chart.measures[endMeasure]?.endTick === endTick;

  if (startsAtBar && endsAtBar) {
    return startMeasure === endMeasure
      ? `bar ${startMeasure + 1}`
      : `bars ${startMeasure + 1}–${endMeasure + 1}`;
  }

  const start = boundaryLabel(chart, startTick, false);
  const end = boundaryLabel(chart, endTick, true);

  if (startMeasure === endMeasure) {
    return `${start.replace(
      `bar ${startMeasure + 1} `,
      `bar ${startMeasure + 1} · `,
    )} → ${end.replace(`bar ${endMeasure + 1} `, '')}`;
  }

  return `${start} → ${end}`;
}

function chunkWindow(
  chart: TutorChartPlan,
  boundaries: readonly number[],
  startIndex: number,
  endIndex: number,
  stage: TutorChunkStage,
): TutorChunkWindow {
  const startTick = boundaries[startIndex];
  const endTick = boundaries[endIndex];

  return {
    startMeasure: measureIndexForTick(chart, startTick, false),
    endMeasure: measureIndexForTick(chart, endTick, true),
    startTick,
    endTick,
    stage,
    expectedKeys: expectedKeys(chart, startTick, endTick),
    label: windowLabel(chart, startTick, endTick),
  };
}

export function planTutorChunkGrowth(
  chart: TutorChartPlan,
  phrase: TutorRecoveryRegion,
  hardTicks: readonly number[],
): TutorChunkGrowthPlan {
  const boundaries = strongBoundaries(chart, phrase);

  if (boundaries.length < 2) {
    return {
      phrase,
      hardTick: phrase.startTick,
      windows: [],
    };
  }

  const hard = hardInterval(boundaries, hardTicks);
  const phraseEndIndex = boundaries.length - 1;
  const halfBoundaryIndex = Math.max(1, Math.floor(phraseEndIndex / 2));
  const seedStart = Math.min(hard.index, phraseEndIndex - 1);
  const seedEnd = seedStart + 1;
  const hardHalfStart = seedStart < halfBoundaryIndex ? 0 : halfBoundaryIndex;
  const hardHalfEnd =
    seedStart < halfBoundaryIndex ? halfBoundaryIndex : phraseEndIndex;
  const growthBudget = MAX_TUTOR_CHUNK_WINDOWS - 2;
  const rightTurns = Math.ceil(growthBudget / 2);
  const leftTurns = Math.floor(growthBudget / 2);
  const rightStride = Math.max(
    1,
    Math.ceil((hardHalfEnd - seedEnd) / Math.max(1, rightTurns)),
  );
  const leftStride = Math.max(
    1,
    Math.ceil((seedStart - hardHalfStart) / Math.max(1, leftTurns)),
  );
  let startIndex = seedStart;
  let endIndex = seedEnd;
  const windows = [
    chunkWindow(chart, boundaries, startIndex, endIndex, 'seed'),
  ];

  for (
    let step = 0;
    step < growthBudget &&
    (startIndex > hardHalfStart || endIndex < hardHalfEnd);
    step += 1
  ) {
    const growRight = step % 2 === 0;
    let stage: TutorChunkStage;

    if (growRight && endIndex < hardHalfEnd) {
      endIndex = Math.min(hardHalfEnd, endIndex + rightStride);
      stage = 'grow-right';
    } else if (startIndex > hardHalfStart) {
      startIndex = Math.max(hardHalfStart, startIndex - leftStride);
      stage = 'grow-left';
    } else {
      endIndex = Math.min(hardHalfEnd, endIndex + rightStride);
      stage = 'grow-right';
    }

    if (startIndex === hardHalfStart && endIndex === hardHalfEnd) {
      stage = 'half';
    }

    windows.push(chunkWindow(chart, boundaries, startIndex, endIndex, stage));
  }

  if (startIndex !== hardHalfStart || endIndex !== hardHalfEnd) {
    startIndex = hardHalfStart;
    endIndex = hardHalfEnd;
    windows.push(chunkWindow(chart, boundaries, startIndex, endIndex, 'half'));
  }

  if (startIndex !== 0 || endIndex !== phraseEndIndex) {
    windows.push(chunkWindow(chart, boundaries, 0, phraseEndIndex, 'full'));
  } else {
    windows[windows.length - 1] = {
      ...windows.at(-1)!,
      stage: 'full',
    };
  }

  while (windows.length > MAX_TUTOR_CHUNK_WINDOWS) {
    windows.splice(Math.max(1, windows.length - 3), 1);
  }

  return {
    phrase,
    hardTick: hard.hardTick,
    windows,
  };
}

export function createTutorChunkGrowthState(
  plan: TutorChunkGrowthPlan,
  settings: ChunkGrowthSettings = {},
): TutorChunkGrowthState {
  const maximumAttemptsPerWindow = positiveInteger(
    settings.maximumAttemptsPerWindow,
    4,
  );

  return {
    plan,
    status: 'active',
    activeWindowIndex: 0,
    attemptsAtWindow: 0,
    totalAttempts: 0,
    qualifyingPasses: 0,
    consecutiveFailures: 0,
    requiredQualifyingPasses: positiveInteger(
      settings.requiredQualifyingPasses,
      REQUIRED_CONSECUTIVE_CLEAN_PASSES,
    ),
    maximumAttemptsPerWindow,
    regressionFailureThreshold: positiveInteger(
      settings.regressionFailureThreshold,
      2,
    ),
    maximumTotalAttempts: positiveInteger(
      settings.maximumTotalAttempts,
      Math.max(1, plan.windows.length) * maximumAttemptsPerWindow,
    ),
  };
}

export function recordTutorChunkAttempt(
  state: TutorChunkGrowthState,
  quality: TutorChunkAttemptQuality,
): ChunkGrowthResult {
  if (state.status !== 'active') {
    return {
      state,
      transition: state.status === 'mastered' ? 'master' : 'defer',
    };
  }

  const attemptsAtWindow = state.attemptsAtWindow + 1;
  const totalAttempts = state.totalAttempts + 1;
  const qualifyingPasses =
    quality === 'qualifying'
      ? state.qualifyingPasses + 1
      : quality === 'failed'
      ? Math.max(0, state.qualifyingPasses - 1)
      : state.qualifyingPasses;
  const consecutiveFailures =
    quality === 'failed' ? state.consecutiveFailures + 1 : 0;
  const attempted = {
    ...state,
    attemptsAtWindow,
    totalAttempts,
    qualifyingPasses,
    consecutiveFailures,
  };

  if (
    quality === 'qualifying' &&
    qualifyingPasses >= state.requiredQualifyingPasses
  ) {
    const lastWindow = state.activeWindowIndex >= state.plan.windows.length - 1;

    return lastWindow
      ? {
          state: { ...attempted, status: 'mastered' },
          transition: 'master',
        }
      : {
          state: {
            ...attempted,
            activeWindowIndex: state.activeWindowIndex + 1,
            attemptsAtWindow: 0,
            qualifyingPasses: 0,
            consecutiveFailures: 0,
          },
          transition: 'expand',
        };
  }

  const totalLimitReached = totalAttempts >= state.maximumTotalAttempts;
  const windowLimitReached = attemptsAtWindow >= state.maximumAttemptsPerWindow;

  if (totalLimitReached) {
    return {
      state: { ...attempted, status: 'deferred' },
      transition: 'defer',
    };
  }

  if (
    (windowLimitReached ||
      consecutiveFailures >= state.regressionFailureThreshold) &&
    state.activeWindowIndex > 0
  ) {
    return {
      state: {
        ...attempted,
        activeWindowIndex: state.activeWindowIndex - 1,
        attemptsAtWindow: 0,
        qualifyingPasses: 0,
        consecutiveFailures: 0,
      },
      transition: 'regress',
    };
  }

  if (windowLimitReached) {
    return {
      state: { ...attempted, status: 'deferred' },
      transition: 'defer',
    };
  }

  return { state: attempted, transition: 'repeat' };
}
