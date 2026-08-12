import { describe, expect, it } from 'vitest';
import type {
  AtomicSkillState,
  ItemSkillManifest,
  PracticeDecision,
  ZpdRankedCandidate,
} from '../pedagogy/types';
import { composeHomeSession } from './home-session';
import type { PracticeWaveResult, RankedPracticeCandidate } from './index';

function manifest(item_id: string): ItemSkillManifest {
  return {
    item_id,
    source: 'manual_song_review',
    source_revision: `${item_id}:rev-1`,
    demands: [
      {
        skill_id: 'pulse.quarter',
        weight: 1,
        context: 'meter=4/4;phrase=groove',
      },
    ],
    context_signature: 'meter=4/4;phrase=groove',
    assessment_confidence: 0.9,
  };
}

function decision(item_id: string, explanation: string): PracticeDecision {
  return {
    policy_version: 'pedagogy-v2.0',
    item_id,
    source_revision: `${item_id}:rev-1`,
    predicted_success: 0.75,
    learning_value: 0.8,
    state: 'productive_acquisition',
    independent_eligible: true,
    skill_fit: 0.75,
    prereq_fit: 0.8,
    tempo_fit: 0.8,
    transfer_fit: 0.7,
    uncertainty: 0.25,
    hard_prerequisites: [],
    scaffold: { speed: 0.8, steps: ['slower_tempo'] },
    factors: [],
    explanation,
  };
}

function ranked(
  id: string,
  kind: 'lesson' | 'song',
  explanation: string,
): RankedPracticeCandidate {
  return {
    candidate: {
      id,
      title: id,
      kind,
      difficulty: 'medium',
      available: true,
      ...(kind === 'song' ? { liked: true } : {}),
      itemManifest: manifest(id),
    },
    score: 80,
    predictedSuccess: 0.75,
    suggestedSpeed: 0.8,
    mastery: 30,
    reason: explanation,
    factors: [],
    confidence: {
      value: 0.75,
      level: 'high',
      evidenceRuns: 4,
      detail: 'Stored atomic evidence is available.',
    },
    decisionReceipt: decision(id, explanation),
  };
}

function zpd(candidate: RankedPracticeCandidate): ZpdRankedCandidate {
  return {
    candidate: {
      item_id: candidate.candidate.id,
      kind: candidate.candidate.kind,
      title: candidate.candidate.title,
      available: true,
      liked: candidate.candidate.liked,
      manifest: candidate.candidate.itemManifest!,
    },
    decision: candidate.decisionReceipt!,
  };
}

const weakState: AtomicSkillState = {
  skill_id: 'pulse.quarter',
  alpha: 2,
  beta: 6,
  effective_trials: 8,
  stage: 'assessed',
  evidence_boundary: 'midi',
};

describe('composeHomeSession', () => {
  it('arms the exact pedagogy-v2 launch for either home intent', () => {
    const lesson = ranked(
      'lesson:focus',
      'lesson',
      'Saved timing evidence makes this the current frontier.',
    );
    const favourite = ranked(
      'song:favourite',
      'song',
      'Your favourite song is the musical application.',
    );
    const wave: PracticeWaveResult = {
      strategy: 'skill-linked',
      stops: [
        {
          role: 'focus',
          recommendation: lesson,
          reason: lesson.reason,
          linkedSkills: ['pulse.quarter'],
        },
        {
          role: 'apply',
          recommendation: favourite,
          reason: favourite.reason,
          linkedSkills: ['pulse.quarter'],
        },
      ],
      focusSkills: ['pulse.quarter'],
    };
    const input = {
      ranking: [lesson, favourite],
      pedagogyRanking: [zpd(lesson), zpd(favourite)],
      practiceWave: wave,
      activeGoal: {
        song_id: favourite.candidate.id,
        preferred: true,
        goal_kind: 'full_song' as const,
      },
      atomicStates: [weakState],
      energy: 'short' as const,
      now: '2026-08-11T08:00:00.000Z',
    };
    const learning = composeHomeSession({ ...input, intent: 'learning' });
    const songs = composeHomeSession({ ...input, intent: 'songs' });

    expect(learning).toMatchObject({
      source: 'pedagogy-v2',
      size: 'short',
      launch: { candidate: { id: lesson.candidate.id } },
      reason: lesson.decisionReceipt?.explanation,
      focus: { title: lesson.candidate.title },
      build: { title: lesson.candidate.title },
      payoff: { title: favourite.candidate.title },
    });
    expect(songs).toMatchObject({
      source: 'pedagogy-v2',
      launch: { candidate: { id: favourite.candidate.id } },
      reason: favourite.decisionReceipt?.explanation,
      goalPath: { goal: { song_id: favourite.candidate.id } },
    });
  });

  it('keeps a wave receipt explicit when atomic evidence is absent', () => {
    const lesson = ranked('lesson:focus', 'lesson', 'Saved Coach evidence.');
    const song = ranked('song:apply', 'song', 'A liked song is available.');
    const wave: PracticeWaveResult = {
      strategy: 'skill-linked',
      stops: [
        {
          role: 'focus',
          recommendation: lesson,
          reason: '2 saved Coach findings route directly to this lesson.',
          linkedSkills: ['timing'],
        },
        {
          role: 'apply',
          recommendation: song,
          reason: 'Apply the focused skill in a liked song.',
          linkedSkills: ['timing'],
        },
      ],
      focusSkills: ['timing'],
    };
    const session = composeHomeSession({
      intent: 'learning',
      ranking: [lesson, song],
      practiceWave: wave,
    });

    expect(session).toMatchObject({
      source: 'practice-wave',
      reason: '2 saved Coach findings route directly to this lesson.',
      focus: {
        title: lesson.candidate.title,
      },
      build: {
        title: 'Build the phrase',
      },
      payoff: { title: song.candidate.title },
    });
  });

  it('keeps a songs-intent launch musical when no song has an atomic receipt', () => {
    const lesson = ranked('lesson:focus', 'lesson', 'Saved timing evidence.');
    const song = ranked('song:apply', 'song', 'A liked song is available.');
    const wave: PracticeWaveResult = {
      strategy: 'skill-linked',
      stops: [
        {
          role: 'focus',
          recommendation: lesson,
          reason: lesson.reason,
          linkedSkills: ['timing'],
        },
        {
          role: 'apply',
          recommendation: song,
          reason: song.reason,
          linkedSkills: ['timing'],
        },
      ],
      focusSkills: ['timing'],
    };
    const session = composeHomeSession({
      intent: 'songs',
      ranking: [lesson, song],
      pedagogyRanking: [zpd(lesson)],
      practiceWave: wave,
    });

    expect(session).toMatchObject({
      source: 'practice-wave',
      launch: { candidate: { id: song.candidate.id } },
    });
  });

  it('shows a target-date runway without inventing a weekly pace when evidence is thin', () => {
    const lesson = ranked('lesson:focus', 'lesson', 'Saved Coach evidence.');
    const song = ranked('song:apply', 'song', 'A liked song is available.');
    const session = composeHomeSession({
      intent: 'learning',
      ranking: [lesson, song],
      pedagogyRanking: [zpd(lesson), zpd(song)],
      activeGoal: {
        song_id: song.candidate.id,
        preferred: true,
        goal_kind: 'full_song',
      },
      goalTargetDate: '2026-09-10',
    });

    expect(session?.runway).toMatchObject({
      title: 'September 10 runway',
      detail: 'Building evidence for a weekly pace.',
    });
  });

  it('keeps the primary goal song as payoff when it is outside the ranked shortlist', () => {
    const lesson = ranked('lesson:focus', 'lesson', 'Saved Coach evidence.');
    const otherSong = ranked('song:other', 'song', 'A different liked song.');
    const goalSong = ranked('song:goal', 'song', 'The chosen goal song.');
    const session = composeHomeSession({
      intent: 'learning',
      ranking: [lesson, otherSong],
      activeGoal: {
        song_id: goalSong.candidate.id,
        preferred: true,
        goal_kind: 'full_song',
      },
      goalPayoffCandidate: goalSong.candidate,
    });

    expect(session?.payoff).toMatchObject({
      candidateId: 'song:goal',
      title: 'song:goal',
    });
    expect(session?.payoff.detail).toContain(
      'Apply the session in your goal song.',
    );
  });
});
