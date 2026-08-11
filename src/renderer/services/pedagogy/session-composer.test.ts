import { describe, expect, it } from 'vitest';
import { composePracticeSession } from './index';
import type {
  ItemSkillManifest,
  PracticeDecision,
  SessionIntent,
  ZpdCandidate,
  ZpdRankedCandidate,
} from './types';

function manifest(
  item_id: string,
  section?: { start_bar: number; end_bar: number },
): ItemSkillManifest {
  return {
    item_id,
    source: 'manual_song_review',
    source_revision: `${item_id}:rev`,
    demands: [
      {
        skill_id: 'pulse.quarter',
        weight: 1,
        context: 'meter=4/4;phrase=groove',
      },
    ],
    context_signature: 'meter=4/4;phrase=groove',
    assessment_confidence: 0.9,
    ...(section ? { section } : {}),
  };
}

function ranked(
  item_id: string,
  kind: ZpdCandidate['kind'],
  overrides: Partial<ZpdCandidate> = {},
): ZpdRankedCandidate {
  const candidate: ZpdCandidate = {
    item_id,
    kind,
    title: item_id,
    available: true,
    liked: kind === 'song',
    manifest: manifest(
      item_id,
      kind === 'song' ? { start_bar: 4, end_bar: 8 } : undefined,
    ),
    ...overrides,
  };
  const decision: PracticeDecision = {
    policy_version: 'pedagogy-v2.0',
    item_id,
    source_revision: candidate.manifest.source_revision,
    predicted_success: 0.75,
    learning_value: kind === 'lesson' ? 0.8 : 0.7,
    state: 'productive_acquisition',
    independent_eligible: true,
    skill_fit: 0.75,
    prereq_fit: 0.8,
    tempo_fit: 0.8,
    transfer_fit: 0.5,
    uncertainty: 0.3,
    hard_prerequisites: [],
    scaffold: { speed: 0.8, steps: ['slower_tempo'] },
    factors: [],
    explanation: 'test',
  };

  return { candidate, decision };
}

function request(
  intent: SessionIntent,
  energy: 'short' | 'standard' | 'deep' = 'standard',
) {
  return {
    intent,
    energy,
    recent_early_exits: 0,
    now: '2026-08-02T10:00:00.000Z',
  };
}

describe('intent-aware session composer', () => {
  it('precomputes a one-kick launch for every intent', () => {
    const ranking = [
      ranked('lesson:focus', 'lesson'),
      ranked('song:favourite', 'song'),
    ];
    const intents: SessionIntent[] = [
      'smart_start',
      'song',
      'exercise',
      'review',
      'free_play',
    ];

    intents.forEach((intent) => {
      const plan = composePracticeSession({
        request: request(intent),
        ranking,
      });

      expect(plan?.launch).toEqual(plan?.blocks[0]);
      expect(plan?.blocks.length).toBeGreaterThan(0);
    });
  });

  it('ends a short session with a musical payoff', () => {
    const plan = composePracticeSession({
      request: request('smart_start', 'short'),
      ranking: [
        ranked('lesson:focus', 'lesson'),
        ranked('song:favourite', 'song'),
      ],
    });

    expect(plan?.blocks.at(-1)).toMatchObject({
      role: 'apply',
      candidate_id: 'song:favourite',
    });
  });

  it('lets an explicit song choice win the launch', () => {
    const plan = composePracticeSession({
      request: { ...request('song'), explicit_song_id: 'song:chosen' },
      ranking: [
        ranked('lesson:focus', 'lesson'),
        ranked('song:favourite', 'song'),
        ranked('song:chosen', 'song'),
      ],
    });

    expect(plan?.launch.candidate_id).toBe('song:chosen');
  });
});
