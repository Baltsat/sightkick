import {
  KitElement,
  StoredHitRecord,
  StoredPracticeRun,
} from '../practice-stats';
import {
  AnalyzeCoachInput,
  CoachChart,
  CoachFinding,
  CoachFindings,
  CoachMeasure,
  CoachSeverity,
  CoachSkillTag,
} from './types';

const SEVERITY_RANK: Record<CoachSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function percent(value: number): number {
  return Math.round(value * 100);
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function measureForTick(
  chart: CoachChart,
  tick: number,
): CoachMeasure | undefined {
  return chart.measures.find(
    (measure) => tick >= measure.startTick && tick < measure.endTick,
  );
}

function tempoForTick(chart: CoachChart, tick: number): number {
  let bpm = 120;

  for (const tempo of chart.tempos) {
    if (tempo.tick > tick) {
      break;
    }

    bpm = tempo.bpm;
  }

  return bpm;
}

function measureSkill(measure: CoachMeasure | undefined): CoachSkillTag {
  if (!measure) {
    return 'timing';
  }

  if (measure.isCompound) {
    return 'shuffle';
  }

  if (measure.tupletCount > 0) {
    return 'triplets';
  }

  const toms = measure.notes.filter((note) => note.element.startsWith('tom'));
  const hats = measure.notes.filter((note) => note.element === 'hihat');

  if (
    toms.length >= 4 ||
    toms.length / Math.max(1, measure.notes.length) >= 0.3
  ) {
    return 'fills';
  }

  if (hats.length >= 12) {
    return 'sixteenth-hihat';
  }

  return 'timing';
}

interface BarScore {
  measure: CoachMeasure;
  hits: number;
  misses: number;
  accuracy: number;
}

function barScores(input: AnalyzeCoachInput): BarScore[] {
  const counts = new Map<number, { hits: number; misses: number }>();

  input.runs.forEach((run) => {
    run.records.forEach((record) => {
      if (record.verdict === 'wrong') {
        return;
      }

      const measure = measureForTick(input.chart, record.tick);

      if (!measure) {
        return;
      }

      const entry = counts.get(measure.index) ?? { hits: 0, misses: 0 };

      entry[record.verdict === 'hit' ? 'hits' : 'misses'] += 1;
      counts.set(measure.index, entry);
    });
  });

  return input.chart.measures.flatMap((measure) => {
    const count = counts.get(measure.index);

    if (!count || count.hits + count.misses < 2) {
      return [];
    }

    return [
      {
        measure,
        ...count,
        accuracy: count.hits / (count.hits + count.misses),
      },
    ];
  });
}

function severityForAccuracy(accuracy: number): CoachSeverity {
  return accuracy < 0.55 ? 'high' : accuracy < 0.72 ? 'medium' : 'low';
}

function troubleBarFindings(scores: BarScore[]): CoachFinding[] {
  const bad = scores.filter((score) => score.accuracy < 0.85);
  const clusters: BarScore[][] = [];

  bad.forEach((score) => {
    const last = clusters[clusters.length - 1];

    if (
      last &&
      last[last.length - 1].measure.index + 1 === score.measure.index
    ) {
      last.push(score);
    } else {
      clusters.push([score]);
    }
  });

  return clusters
    .map((cluster) => {
      const hits = cluster.reduce((sum, score) => sum + score.hits, 0);
      const misses = cluster.reduce((sum, score) => sum + score.misses, 0);
      const accuracy = hits / (hits + misses);
      const first = cluster[0].measure;
      const last = cluster[cluster.length - 1].measure;
      const start = first.index + 1;
      const end = last.index + 1;

      return {
        id: `trouble-${start}-${end}`,
        kind: 'trouble-bars' as const,
        severity: severityForAccuracy(accuracy),
        title:
          start === end
            ? `Bar ${start} needs a loop`
            : `Bars ${start}–${end} need a loop`,
        summary: `${percent(accuracy)}% across ${
          hits + misses
        } scored notes; ${misses} misses cluster here.`,
        skillTag: measureSkill(
          cluster.find((score) => measureSkill(score.measure) !== 'timing')
            ?.measure ?? first,
        ),
        evidence: {
          barStart: start,
          barEnd: end,
          accuracy,
          sampleCount: hits + misses,
        },
      };
    })
    .sort(
      (a, b) =>
        (a.evidence.accuracy ?? 1) - (b.evidence.accuracy ?? 1) ||
        b.evidence.sampleCount - a.evidence.sampleCount,
    )
    .slice(0, 3);
}

function signature(measure: CoachMeasure): Set<string> {
  const width = Math.max(1, measure.endTick - measure.startTick);

  return new Set(
    measure.notes.map(
      (note) =>
        `${note.element}:${Math.round(
          ((note.tick - measure.startTick) / width) * 16,
        )}`,
    ),
  );
}

function patternDistance(a: CoachMeasure, b: CoachMeasure): number {
  const left = signature(a);
  const right = signature(b);
  const union = new Set([...left, ...right]);
  const overlap = [...left].filter((item) => right.has(item)).length;

  return union.size === 0 ? 0 : 1 - overlap / union.size;
}

function transitionFindings(scores: BarScore[]): CoachFinding[] {
  const byIndex = new Map(scores.map((score) => [score.measure.index, score]));

  return scores
    .flatMap((score) => {
      const previous = byIndex.get(score.measure.index - 1);

      if (
        !previous ||
        previous.accuracy - score.accuracy < 0.2 ||
        patternDistance(previous.measure, score.measure) < 0.35
      ) {
        return [];
      }

      const bar = score.measure.index + 1;
      const cliff = previous.accuracy - score.accuracy;

      return [
        {
          id: `transition-${bar}`,
          kind: 'breakdown-transition' as const,
          severity: cliff >= 0.4 ? ('high' as const) : ('medium' as const),
          title: `The pattern change at bar ${bar} breaks the run`,
          summary: `Accuracy drops from ${percent(
            previous.accuracy,
          )}% to ${percent(score.accuracy)}% when the rhythm changes.`,
          skillTag: measureSkill(score.measure),
          evidence: {
            barStart: bar,
            barEnd: bar,
            accuracy: score.accuracy,
            previousAccuracy: previous.accuracy,
            sampleCount: score.hits + score.misses,
          },
        },
      ];
    })
    .sort(
      (a, b) =>
        (b.evidence.previousAccuracy ?? 0) -
        (b.evidence.accuracy ?? 0) -
        ((a.evidence.previousAccuracy ?? 0) - (a.evidence.accuracy ?? 0)),
    )
    .slice(0, 3);
}

interface LaneRegion {
  lane: KitElement;
  bpm: number;
  hits: number;
  misses: number;
  deltas: number[];
}

function limbFindings(input: AnalyzeCoachInput): CoachFinding[] {
  const regions = new Map<string, LaneRegion>();

  input.runs.forEach((run) => {
    run.records.forEach((record) => {
      if (record.verdict === 'wrong') {
        return;
      }

      const bpm = Math.round(tempoForTick(input.chart, record.tick));
      const key = `${record.element}:${bpm}`;
      const entry = regions.get(key) ?? {
        lane: record.element,
        bpm,
        hits: 0,
        misses: 0,
        deltas: [],
      };

      if (record.verdict === 'hit') {
        entry.hits += 1;
        entry.deltas.push(record.deltaMs);
      } else {
        entry.misses += 1;
      }

      regions.set(key, entry);
    });
  });

  return [...regions.values()]
    .flatMap((region) => {
      const samples = region.hits + region.misses;
      const accuracy = samples === 0 ? 1 : region.hits / samples;
      const bias = mean(region.deltas);

      if (samples < 4 || (accuracy >= 0.85 && Math.abs(bias) < 25)) {
        return [];
      }

      const direction =
        bias < -8 ? 'rushes' : bias > 8 ? 'drags' : 'loses notes';
      const severity =
        accuracy < 0.65 || Math.abs(bias) >= 50
          ? ('high' as const)
          : ('medium' as const);

      return [
        {
          id: `limb-${region.lane}-${region.bpm}`,
          kind: 'limb-weakness' as const,
          severity,
          title: `${region.lane} ${direction} around ${region.bpm} BPM`,
          summary: `${percent(accuracy)}% accuracy with ${Math.round(
            bias,
          )} ms average timing bias.`,
          skillTag:
            region.lane === 'kick'
              ? ('kick-independence' as const)
              : region.lane === 'hihat'
              ? ('sixteenth-hihat' as const)
              : ('timing' as const),
          evidence: {
            lane: region.lane,
            accuracy,
            meanMs: bias,
            bpm: region.bpm,
            sampleCount: samples,
          },
        },
      ];
    })
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        (a.evidence.accuracy ?? 1) - (b.evidence.accuracy ?? 1),
    )
    .slice(0, 3);
}

function speedFinding(runs: StoredPracticeRun[]): CoachFinding[] {
  const groups = new Map<number, number[]>();

  runs.forEach(({ summary }) => {
    if (summary.playbackSpeed === undefined) {
      return;
    }

    const speed = Math.round(summary.playbackSpeed * 10) / 10;
    const values = groups.get(speed) ?? [];

    values.push(summary.overallAccuracy);
    groups.set(speed, values);
  });

  const points = [...groups.entries()]
    .map(([speed, accuracies]) => ({ speed, accuracy: mean(accuracies) }))
    .sort((a, b) => a.speed - b.speed);
  let best:
    | { slow: (typeof points)[number]; fast: (typeof points)[number] }
    | undefined;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (points[i].accuracy - points[j].accuracy >= 0.12) {
        if (
          !best ||
          points[i].accuracy - points[j].accuracy >
            best.slow.accuracy - best.fast.accuracy
        ) {
          best = { slow: points[i], fast: points[j] };
        }
      }
    }
  }

  if (!best) {
    return [];
  }

  const delta = best.slow.accuracy - best.fast.accuracy;

  return [
    {
      id: `speed-${best.slow.speed}-${best.fast.speed}`,
      kind: 'speed-sensitivity',
      severity: delta >= 0.25 ? 'high' : 'medium',
      title: `Clean at ${best.slow.speed}x, breaks at ${best.fast.speed}x`,
      summary: `Accuracy falls ${percent(
        delta,
      )} points as speed rises. Start the loop at ${best.slow.speed}x.`,
      skillTag: 'timing',
      evidence: {
        slowSpeed: best.slow.speed,
        slowAccuracy: best.slow.accuracy,
        fastSpeed: best.fast.speed,
        fastAccuracy: best.fast.accuracy,
        sampleCount:
          (groups.get(best.slow.speed)?.length ?? 0) +
          (groups.get(best.fast.speed)?.length ?? 0),
      },
    },
  ];
}

function closestMiss(
  wrong: StoredHitRecord,
  records: StoredHitRecord[],
  tolerance: number,
): StoredHitRecord | undefined {
  return records
    .filter(
      (record) =>
        record.verdict === 'miss' &&
        record.element !== wrong.element &&
        Math.abs(record.tick - wrong.tick) <= tolerance,
    )
    .sort(
      (a, b) => Math.abs(a.tick - wrong.tick) - Math.abs(b.tick - wrong.tick),
    )[0];
}

function confusionFindings(input: AnalyzeCoachInput): CoachFinding[] {
  const pairs = new Map<
    string,
    { actual: KitElement; expected: KitElement; count: number }
  >();
  const tolerance = Math.max(1, input.chart.resolution / 4);

  input.runs.forEach((run) => {
    run.records
      .filter((record) => record.verdict === 'wrong')
      .forEach((wrong) => {
        const missed = closestMiss(wrong, run.records, tolerance);

        if (!missed) {
          return;
        }

        const key = `${wrong.element}:${missed.element}`;
        const pair = pairs.get(key) ?? {
          actual: wrong.element,
          expected: missed.element,
          count: 0,
        };

        pair.count += 1;
        pairs.set(key, pair);
      });
  });

  return [...pairs.values()]
    .filter((pair) => pair.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((pair) => ({
      id: `confusion-${pair.actual}-${pair.expected}`,
      kind: 'pad-confusion',
      severity: pair.count >= 5 ? 'high' : 'medium',
      title: `${pair.actual} is replacing ${pair.expected}`,
      summary: `${pair.count} wrong-pad strikes line up with missed ${pair.expected} notes.`,
      skillTag: 'pad-accuracy',
      evidence: {
        actualElement: pair.actual,
        expectedElement: pair.expected,
        sampleCount: pair.count,
      },
    }));
}

export function analyzePracticeRuns(input: AnalyzeCoachInput): CoachFindings {
  const scores = barScores(input);
  const findings = [
    ...troubleBarFindings(scores),
    ...transitionFindings(scores),
    ...limbFindings(input),
    ...speedFinding(input.runs),
    ...confusionFindings(input),
  ]
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.evidence.sampleCount - a.evidence.sampleCount,
    )
    .slice(0, 10);

  return { analyzedRuns: input.runs.length, findings };
}
