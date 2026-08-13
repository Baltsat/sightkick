import type { CoachFinding } from '../coach';
import {
  DEFAULT_MINIMUM_RESOLVED_NOTES,
  DEFAULT_REMEDIATION_SPEED,
  MAX_REMEDIATION_BARS,
  REMEDIATION_NEAR_MISS_ACCURACY,
  REMEDIATION_QUALITY_ACCURACY,
  REQUIRED_CONSECUTIVE_CLEAN_PASSES,
  REMEDIATION_QUEUE_VERSION,
  CreateRemediationQueueInput,
  RecordRemediationPassInput,
  RemediationAttempt,
  RemediationFindingReference,
  RemediationQueue,
  RemediationSource,
  RemediationTask,
} from './types';

type CoachBarFinding = CoachFinding & {
  evidence: CoachFinding['evidence'] & {
    barStart: number;
    barEnd: number;
  };
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function hasBarRange(finding: CoachFinding): finding is CoachBarFinding {
  const { barStart, barEnd } = finding.evidence;

  return (
    isPositiveInteger(barStart) &&
    isPositiveInteger(barEnd) &&
    barStart <= barEnd
  );
}

function taskId(barStart: number, barEnd: number): string {
  return `bars:${barStart}-${barEnd}`;
}

function splitBarRange(
  barStart: number,
  barEnd: number,
): Array<{ barStart: number; barEnd: number }> {
  const ranges: Array<{ barStart: number; barEnd: number }> = [];

  for (let start = barStart; start <= barEnd; start += MAX_REMEDIATION_BARS) {
    ranges.push({
      barStart: start,
      barEnd: Math.min(barEnd, start + MAX_REMEDIATION_BARS - 1),
    });
  }

  return ranges;
}

function findingReference(finding: CoachFinding): RemediationFindingReference {
  return {
    id: finding.id,
    kind: finding.kind,
    severity: finding.severity,
    skillTag: finding.skillTag,
  };
}

function sortReferences(
  findings: readonly RemediationFindingReference[],
): RemediationFindingReference[] {
  return [...findings].sort((left, right) => left.id.localeCompare(right.id));
}

function sourceMatches(
  actual: RemediationSource,
  expected: RemediationSource,
): boolean {
  return (
    actual.runId === expected.runId &&
    actual.sessionId === expected.sessionId &&
    actual.songId === expected.songId &&
    actual.chartRevision === expected.chartRevision &&
    actual.completedAt === expected.completedAt
  );
}

function normalizedMinimumResolvedNotes(value: number | undefined): number {
  return isNonNegativeInteger(value) ? value : DEFAULT_MINIMUM_RESOLVED_NOTES;
}

function normalizedPlaybackSpeed(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(2, Math.max(0.3, value))
    : DEFAULT_REMEDIATION_SPEED;
}

function variedPlaybackSpeed(value: number): number {
  const current = normalizedPlaybackSpeed(value);
  const varied = current < 1 ? current + 0.1 : current - 0.1;

  return Math.round(normalizedPlaybackSpeed(varied) * 10) / 10;
}

function skillLabel(task: RemediationTask): string {
  const labels = [
    ...new Set(
      task.findings.map(({ skillTag }) => skillTag.replaceAll('-', ' ')),
    ),
  ];

  return labels.length === 1 ? labels[0] : 'this phrase';
}

export function remediationTaskWhy(task: RemediationTask): string {
  const skill = skillLabel(task);

  return task.approach === 'tempo-variation'
    ? `The anchor is in. Keep ${skill} through this phrase at ${task.playbackSpeed.toFixed(
        1,
      )}× so it holds when the song moves on.`
    : `Build ${skill} in this phrase first; one clean anchor earns a nearby-tempo return.`;
}

/**
 * Creates one deterministic task per distinct bar range. Multiple Coach cards
 * about the same phrase deliberately become one loop, with every card id kept
 * on that task for an honest return to the original analysis.
 *
 * A queue is absent rather than fabricated when no Coach finding identifies a
 * concrete bar range.
 */
export function createRemediationQueue(
  input: CreateRemediationQueueInput,
): RemediationQueue | null {
  if (
    !isSource(input.source) ||
    !isNonEmptyString(input.createdAt) ||
    (input.id !== undefined && !isNonEmptyString(input.id))
  ) {
    return null;
  }

  const findingsByRange = new Map<string, CoachBarFinding[]>();

  for (const finding of input.findings) {
    if (!hasBarRange(finding)) {
      continue;
    }

    const key = taskId(finding.evidence.barStart, finding.evidence.barEnd);
    const current = findingsByRange.get(key) ?? [];

    findingsByRange.set(key, [...current, finding]);
  }

  const tasks: RemediationTask[] = [...findingsByRange.values()]
    .flatMap((findings) => {
      const first = findings[0];
      const references = sortReferences(
        [
          ...new Map(findings.map((finding) => [finding.id, finding])).values(),
        ].map(findingReference),
      );

      return splitBarRange(first.evidence.barStart, first.evidence.barEnd).map(
        ({ barStart, barEnd }) => ({
          id: taskId(barStart, barEnd),
          barStart,
          barEnd,
          findings: references,
          minimumResolvedNotes: normalizedMinimumResolvedNotes(
            input.minimumResolvedNotesForRange?.(barStart, barEnd, findings),
          ),
          playbackSpeed: normalizedPlaybackSpeed(
            input.playbackSpeedForRange?.(barStart, barEnd, findings) ??
              findings.find(
                (finding) => finding.evidence.slowSpeed !== undefined,
              )?.evidence.slowSpeed,
          ),
          approach: 'anchor' as const,
          status: 'pending' as const,
          consecutiveCleanPasses: 0,
          attempts: [],
        }),
      );
    })
    .sort(
      (left, right) =>
        left.barStart - right.barStart ||
        left.barEnd - right.barEnd ||
        left.id.localeCompare(right.id),
    )
    .map((task, index) =>
      index === 0 ? { ...task, status: 'active' as const } : task,
    );

  if (tasks.length === 0) {
    return null;
  }

  return {
    version: REMEDIATION_QUEUE_VERSION,
    id: input.id ?? `remediation:${input.source.runId}`,
    source: { ...input.source },
    createdAt: input.createdAt,
    status: 'active',
    activeTaskIndex: 0,
    tasks,
  };
}

export function getActiveRemediationTask(
  queue: RemediationQueue,
): RemediationTask | null {
  return queue.status === 'active'
    ? queue.tasks[queue.activeTaskIndex] ?? null
    : null;
}

export function isRemediationComplete(queue: RemediationQueue): boolean {
  return queue.status === 'completed';
}

function isValidPassInput(input: RecordRemediationPassInput): boolean {
  return (
    isNonEmptyString(input.completedAt) &&
    isNonNegativeInteger(input.resolvedNotes) &&
    isNonNegativeInteger(input.misses) &&
    isNonNegativeInteger(input.wrongHits)
  );
}

function assessRemediationPass(
  minimumResolvedNotes: number,
  input: Pick<
    RecordRemediationPassInput,
    'resolvedNotes' | 'misses' | 'wrongHits'
  >,
) {
  const isErrorFree = input.misses === 0 && input.wrongHits === 0;
  const hasSufficientCoverage = input.resolvedNotes >= minimumResolvedNotes;
  const denominator = Math.max(1, input.resolvedNotes + input.wrongHits);
  const accuracy =
    minimumResolvedNotes === 0 &&
    input.resolvedNotes === 0 &&
    input.wrongHits === 0
      ? 1
      : Math.max(0, (input.resolvedNotes - input.misses) / denominator);
  const allowedMisses = minimumResolvedNotes >= 6 ? 1 : 0;
  const allowedWrongHits = minimumResolvedNotes >= 8 ? 1 : 0;
  const qualifiesAsCleanPass =
    hasSufficientCoverage &&
    accuracy >= REMEDIATION_QUALITY_ACCURACY &&
    input.misses <= allowedMisses &&
    input.wrongHits <= allowedWrongHits;
  const nearMiss =
    hasSufficientCoverage &&
    accuracy >= REMEDIATION_NEAR_MISS_ACCURACY &&
    input.wrongHits <= Math.max(1, allowedWrongHits);

  return {
    isErrorFree,
    hasSufficientCoverage,
    qualifiesAsCleanPass,
    nearMiss,
  };
}

function makeAttempt(
  task: RemediationTask,
  input: RecordRemediationPassInput,
): RemediationAttempt {
  const { isErrorFree, hasSufficientCoverage, qualifiesAsCleanPass, nearMiss } =
    assessRemediationPass(task.minimumResolvedNotes, input);
  const progressAfter = qualifiesAsCleanPass
    ? task.consecutiveCleanPasses + 1
    : nearMiss
    ? task.consecutiveCleanPasses
    : Math.max(0, task.consecutiveCleanPasses - 1);

  return {
    ...input,
    approach: task.approach ?? 'anchor',
    isErrorFree,
    hasSufficientCoverage,
    qualifiesAsCleanPass,
    consecutiveCleanPassesAfter: progressAfter,
  };
}

/**
 * Records exactly one completed loop. A useful near miss is retained as
 * evidence instead of erasing the preceding pass; a clearly unplayable pass
 * steps progress down by one. Completing the final task keeps the original
 * source identity intact for the review return.
 */
export function recordRemediationPass(
  queue: RemediationQueue,
  input: RecordRemediationPassInput,
): RemediationQueue {
  const activeTask = getActiveRemediationTask(queue);

  if (activeTask === null || !isValidPassInput(input)) {
    return queue;
  }

  const attempt = makeAttempt(activeTask, input);
  const taskCompleted =
    attempt.consecutiveCleanPassesAfter >= REQUIRED_CONSECUTIVE_CLEAN_PASSES;
  const shouldVary =
    attempt.qualifiesAsCleanPass &&
    activeTask.consecutiveCleanPasses === 0 &&
    !taskCompleted &&
    activeTask.approach !== 'tempo-variation';
  const nextActiveTaskIndex = taskCompleted
    ? queue.activeTaskIndex + 1
    : queue.activeTaskIndex;
  const queueCompleted = nextActiveTaskIndex >= queue.tasks.length;
  const tasks = queue.tasks.map((task, index) => {
    if (index === queue.activeTaskIndex) {
      return {
        ...task,
        attempts: [...task.attempts, attempt],
        consecutiveCleanPasses: attempt.consecutiveCleanPassesAfter,
        ...(shouldVary
          ? {
              id: `${task.id}:tempo`,
              approach: 'tempo-variation' as const,
              playbackSpeed: variedPlaybackSpeed(task.playbackSpeed),
            }
          : {}),
        ...(taskCompleted
          ? { status: 'completed' as const, completedAt: input.completedAt }
          : {}),
      };
    }

    if (taskCompleted && index === nextActiveTaskIndex) {
      return { ...task, status: 'active' as const };
    }

    return task;
  });

  return {
    ...queue,
    tasks,
    activeTaskIndex: nextActiveTaskIndex,
    ...(queueCompleted
      ? { status: 'completed' as const, completedAt: input.completedAt }
      : {}),
  };
}

/** Stable, namespaced key for a generic localStorage or persisted-hook caller. */
export function remediationQueueStorageKey(source: RemediationSource): string {
  return [
    'drumroll',
    'remediation',
    `v${REMEDIATION_QUEUE_VERSION}`,
    encodeURIComponent(source.songId),
    encodeURIComponent(source.chartRevision),
    encodeURIComponent(source.runId),
  ].join(':');
}

/** One discoverable active/completed journey slot per song chart revision. */
export function remediationQueueSlotKey(
  songId: string,
  chartRevision: string,
): string {
  return [
    'drumroll',
    'remediation-slot',
    `v${REMEDIATION_QUEUE_VERSION}`,
    encodeURIComponent(songId),
    encodeURIComponent(chartRevision),
  ].join(':');
}

function isFindingReference(
  value: unknown,
): value is RemediationFindingReference {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.kind) &&
    isNonEmptyString(value.severity) &&
    isNonEmptyString(value.skillTag)
  );
}

function isAttempt(
  value: unknown,
  minimumResolvedNotes: number,
): value is RemediationAttempt {
  if (!isPlainObject(value)) {
    return false;
  }

  if (
    !isNonEmptyString(value.completedAt) ||
    !isNonNegativeInteger(value.resolvedNotes) ||
    !isNonNegativeInteger(value.misses) ||
    !isNonNegativeInteger(value.wrongHits) ||
    typeof value.isErrorFree !== 'boolean' ||
    typeof value.hasSufficientCoverage !== 'boolean' ||
    typeof value.qualifiesAsCleanPass !== 'boolean' ||
    !isNonNegativeInteger(value.consecutiveCleanPassesAfter)
  ) {
    return false;
  }

  if (
    value.approach !== undefined &&
    value.approach !== 'anchor' &&
    value.approach !== 'tempo-variation'
  ) {
    return false;
  }

  const isErrorFree = value.misses === 0 && value.wrongHits === 0;
  const assessment = assessRemediationPass(minimumResolvedNotes, {
    resolvedNotes: value.resolvedNotes,
    misses: value.misses,
    wrongHits: value.wrongHits,
  });

  return (
    value.isErrorFree === isErrorFree &&
    value.hasSufficientCoverage === assessment.hasSufficientCoverage &&
    (value.qualifiesAsCleanPass === assessment.qualifiesAsCleanPass ||
      // Legacy v1 attempts used a stricter zero-error gate. Preserve them as
      // honest failures while all newly recorded passes use the adaptive gate.
      (!value.isErrorFree && !value.qualifiesAsCleanPass))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is RemediationSource {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.songId) &&
    isNonEmptyString(value.chartRevision) &&
    isNonEmptyString(value.completedAt)
  );
}

function isTask(value: unknown): value is RemediationTask {
  if (!isPlainObject(value)) {
    return false;
  }

  const minimumResolvedNotes = value.minimumResolvedNotes;

  if (
    !isNonEmptyString(value.id) ||
    !isPositiveInteger(value.barStart) ||
    !isPositiveInteger(value.barEnd) ||
    value.barStart > value.barEnd ||
    !Array.isArray(value.findings) ||
    value.findings.length === 0 ||
    !value.findings.every(isFindingReference) ||
    !isNonNegativeInteger(minimumResolvedNotes) ||
    typeof value.playbackSpeed !== 'number' ||
    !Number.isFinite(value.playbackSpeed) ||
    value.playbackSpeed < 0.3 ||
    value.playbackSpeed > 2 ||
    (value.status !== 'pending' &&
      value.status !== 'active' &&
      value.status !== 'completed') ||
    !isNonNegativeInteger(value.consecutiveCleanPasses) ||
    !Array.isArray(value.attempts)
  ) {
    return false;
  }

  if (
    value.approach !== undefined &&
    value.approach !== 'anchor' &&
    value.approach !== 'tempo-variation'
  ) {
    return false;
  }

  if (
    !value.attempts.every((attempt) => isAttempt(attempt, minimumResolvedNotes))
  ) {
    return false;
  }

  let expectedCleanPasses = 0;

  for (const attempt of value.attempts) {
    const assessment = assessRemediationPass(minimumResolvedNotes, attempt);

    expectedCleanPasses = attempt.qualifiesAsCleanPass
      ? expectedCleanPasses + 1
      : assessment.nearMiss
      ? expectedCleanPasses
      : Math.max(0, expectedCleanPasses - 1);

    if (attempt.consecutiveCleanPassesAfter !== expectedCleanPasses) {
      // v1 queues created before retained progress reset a near miss to zero.
      // Accept that honest old state; every newly recorded attempt uses the
      // non-erasing progression above.
      if (
        !attempt.qualifiesAsCleanPass &&
        attempt.consecutiveCleanPassesAfter === 0
      ) {
        expectedCleanPasses = 0;
      } else {
        return false;
      }
    }
  }

  const isComplete = value.status === 'completed';

  return (
    value.consecutiveCleanPasses === expectedCleanPasses &&
    (isComplete
      ? expectedCleanPasses >= REQUIRED_CONSECUTIVE_CLEAN_PASSES &&
        isNonEmptyString(value.completedAt)
      : value.completedAt === undefined) &&
    (isComplete || expectedCleanPasses < REQUIRED_CONSECUTIVE_CLEAN_PASSES)
  );
}

/**
 * Strictly validates the complete persisted shape. Returning null is the safe
 * recovery path for malformed/tampered/old localStorage rather than resuming a
 * player at an unrelated or unverifiable practice loop.
 */
export function isRemediationQueue(value: unknown): value is RemediationQueue {
  if (!isPlainObject(value)) {
    return false;
  }

  const activeTaskIndex = value.activeTaskIndex;

  if (
    value.version !== REMEDIATION_QUEUE_VERSION ||
    !isNonEmptyString(value.id) ||
    !isSource(value.source) ||
    !isNonEmptyString(value.createdAt) ||
    (value.status !== 'active' && value.status !== 'completed') ||
    !isNonNegativeInteger(activeTaskIndex) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length === 0 ||
    !value.tasks.every(isTask)
  ) {
    return false;
  }

  const isComplete = value.status === 'completed';
  const expectedActiveIndex = isComplete ? value.tasks.length : activeTaskIndex;

  if (
    expectedActiveIndex !== activeTaskIndex ||
    (!isComplete && activeTaskIndex >= value.tasks.length) ||
    (isComplete && !isNonEmptyString(value.completedAt)) ||
    (!isComplete && value.completedAt !== undefined)
  ) {
    return false;
  }

  return value.tasks.every((task, index) => {
    if (isComplete || index < activeTaskIndex) {
      return task.status === 'completed';
    }

    if (index === activeTaskIndex) {
      return task.status === 'active';
    }

    return task.status === 'pending';
  });
}

export function serializeRemediationQueue(queue: RemediationQueue): string {
  return JSON.stringify(queue);
}

export function deserializeRemediationQueue(
  serialized: string | null | undefined,
): RemediationQueue | null {
  if (!serialized) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(serialized);

    return isRemediationQueue(value) ? value : null;
  } catch {
    return null;
  }
}

/** Restores only the exact original run review, never a similarly named song. */
export function restoreRemediationQueue(
  serialized: string | null | undefined,
  expectedSource: RemediationSource,
): RemediationQueue | null {
  const queue = deserializeRemediationQueue(serialized);

  return queue !== null && sourceMatches(queue.source, expectedSource)
    ? queue
    : null;
}
