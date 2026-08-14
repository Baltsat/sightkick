import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import {
  buildWeeklyMusicalRecap,
  buildWeeklyRhythm,
  composePracticeCards,
  selectWeeklyPracticeSet,
} from './engagement';
import type {
  AtomicSkillState,
  SessionPlan,
  ZpdCandidate,
  ZpdRankedCandidate,
} from './types';

function ranked(
  item_id: string,
  kind: ZpdCandidate['kind'],
): ZpdRankedCandidate {
  return {
    candidate: {
      item_id,
      kind,
      title: item_id,
      available: true,
      manifest: {
        item_id,
        source: kind === 'song' ? 'chart_analysis' : 'curriculum',
        source_revision: `${item_id}:v1`,
        demands: [
          {
            skill_id: 'pulse.eighth',
            weight: 1,
            context: 'meter=4/4;phrase=groove',
          },
        ],
        context_signature: 'meter=4/4;phrase=groove',
        assessment_confidence: 0.9,
        ...(kind === 'song' ? { section: { start_bar: 5, end_bar: 8 } } : {}),
      },
    },
    decision: {
      policy_version: 'pedagogy-v2.0',
      item_id,
      source_revision: `${item_id}:v1`,
      predicted_success: 0.74,
      learning_value: kind === 'lesson' ? 0.9 : 0.7,
      state: 'productive_acquisition',
      independent_eligible: true,
      skill_fit: 0.8,
      prereq_fit: 0.8,
      tempo_fit: 0.8,
      transfer_fit: 0.7,
      uncertainty: 0.2,
      hard_prerequisites: [],
      scaffold: { speed: 0.7, steps: ['short_loop'] },
      factors: [],
      explanation: 'Saved evidence supports this route.',
    },
  };
}

function plan(): SessionPlan {
  return {
    request: {
      intent: 'smart_start',
      energy: 'standard',
      recent_early_exits: 0,
      now: '2026-08-11T12:00:00.000Z',
    },
    launch: {
      role: 'orient',
      candidate_id: 'lesson:pulse',
      speed: 0.7,
      scaffold: ['short_loop'],
      stop_rule: 'One phrase.',
      why: 'Set the pulse.',
    },
    blocks: [
      {
        role: 'acquire',
        candidate_id: 'lesson:pulse',
        speed: 0.7,
        scaffold: ['short_loop'],
        stop_rule: 'Two passes.',
        why: 'Build the pulse.',
      },
      {
        role: 'apply',
        candidate_id: 'song:favourite',
        speed: 0.7,
        scaffold: ['short_loop'],
        stop_rule: 'One section.',
        why: 'Apply the pulse in music.',
      },
    ],
    reason: 'Current route.',
  };
}

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: '2026-08-11T12:00:00.000Z',
    totalHits: 24,
    totalMisses: 2,
    totalWrong: 0,
    overallAccuracy: 24 / 26,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 24,
      sampleCount: 24,
    },
    wrongHitCounts: [],
    ...overrides,
  };
}

const retained: AtomicSkillState = {
  skill_id: 'pulse.eighth',
  alpha: 8,
  beta: 2,
  effective_trials: 8,
  stage: 'retained',
  evidence_boundary: 'midi',
  last_retention_at: '2026-08-10T12:00:00.000Z',
};

describe('engagement evidence', () => {
  it('derives review, build, and eligible section audition cards from saved evidence', () => {
    const cards = composePracticeCards({
      plan: plan(),
      ranking: [
        ranked('lesson:pulse', 'lesson'),
        ranked('song:favourite', 'song'),
      ],
      due_reviews: [
        {
          skill_id: 'pulse.eighth',
          due_at: '2026-08-11T08:00:00.000Z',
          overdue: true,
          stage: 'retained',
        },
      ],
      goal_path: {
        goal: {
          song_id: 'song:favourite',
          preferred: true,
          goal_kind: 'full_song',
        },
        blockers: [],
        next_items: [],
        next_song_probe: {
          song_id: 'song:favourite',
          start_bar: 5,
          end_bar: 8,
          speed: 0.7,
          section_label: 'Bars 5–8',
          test_label: 'Eighth-note pulse in this section',
          required_skill_id: 'pulse.eighth',
        },
        free_play_available: true,
      },
    });

    expect(cards.cards.map((card) => card.kind)).toEqual([
      'review',
      'build',
      'apply',
    ]);
    expect(cards.cards[0]?.options[0]?.source_label).toContain(
      'Saved review queue',
    );
    expect(cards.cards[0]?.options[0]).toMatchObject({
      title: "Prove yesterday's Eighth-note pulse",
      completion_label: 'One target-tempo retrieval',
    });
    expect(cards.cards[1]?.options[0]?.completion_label).toBe(
      'One saved loop or lesson block',
    );
    expect(cards.cards[2]?.options[0]?.audition).toMatchObject({
      section_label: 'Bars 5–8',
      required_skill_id: 'pulse.eighth',
    });
  });

  it('keeps a weekly set stable until an explicit rotation changes it', () => {
    const cards = composePracticeCards({
      plan: plan(),
      ranking: [
        ranked('lesson:pulse', 'lesson'),
        ranked('song:favourite', 'song'),
      ],
      due_reviews: [],
    });
    const first = selectWeeklyPracticeSet({ cards, rhythm: 'weekly' });
    const again = selectWeeklyPracticeSet({ cards, rhythm: 'weekly' });

    expect(again).toEqual(first);
    expect(first.evidence_signature).toContain('weekly');
  });

  it('uses saved runs and atomic evidence for the recap without missed-session language', () => {
    const recap = buildWeeklyMusicalRecap({
      runs: [
        summary({
          audition: {
            song_id: 'song:favourite',
            start_bar: 5,
            end_bar: 8,
            speed: 0.7,
            section_label: 'Bars 5–8',
            test_label: 'Eighth-note pulse in this section',
            required_skill_id: 'pulse.eighth',
          },
        }),
      ],
      states: [retained],
      now: new Date('2026-08-11T18:00:00.000Z'),
    });

    expect(recap.sessions).toBe(1);
    expect(recap.played_days).toBe(1);
    expect(recap.skill.state).toBe('reliable');
    expect(recap.section?.label).toBe('Bars 5–8');
    expect(JSON.stringify(recap)).not.toContain('missed');
  });

  it('marks weekly rests as planned and never as failures', () => {
    const rhythm = buildWeeklyRhythm({
      days: { '2026-08-11': { xp: 24, runs: 1, stars: 0, minutes: 4 } },
      rhythm: 'weekly',
      now: new Date('2026-08-11T12:00:00.000Z'),
    });

    expect(rhythm.days.find((day) => day.key === '2026-08-11')?.state).toBe(
      'played',
    );
    expect(rhythm.days.some((day) => day.state === 'rest')).toBe(true);
  });
});
