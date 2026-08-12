import { describe, expect, it } from 'vitest';
import type { SkillEvidenceEvent } from './types';
import { learningEvidenceReceipt } from './evidence-receipt';

function atomicEvent(
  overrides: Partial<SkillEvidenceEvent> = {},
): SkillEvidenceEvent {
  return {
    run_id: 'run:1',
    chart_revision: 'chart:1',
    manifest_revision: 'manifest:1',
    skill_id: 'kit.tom_t2_t3',
    item_id: '07.03',
    context_signature: 'groove:rock',
    evidence_kind: 'acquisition',
    quality: 0.84,
    weight: 0.5,
    playback_speed: 0.8,
    completed_at: '2026-08-11T10:00:00.000Z',
    judging_window_ms: 120,
    normalized_timing_stability: 0.7,
    ...overrides,
  };
}

describe('learningEvidenceReceipt', () => {
  it('keeps atomic classifications, judging-window provenance, and bounded support routes separate', () => {
    const receipt = learningEvidenceReceipt({
      timingWindowMs: 120,
      atomicSkillEvidence: [
        atomicEvent(),
        atomicEvent({
          skill_id: 'music.fill_8th',
          evidence_kind: 'retention',
          judging_window_ms: undefined,
        }),
        atomicEvent({
          skill_id: 'pulse.eighth',
          evidence_kind: 'transfer',
        }),
      ],
      tutor: {
        interventions: [{}],
        recoveryAttempts: [
          { result: 'clean' },
          { result: 'retry' },
          { result: 'deferred' },
        ],
      },
      coachEvidence: [
        {
          id: 'coach:1',
          remediationLessonId: '07.03',
          barStart: 4,
          barEnd: 5,
        },
        {
          id: 'coach:2',
          remediationLessonId: '07.03',
          resolved: true,
        },
      ],
    });

    expect(receipt.atomic).toEqual({
      recorded: 3,
      acquisition: 1,
      retention: 1,
      transfer: 1,
      observableSkillIds: ['kit.tom_t2_t3', 'music.fill_8th', 'pulse.eighth'],
      normalizedTimingReceipts: 2,
    });
    expect(receipt.timing).toEqual({
      windowMs: 120,
      normalizedAtomicReceipts: 2,
    });
    expect(receipt.tutor).toEqual({
      interventions: 1,
      cleanAttempts: 1,
      retryAttempts: 1,
      deferredAttempts: 1,
    });
    expect(receipt.coach).toEqual({
      findings: 2,
      unresolvedFindings: 1,
      remediationLessonIds: ['07.03'],
      barRanges: ['4–5'],
    });
  });

  it('does not manufacture timing, tutor, or remediation evidence', () => {
    expect(learningEvidenceReceipt({})).toEqual({
      atomic: {
        recorded: 0,
        acquisition: 0,
        retention: 0,
        transfer: 0,
        observableSkillIds: [],
        normalizedTimingReceipts: 0,
      },
      coach: {
        findings: 0,
        unresolvedFindings: 0,
        remediationLessonIds: [],
        barRanges: [],
      },
    });
  });
});
