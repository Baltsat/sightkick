import { describe, expect, it } from 'vitest';
import type { CoachFinding } from '../coach';
import {
  DEFAULT_MINIMUM_RESOLVED_NOTES,
  MAX_REMEDIATION_BARS,
  REQUIRED_CONSECUTIVE_CLEAN_PASSES,
  createRemediationQueue,
  deserializeRemediationQueue,
  getActiveRemediationTask,
  isRemediationComplete,
  recordRemediationPass,
  remediationQueueStorageKey,
  remediationQueueSlotKey,
  remediationTaskWhy,
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

function recordCleanPass(
  queue: NonNullable<ReturnType<typeof createQueue>>,
  minute: number,
) {
  const task = getActiveRemediationTask(queue);

  if (!task) {
    return queue;
  }

  return recordRemediationPass(queue, {
    completedAt: `2026-08-10T09:${String(minute).padStart(2, '0')}:00.000Z`,
    resolvedNotes: task.minimumResolvedNotes,
    misses: 0,
    wrongHits: 0,
  });
}

function completeQueue(queue: NonNullable<ReturnType<typeof createQueue>>) {
  let current = queue;
  let minute = 40;

  while (!isRemediationComplete(current)) {
    current = recordCleanPass(current, minute);
    minute += 1;
  }

  return current;
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
    expect(
      queue?.tasks.filter(({ approach }) => approach === 'anchor'),
    ).toEqual([
      expect.objectContaining({
        id: 'bars:4-5',
        barStart: 4,
        barEnd: 5,
        minimumResolvedNotes: 7,
        playbackSpeed: 0.7,
        approach: 'anchor',
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

  it('plans each tempo step through an explicit target-tempo probe', () => {
    const queue = createQueue();

    expect(
      queue?.tasks.map(({ id, playbackSpeed, approach }) => ({
        id,
        playbackSpeed,
        approach,
      })),
    ).toEqual([
      { id: 'bars:4-5', playbackSpeed: 0.7, approach: 'anchor' },
      {
        id: 'bars:4-5:tempo-0.8',
        playbackSpeed: 0.8,
        approach: 'tempo-variation',
      },
      {
        id: 'bars:4-5:tempo-0.9',
        playbackSpeed: 0.9,
        approach: 'tempo-variation',
      },
      { id: 'bars:4-5:target', playbackSpeed: 1, approach: 'target-probe' },
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

    expect(queue?.tasks).toEqual([
      expect.objectContaining({
        playbackSpeed: 1,
        approach: 'anchor',
      }),
    ]);
    expect(
      deserializeRemediationQueue(serializeRemediationQueue(queue!)),
    ).toEqual(queue);
  });

  it('splits a long Coach finding into four-bar loops without losing its review link', () => {
    const queue = createRemediationQueue({
      source,
      findings: [finding('bars-76-89', 76, 89)],
      createdAt: '2026-08-10T09:31:00.000Z',
      minimumResolvedNotesForRange: (barStart, barEnd) =>
        (barEnd - barStart + 1) * 4,
    });

    expect(MAX_REMEDIATION_BARS).toBe(4);
    expect(
      queue?.tasks.filter(({ approach }) => approach === 'anchor'),
    ).toEqual([
      expect.objectContaining({
        id: 'bars:76-79',
        barStart: 76,
        barEnd: 79,
        minimumResolvedNotes: 16,
        status: 'active',
        findings: [expect.objectContaining({ id: 'bars-76-89' })],
      }),
      expect.objectContaining({
        id: 'bars:80-83',
        barStart: 80,
        barEnd: 83,
        minimumResolvedNotes: 16,
        status: 'pending',
      }),
      expect.objectContaining({
        id: 'bars:84-87',
        barStart: 84,
        barEnd: 87,
        minimumResolvedNotes: 16,
        status: 'pending',
      }),
      expect.objectContaining({
        id: 'bars:88-89',
        barStart: 88,
        barEnd: 89,
        minimumResolvedNotes: 8,
        status: 'pending',
      }),
    ]);
    expect(queue?.tasks).toHaveLength(16);
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
      completedAt: '2026-08-10T09:34:00.000Z',
      resolvedNotes: 6,
      misses: 0,
      wrongHits: 0,
    });

    expect(getActiveRemediationTask(firstClean)).toMatchObject({
      id: 'bars:4-5:tempo-0.8',
      status: 'active',
    });
    expect(firstClean).toMatchObject({
      status: 'active',
      activeTaskIndex: 1,
      source,
    });
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

    const completed = completeQueue(secondClean);

    expect(getActiveRemediationTask(secondClean)).toMatchObject({
      id: 'bars:4-5:tempo-0.8',
      consecutiveCleanPasses: 1,
    });
    expect(isRemediationComplete(completed)).toBe(true);
  });

  it('requires two quality passes at each planned tempo step', () => {
    const queue = createQueue();

    expect(queue).not.toBeNull();
    expect(remediationTaskWhy(queue!.tasks[0])).toBe(
      'Build timing in this phrase. Save 2 good-enough passes. Then test the next tempo.',
    );

    const anchor = recordRemediationPass(queue!, {
      completedAt: '2026-08-10T09:32:00.000Z',
      resolvedNotes: 6,
      misses: 0,
      wrongHits: 0,
    });
    const varied = getActiveRemediationTask(anchor);

    expect(varied).toMatchObject({
      id: 'bars:4-5',
      approach: 'anchor',
      playbackSpeed: 0.7,
      consecutiveCleanPasses: 1,
      attempts: [expect.objectContaining({ approach: 'anchor' })],
    });

    const nextStep = recordRemediationPass(anchor, {
      completedAt: '2026-08-10T09:33:00.000Z',
      resolvedNotes: 6,
      misses: 0,
      wrongHits: 0,
    });

    expect(nextStep.tasks[0]).toMatchObject({
      id: 'bars:4-5',
      approach: 'anchor',
      status: 'completed',
    });
    expect(getActiveRemediationTask(nextStep)).toMatchObject({
      id: 'bars:4-5:tempo-0.8',
      approach: 'tempo-variation',
      playbackSpeed: 0.8,
      consecutiveCleanPasses: 0,
    });
    expect(remediationTaskWhy(getActiveRemediationTask(nextStep)!)).toBe(
      'The anchor is in. Keep timing through this phrase at 0.8× before the next planned tempo probe.',
    );
    expect(
      deserializeRemediationQueue(serializeRemediationQueue(nextStep)),
    ).toEqual(nextStep);
  });

  it('advances through multiple phrases only after each phrase is mastered', () => {
    const queue = createRemediationQueue({
      source,
      findings: [finding('first', 2), finding('second', 7)],
      createdAt: '2026-08-10T09:31:00.000Z',
      minimumResolvedNotesForRange: () => 4,
    });

    expect(queue).not.toBeNull();

    let afterFirstPhrase = queue!;

    for (let minute = 32; minute < 40; minute += 1) {
      afterFirstPhrase = recordCleanPass(afterFirstPhrase, minute);
    }

    expect(afterFirstPhrase).toMatchObject({
      status: 'active',
      activeTaskIndex: 4,
    });
    expect(getActiveRemediationTask(afterFirstPhrase)).toMatchObject({
      id: 'bars:7-7',
      status: 'active',
    });

    const completed = completeQueue(afterFirstPhrase);

    expect(completed).toMatchObject({
      status: 'completed',
      activeTaskIndex: 8,
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
    const completed = completeQueue(secondClean);

    expect(completed.status).toBe('completed');
    expect(
      deserializeRemediationQueue(serializeRemediationQueue(completed)),
    ).toEqual(completed);
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
