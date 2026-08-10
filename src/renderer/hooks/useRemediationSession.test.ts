import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Measure, ParsedChart } from '../../chart-parser/types';
import type { Engine, ResolvedJudgement } from '../services/engine';
import { createRemediationQueue } from '../services/remediation';
import { useRemediationSession } from './useRemediationSession';

function fakeEngine() {
  const judgements = new Set<(judgement: ResolvedJudgement) => void>();
  const resets = new Set<() => void>();
  const loopRestarts = new Set<() => void>();
  const subscribe = <T>(listeners: Set<T>, listener: T) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  return {
    engine: {
      onJudgement: (listener: (judgement: ResolvedJudgement) => void) =>
        subscribe(judgements, listener),
      onReset: (listener: () => void) => subscribe(resets, listener),
      onLoopRestart: (listener: () => void) =>
        subscribe(loopRestarts, listener),
    } as unknown as Engine,
    emitJudgement: (judgement: ResolvedJudgement) =>
      judgements.forEach((listener) => listener(judgement)),
    emitReset: () => resets.forEach((listener) => listener()),
    emitLoopRestart: () => loopRestarts.forEach((listener) => listener()),
  };
}

function queue(minimumResolvedNotes = 2) {
  return createRemediationQueue({
    source: {
      runId: 'run-1',
      sessionId: 'session-1',
      songId: 'song-1',
      chartRevision: 'chart-1',
      completedAt: '2026-08-10T00:00:00.000Z',
    },
    findings: [
      {
        id: 'bars-1',
        kind: 'trouble-bars',
        severity: 'high',
        title: 'Trouble bar',
        summary: 'Repeat the bar.',
        skillTag: 'timing',
        evidence: { sampleCount: 2, barStart: 1, barEnd: 1 },
      },
    ],
    createdAt: '2026-08-10T00:01:00.000Z',
    minimumResolvedNotesForRange: () => minimumResolvedNotes,
  })!;
}

function outcome(
  id: string,
  verdict: ResolvedJudgement['verdict'] = 'hit',
  scoreable = true,
): ResolvedJudgement {
  return {
    id,
    verdict,
    measureIndex: 0,
    scoreable,
  };
}

const chart = {} as ParsedChart;
const measures = [
  { startTick: 0, endTick: 1920, notes: [] },
] as unknown as Measure[];

beforeEach(() => {
  localStorage.clear();
});

describe('useRemediationSession', () => {
  it('completes and persists only after two natural, full, zero-error loop passes', () => {
    const runtime = fakeEngine();
    const { result } = renderHook(() =>
      useRemediationSession({
        engine: runtime.engine,
        chart,
        measures,
        isLooping: true,
        storageKey: 'remediation-test',
      }),
    );

    act(() => result.current.begin(queue()));

    for (let pass = 0; pass < 2; pass += 1) {
      act(() => {
        runtime.emitJudgement(outcome('note:1'));
        runtime.emitJudgement(outcome('note:2'));
        runtime.emitLoopRestart();
        runtime.emitReset();
      });
    }

    expect(result.current.queue).toMatchObject({
      status: 'completed',
      activeTaskIndex: 1,
      tasks: [
        {
          status: 'completed',
          consecutiveCleanPasses: 2,
          attempts: [
            { qualifiesAsCleanPass: true },
            { qualifiesAsCleanPass: true },
          ],
        },
      ],
    });
    expect(localStorage.getItem('remediation-test')).toContain(
      '"status":"completed"',
    );
  });

  it('clears an interrupted pass on every administrative reset instead of splicing fragments', () => {
    const runtime = fakeEngine();
    const { result } = renderHook(() =>
      useRemediationSession({
        engine: runtime.engine,
        chart,
        measures,
        isLooping: true,
        storageKey: 'remediation-test',
      }),
    );

    act(() => result.current.begin(queue()));
    act(() => {
      runtime.emitJudgement(outcome('note:1'));
      runtime.emitReset();
      runtime.emitJudgement(outcome('note:2'));
      runtime.emitLoopRestart();
      runtime.emitReset();
    });

    expect(result.current.queue?.tasks[0]).toMatchObject({
      status: 'active',
      consecutiveCleanPasses: 0,
      attempts: [
        {
          resolvedNotes: 1,
          hasSufficientCoverage: false,
          qualifiesAsCleanPass: false,
        },
      ],
    });
  });

  it('treats every wrong pad inside the phrase as an error, including lenient rest-region hits', () => {
    const runtime = fakeEngine();
    const { result } = renderHook(() =>
      useRemediationSession({
        engine: runtime.engine,
        chart,
        measures,
        isLooping: true,
        storageKey: 'remediation-test',
      }),
    );

    act(() => result.current.begin(queue()));
    act(() => {
      runtime.emitJudgement(outcome('note:1'));
      runtime.emitJudgement(outcome('note:2'));
      runtime.emitJudgement(outcome('wrong:1', 'wrong', false));
      runtime.emitLoopRestart();
      runtime.emitReset();
    });

    expect(result.current.queue?.tasks[0].attempts[0]).toMatchObject({
      resolvedNotes: 2,
      wrongHits: 1,
      isErrorFree: false,
      qualifiesAsCleanPass: false,
    });
  });
});
