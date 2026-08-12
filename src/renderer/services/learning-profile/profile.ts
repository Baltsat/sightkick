import type {
  PersistedCoachFindingEvidence,
  RunSummary,
} from '../practice-stats';
import { axesForDrumSkillTag, axesForKitElement } from './mappings';
import {
  DRUM_SKILL_AXES,
  DrumLearningProfile,
  DrumSkillAxisId,
  DrumSkillAxisProfile,
  SkillConfidence,
  SkillLimitingFactor,
  SkillTrend,
} from './types';

/** RunSummary now carries optional authoredSkills; the alias keeps call sites semantic. */
export type LearningProfileRun = RunSummary;

interface Signal {
  axis: DrumSkillAxisId;
  runIndex: number;
  score: number;
  weight: number;
  factorKey: string;
  factorLabel: string;
  factorDetail: string;
}

interface SafeRun {
  source: Record<string, unknown>;
  originalIndex: number;
  timestamp: number;
  completedAt?: string;
  accuracy?: number;
  attempts: number;
  speed: number;
}

const NEUTRAL_SCORE = 50;
const PRIOR_WEIGHT = 1.5;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function nonNegative(value: unknown): number {
  return Math.max(0, finite(value) ?? 0);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function round(value: number, digits = 0): number {
  const multiplier = 10 ** digits;

  return Math.round(value * multiplier) / multiplier;
}

function safeAccuracy(source: Record<string, unknown>): {
  accuracy?: number;
  attempts: number;
} {
  const hits = nonNegative(source.totalHits);
  const misses = nonNegative(source.totalMisses);
  const attempts = hits + misses;

  if (attempts > 0) {
    return { accuracy: clamp(hits / attempts, 0, 1), attempts };
  }

  const accuracy = finite(source.overallAccuracy);

  return {
    accuracy:
      accuracy === undefined || accuracy < 0 || accuracy > 1
        ? undefined
        : accuracy,
    attempts,
  };
}

function safeSpeed(source: Record<string, unknown>): number {
  const speed = finite(source.playbackSpeed);

  if (speed !== undefined && speed > 0) {
    return clamp(speed, 0.4, 1.1);
  }

  // A legacy Perform result is full-speed evidence. Missing Practice speed is
  // intentionally conservative because its demonstrated tempo is unknown.
  return source.mode === 'practice' ? 0.8 : 1;
}

function demonstratedScore(accuracy: number, speed: number): number {
  const tempoFactor = 0.65 + 0.35 * Math.min(1, speed);

  return 100 * accuracy * tempoFactor;
}

function sampleWeight(samples: number, ceiling = 2.5): number {
  return clamp(Math.log10(Math.max(0, samples) + 1), 0.35, ceiling);
}

function addSignal(
  signals: Signal[],
  signal: Omit<Signal, 'score' | 'weight'> & { score: number; weight: number },
): void {
  if (!Number.isFinite(signal.score) || !Number.isFinite(signal.weight)) {
    return;
  }

  signals.push({
    ...signal,
    score: clamp(signal.score, 0, 100),
    weight: clamp(signal.weight, 0.05, 4),
  });
}

function addLaneSignals(
  signals: Signal[],
  run: SafeRun,
  laneValue: unknown,
): void {
  const lane = record(laneValue);

  if (!lane) {
    return;
  }

  const axes = axesForKitElement(lane.element);

  if (axes.length === 0) {
    return;
  }

  const hits = nonNegative(lane.hits);
  const misses = nonNegative(lane.misses);
  const samples = hits + misses;
  const serializedAccuracy = finite(lane.accuracy);
  const accuracy =
    samples > 0
      ? hits / samples
      : serializedAccuracy === undefined ||
        serializedAccuracy < 0 ||
        serializedAccuracy > 1
      ? undefined
      : serializedAccuracy;

  if (accuracy === undefined) {
    return;
  }

  const label = String(lane.element);
  const score = demonstratedScore(accuracy, run.speed);

  axes.forEach((axis, axisIndex) => {
    addSignal(signals, {
      axis,
      runIndex: run.originalIndex,
      score,
      weight: sampleWeight(samples || 1) * (axisIndex === 0 ? 1 : 0.45),
      factorKey: `lane-${label}`,
      factorLabel: `${label} accuracy`,
      factorDetail: `${Math.round(
        accuracy * 100,
      )}% ${label} accuracy at ${Math.round(run.speed * 100)}% tempo.`,
    });
  });
}

function addLaneBiasSignals(
  signals: Signal[],
  run: SafeRun,
  biasValue: unknown,
): void {
  const bias = record(biasValue);
  const meanMs = finite(bias?.meanMs);
  const samples = nonNegative(bias?.sampleCount);

  if (!bias || meanMs === undefined || samples <= 0) {
    return;
  }

  const axes = axesForKitElement(bias.element);
  const score = clamp(100 - Math.abs(meanMs) * 0.8, 0, 100);
  const direction = meanMs < 0 ? 'early' : 'late';

  axes.slice(0, 1).forEach((axis) => {
    addSignal(signals, {
      axis,
      runIndex: run.originalIndex,
      score,
      weight: sampleWeight(samples, 1.5) * 0.35,
      factorKey: `lane-centering-${String(bias.element)}`,
      factorLabel: `${String(bias.element)} centering`,
      factorDetail: `${String(bias.element)} averaged ${Math.round(
        Math.abs(meanMs),
      )} ms ${direction}.`,
    });
  });
}

function addTagPerformance(
  signals: Signal[],
  run: SafeRun,
  tag: unknown,
  weight = 0.6,
): void {
  if (run.accuracy === undefined) {
    return;
  }

  const accuracy = run.accuracy;

  axesForDrumSkillTag(tag).forEach((axis) => {
    addSignal(signals, {
      axis,
      runIndex: run.originalIndex,
      score: demonstratedScore(accuracy, run.speed),
      weight,
      factorKey: `skill-${String(tag)}`,
      factorLabel: `${String(tag)} execution`,
      factorDetail: `Demonstrated while practising ${String(tag)}.`,
    });
  });
}

function addLearningEvidence(
  signals: Signal[],
  run: SafeRun,
  source: Record<string, unknown>,
): void {
  const learningEvidence = record(source.learningEvidence);
  const skills = record(learningEvidence?.skills);

  if (skills) {
    Object.entries(skills).forEach(([tag, countsValue]) => {
      const counts = record(countsValue);
      const axes = axesForDrumSkillTag(tag);

      if (axes.length === 0) {
        return;
      }

      const components = [
        {
          count: nonNegative(counts?.recoveryCleanCount),
          score: 82,
          key: 'recovery-success',
          label: 'Recovered repetitions',
          detail: `Recovered ${tag} repetitions were completed.`,
        },
        {
          count: nonNegative(counts?.recoveryRetryCount),
          score: 42,
          key: 'recovery-retries',
          label: 'Recovery retries',
          detail: `${tag} needed additional recovery attempts.`,
        },
        {
          count: nonNegative(counts?.recoveryDeferredCount),
          score: 28,
          key: 'recovery-deferred',
          label: 'Deferred recovery',
          detail: `${tag} recovery was deferred for later practice.`,
        },
        {
          count: nonNegative(counts?.troubleCount),
          score: 45,
          key: 'trouble-patterns',
          label: 'Trouble patterns',
          detail: `${tag} triggered focused recovery.`,
        },
      ];

      components.forEach((component) => {
        if (component.count <= 0) {
          return;
        }

        axes.forEach((axis) => {
          addSignal(signals, {
            axis,
            runIndex: run.originalIndex,
            score: component.score,
            weight: sampleWeight(component.count, 1.4),
            factorKey: `${component.key}-${tag}`,
            factorLabel: component.label,
            factorDetail: component.detail,
          });
        });
      });

      addTagPerformance(signals, run, tag, 0.65);
    });
  }

  array(source.authoredSkills).forEach((tag) =>
    addTagPerformance(signals, run, tag, 0.55),
  );
}

function coachWeaknessScore(severity: unknown): number {
  if (severity === 'high') {
    return 32;
  }

  if (severity === 'medium') {
    return 48;
  }

  return severity === 'low' ? 64 : 50;
}

function addCoachEvidence(
  signals: Signal[],
  run: SafeRun,
  findingValue: unknown,
): void {
  const finding = record(findingValue) as
    | (Record<string, unknown> & Partial<PersistedCoachFindingEvidence>)
    | undefined;

  if (!finding) {
    return;
  }

  const axes = [
    ...axesForDrumSkillTag(finding.skillTag),
    ...axesForKitElement(finding.lane),
  ];
  const uniqueAxes = [...new Set(axes)];

  if (uniqueAxes.length === 0) {
    return;
  }

  const samples = nonNegative(finding.sampleCount);
  const score = coachWeaknessScore(finding.severity);

  uniqueAxes.forEach((axis) => {
    addSignal(signals, {
      axis,
      runIndex: run.originalIndex,
      score,
      weight: sampleWeight(samples || 1, 1.8),
      factorKey: `coach-${String(
        finding.kind || finding.skillTag || 'finding',
      )}`,
      factorLabel: 'Coach finding',
      factorDetail: `${String(finding.skillTag || 'This skill')} has a ${String(
        finding.severity || 'reported',
      )} Coach finding from ${Math.round(samples)} samples.`,
    });
  });
}

function safeRuns(
  input: readonly LearningProfileRun[] | null | undefined,
): SafeRun[] {
  return array(input).flatMap((value, originalIndex) => {
    const source = record(value);

    if (!source) {
      return [];
    }

    const { accuracy, attempts } = safeAccuracy(source);
    const completedAt =
      typeof source.completedAt === 'string' ? source.completedAt : undefined;
    const parsed = completedAt ? Date.parse(completedAt) : Number.NaN;

    return [
      {
        source,
        originalIndex,
        timestamp: Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY,
        completedAt: Number.isFinite(parsed) ? completedAt : undefined,
        accuracy,
        attempts,
        speed: safeSpeed(source),
      },
    ];
  });
}

function signalsForRuns(runs: readonly SafeRun[]): Signal[] {
  const signals: Signal[] = [];

  runs.forEach((run) => {
    const source = run.source;

    if (run.accuracy !== undefined) {
      const execution = demonstratedScore(run.accuracy, run.speed);
      const weight = sampleWeight(run.attempts || 1);

      addSignal(signals, {
        axis: 'groove-pocket',
        runIndex: run.originalIndex,
        score: execution,
        weight,
        factorKey: 'execution-accuracy',
        factorLabel: 'Sustained accuracy',
        factorDetail: `${Math.round(
          run.accuracy * 100,
        )}% accuracy at ${Math.round(run.speed * 100)}% tempo.`,
      });
      addSignal(signals, {
        axis: 'limb-coordination',
        runIndex: run.originalIndex,
        score: execution,
        weight: weight * 0.55,
        factorKey: 'execution-accuracy',
        factorLabel: 'Whole-kit accuracy',
        factorDetail:
          'Overall scored notes provide a broad coordination signal.',
      });
    }

    const timing = record(source.timingBias);
    const timingSamples = nonNegative(timing?.sampleCount);
    const meanMs = finite(timing?.meanMs);
    const spreadMs = finite(timing?.spreadMs);

    if (timingSamples > 0 && meanMs !== undefined && spreadMs !== undefined) {
      const centering = clamp(100 - Math.abs(meanMs) * 0.65, 0, 100);
      const stability = clamp(100 - Math.max(0, spreadMs) * 0.9, 0, 100);
      const weight = sampleWeight(timingSamples);

      addSignal(signals, {
        axis: 'pulse-timing',
        runIndex: run.originalIndex,
        score: centering,
        weight,
        factorKey: 'timing-centering',
        factorLabel: 'Beat centering',
        factorDetail: `Average timing bias was ${Math.round(
          Math.abs(meanMs),
        )} ms ${meanMs < 0 ? 'early' : 'late'}.`,
      });
      addSignal(signals, {
        axis: 'pulse-timing',
        runIndex: run.originalIndex,
        score: stability,
        weight,
        factorKey: 'timing-stability',
        factorLabel: 'Timing stability',
        factorDetail: `Timing spread was ${Math.round(
          Math.max(0, spreadMs),
        )} ms.`,
      });
      addSignal(signals, {
        axis: 'groove-pocket',
        runIndex: run.originalIndex,
        score: (centering + stability) / 2,
        weight: weight * 0.6,
        factorKey: 'timing-in-groove',
        factorLabel: 'Timing in the groove',
        factorDetail: 'Beat centering and spread constrain pocket consistency.',
      });
    }

    const streak = nonNegative(source.bestStreak);

    if (streak > 0) {
      const target = Math.min(32, Math.max(8, run.attempts * 0.35));
      const continuity = clamp((streak / target) * 100, 0, 100);

      addSignal(signals, {
        axis: 'groove-pocket',
        runIndex: run.originalIndex,
        score: continuity,
        weight: 0.9,
        factorKey: 'streak-continuity',
        factorLabel: 'Groove continuity',
        factorDetail: `Longest accurate phrase was ${Math.round(
          streak,
        )} notes.`,
      });
      addSignal(signals, {
        axis: 'pulse-timing',
        runIndex: run.originalIndex,
        score: continuity,
        weight: 0.35,
        factorKey: 'streak-continuity',
        factorLabel: 'Pulse continuity',
        factorDetail: `Longest accurate phrase was ${Math.round(
          streak,
        )} notes.`,
      });
    }

    const wrong = nonNegative(source.totalWrong);
    const resolved = run.attempts + wrong;

    if (resolved > 0) {
      const padChoice = clamp(100 * (1 - wrong / resolved), 0, 100);

      addSignal(signals, {
        axis: 'limb-coordination',
        runIndex: run.originalIndex,
        score: padChoice,
        weight: sampleWeight(resolved) * 0.65,
        factorKey: 'pad-choice',
        factorLabel: 'Pad choice',
        factorDetail: `${Math.round(wrong)} wrong-pad hits across ${Math.round(
          resolved,
        )} resolved inputs.`,
      });
      addSignal(signals, {
        axis: 'fills-kit-navigation',
        runIndex: run.originalIndex,
        score: padChoice,
        weight: sampleWeight(resolved) * 0.35,
        factorKey: 'pad-choice',
        factorLabel: 'Kit navigation',
        factorDetail: 'Wrong-pad rate provides a broad kit-navigation signal.',
      });
    }

    array(source.laneAccuracy).forEach((lane) =>
      addLaneSignals(signals, run, lane),
    );
    array(source.laneBias).forEach((bias) =>
      addLaneBiasSignals(signals, run, bias),
    );
    addLearningEvidence(signals, run, source);
    array(source.coachEvidence).forEach((finding) =>
      addCoachEvidence(signals, run, finding),
    );
  });

  return signals;
}

function confidenceFor(signals: readonly Signal[]): SkillConfidence {
  const evidenceCount = new Set(signals.map(({ runIndex }) => runIndex)).size;
  const evidenceWeight = round(
    Math.min(
      100,
      signals.reduce((sum, signal) => sum + signal.weight, 0),
    ),
    1,
  );
  const level =
    evidenceCount >= 8 && evidenceWeight >= 12
      ? 'high'
      : evidenceCount >= 3 && evidenceWeight >= 4
      ? 'medium'
      : 'low';
  const label =
    level === 'high'
      ? 'High confidence'
      : level === 'medium'
      ? 'Medium confidence'
      : 'Low confidence';

  return {
    level,
    label,
    evidenceCount,
    evidenceWeight,
    detail:
      evidenceCount === 0
        ? 'Low confidence: no direct scored evidence yet.'
        : `${label}: based on ${evidenceCount} scored ${
            evidenceCount === 1 ? 'run' : 'runs'
          } and ${evidenceWeight} weighted evidence points.`,
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trendFor(
  signals: readonly Signal[],
  chronologicalRuns: readonly SafeRun[],
): SkillTrend {
  const perRun = chronologicalRuns.flatMap((run) => {
    const runSignals = signals.filter(
      ({ runIndex }) => runIndex === run.originalIndex,
    );

    if (runSignals.length === 0) {
      return [];
    }

    const weight = runSignals.reduce((sum, signal) => sum + signal.weight, 0);
    const score =
      runSignals.reduce(
        (sum, signal) => sum + signal.score * signal.weight,
        0,
      ) / weight;

    return [score];
  });

  if (perRun.length < 2) {
    return {
      direction: 'unknown',
      delta: 0,
      detail: 'Play twice to see a trend.',
    };
  }

  const split = Math.max(1, Math.floor(perRun.length / 2));
  const earlier = perRun.slice(Math.max(0, split - 3), split);
  const recent = perRun.slice(split).slice(-3);
  const delta = round(mean(recent) - mean(earlier), 1);
  const direction =
    delta >= 3 ? 'improving' : delta <= -3 ? 'declining' : 'stable';

  return {
    direction,
    delta,
    detail:
      direction === 'stable'
        ? 'Recent demonstrated performance is within 3 points of the earlier baseline.'
        : `Recent demonstrated performance is ${Math.abs(delta)} points ${
            direction === 'improving' ? 'higher' : 'lower'
          } than the earlier baseline.`,
  };
}

function limitingFactorFor(signals: readonly Signal[]): SkillLimitingFactor {
  if (signals.length === 0) {
    return {
      key: 'insufficient-evidence',
      label: 'More evidence needed',
      detail: 'Complete a scored exercise that directly trains this skill.',
      score: NEUTRAL_SCORE,
    };
  }

  const grouped = new Map<
    string,
    {
      label: string;
      detail: string;
      scoreTotal: number;
      weight: number;
    }
  >();

  signals.forEach((signal) => {
    const current = grouped.get(signal.factorKey) ?? {
      label: signal.factorLabel,
      detail: signal.factorDetail,
      scoreTotal: 0,
      weight: 0,
    };

    current.scoreTotal += signal.score * signal.weight;
    current.weight += signal.weight;
    current.detail = signal.factorDetail;
    grouped.set(signal.factorKey, current);
  });

  const [key, weakest] = [...grouped.entries()].sort(
    ([leftKey, left], [rightKey, right]) =>
      left.scoreTotal / left.weight - right.scoreTotal / right.weight ||
      leftKey.localeCompare(rightKey),
  )[0];

  return {
    key,
    label: weakest.label,
    detail: weakest.detail,
    score: round(weakest.scoreTotal / weakest.weight),
  };
}

function axisProfile(
  axis: (typeof DRUM_SKILL_AXES)[number],
  signals: readonly Signal[],
  chronologicalRuns: readonly SafeRun[],
): DrumSkillAxisProfile {
  const axisSignals = signals.filter((signal) => signal.axis === axis.id);
  const signalWeight = axisSignals.reduce(
    (sum, signal) => sum + signal.weight,
    0,
  );
  const demonstratedTotal = axisSignals.reduce(
    (sum, signal) => sum + signal.score * signal.weight,
    0,
  );
  const score =
    signalWeight === 0
      ? NEUTRAL_SCORE
      : (demonstratedTotal + NEUTRAL_SCORE * PRIOR_WEIGHT) /
        (signalWeight + PRIOR_WEIGHT);

  return {
    ...axis,
    score: round(clamp(score, 0, 100)),
    confidence: confidenceFor(axisSignals),
    trend: trendFor(axisSignals, chronologicalRuns),
    limitingFactor: limitingFactorFor(axisSignals),
  };
}

/**
 * Builds a deterministic, interpretable drum-skill profile from completed-run
 * evidence. Scores are deliberately shrunk toward 50 when evidence is sparse;
 * confidence must be shown alongside a score and is never inferred from age.
 */
export function buildDrumLearningProfile(
  input: readonly LearningProfileRun[] | null | undefined,
): DrumLearningProfile {
  const runs = safeRuns(input);
  const chronologicalRuns = [...runs].sort(
    (left, right) =>
      left.timestamp - right.timestamp ||
      left.originalIndex - right.originalIndex,
  );
  const signals = signalsForRuns(runs);
  const axes = DRUM_SKILL_AXES.map((axis) =>
    axisProfile(axis, signals, chronologicalRuns),
  );
  const rankedStrongest = [...axes].sort(
    (left, right) =>
      // An unmeasured neutral prior is not a demonstrated strength.
      Number(left.confidence.evidenceCount === 0) -
        Number(right.confidence.evidenceCount === 0) ||
      right.score - left.score ||
      right.confidence.evidenceWeight - left.confidence.evidenceWeight ||
      left.id.localeCompare(right.id),
  );
  const rankedFocus = [...axes].sort(
    (left, right) =>
      // Prefer a measured weakness over an unmeasured neutral placeholder.
      Number(left.confidence.evidenceCount === 0) -
        Number(right.confidence.evidenceCount === 0) ||
      left.score - right.score ||
      right.confidence.evidenceWeight - left.confidence.evidenceWeight ||
      left.id.localeCompare(right.id),
  );
  const latest = chronologicalRuns
    .filter(({ completedAt }) => completedAt)
    .at(-1);

  return {
    axes,
    evidenceRuns: new Set(signals.map(({ runIndex }) => runIndex)).size,
    ...(latest?.completedAt ? { computedThrough: latest.completedAt } : {}),
    strongestAxis: rankedStrongest[0].id,
    focusAxis: rankedFocus[0].id,
  };
}

export const computeDrumLearningProfile = buildDrumLearningProfile;

export function drumSkillAxis(
  profile: DrumLearningProfile,
  axisId: DrumSkillAxisId,
): DrumSkillAxisProfile | undefined {
  return profile.axes.find(({ id }) => id === axisId);
}

/** Useful for future recommendation matching without recomputing the profile. */
export function weakestMappedAxis(
  profile: DrumLearningProfile,
  skillTag: unknown,
): DrumSkillAxisProfile | undefined {
  const mapped = new Set(axesForDrumSkillTag(skillTag));

  return profile.axes
    .filter(({ id }) => mapped.has(id))
    .sort(
      (left, right) =>
        Number(left.confidence.evidenceCount === 0) -
          Number(right.confidence.evidenceCount === 0) ||
        left.score - right.score ||
        right.confidence.evidenceWeight - left.confidence.evidenceWeight,
    )[0];
}
