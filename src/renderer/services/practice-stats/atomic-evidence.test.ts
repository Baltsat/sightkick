import { describe, expect, it } from 'vitest';
import type { SkillEvidenceEvent } from '../pedagogy/types';
import { atomicEvidenceFromPracticeRuns } from './atomic-evidence';
import type { RunSummary, StoredPracticeRun } from './types';

function event(run_id: string, completed_at: string): SkillEvidenceEvent {
  return {
    run_id,
    chart_revision: 'song:one:expert:mid:fnv1a64-0000000000000001-12',
    manifest_revision: 'curriculum:sha256:one',
    skill_id: 'pulse.quarter',
    item_id: '01.01',
    context_signature: 'meter=4/4;phrase=groove',
    evidence_kind: 'acquisition',
    quality: 0.84,
    weight: 0.5,
    playback_speed: 1,
    completed_at,
  };
}

function summary(
  completedAt: string,
  atomicSkillEvidence?: SkillEvidenceEvent[],
): RunSummary {
  return {
    completedAt,
    totalHits: 0,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 0,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 0,
      sampleCount: 0,
    },
    wrongHitCounts: [],
    ...(atomicSkillEvidence ? { atomicSkillEvidence } : {}),
  };
}

describe('practice-stats atomic evidence persistence', () => {
  it('reads only persisted immutable events and returns a deterministic order', () => {
    const later = event('run:later', '2026-08-02T10:00:00.000Z');
    const earlier = event('run:earlier', '2026-08-01T10:00:00.000Z');
    const runs: StoredPracticeRun[] = [
      { summary: summary(later.completed_at, [later]), records: [] },
      { summary: summary(earlier.completed_at, [earlier]), records: [] },
      { summary: summary('2026-08-03T10:00:00.000Z'), records: [] },
    ];

    expect(atomicEvidenceFromPracticeRuns(runs)).toEqual([earlier, later]);
  });
});
