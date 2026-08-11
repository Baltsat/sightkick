import { describe, expect, it } from 'vitest';
import type { CoachFinding } from '../coach';
import {
  DEFAULT_MINIMUM_RESOLVED_NOTES,
  REQUIRED_CONSECUTIVE_CLEAN_PASSES,
  createRemediationQueue,
  deserializeRemediationQueue,
  getActiveRemediationTask,
  isRemediationComplete,
  recordRemediationPass,
  remediationQueueStorageKey,
  remediationQueueSlotKey,
  restoreRemediationQueue,
  serializeRemediationQueue,
} from './index';
import type { RemediationSource } from './types';

const source: RemediationSource = {
  runId: 'run-boulevard-001',
  sessionId: 'session-boulevard-001',
  songId: 'boulevard-of-broken-dreams',
  chartRevision: 'sha256:chart-v3',
  completedAt: '2026-08-10T09:30:00.000Z',
};

function finding(
  id: string,
  barStart: number | undefined,
  barEnd = barStart,
): CoachFinding {
  return {
    id,
    kind: 'trouble-bars',
    severity: 'high',
    title: `Trouble bars ${barStart}`,
    summary: 'The phrase needs a focused loop.',
    skillTag: 'timing',
    evidence: {
      sampleCount: 8,
      ...(barStart === undefined ? {} : { barStart, barEnd }),
    },
  };
}

function createQueue() {
  return createRemediationQueue({
    source,
    findings: [finding('bars-4-5', 4, 5), finding('same-bars', 4, 5)],
    createdAt: '2026-08-10T09:31:00.000Z',
    minimumResolvedNotesForRange: () => 6,
  });
}

describe('remediation queue', () => {
  it('builds deterministic bar tasks from Coach findings and retains the source review identity', () => {
    const queue = createRemediationQueue({
      source,
      findings: [
        finding('bars-9', 9),
        finding('same-bars-a', 4, 5),
        finding('same-bars-b', 4, 5),
        finding('not-a-bar', undefined),
      ],
      createdAt: '2026-08-10T09:31:00.000Z',
      minimumResolvedNotesForRange: (barStart, barEnd) => barEnd - barStart + 6,
    });

    expect(queue).not.toBeNull();
    expect(queue).toMatchObject({
      id: 'remediation:run-boulevard-001',
      source,
      status: 'active',
      activeTaskIndex: 0,
    });
    expect(queue?.tasks).toEqual([
      expect.objectContaining({
        id: 'bars:4-5',
        barStart: 4,
        barEnd: 5,
        minimumResolvedNotes: 7,
        playbackSpeed: 0.7,
        status: 'active',
        findings: [
          expect.objectContaining({ id: 'same-bars-a' }),
          expect.objectContaining({ id: 'same-bars-b' }),
        ],
      }),
      expect.objectContaining({
        id: 'bars:9-9',
        minimumResolvedNotes: 6,
        status: 'pending',
      }),
    ]);
  });

  it('persists a bounded Coach tempo for every task', () => {
    const queue = createRemediationQueue({
      source,
      findings: [
        {
          ...finding('fast', 3),
          evidence: {
            ...finding('fast', 3).evidence,
            slowSpeed: 0.82,
          },
        },
      ],
      createdAt: '2026-08-10T09:31:00.000Z',
      playbackSpeedForRange: () => 4,
    });

    expect(queue?.tasks[0].playbackSpeed).toBe(2);
    expect(
      deserializeRemediationQueue(serializeRemediationQueue(queue!)),
    ).toEqual(queue);
  });

  it('accepts a developing one-miss pass and reaches a finite terminal state', () => {
    const queue = createQueue();

    expect(queue).not.toBeNull();

    const insufficient = recordRemediationPass(queue!, {
      completedAt: '2026-08-10T09:32:00.000Z',
      resolvedNotes: 5,
      misses: 0,
      wrongHits: 0,
    });
    const failed = recordRemediationPass(insufficient, {
      completedAt: '2026-08-10T09:33:00.000Z',
      resolvedNotes: 6,
      misses: 1,
      wrongHits: 0,
    });

    expect(
      deserializeRemediationQueue(serializeRemediationQueue(insufficient)),
    ).toEqual(insufficient);
    expect(
      deserializeRemediationQueue(serializeRemediationQueue(failed)),
    ).toEqual(failed);

    const firstClean = recordRemediationPass(failed, {
      completedAt: '2026-08-10T09:34:00.000Z',
      resolvedNotes: 6,
      misses: 0,
      wrongHits: 0,
    });
    const secondClean = recordRemediationPass(firstClean, {
      completedAt: '2026-08-10T09:35:00.000Z',
      resolvedNotes: 6,
      misses: 0,
      wrongHits: 0,
    });

    expect(getActiveRemediationTask(firstClean)).toBeNull();
    expect(firstClean).toMatchObject({
      status: 'completed',
      activeTaskIndex: 1,
      source,
      completedAt: '2026-08-10T09:34:00.000Z',
    });
    expect(secondClean).toEqual(firstClean);
    expect(firstClean.tasks[0]).toMatchObject({
      status: 'completed',
      consecutiveCleanPasses: REQUIRED_CONSECUTIVE_CLEAN_PASSES,
      completedAt: '2026-08-10T09:34:00.000Z',
    });
    expect(firstClean.tasks[0].attempts).toEqual([
      expect.objectContaining({
        resolvedNotes: 5,
        isErrorFree: true,
        hasSufficientCoverage: false,
        qualifiesAsCleanPass: false,
        consecutiveCleanPassesAfter: 0,
      }),
      expect.objectContaining({
        misses: 1,
        isErrorFree: false,
        qualifiesAsCleanPass: true,
        consecutiveCleanPassesAfter: 1,
      }),
      expect.objectContaining({
        qualifiesAsCleanPass: true,
        consecutiveCleanPassesAfter: 2,
      }),
    ]);
    expect(isRemediationComplete(firstClean)).toBe(true);
  });

  it('advances through multiple phrases only after each phrase is mastered', () => {
    const queue = createRemediationQueue({
      source,
      findings: [finding('first', 2), finding('second', 7)],
      createdAt: '2026-08-10T09:31:00.000Z',
      minimumResolvedNotesForRange: () => 4,
    });

    expect(queue).not.toBeNull();

    const afterFirstPhrase = [
      '2026-08-10T09:32:00.000Z',
      '2026-08-10T09:33:00.000Z',
    ].reduce(
      (state, completedAt) =>
        recordRemediationPass(state, {
          completedAt,
          resolvedNotes: 4,
          misses: 0,
          wrongHits: 0,
        }),
      queue!,
    );

    expect(afterFirstPhrase).toMatchObject({
      status: 'active',
      activeTaskIndex: 1,
    });
    expect(getActiveRemediationTask(afterFirstPhrase)).toMatchObject({
      id: 'bars:7-7',
      status: 'active',
    });

    const completed = [
      '2026-08-10T09:34:00.000Z',
      '2026-08-10T09:35:00.000Z',
    ].reduce(
      (state, completedAt) =>
        recordRemediationPass(state, {
          completedAt,
          resolvedNotes: 4,
          misses: 0,
          wrongHits: 0,
        }),
      afterFirstPhrase,
    );

    expect(completed).toMatchObject({
      status: 'completed',
      activeTaskIndex: 2,
      source,
    });
  });

  it('clears a rest-only trouble range after two natural zero-wrong silent passes', () => {
    const queue = createRemediationQueue({
      source,
      findings: [finding('silence-control', 4)],
      createdAt: '2026-08-10T09:40:00.000Z',
      minimumResolvedNotesForRange: () => 0,
    });

    expect(queue?.tasks[0].minimumResolvedNotes).toBe(0);

    const firstClean = recordRemediationPass(queue!, {
      completedAt: '2026-08-10T09:41:00.000Z',
      resolvedNotes: 0,
      misses: 0,
      wrongHits: 0,
    });
    const secondClean = recordRemediationPass(firstClean, {
      completedAt: '2026-08-10T09:42:00.000Z',
      resolvedNotes: 0,
      misses: 0,
      wrongHits: 0,
    });

    expect(secondClean.status).toBe('completed');
    expect(
      deserializeRemediationQueue(serializeRemediationQueue(secondClean)),
    ).toEqual(secondClean);
  });

  it('round-trips only current versioned state and refuses unsafe recovery', () => {
    const queue = createQueue();

    expect(queue).not.toBeNull();

    const saved = serializeRemediationQueue(queue!);

    expect(deserializeRemediationQueue(saved)).toEqual(queue);
    expect(restoreRemediationQueue(saved, source)).toEqual(queue);
    expect(
      restoreRemediationQueue(saved, { ...source, sessionId: 'other-session' }),
    ).toBeNull();
    expect(deserializeRemediationQueue('{not json')).toBeNull();
    expect(
      deserializeRemediationQueue(
        JSON.stringify({ ...queue, version: 999, tasks: [] }),
      ),
    ).toBeNull();
    expect(
      deserializeRemediationQueue(
        JSON.stringify({
          ...queue,
          tasks: [
            {
              ...queue!.tasks[0],
              status: 'completed',
              consecutiveCleanPasses: 2,
              completedAt: '2026-08-10T10:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(remediationQueueStorageKey(source)).toBe(
      'drumroll:remediation:v1:boulevard-of-broken-dreams:sha256%3Achart-v3:run-boulevard-001',
    );
    expect(remediationQueueSlotKey(source.songId, source.chartRevision)).toBe(
      'drumroll:remediation-slot:v1:boulevard-of-broken-dreams:sha256%3Achart-v3',
    );
  });

  it('does not invent a queue for non-bar Coach observations', () => {
    expect(
      createRemediationQueue({
        source,
        findings: [finding('speed', undefined)],
        createdAt: '2026-08-10T09:31:00.000Z',
      }),
    ).toBeNull();

    const queue = createRemediationQueue({
      source,
      findings: [finding('bar', 1)],
      createdAt: '2026-08-10T09:31:00.000Z',
    });

    expect(queue?.tasks[0].minimumResolvedNotes).toBe(
      DEFAULT_MINIMUM_RESOLVED_NOTES,
    );

    expect(
      createRemediationQueue({
        source: { ...source, runId: '' },
        findings: [finding('bar', 1)],
        createdAt: '2026-08-10T09:31:00.000Z',
      }),
    ).toBeNull();
  });
});
