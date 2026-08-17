import type { Measure, ParsedChart } from '../../../chart-parser/types';
import type { RunSummary } from '../practice-stats';

export type OpeningSubdivision =
  | 'quarter'
  | 'eighth'
  | 'triplet'
  | 'sixteenth'
  | 'thirty-second';

export interface OpeningChartDemand {
  tempoBpm: number;
  subdivision: OpeningSubdivision;
  gapMsAtOneX: number;
  notesPerBeat: number;
  maxSimultaneousNotes: number;
}

export interface PracticeOpening {
  playbackSpeed: number;
  timingStandard: 'target';
  timingWindowMs: number;
  timingGapMs: number;
  effectiveTempoBpm: number;
  demand: OpeningChartDemand;
  evidenceRunCount: number;
  reason: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function firstTempo(chart: Pick<ParsedChart, 'tempos'>): number {
  const tempo = chart.tempos.find(
    ({ beatsPerMinute }) =>
      Number.isFinite(beatsPerMinute) && beatsPerMinute > 0,
  )?.beatsPerMinute;

  return tempo ?? 100;
}

function subdivisionFor(
  ticksPerBeat: number,
  smallestGapTicks: number,
): OpeningSubdivision {
  const notesPerBeat = ticksPerBeat / smallestGapTicks;

  if (Math.abs(notesPerBeat - 3) < 0.1) {
    return 'triplet';
  }

  if (notesPerBeat >= 6) {
    return 'thirty-second';
  }

  if (notesPerBeat >= 3.5) {
    return 'sixteenth';
  }

  if (notesPerBeat >= 1.5) {
    return 'eighth';
  }

  return 'quarter';
}

export function analyzeOpeningChart(
  chart: Pick<ParsedChart, 'resolution' | 'tempos'>,
  measures: readonly Measure[],
): OpeningChartDemand | undefined {
  if (!Number.isFinite(chart.resolution) || chart.resolution <= 0) {
    return undefined;
  }

  const notes = measures.flatMap((measure) =>
    measure.notes.filter((note) => !note.isRest),
  );
  const ticks = [...new Set(notes.map((note) => note.tick))].sort(
    (left, right) => left - right,
  );

  if (ticks.length === 0) {
    return undefined;
  }

  const gaps = ticks
    .slice(1)
    .map((tick, index) => tick - ticks[index])
    .filter((gap) => gap > 0);
  const smallestGapTicks = Math.min(...gaps, chart.resolution);
  const tempoBpm = firstTempo(chart);
  const notesPerBeat = chart.resolution / smallestGapTicks;
  const maxSimultaneousNotes = Math.max(
    ...ticks.map(
      (tick) => notes.find((note) => note.tick === tick)?.notes.length ?? 1,
    ),
  );

  return {
    tempoBpm,
    subdivision: subdivisionFor(chart.resolution, smallestGapTicks),
    gapMsAtOneX: 60_000 / (tempoBpm * notesPerBeat),
    notesPerBeat,
    maxSimultaneousNotes,
  };
}

function runMatchesSubdivision(
  run: RunSummary,
  subdivision: OpeningSubdivision,
): boolean {
  return Boolean(
    run.atomicSkillEvidence?.some(
      (event) =>
        event.skill_id.endsWith(`.${subdivision}`) ||
        event.context_signature.includes(`subdivision=${subdivision}`),
    ),
  );
}

function safeSpeed(
  demand: OpeningChartDemand,
  runs: readonly RunSummary[],
  currentRuns: readonly RunSummary[],
): { speed: number; currentChartEvidence: boolean } {
  const profileRelevant = runs.filter((run) =>
    runMatchesSubdivision(run, demand.subdivision),
  );
  const evidence = currentRuns.length > 0 ? currentRuns : profileRelevant;
  const latest = [...evidence].sort((left, right) =>
    right.completedAt.localeCompare(left.completedAt),
  )[0];
  const priorSpeed = latest?.playbackSpeed ?? 1;
  const priorGapMs = demand.gapMsAtOneX / priorSpeed;
  const hasLooseWindow =
    latest?.timingWindowMs !== undefined &&
    latest.timingWindowMs > priorGapMs / 2;
  const chartPressure =
    demand.notesPerBeat >= 6 || demand.maxSimultaneousNotes >= 3;
  const hasPoorTiming =
    latest !== undefined &&
    (latest.overallAccuracy < 0.85 ||
      Math.abs(latest.timingBias.meanMs) > demand.gapMsAtOneX / 3 ||
      latest.timingBias.spreadMs > demand.gapMsAtOneX / 3 ||
      hasLooseWindow);

  if (hasPoorTiming || (latest === undefined && chartPressure)) {
    return { speed: 0.5, currentChartEvidence: currentRuns.length > 0 };
  }

  return {
    speed: clamp(round(Math.min(0.7, 90 / demand.tempoBpm)), 0.5, 0.7),
    currentChartEvidence: false,
  };
}

export function selectPracticeOpening({
  chart,
  measures,
  runs,
  currentRuns = [],
}: {
  chart: Pick<ParsedChart, 'resolution' | 'tempos'>;
  measures: readonly Measure[];
  runs: readonly RunSummary[];
  currentRuns?: readonly RunSummary[];
}): PracticeOpening | undefined {
  const demand = analyzeOpeningChart(chart, measures);

  if (!demand) {
    return undefined;
  }

  const speed = safeSpeed(demand, runs, currentRuns);
  const playbackSpeed = speed.speed;
  const timingGapMs = demand.gapMsAtOneX / playbackSpeed;
  const timingWindowMs = timingGapMs / 3;
  const evidenceRunCount = runs.filter((run) =>
    runMatchesSubdivision(run, demand.subdivision),
  ).length;
  const reason = speed.currentChartEvidence
    ? 'This chart’s most recent run was not clean enough for a faster start.'
    : evidenceRunCount > 0
    ? `Recent ${demand.subdivision} evidence has not earned a faster start.`
    : `No ${demand.subdivision} evidence yet. Start near 90 BPM. Earn a clean pass at the target window.`;

  return {
    playbackSpeed,
    timingStandard: 'target',
    timingWindowMs: round(timingWindowMs),
    timingGapMs: round(timingGapMs),
    effectiveTempoBpm: round(demand.tempoBpm * playbackSpeed),
    demand,
    evidenceRunCount,
    reason,
  };
}

export function overridePracticeOpening(
  opening: PracticeOpening,
  playbackSpeed: number,
): PracticeOpening {
  const speed = clamp(round(playbackSpeed), 0.3, 2);
  const timingGapMs = opening.demand.gapMsAtOneX / speed;

  return {
    ...opening,
    playbackSpeed: speed,
    timingGapMs: round(timingGapMs),
    timingWindowMs: round(timingGapMs / 3),
    effectiveTempoBpm: round(opening.demand.tempoBpm * speed),
  };
}
