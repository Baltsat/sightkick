import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import {
  deriveAtomicSkillEvidence,
  initialAtomicSkillState,
  replayAtomicSkillState,
} from './index';
import type { ItemSkillManifest, SkillEvidenceEvent } from './types';

function records(deltaMs = 0) {
  return Array.from({ length: 12 }, (_, index) => ({
    tick: index * 120,
    deltaMs,
    element: 'snare' as const,
    verdict: 'hit' as const,
  }));
}

const manifest = (
  context_signature = 'meter=4/4;phrase=groove',
): ItemSkillManifest => ({
  item_id: 'lesson:one',
  source: 'curriculum',
  source_revision: 'manifest:one',
  chart_revision: 'chart:one',
  demands: [
    {
      skill_id: 'pulse.quarter',
      weight: 1,
      target_bpm: 80,
      context: context_signature,
    },
  ],
  context_signature,
  assessment_confidence: 1,
  chart_total_notes: 12,
});

function run(
  completedAt: string,
  overrides: Partial<RunSummary> = {},
): RunSummary {
  return {
    completedAt,
    totalHits: 12,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 1,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 12,
      sampleCount: 12,
    },
    wrongHitCounts: [],
    playbackSpeed: 1,
    timingWindowMs: 100,
    context: {
      sessionId: `session:${completedAt}`,
      schemaVersion: 3,
      appVersion: 'test',
      scoringPolicyVersion: 'test',
      startedAt: completedAt,
      chartRevision: 'chart:one',
      inputLatencyMs: 0,
      inputMapping: {},
    },
    ...overrides,
  };
}

function evidence(
  run_id: string,
  completed_at: string,
  previous_events: readonly SkillEvidenceEvent[] = [],
  item_manifest = manifest(),
) {
  return deriveAtomicSkillEvidence({
    run_id,
    summary: run(completed_at),
    manifest: item_manifest,
    previous_events,
  });
}

describe('atomic skill-state replay', () => {
  it('records steadiness independently of note accuracy when raw offsets are available', () => {
    const context = 'meter=4/4;subdivision=sixteenth';
    const item = {
      ...manifest(context),
      demands: [
        {
          skill_id: 'pulse.sixteenth',
          weight: 0.5,
          target_bpm: 80,
          context,
        },
        {
          skill_id: 'timing.steadiness.sixteenth',
          weight: 0.5,
          target_bpm: 80,
          context,
        },
      ],
    };
    const derived = deriveAtomicSkillEvidence({
      run_id: 'independent-timing',
      summary: run('2026-08-01T10:00:00.000Z', { overallAccuracy: 0 }),
      manifest: item,
      records: records(),
    });
    const timing = derived.events.find(
      ({ skill_id }) => skill_id === 'timing.steadiness.sixteenth',
    );

    expect(timing?.quality).toBe(1);
    expect(
      derived.events.find(({ skill_id }) => skill_id === 'pulse.sixteenth')
        ?.quality,
    ).toBeLessThan(1);
  });

  it('replays a fixed recorded-evidence fixture identically', () => {
    const first = evidence('run:1', '2026-08-01T10:00:00.000Z');
    const second = evidence('run:2', '2026-08-01T11:00:00.000Z', first.events);
    const events = [...first.events, ...second.events];

    expect(replayAtomicSkillState(events)).toEqual(
      replayAtomicSkillState([...events]),
    );
    expect(replayAtomicSkillState(events).states[0]?.stage).toBe('provisional');
  });

  it('keeps same-day clean passes provisional, then promotes delayed retention and changed-context transfer', () => {
    const first = evidence('run:1', '2026-08-01T10:00:00.000Z');
    const second = evidence('run:2', '2026-08-01T11:00:00.000Z', first.events);
    const provisional_events = [...first.events, ...second.events];
    const retained = evidence(
      'run:3',
      '2026-08-02T12:00:00.000Z',
      provisional_events,
    );
    const retained_events = [...provisional_events, ...retained.events];
    const transfer = evidence(
      'run:4',
      '2026-08-03T14:00:00.000Z',
      retained_events,
      manifest('meter=4/4;phrase=fill'),
    );

    expect(second.events[0]?.evidence_kind).toBe('acquisition');
    expect(retained.events[0]?.evidence_kind).toBe('retention');
    expect(transfer.events[0]?.evidence_kind).toBe('transfer');
    expect(replayAtomicSkillState(retained_events).states[0]?.stage).toBe(
      'retained',
    );
    expect(
      replayAtomicSkillState([...retained_events, ...transfer.events]).states[0]
        ?.stage,
    ).toBe('transferable');
  });

  it('rejects stale chart evidence and keeps unsupported claims unknown', () => {
    const stale = deriveAtomicSkillEvidence({
      run_id: 'stale',
      summary: run('2026-08-01T10:00:00.000Z', {
        context: {
          ...run('2026-08-01T10:00:00.000Z').context!,
          chartRevision: 'chart:new',
        },
      }),
      manifest: manifest(),
    });
    const unsupported = initialAtomicSkillState('reading.form_navigation');

    expect(stale).toMatchObject({ rejected: true, events: [] });
    expect(unsupported?.stage).toBe('unknown');
    expect(unsupported?.evidence_boundary).toBe('unsupported');
  });

  it('rejects evidence from a superseded item manifest during replay', () => {
    const recorded = evidence('run:1', '2026-08-01T10:00:00.000Z');
    const superseded = { ...manifest(), source_revision: 'manifest:two' };
    const replay = replayAtomicSkillState(recorded.events, {
      manifests: [superseded],
    });

    expect(replay.states).toEqual([]);
    expect(replay.rejected_events).toEqual(recorded.events);
  });

  it('does not make the same raw timing spread look stronger under a wider judging window', () => {
    const narrow = deriveAtomicSkillEvidence({
      run_id: 'narrow',
      summary: run('2026-08-01T10:00:00.000Z', {
        timingWindowMs: 100,
        timingBias: {
          meanMs: 0,
          medianMs: 0,
          spreadMs: 30,
          earlyCount: 0,
          lateCount: 0,
          onTimeCount: 12,
          sampleCount: 12,
        },
      }),
      manifest: manifest(),
    });
    const wide = deriveAtomicSkillEvidence({
      run_id: 'wide',
      summary: run('2026-08-01T10:00:00.000Z', {
        timingWindowMs: 220,
        timingBias: {
          meanMs: 0,
          medianMs: 0,
          spreadMs: 30,
          earlyCount: 0,
          lateCount: 0,
          onTimeCount: 12,
          sampleCount: 12,
        },
      }),
      manifest: manifest(),
    });

    expect(wide.events[0]?.quality).toBe(narrow.events[0]?.quality);
  });
});
