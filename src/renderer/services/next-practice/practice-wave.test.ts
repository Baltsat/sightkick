import { describe, expect, it } from 'vitest';
import { RunSummary } from '../practice-stats';
import { buildPracticeWave } from './practice-wave';
import {
  PracticeCandidate,
  PracticeHistoryEntry,
  RankedPracticeCandidate,
  RecommendationFactor,
} from './types';

function candidate(
  id: string,
  overrides: Partial<PracticeCandidate> = {},
): PracticeCandidate {
  return {
    id,
    title: id,
    kind: 'song',
    difficulty: 'medium',
    available: true,
    ...overrides,
  };
}

function weakSkillFactor(value = 1): RecommendationFactor {
  return {
    key: 'weak-skill-match',
    label: 'Weak skill match',
    value,
    weight: 30,
    contribution: value * 30,
    detail: 'Matches saved Coach evidence.',
  };
}

function ranked(
  id: string,
  overrides: Partial<PracticeCandidate> = {},
  options: {
    score?: number;
    factors?: RecommendationFactor[];
  } = {},
): RankedPracticeCandidate {
  return {
    candidate: candidate(id, overrides),
    score: options.score ?? 80,
    predictedSuccess: 0.78,
    suggestedSpeed: 0.8,
    mastery: 30,
    reason: 'Ranked from current evidence.',
    factors: options.factors ?? [],
    confidence: {
      value: 0.7,
      level: 'medium',
      evidenceRuns: 3,
      detail: 'Three recent runs.',
    },
  };
}

function summary(completedAt: string): RunSummary {
  return {
    completedAt,
    totalHits: 80,
    totalMisses: 20,
    totalWrong: 0,
    overallAccuracy: 0.8,
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 20,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 80,
      sampleCount: 80,
    },
    wrongHitCounts: [],
    mode: 'practice',
    playbackSpeed: 0.8,
    difficulty: 'medium',
  };
}

function history(
  candidateId: string,
  completedAt: string,
): PracticeHistoryEntry {
  return { candidateId, summary: summary(completedAt) };
}

describe('buildPracticeWave', () => {
  it('builds focus, liked-song application, and a distinct consolidation stop', () => {
    const result = buildPracticeWave({
      ranking: [
        ranked(
          'kick-lesson',
          {
            title: 'Kick independence',
            kind: 'lesson',
            skills: ['kick-independence'],
            curriculumId: '04.02',
          },
          { score: 83, factors: [weakSkillFactor()] },
        ),
        ranked('favorite-song', {
          title: 'Favorite groove',
          liked: true,
          skills: ['kick-independence', 'timing'],
        }),
        ranked('timing-check', {
          title: 'Timing check',
          kind: 'lesson',
          skills: ['kick-independence'],
          curriculumId: '04.03',
        }),
        ranked('unrelated-song', { title: 'Other song', liked: true }),
      ],
      history: [],
    });

    expect(result.strategy).toBe('skill-linked');
    expect(result.stops.map(({ role }) => role)).toEqual([
      'focus',
      'apply',
      'consolidate',
    ]);
    expect(
      result.stops.map(({ recommendation }) => recommendation.candidate.id),
    ).toEqual(['kick-lesson', 'favorite-song', 'timing-check']);
    expect(result.stops[1].linkedSkills).toEqual(['kick-independence']);
    expect(result.stops[1].reason).toContain('liked song');
    expect(
      new Set(
        result.stops.map(({ recommendation }) => recommendation.candidate.id),
      ).size,
    ).toBe(3);
  });

  it('does not immediately repeat the latest task when another focus is playable', () => {
    const result = buildPracticeWave({
      ranking: [
        ranked(
          'latest-lesson',
          { kind: 'lesson', skills: ['timing'], curriculumId: '01.01' },
          { score: 99, factors: [weakSkillFactor()] },
        ),
        ranked(
          'fresh-lesson',
          { kind: 'lesson', skills: ['timing'], curriculumId: '01.02' },
          { score: 80, factors: [weakSkillFactor(0.8)] },
        ),
        ranked('song', { liked: true, skills: ['timing'] }),
      ],
      history: [
        history('latest-lesson', '2026-08-11T08:00:00.000Z'),
        history('older-song', '2026-08-10T08:00:00.000Z'),
      ],
    });

    expect(result.latestCandidateId).toBe('latest-lesson');
    expect(result.stops[0].recommendation.candidate.id).toBe('fresh-lesson');
    expect(result.stops[0].recommendation.candidate.id).not.toBe(
      result.latestCandidateId,
    );
  });

  it('puts a direct stored remediation first even when its authored tag differs from the finding tag', () => {
    const result = buildPracticeWave({
      ranking: [
        ranked(
          'generic-timing-song',
          { liked: true, skills: ['timing'] },
          { score: 95, factors: [weakSkillFactor()] },
        ),
        {
          ...ranked(
            'lesson-01-01',
            {
              kind: 'lesson',
              curriculumId: '01.01',
              skills: ['sixteenth-notes'],
            },
            { score: 40 },
          ),
          directRemediation: { findingCount: 3 },
        },
        ranked('transfer-song', { skills: ['sixteenth-notes'] }),
      ],
      history: [],
    });

    expect(result.stops[0]).toMatchObject({
      role: 'focus',
      recommendation: { candidate: { id: 'lesson-01-01' } },
      reason: '3 saved Coach findings route directly to this lesson.',
    });
  });

  it('keeps fallback reasons honest when no skill link is proven', () => {
    const result = buildPracticeWave({
      ranking: [
        ranked('lesson', { kind: 'lesson', sequence: 1 }),
        ranked('liked-song', { liked: true }),
        ranked('other-song'),
      ],
      history: [],
    });

    expect(result.strategy).toBe('deterministic-fallback');
    expect(
      result.stops.map(({ recommendation }) => recommendation.candidate.id),
    ).toEqual(['lesson', 'liked-song', 'other-song']);
    expect(result.stops[0].reason).toContain(
      'no specific weak-skill link is proven yet',
    );
    expect(result.stops[1].reason).toContain('preference-based');
    expect(result.focusSkills).toEqual([]);
  });

  it('deduplicates difficulty variants of the same task', () => {
    const result = buildPracticeWave({
      ranking: [
        ranked(
          'song-medium',
          { title: 'Same Song', difficulty: 'medium' },
          { score: 90 },
        ),
        ranked(
          'song-hard',
          { title: ' same   song ', difficulty: 'hard' },
          { score: 85 },
        ),
        ranked('lesson', { title: 'Lesson', kind: 'lesson' }),
      ],
      history: [],
    });

    expect(result.stops).toHaveLength(2);
    expect(
      result.stops.filter(({ recommendation }) =>
        recommendation.candidate.title.toLocaleLowerCase().includes('same'),
      ),
    ).toHaveLength(1);
  });

  it('filters unavailable and locked candidates without inventing stops', () => {
    const result = buildPracticeWave({
      ranking: [
        ranked('locked', { kind: 'lesson', unlocked: false }),
        ranked('metadata-only', { available: false }),
      ],
      history: [],
    });

    expect(result).toMatchObject({
      strategy: 'none-available',
      stops: [],
      focusSkills: [],
    });
  });

  it('uses the sole playable latest task as an explicit finite fallback', () => {
    const result = buildPracticeWave({
      ranking: [ranked('only-song')],
      history: [history('only-song', 'not-a-date')],
    });

    expect(result.latestCandidateId).toBe('only-song');
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0]).toMatchObject({
      role: 'focus',
      recommendation: { candidate: { id: 'only-song' } },
    });
  });

  it('does not mutate the caller-owned ranking or history arrays', () => {
    const ranking = [
      ranked('song', { liked: true }),
      ranked('lesson', { kind: 'lesson' }),
    ];
    const practiceHistory = [
      history('older', '2026-08-10T08:00:00.000Z'),
      history('newer', '2026-08-11T08:00:00.000Z'),
    ];
    const rankingOrder = ranking.map(
      ({ candidate: practiceCandidate }) => practiceCandidate.id,
    );
    const historyOrder = practiceHistory.map(({ candidateId }) => candidateId);

    buildPracticeWave({ ranking, history: practiceHistory });

    expect(
      ranking.map(({ candidate: practiceCandidate }) => practiceCandidate.id),
    ).toEqual(rankingOrder);
    expect(practiceHistory.map(({ candidateId }) => candidateId)).toEqual(
      historyOrder,
    );
  });
});
