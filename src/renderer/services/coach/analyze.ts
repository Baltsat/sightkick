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

const LANE_TEMPO_BUCKET_BPM = 5;
const MINIMUM_LANE_REGION_SAMPLES = 6;

/**
 * Charts often contain one-BPM tempo events from import/authoring jitter.
 * Coaching should describe a usable tempo region, rather than split the same
 * physical passage into several tiny "82 BPM" / "83 BPM" diagnoses.  Ceiling
 * buckets intentionally keep the common 82–85 BPM authored range together
 * as an interpretable "around 85 BPM" region.
 */
function stableTempoBucket(bpm: number): number {
  return Math.max(
    LANE_TEMPO_BUCKET_BPM,
    Math.ceil(bpm / LANE_TEMPO_BUCKET_BPM) * LANE_TEMPO_BUCKET_BPM,
  );
}

interface WrongPadPair {
  actual: KitElement;
  expected: KitElement;
}

/**
 * Match at most one wrong strike to one miss, and only when the expected pad
 * is unambiguous. A paired wrong is evidence about the pad transition, but
 * is already represented by that miss for mastery accuracy.
 */
function unambiguousWrongPadPairs(
  records: StoredHitRecord[],
  tolerance: number,
): WrongPadPair[] {
  const misses = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.verdict === 'miss');
  const usedMisses = new Set<number>();

  return records.flatMap((wrong) => {
    if (wrong.verdict !== 'wrong') {
      return [];
    }

    const candidates = misses.filter(
      ({ record, index }) =>
        !usedMisses.has(index) &&
        record.element !== wrong.element &&
        Math.abs(record.tick - wrong.tick) <= tolerance,
    );

    if (candidates.length !== 1) {
      return [];
    }

    const [{ record: missed, index }] = candidates;

    usedMisses.add(index);

    return [{ actual: wrong.element, expected: missed.element }];
  });
}

interface BarScore {
  measure: CoachMeasure;
  hits: number;
  misses: number;
  wrong: number;
  /** Wrong strikes which do not already correspond to a recorded miss. */
  unmatchedWrong: number;
  /** Scored outcomes used for mastery/accuracy. */
  resolved: number;
  accuracy: number;
}

function barScores(input: AnalyzeCoachInput): BarScore[] {
  const counts = new Map<
    number,
    { hits: number; misses: number; wrong: number; pairedWrong: number }
  >();

  input.runs.forEach((run) => {
    const recordsByMeasure = new Map<number, StoredHitRecord[]>();

    run.records.forEach((record) => {
      const measure = measureForTick(input.chart, record.tick);

      if (!measure) {
        return;
      }

      const records = recordsByMeasure.get(measure.index) ?? [];

      records.push(record);
      recordsByMeasure.set(measure.index, records);
    });

    recordsByMeasure.forEach((records, measureIndex) => {
      const measure = input.chart.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      if (!measure) {
        return;
      }

      const entry = counts.get(measure.index) ?? {
        hits: 0,
        misses: 0,
        wrong: 0,
        pairedWrong: 0,
      };

      records.forEach((record) => {
        if (record.verdict === 'wrong') {
          entry.wrong += 1;

          return;
        }

        entry[record.verdict === 'hit' ? 'hits' : 'misses'] += 1;
      });
      entry.pairedWrong += unambiguousWrongPadPairs(
        records,
        Math.max(1, input.chart.resolution / 4),
      ).length;
      counts.set(measure.index, entry);
    });
  });

  return input.chart.measures.flatMap((measure) => {
    const count = counts.get(measure.index);

    if (!count) {
      return [];
    }

    const unmatchedWrong = Math.max(0, count.wrong - count.pairedWrong);
    const resolved = count.hits + count.misses + unmatchedWrong;

    if (resolved < 2) {
      return [];
    }

    return [
      {
        measure,
        ...count,
        unmatchedWrong,
        resolved,
        accuracy: count.hits / resolved,
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
      const resolved = cluster.reduce((sum, score) => sum + score.resolved, 0);
      const accuracy = hits / resolved;
      const wrongHits = cluster.reduce((sum, score) => sum + score.wrong, 0);
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
        summary: `${percent(
          accuracy,
        )}% across ${resolved} scored notes; ${misses} misses and ${wrongHits} wrong hits cluster here.`,
        skillTag: measureSkill(
          cluster.find((score) => measureSkill(score.measure) !== 'timing')
            ?.measure ?? first,
        ),
        evidence: {
          barStart: start,
          barEnd: end,
          accuracy,
          sampleCount: resolved,
          hitCount: hits,
          missCount: misses,
          wrongHitCount: wrongHits,
        },
        reason: {
          code: 'low-bar-accuracy' as const,
          counts: {
            samples: resolved,
            hits,
            misses,
            wrongHits,
          },
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
            sampleCount: score.resolved,
            hitCount: score.hits,
            missCount: score.misses,
            wrongHitCount: score.wrong,
          },
          reason: {
            code: 'pattern-transition-accuracy-drop' as const,
            counts: {
              samples: score.resolved,
              hits: score.hits,
              misses: score.misses,
              wrongHits: score.wrong,
            },
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

function laneWeaknessFindings(input: AnalyzeCoachInput): CoachFinding[] {
  const regions = new Map<string, LaneRegion>();

  input.runs.forEach((run) => {
    run.records.forEach((record) => {
      if (record.verdict === 'wrong') {
        return;
      }

      const bpm = stableTempoBucket(tempoForTick(input.chart, record.tick));
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

      if (
        samples < MINIMUM_LANE_REGION_SAMPLES ||
        (accuracy >= 0.85 && Math.abs(bias) < 25)
      ) {
        return [];
      }

      const direction =
        bias < -8
          ? 'records early hits'
          : bias > 8
          ? 'records late hits'
          : 'misses expected notes';
      const severity =
        accuracy < 0.65 || Math.abs(bias) >= 50
          ? ('high' as const)
          : ('medium' as const);

      return [
        {
          id: `lane-${region.lane}-${region.bpm}`,
          kind: 'lane-weakness' as const,
          severity,
          title: `${region.lane} lane ${direction} around ${region.bpm} BPM`,
          summary: `Recorded ${region.lane} lane: ${percent(
            accuracy,
          )}% accuracy and ${Math.round(
            bias,
          )} ms average timing bias across ${samples} resolved notes in the ${
            region.bpm
          } BPM bucket.`,
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
            hitCount: region.hits,
            missCount: region.misses,
          },
          reason: {
            code: 'lane-accuracy-or-timing' as const,
            counts: {
              samples,
              hits: region.hits,
              misses: region.misses,
            },
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
      reason: {
        code: 'speed-comparison',
        counts: {
          samples:
            (groups.get(best.slow.speed)?.length ?? 0) +
            (groups.get(best.fast.speed)?.length ?? 0),
        },
      },
    },
  ];
}

function confusionFindings(input: AnalyzeCoachInput): CoachFinding[] {
  const pairs = new Map<
    string,
    { actual: KitElement; expected: KitElement; count: number }
  >();
  const tolerance = Math.max(1, input.chart.resolution / 4);

  input.runs.forEach((run) => {
    unambiguousWrongPadPairs(run.records, tolerance).forEach((match) => {
      const key = `${match.actual}:${match.expected}`;
      const pair = pairs.get(key) ?? {
        actual: match.actual,
        expected: match.expected,
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
      summary: `${pair.count} unambiguous wrong-pad strikes each pair with one missed ${pair.expected} note.`,
      skillTag: 'pad-accuracy',
      evidence: {
        actualElement: pair.actual,
        expectedElement: pair.expected,
        sampleCount: pair.count,
        matchedWrongPadPairs: pair.count,
        wrongHitCount: pair.count,
        missCount: pair.count,
      },
      reason: {
        code: 'repeated-unambiguous-wrong-pad-pairs',
        counts: {
          samples: pair.count,
          wrongHits: pair.count,
          misses: pair.count,
          matchedWrongPadPairs: pair.count,
        },
      },
    }));
}

export function analyzePracticeRuns(input: AnalyzeCoachInput): CoachFindings {
  const scores = barScores(input);
  const findings = [
    ...troubleBarFindings(scores),
    ...transitionFindings(scores),
    ...laneWeaknessFindings(input),
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
