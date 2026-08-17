import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../../services/practice-stats';
import { DEFAULT_TUTOR_SETTINGS } from '../../services/tutor';
import { LearningEvidenceReceipt } from './LearningEvidenceReceipt';

function summary(): RunSummary {
  return {
    completedAt: '2026-08-11T10:00:00.000Z',
    totalHits: 16,
    totalMisses: 2,
    totalWrong: 1,
    overallAccuracy: 0.89,
    laneAccuracy: [],
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs: 2,
      medianMs: 2,
      spreadMs: 35,
      earlyCount: 1,
      lateCount: 2,
      onTimeCount: 13,
      sampleCount: 16,
    },
    timingWindowMs: 120,
    atomicSkillEvidence: [
      {
        run_id: 'run:1',
        chart_revision: 'chart:1',
        manifest_revision: 'manifest:1',
        skill_id: 'kit.tom_t2_t3',
        item_id: '07.03',
        context_signature: 'rock',
        evidence_kind: 'acquisition',
        quality: 0.84,
        weight: 0.5,
        playback_speed: 0.8,
        completed_at: '2026-08-11T10:00:00.000Z',
        judging_window_ms: 120,
        normalized_timing_stability: 0.7,
      },
    ],
    tutor: {
      settings: DEFAULT_TUTOR_SETTINGS,
      interventions: [],
      recoveryAttempts: [],
    },
    coachEvidence: [
      {
        id: 'coach:1',
        kind: 'wrong-pad',
        severity: 'high',
        skillTag: 'pad-accuracy',
        sampleCount: 2,
        barStart: 4,
        barEnd: 5,
        remediationLessonId: '07.03',
      },
    ],
  };
}

describe('LearningEvidenceReceipt', () => {
  it('shows only the evidence actually stamped on a run', () => {
    render(<LearningEvidenceReceipt summary={summary()} />);

    expect(screen.getByTestId('learning-evidence-receipt')).toHaveTextContent(
      '1 saved result',
    );
    expect(screen.getByTestId('learning-evidence-receipt')).toHaveTextContent(
      '±120 ms',
    );
    expect(screen.getByTestId('learning-evidence-receipt')).toHaveTextContent(
      'bars 4–5',
    );
    expect(screen.getByTestId('learning-evidence-receipt')).toHaveTextContent(
      'Your level stays unchanged',
    );
  });

  it('does not render when the caller has no completed run receipt', () => {
    const { container } = render(<LearningEvidenceReceipt />);

    expect(container).toBeEmptyDOMElement();
  });

  it('rounds a timing window to a whole visible millisecond', () => {
    render(
      <LearningEvidenceReceipt
        summary={{ ...summary(), timingWindowMs: 123.4 }}
      />,
    );

    expect(screen.getByTestId('learning-evidence-receipt')).toHaveTextContent(
      '±123 ms',
    );
    expect(
      screen.getByTestId('learning-evidence-receipt'),
    ).not.toHaveTextContent('123.4');
  });
});
