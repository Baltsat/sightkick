import { describe, expect, it } from 'vitest';
import type {
  RunSectionEvidence,
  RunSummary,
  StoredHitRecord,
  StoredPracticeRun,
} from '../practice-stats';
import {
  archiveRunSummaries,
  emptyPracticeRunArchive,
} from '../practice-stats';
import {
  MAX_SLOW_LOOP_ATTEMPTS,
  analyzeStruggle,
  buildRunSectionEvidence,
  buildStruggleHistory,
  createStruggleSectionDefinitions,
} from './index';
import type { StruggleChart } from './types';

function chart(barCount: number): StruggleChart {
  return {
    resolution: 100,
    tempos: [{ tick: 0, bpm: 60 }],
    measures: Array.from({ length: barCount }, (_, index) => ({
      index,
      startTick: index * 100,
      endTick: (index + 1) * 100,
      notes: [10, 30, 50, 70].map((offset) => ({
        tick: index * 100 + offset,
        element: offset === 10 ? ('kick' as const) : ('hihat' as const),
      })),
    })),
  };
}

function record(tick: number, verdict: StoredHitRecord['verdict']) {
  return {
    tick,
    deltaMs: 0,
    element: tick % 100 === 10 ? ('kick' as const) : ('hihat' as const),
    verdict,
  };
}

function summary(
  completedAt: string,
  playbackSpeed: number,
  sectionEvidence?: RunSectionEvidence[],
): RunSummary {
  const hits = sectionEvidence?.reduce((sum, item) => sum + item.hits, 0);
  const misses = sectionEvidence?.reduce((sum, item) => sum + item.misses, 0);

  return {
    completedAt,
    totalHits: hits ?? 0,
    totalMisses: misses ?? 0,
    totalWrong: 0,
    overallAccuracy:
      hits === undefined || misses === undefined || hits + misses === 0
        ? 0
        : hits / (hits + misses),
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: hits ?? 0,
      sampleCount: hits ?? 0,
    },
    wrongHitCounts: [],
    playbackSpeed,
    ...(sectionEvidence ? { sectionEvidence } : {}),
  };
}

function storedRun(
  completedAt: string,
  playbackSpeed: number,
  sectionEvidence?: RunSectionEvidence[],
): StoredPracticeRun {
  return {
    summary: summary(completedAt, playbackSpeed, sectionEvidence),
    records: [],
  };
}

function section(
  bar: number,
  patternSignature: string,
  hits: number,
  misses: number,
): RunSectionEvidence {
  return {
    barStart: bar,
    barEnd: bar,
    startTick: (bar - 1) * 100,
    endTick: bar * 100,
    startTimeSeconds: bar - 1,
    endTimeSeconds: bar,
    expectedNotes: hits + misses,
    hits,
    misses,
    wrongHits: 0,
    patternSignature,
    attempted: true,
  };
}

describe('struggle analysis', () => {
  it('finds a sustained collapse beginning at 85% of the song and proposes a bounded slow loop', () => {
    const songChart = chart(20);
    const records = songChart.measures.flatMap((measure, index) =>
      measure.notes.map(({ tick }) =>
        record(tick, index < 17 ? 'hit' : 'miss'),
      ),
    );
    const sectionEvidence = buildRunSectionEvidence({
      records,
      sections: createStruggleSectionDefinitions(songChart),
    });
    const run = storedRun('2026-08-15T04:29:59.873Z', 0.8, sectionEvidence);
    const report = analyzeStruggle({
      run,
      history: { runs: [], patternHistoryState: 'complete' },
    });

    expect(report.status).toBe('available');
    expect(report.collapseSections).toHaveLength(1);
    expect(report.collapseSections[0]).toMatchObject({
      barStart: 18,
      barEnd: 20,
      startTimeSeconds: 17,
      endTimeSeconds: 20,
      hitRate: 0,
      drill: {
        barStart: 18,
        barEnd: 20,
        tempoMultiplier: 0.6,
        targetTempoMultiplier: 0.8,
        maximumAttempts: MAX_SLOW_LOOP_ATTEMPTS,
        terminalOutcomes: ['mastered', 'deferred'],
        passCriteria: {
          minimumResolvedNotes: 12,
          minimumAccuracy: 0.82,
          maximumMisses: 1,
          maximumWrongHits: 1,
          requiredConsecutiveCleanPasses: 2,
        },
      },
    });
  });

  it('treats a late-entry run as a late passage instead of inventing an unplayed-prefix collapse', () => {
    const songChart = chart(20);
    const records: StoredHitRecord[] = songChart.measures.flatMap(
      (measure, index) =>
        measure.notes.map(({ tick }) =>
          record(tick, index >= 17 && tick % 100 === 10 ? 'hit' : 'miss'),
        ),
    );

    records.push(record(1_750, 'wrong'));

    const evidence = buildRunSectionEvidence({
      records,
      sections: createStruggleSectionDefinitions(songChart),
    });

    expect(evidence[0].barStart).toBe(18);
    expect(evidence.at(-1)?.barEnd).toBe(20);
    expect(evidence).toHaveLength(3);
  });

  it('flags and prioritizes a never-played rhythm over a familiar collapse', () => {
    const currentEvidence = [
      section(1, 'known', 8, 0),
      section(2, 'known', 8, 0),
      section(3, 'known', 0, 8),
      section(4, 'known', 0, 8),
      section(5, 'known', 8, 0),
      section(6, 'known', 8, 0),
      section(7, 'novel', 2, 6),
      section(8, 'novel', 2, 6),
    ];
    const prior = storedRun('2026-08-14T00:00:00.000Z', 1, [
      section(1, 'known', 8, 0),
    ]);
    const run = storedRun('2026-08-15T00:00:00.000Z', 1, currentEvidence);
    const report = analyzeStruggle({
      run,
      history: { runs: [prior], patternHistoryState: 'complete' },
    });

    expect(report.collapseSections.map(({ barStart }) => barStart)).toEqual([
      7, 3,
    ]);
    expect(report.collapseSections[0]).toMatchObject({
      novelty: 'new',
      isNovel: true,
      novelPatternSignatures: ['novel'],
    });
    expect(report.collapseSections[1]).toMatchObject({
      novelty: 'seen-before',
      isNovel: false,
    });
  });

  it('does not fabricate novelty when older run patterns are unavailable', () => {
    const run = storedRun('2026-08-15T00:00:00.000Z', 1, [
      section(1, 'novel', 0, 8),
      section(2, 'novel', 0, 8),
    ]);
    const legacy = storedRun('2026-08-14T00:00:00.000Z', 1);
    const report = analyzeStruggle({ run, history: { runs: [legacy] } });

    expect(report.collapseSections[0]).toMatchObject({
      novelty: 'history-unavailable',
      isNovel: false,
    });
  });

  it('carries incomplete archived pattern coverage into the novelty gate', () => {
    const archive = archiveRunSummaries(emptyPracticeRunArchive(), [
      summary('2026-08-14T00:00:00.000Z', 1),
    ]);

    expect(buildStruggleHistory([], [archive])).toMatchObject({
      archivedPatternCounts: {},
      patternHistoryState: 'partial',
    });
  });

  it('returns an explicit unavailable state for legacy runs without section evidence', () => {
    expect(
      analyzeStruggle({
        run: storedRun('2026-08-15T00:00:00.000Z', 1),
        history: { runs: [] },
      }),
    ).toEqual({
      status: 'insufficient-section-evidence',
      analyzedSections: 0,
      collapseSections: [],
    });
  });
});
