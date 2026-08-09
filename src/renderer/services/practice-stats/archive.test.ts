import { describe, expect, it } from 'vitest';
import {
  archiveRunSummaries,
  emptyPracticeRunArchive,
  historicalDetailState,
  MAX_ARCHIVED_CHART_REVISIONS_PER_DAY,
  readPracticeRunArchive,
} from './archive';
import { RunSummary } from './types';

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: '2026-08-10T12:00:00.000Z',
    totalHits: 8,
    totalMisses: 2,
    totalWrong: 0,
    overallAccuracy: 0.8,
    laneAccuracy: [],
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 0,
      sampleCount: 0,
    },
    ...overrides,
  };
}

describe('practice archive learning evidence', () => {
  it('keeps trouble and recovery evidence separate by chart revision', () => {
    const archive = archiveRunSummaries(emptyPracticeRunArchive(), [
      run({
        context: {
          sessionId: 's1',
          schemaVersion: 2,
          appVersion: 'test',
          scoringPolicyVersion: 'test',
          startedAt: '2026-08-10T11:00:00.000Z',
          chartRevision: 'song:expert:rev-a',
          inputLatencyMs: 0,
          inputMapping: {},
        },
        learningEvidence: {
          skills: {
            fills: { troubleCount: 2, recoveryCleanCount: 1 },
          },
          bars: {
            '7': { troubleCount: 2, recoveryRetryCount: 1 },
          },
        },
      }),
      run({
        completedAt: '2026-08-10T13:00:00.000Z',
        context: {
          sessionId: 's2',
          schemaVersion: 2,
          appVersion: 'test',
          scoringPolicyVersion: 'test',
          startedAt: '2026-08-10T12:00:00.000Z',
          chartRevision: 'song:expert:rev-b',
          inputLatencyMs: 0,
          inputMapping: {},
        },
        learningEvidence: {
          skills: { fills: { troubleCount: 1 } },
          bars: { '7': { recoveryDeferredCount: 1 } },
        },
      }),
    ]);
    const day = archive.days['2026-08-10'];

    expect(day.historicalDetailState).toBe('available');
    expect(day.chartRevisions?.['song:expert:rev-a']).toMatchObject({
      runCount: 1,
      skills: { fills: { troubleCount: 2, recoveryCleanCount: 1 } },
      bars: { '7': { troubleCount: 2, recoveryRetryCount: 1 } },
    });
    expect(day.chartRevisions?.['song:expert:rev-b']).toMatchObject({
      skills: { fills: { troubleCount: 1 } },
      bars: { '7': { recoveryDeferredCount: 1 } },
    });
    expect(historicalDetailState(archive)).toBe('available');
  });

  it('reports legacy and summary-only history as detail-unavailable instead of reconstructing bars', () => {
    const legacy = readPracticeRunArchive({
      schemaVersion: 1,
      days: {
        '2021-01-01': {
          date: '2021-01-01',
          runCount: 2,
          totalHits: 16,
          totalMisses: 4,
        },
      },
    });

    expect(legacy.days['2021-01-01'].historicalDetailState).toBe(
      'historical-detail-unavailable',
    );
    expect(historicalDetailState(legacy)).toBe('historical-detail-unavailable');
    expect(legacy.days['2021-01-01'].chartRevisions).toBeUndefined();
  });

  it('bounds old revision detail without changing the daily run aggregate', () => {
    const summaries = Array.from(
      { length: MAX_ARCHIVED_CHART_REVISIONS_PER_DAY + 3 },
      (_, index) =>
        run({
          completedAt: `2026-08-10T${String(index).padStart(
            2,
            '0',
          )}:00:00.000Z`,
          context: {
            sessionId: `s${index}`,
            schemaVersion: 2,
            appVersion: 'test',
            scoringPolicyVersion: 'test',
            startedAt: '2026-08-10T00:00:00.000Z',
            chartRevision: `song:expert:rev-${index}`,
            inputLatencyMs: 0,
            inputMapping: {},
          },
          learningEvidence: { bars: { '1': { troubleCount: 1 } } },
        }),
    );
    const archive = archiveRunSummaries(emptyPracticeRunArchive(), summaries);
    const day = archive.days['2026-08-10'];

    expect(day.runCount).toBe(summaries.length);
    expect(Object.keys(day.chartRevisions ?? {})).toHaveLength(
      MAX_ARCHIVED_CHART_REVISIONS_PER_DAY,
    );
  });
});
