import {
  HitRecord,
  RunSummary,
  summarizeRun,
} from '../../services/practice-stats';

function hit(element: HitRecord['element'], deltaMs: number): HitRecord {
  return { tick: 0, timeSeconds: 0, deltaMs, element, verdict: 'hit' };
}

function miss(element: HitRecord['element']): HitRecord {
  return { tick: 0, timeSeconds: 0, deltaMs: 0, element, verdict: 'miss' };
}

function wrong(element: HitRecord['element']): HitRecord {
  return { tick: 0, timeSeconds: 0, deltaMs: 0, element, verdict: 'wrong' };
}

/** A mixed-lane run: uneven accuracy per drum, a consistent early bias led
 * by kick, and a couple of wrong hits on hihat. */
export function multiLaneRunFixture(
  completedAt = '2026-08-01T00:00:00.000Z',
): RunSummary {
  return summarizeRun(
    [
      hit('kick', -30),
      hit('kick', -25),
      hit('kick', -20),
      miss('kick'),
      hit('snare', -5),
      hit('snare', 5),
      hit('snare', 0),
      hit('hihat', -10),
      wrong('hihat'),
      wrong('hihat'),
      wrong('kick'),
    ],
    completedAt,
  );
}

/** A single-lane (kick-only) practice drill. */
export function singleLaneRunFixture(
  completedAt = '2026-08-02T00:00:00.000Z',
): RunSummary {
  return summarizeRun(
    [hit('kick', 12), hit('kick', 18), hit('kick', 8), miss('kick')],
    completedAt,
  );
}

/** A perfectly on-time, all-hit run: no bias, no wrong hits. */
export function perfectRunFixture(
  completedAt = '2026-08-03T00:00:00.000Z',
): RunSummary {
  return summarizeRun(
    [hit('kick', 0), hit('snare', 0), hit('hihat', 0)],
    completedAt,
  );
}

export function emptyRunFixture(
  completedAt = '2026-08-04T00:00:00.000Z',
): RunSummary {
  return summarizeRun([], completedAt);
}

export function runHistoryFixture(): RunSummary[] {
  const accuracies = [
    0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.72, 0.8, 0.85, 0.9,
  ];

  return accuracies.map((accuracy, index) => {
    const day = String(index + 1).padStart(2, '0');

    return summarizeRun(
      Array.from({ length: 10 }, (_, i) =>
        i < Math.round(accuracy * 10) ? hit('kick', 0) : miss('kick'),
      ),
      `2026-07-${day}T00:00:00.000Z`,
    );
  });
}
