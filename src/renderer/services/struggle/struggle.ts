import {
  MAX_PERSISTED_RUN_SECTIONS,
  PracticeRunArchive,
  RunSectionEvidence,
  StoredHitRecord,
  StoredPracticeRun,
} from '../practice-stats';
import {
  MAX_REMEDIATION_BARS,
  REMEDIATION_NEAR_MISS_ACCURACY,
  REMEDIATION_QUALITY_ACCURACY,
  REQUIRED_CONSECUTIVE_CLEAN_PASSES,
} from '../remediation';
import {
  AnalyzeStruggleInput,
  BuildRunSectionEvidenceInput,
  CollapseSection,
  PatternNovelty,
  SlowLoopDrillProposal,
  StruggleChart,
  StruggleReport,
  StruggleHistory,
  StruggleSectionDefinition,
} from './types';

export const MAX_COLLAPSE_SECTIONS_PER_RUN = 3;

export const MAX_SLOW_LOOP_ATTEMPTS = 6;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

function secondsForTick(chart: StruggleChart, targetTick: number): number {
  const tempos = [...chart.tempos].sort(
    (left, right) => left.tick - right.tick,
  );
  const resolution = Math.max(1, chart.resolution);
  let cursor = 0;
  let bpm = 120;
  let seconds = 0;

  for (const tempo of tempos) {
    if (tempo.tick > targetTick) {
      break;
    }

    seconds += ((tempo.tick - cursor) / resolution) * (60 / bpm);
    cursor = tempo.tick;
    bpm = tempo.bpm > 0 ? tempo.bpm : bpm;
  }

  return seconds + ((targetTick - cursor) / resolution) * (60 / bpm);
}

function sectionPatternSignature(
  measure: StruggleChart['measures'][number],
): string {
  const width = Math.max(1, measure.endTick - measure.startTick);
  const tokens = measure.notes
    .map(
      ({ element, tick }) =>
        `${element}:${Math.round(((tick - measure.startTick) / width) * 48)}`,
    )
    .sort();
  const value = tokens.join('|');

  return `rhythm-v1:${tokens.length}:${fnv1a(value)}`;
}

export function createStruggleSectionDefinitions(
  chart: StruggleChart,
  timeOffsetSeconds = 0,
): StruggleSectionDefinition[] {
  return chart.measures.map((measure) => ({
    barStart: measure.index + 1,
    barEnd: measure.index + 1,
    startTick: measure.startTick,
    endTick: measure.endTick,
    startTimeSeconds:
      secondsForTick(chart, measure.startTick) + timeOffsetSeconds,
    endTimeSeconds: secondsForTick(chart, measure.endTick) + timeOffsetSeconds,
    patternSignature: sectionPatternSignature(measure),
  }));
}

function effectiveTick(record: StoredHitRecord): number {
  return record.verdict === 'wrong'
    ? record.actualTick ?? record.tick
    : record.expectedTick ?? record.tick;
}

function sectionForTick(
  sections: readonly StruggleSectionDefinition[],
  tick: number,
): StruggleSectionDefinition | undefined {
  return sections.find(
    (section, index) =>
      tick >= section.startTick &&
      (tick < section.endTick ||
        (index === sections.length - 1 && tick === section.endTick)),
  );
}

function inferredAttemptedRange(
  records: readonly StoredHitRecord[],
  sections: readonly StruggleSectionDefinition[],
): { startTick: number; endTick: number } | undefined {
  const physicalTicks = records
    .filter(({ verdict }) => verdict === 'hit' || verdict === 'wrong')
    .map(effectiveTick)
    .sort((left, right) => left - right);
  const firstTick = physicalTicks.at(0);
  const lastTick = physicalTicks.at(-1);
  const chartStart = sections.at(0)?.startTick;
  const chartEnd = sections.at(-1)?.endTick;

  if (
    firstTick === undefined ||
    lastTick === undefined ||
    chartStart === undefined ||
    chartEnd === undefined
  ) {
    return undefined;
  }

  const firstSection = sectionForTick(sections, firstTick);
  const lastSection = sectionForTick(sections, lastTick);

  if (!firstSection || !lastSection) {
    return undefined;
  }

  const enteredNearStart =
    firstTick <= chartStart + (chartEnd - chartStart) * 0.1;

  return {
    startTick: firstSection.startTick,
    endTick: enteredNearStart ? chartEnd : lastSection.endTick,
  };
}

export function buildRunSectionEvidence({
  records,
  sections,
  attemptedRange,
}: BuildRunSectionEvidenceInput): RunSectionEvidence[] {
  const range = attemptedRange ?? inferredAttemptedRange(records, sections);
  const counts = new Map<
    number,
    { hits: number; misses: number; wrongHits: number }
  >();

  records.forEach((record) => {
    const section = sectionForTick(sections, effectiveTick(record));

    if (!section) {
      return;
    }

    const current = counts.get(section.barStart) ?? {
      hits: 0,
      misses: 0,
      wrongHits: 0,
    };

    if (record.verdict === 'hit') {
      current.hits += 1;
    } else if (record.verdict === 'miss') {
      current.misses += 1;
    } else {
      current.wrongHits += 1;
    }

    counts.set(section.barStart, current);
  });

  return sections
    .map((section) => {
      const { patternSignature: signature, ...definition } = section;
      const sectionCounts = counts.get(section.barStart) ?? {
        hits: 0,
        misses: 0,
        wrongHits: 0,
      };
      const attempted = Boolean(
        range &&
          section.endTick > range.startTick &&
          section.startTick < range.endTick,
      );

      return {
        ...definition,
        expectedNotes: sectionCounts.hits + sectionCounts.misses,
        ...sectionCounts,
        patternSignatures: [signature],
        attempted,
      };
    })
    .filter(({ attempted, expectedNotes }) => attempted && expectedNotes > 0)
    .slice(-MAX_PERSISTED_RUN_SECTIONS);
}

export function buildStruggleHistory(
  runs: readonly StoredPracticeRun[],
  archives: readonly PracticeRunArchive[] = [],
): StruggleHistory {
  const archivedPatternCounts: Record<string, number> = {};
  let patternHistoryState: StruggleHistory['patternHistoryState'] = runs.every(
    (run) =>
      run.summary.sectionEvidence !== undefined &&
      run.summary.sectionEvidence.every(
        ({ patternSignatures, patternSignature }) =>
          (patternSignatures?.length ?? 0) > 0 || Boolean(patternSignature),
      ),
  )
    ? 'complete'
    : 'partial';

  archives.forEach((archive) => {
    Object.values(archive.days).forEach((day) => {
      if (day.patternHistoryTruncated) {
        patternHistoryState = 'partial';
      }

      Object.entries(day.patternCounts ?? {}).forEach(([signature, count]) => {
        archivedPatternCounts[signature] =
          (archivedPatternCounts[signature] ?? 0) + count;
      });
    });
  });

  return {
    runs,
    archivedPatternCounts,
    patternHistoryState,
  };
}

function sameRun(
  left: AnalyzeStruggleInput['run'],
  right: AnalyzeStruggleInput['run'],
): boolean {
  const leftSession = left.summary.context?.sessionId;
  const rightSession = right.summary.context?.sessionId;

  return leftSession && rightSession
    ? leftSession === rightSession
    : left.summary.completedAt === right.summary.completedAt &&
        left.summary.totalHits === right.summary.totalHits &&
        left.summary.totalMisses === right.summary.totalMisses;
}

function hitRate(section: RunSectionEvidence): number {
  return section.expectedNotes === 0 ? 0 : section.hits / section.expectedNotes;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function splitClusters(
  sections: readonly RunSectionEvidence[],
): RunSectionEvidence[][] {
  const clusters: RunSectionEvidence[][] = [];

  sections.forEach((section) => {
    const current = clusters.at(-1);

    if (current && current.at(-1)!.barEnd + 1 === section.barStart) {
      current.push(section);
    } else {
      clusters.push([section]);
    }
  });

  return clusters.flatMap((cluster) => {
    if (
      cluster.length === 1 &&
      (cluster[0].expectedNotes < 8 || hitRate(cluster[0]) > 0.35)
    ) {
      return [];
    }

    const chunks: RunSectionEvidence[][] = [];

    for (let index = 0; index < cluster.length; index += MAX_REMEDIATION_BARS) {
      chunks.push(cluster.slice(index, index + MAX_REMEDIATION_BARS));
    }

    return chunks;
  });
}

function tempoForDrill(runSpeed: number | undefined, accuracy: number): number {
  const current = clamp(runSpeed ?? 1, 0.3, 1);
  const reduction = accuracy < 0.4 ? 0.2 : 0.1;

  return (
    Math.round(clamp(Math.min(0.8, current - reduction), 0.3, 1) * 10) / 10
  );
}

export function proposeSlowLoopDrill(
  section: Pick<
    CollapseSection,
    | 'barStart'
    | 'barEnd'
    | 'startTimeSeconds'
    | 'endTimeSeconds'
    | 'expectedNotes'
    | 'hitRate'
  >,
  playbackSpeed: number | undefined,
): SlowLoopDrillProposal {
  const targetTempoMultiplier = clamp(playbackSpeed ?? 1, 0.3, 1);

  return {
    barStart: section.barStart,
    barEnd: section.barEnd,
    startTimeSeconds: section.startTimeSeconds,
    endTimeSeconds: section.endTimeSeconds,
    tempoMultiplier: tempoForDrill(playbackSpeed, section.hitRate),
    targetTempoMultiplier,
    maximumAttempts: MAX_SLOW_LOOP_ATTEMPTS,
    terminalOutcomes: ['mastered', 'deferred'],
    passCriteria: {
      minimumResolvedNotes: section.expectedNotes,
      minimumAccuracy: REMEDIATION_QUALITY_ACCURACY,
      maximumMisses: section.expectedNotes >= 6 ? 1 : 0,
      maximumWrongHits: section.expectedNotes >= 8 ? 1 : 0,
      requiredConsecutiveCleanPasses: REQUIRED_CONSECUTIVE_CLEAN_PASSES,
    },
  };
}

export function analyzeStruggle({
  run,
  history,
}: AnalyzeStruggleInput): StruggleReport {
  const evidence = [...(run.summary.sectionEvidence ?? [])]
    .filter(
      ({ attempted, expectedNotes }) =>
        attempted !== false && expectedNotes > 0,
    )
    .sort((left, right) => left.barStart - right.barStart);

  if (evidence.length === 0) {
    return {
      status: 'insufficient-section-evidence',
      analyzedSections: 0,
      collapseSections: [],
    };
  }

  const priorRuns = history.runs.filter(
    (candidate) => !sameRun(candidate, run),
  );
  const priorPatterns = new Set(
    priorRuns.flatMap((candidate) =>
      (candidate.summary.sectionEvidence ?? [])
        .filter(({ attempted }) => attempted !== false)
        .flatMap(
          ({ patternSignatures, patternSignature }) =>
            patternSignatures ?? (patternSignature ? [patternSignature] : []),
        ),
    ),
  );

  Object.entries(history.archivedPatternCounts ?? {}).forEach(
    ([signature, count]) => {
      if (count > 0) {
        priorPatterns.add(signature);
      }
    },
  );

  const patternHistoryState =
    history.patternHistoryState ??
    (priorRuns.every(
      (candidate) =>
        candidate.summary.sectionEvidence !== undefined &&
        candidate.summary.sectionEvidence.every(
          ({ patternSignatures, patternSignature }) =>
            (patternSignatures?.length ?? 0) > 0 || Boolean(patternSignature),
        ),
    )
      ? 'complete'
      : 'partial');
  const struggling = evidence.filter((section, index) => {
    const rate = hitRate(section);
    const baseline = mean(
      evidence.slice(Math.max(0, index - 2), index).map(hitRate),
    );
    const cliff = index > 0 && baseline - rate >= 0.25;

    return (
      rate < REMEDIATION_NEAR_MISS_ACCURACY ||
      (cliff && rate < REMEDIATION_QUALITY_ACCURACY)
    );
  });
  const sections = splitClusters(struggling).map((cluster) => {
    const first = cluster[0];
    const last = cluster.at(-1)!;
    const expectedNotes = cluster.reduce(
      (sum, section) => sum + section.expectedNotes,
      0,
    );
    const hits = cluster.reduce((sum, section) => sum + section.hits, 0);
    const misses = cluster.reduce((sum, section) => sum + section.misses, 0);
    const wrongHits = cluster.reduce(
      (sum, section) => sum + section.wrongHits,
      0,
    );
    const sectionHitRate = expectedNotes === 0 ? 0 : hits / expectedNotes;
    const patternSignatures = [
      ...new Set(
        cluster.flatMap(
          ({ patternSignatures: values, patternSignature }) =>
            values ?? (patternSignature ? [patternSignature] : []),
        ),
      ),
    ];
    const novelPatternSignatures = patternSignatures.filter(
      (signature) => !priorPatterns.has(signature),
    );
    const novelty: PatternNovelty =
      novelPatternSignatures.length === 0
        ? 'seen-before'
        : patternHistoryState === 'complete'
        ? 'new'
        : 'history-unavailable';
    const section: Omit<CollapseSection, 'drill'> = {
      barStart: first.barStart,
      barEnd: last.barEnd,
      startTimeSeconds: first.startTimeSeconds,
      endTimeSeconds: last.endTimeSeconds,
      expectedNotes,
      hits,
      misses,
      wrongHits,
      hitRate: sectionHitRate,
      patternSignatures,
      novelPatternSignatures,
      novelty,
      isNovel: novelty === 'new',
    };

    return {
      ...section,
      drill: proposeSlowLoopDrill(section, run.summary.playbackSpeed),
    };
  });

  return {
    status: 'available',
    analyzedSections: evidence.length,
    collapseSections: sections
      .sort(
        (left, right) =>
          Number(right.isNovel) - Number(left.isNovel) ||
          left.hitRate - right.hitRate ||
          right.expectedNotes - left.expectedNotes ||
          left.barStart - right.barStart,
      )
      .slice(0, MAX_COLLAPSE_SECTIONS_PER_RUN),
  };
}
