import { describe, expect, it } from 'vitest';
import { CoachFinding } from '../coach';
import { DRUM_SKILL_AXES } from '../learning-profile';
import type { DrumLearningProfile, DrumSkillAxisId } from '../learning-profile';
import { RunSummary } from '../practice-stats';
import { recommendNextPractice } from './recommend';
import {
  NextPracticeInput,
  PracticeCandidate,
  PracticeHistoryEntry,
} from './types';

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const PACING_NOW = Date.parse('2026-08-27T12:00:00.000Z');
const PACING_GOAL_DATE = '2026-09-10T12:00:00.000Z';

function makeCandidate(
  id: string,
  overrides: Partial<PracticeCandidate> = {},
): PracticeCandidate {
  return {
    id,
    title: id,
    kind: 'song',
    difficulty: 'medium',
    available: true,
    challengeLevel: 0.45,
    targetSpeed: 1,
    ...overrides,
  };
}

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    completedAt: '2026-08-01T12:00:00.000Z',
    totalHits: 80,
    totalMisses: 20,
    totalWrong: 0,
    overallAccuracy: 0.8,
    laneAccuracy: [
      { element: 'kick', hits: 8, misses: 2, accuracy: 0.8 },
      { element: 'snare', hits: 8, misses: 2, accuracy: 0.8 },
    ],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 12,
      earlyCount: 4,
      lateCount: 4,
      onTimeCount: 72,
      sampleCount: 80,
    },
    wrongHitCounts: [],
    mode: 'practice',
    playbackSpeed: 0.8,
    difficulty: 'medium',
    ...overrides,
  };
}

function history(
  candidateId: string,
  completedAt: string,
  overrides: Partial<RunSummary> = {},
): PracticeHistoryEntry {
  return {
    candidateId,
    summary: run({ completedAt, ...overrides }),
  };
}

function coachFinding(overrides: Partial<CoachFinding> = {}): CoachFinding {
  return {
    id: 'weak-kick',
    kind: 'limb-weakness',
    severity: 'high',
    title: 'Kick loses notes',
    summary: 'Repeated kick misses.',
    skillTag: 'kick-independence',
    evidence: {
      lane: 'kick',
      accuracy: 0.45,
      sampleCount: 12,
    },
    ...overrides,
  };
}

function learningProfile(
  overrides: Partial<Record<DrumSkillAxisId, number>> = {},
): DrumLearningProfile {
  return {
    axes: DRUM_SKILL_AXES.map((axis) => ({
      ...axis,
      score: overrides[axis.id] ?? 70,
      confidence: {
        level: 'medium',
        label: 'Medium confidence',
        evidenceCount: 4,
        evidenceWeight: 6,
        detail: 'Measured across four scored runs.',
      },
      trend: {
        direction: axis.id === 'hand-control' ? 'stable' : 'improving',
        delta: axis.id === 'hand-control' ? 0 : 5,
        detail: 'Fixture trend.',
      },
      limitingFactor: {
        key: 'fixture',
        label: 'Fixture',
        detail: 'Fixture evidence.',
        score: overrides[axis.id] ?? 70,
      },
    })),
    evidenceRuns: 4,
    computedThrough: '2026-08-27T10:00:00.000Z',
    strongestAxis: 'pulse-timing',
    focusAxis: 'hand-control',
  };
}

function recommend(
  overrides: Partial<NextPracticeInput>,
): ReturnType<typeof recommendNextPractice> {
  return recommendNextPractice({
    candidates: [],
    history: [],
    nowMs: NOW,
    ...overrides,
  });
}

describe('recommendNextPractice', () => {
  it('uses a deterministic curriculum-first fallback with no history', () => {
    const result = recommend({
      candidates: [
        makeCandidate('liked-song', { liked: true }),
        makeCandidate('lesson-2', {
          kind: 'lesson',
          difficulty: 'expert',
          sequence: 2,
        }),
        makeCandidate('lesson-1', {
          kind: 'lesson',
          difficulty: 'expert',
          sequence: 1,
        }),
      ],
    });

    expect(result.strategy).toBe('deterministic-fallback');
    expect(result.recommendation?.candidate.id).toBe('lesson-1');
    expect(result.recommendation?.confidence).toMatchObject({
      level: 'low',
      value: 0.15,
      evidenceRuns: 0,
    });
    expect(result.recommendation?.reason).toContain('earliest unlocked lesson');
  });

  it('keeps no-history fallback finite and honest with malformed speed metadata', () => {
    const result = recommend({
      candidates: [
        makeCandidate('fresh', { targetSpeed: Number.NaN }),
        makeCandidate('known-mastered', {
          mastered: true,
          targetSpeed: Number.POSITIVE_INFINITY,
        }),
      ],
    });

    expect(result.recommendation).toMatchObject({
      candidate: { id: 'fresh' },
      suggestedSpeed: 0.7,
      mastery: 0,
    });
    expect(result.ranking[1]).toMatchObject({
      candidate: { id: 'known-mastered' },
      suggestedSpeed: 0.7,
      mastery: 100,
    });
    expect(Number.isFinite(result.ranking[1].suggestedSpeed)).toBe(true);
  });

  it('moves repeated failure to a matching remedial lesson', () => {
    const failedHistory = [1, 2, 3].map((day) =>
      history('hard-song', `2026-08-0${6 + day}T12:00:00.000Z`, {
        overallAccuracy: 0.48,
        totalHits: 48,
        totalMisses: 52,
        playbackSpeed: 1,
        difficulty: 'hard',
        laneAccuracy: [{ element: 'kick', hits: 4, misses: 6, accuracy: 0.4 }],
      }),
    );
    const result = recommend({
      candidates: [
        makeCandidate('hard-song', {
          difficulty: 'hard',
          challengeLevel: 0.9,
          skills: ['kick-independence'],
          targetLanes: [{ element: 'kick', weight: 1 }],
        }),
        makeCandidate('kick-lesson', {
          kind: 'lesson',
          difficulty: 'expert',
          challengeLevel: 0.35,
          sequence: 5,
          skills: ['kick-independence'],
          targetLanes: [{ element: 'kick', weight: 1 }],
          targetSpeed: 0.8,
        }),
      ],
      history: failedHistory,
      coachFindings: [coachFinding()],
    });

    expect(result.recommendation?.candidate.id).toBe('kick-lesson');
    expect(
      result.recommendation?.factors.find(
        (factor) => factor.key === 'weak-skill-match',
      ),
    ).toMatchObject({ value: 1 });
    expect(
      result.ranking
        .find(({ candidate }) => candidate.id === 'hard-song')
        ?.factors.find((factor) => factor.key === 'same-song-fatigue')
        ?.contribution,
    ).toBeLessThan(0);
  });

  it('does not treat a failed Expert attempt as Expert capability', () => {
    const result = recommend({
      candidates: [
        makeCandidate('foundation', {
          kind: 'lesson',
          difficulty: 'expert',
          challengeLevel: 0.2,
          sequence: 1,
        }),
        makeCandidate('expert-song', {
          difficulty: 'expert',
          challengeLevel: 1,
        }),
      ],
      history: [
        history('unrelated-expert', '2026-08-08T12:00:00.000Z', {
          difficulty: 'expert',
          overallAccuracy: 0.1,
          totalHits: 10,
          totalMisses: 90,
          playbackSpeed: 1,
        }),
      ],
    });
    const foundationFit = result.ranking
      .find(({ candidate }) => candidate.id === 'foundation')
      ?.factors.find((factor) => factor.key === 'difficulty-fit')?.value;
    const expertFit = result.ranking
      .find(({ candidate }) => candidate.id === 'expert-song')
      ?.factors.find((factor) => factor.key === 'difficulty-fit')?.value;

    expect(result.recommendation?.candidate.id).toBe('foundation');
    expect(foundationFit).toBeGreaterThan(expertFit ?? 1);
  });

  it('does not immediately repeat a recently mastered item', () => {
    const masteredRuns = [1, 2, 3, 4, 5].map((day) =>
      history('mastered', `2026-08-0${day + 4}T10:00:00.000Z`, {
        overallAccuracy: 0.98,
        totalHits: 98,
        totalMisses: 2,
        playbackSpeed: 1,
        mode: 'perform',
      }),
    );
    const result = recommend({
      candidates: [
        makeCandidate('mastered', { mastered: true, liked: true }),
        makeCandidate('next-step', {
          kind: 'lesson',
          sequence: 8,
          challengeLevel: 0.55,
        }),
      ],
      history: [
        ...masteredRuns,
        history('next-step', '2026-07-29T10:00:00.000Z', {
          overallAccuracy: 0.78,
        }),
      ],
    });

    expect(result.recommendation?.candidate.id).toBe('next-step');
    expect(
      result.ranking
        .find(({ candidate }) => candidate.id === 'mastered')
        ?.factors.find((factor) => factor.key === 'recent-mastery'),
    ).toMatchObject({ value: -1, contribution: -25 });
  });

  it('hard-excludes unavailable and locked candidates', () => {
    const result = recommend({
      candidates: [
        makeCandidate('unavailable', {
          available: false,
          liked: true,
          kind: 'lesson',
          sequence: 0,
        }),
        makeCandidate('locked', {
          unlocked: false,
          kind: 'lesson',
          sequence: 1,
        }),
        makeCandidate('playable'),
      ],
      history: [history('baseline', '2026-08-01T12:00:00.000Z')],
    });

    expect(result.ranking.map(({ candidate }) => candidate.id)).toEqual([
      'playable',
    ]);
    expect(result.recommendation?.candidate.id).toBe('playable');
  });

  it('keeps an authored prerequisite chain safe even when a stars unlock says available', () => {
    const result = recommend({
      candidates: [
        makeCandidate('foundation', {
          kind: 'lesson',
          curriculumId: '01.01',
          mastered: false,
          sequence: 0,
        }),
        makeCandidate('unsafe-skip', {
          kind: 'lesson',
          curriculumId: '01.02',
          prerequisiteIds: ['01.01'],
          unlocked: true,
          sequence: 1,
        }),
      ],
    });

    expect(result.ranking.map(({ candidate }) => candidate.id)).toEqual([
      'foundation',
    ]);
  });

  it('routes a new reachable T2 lesson from saved weak-lane evidence', () => {
    const result = recommend({
      candidates: [
        makeCandidate('complete-foundation', {
          kind: 'lesson',
          curriculumId: '07.01',
          mastered: true,
          sequence: 0,
        }),
        makeCandidate('t2-lesson', {
          kind: 'lesson',
          curriculumId: '07.03',
          prerequisiteIds: ['07.01'],
          challengeLevel: 0.3,
          targetLanes: [{ element: 'tom2', weight: 1 }],
          sequence: 1,
          cue: 'Move cleanly from mid tom to floor tom.',
          bpmStart: 60,
          bpmTarget: 80,
          doseRule: 'Four focused repeats.',
          masteryRule: 'Three clean passes.',
        }),
        makeCandidate('snare-lesson', {
          kind: 'lesson',
          challengeLevel: 0.3,
          targetLanes: [{ element: 'snare', weight: 1 }],
          sequence: 2,
        }),
      ],
      history: [
        history('baseline', '2026-08-08T12:00:00.000Z', {
          laneAccuracy: [
            { element: 'tom2', hits: 2, misses: 8, accuracy: 0.2 },
            { element: 'snare', hits: 9, misses: 1, accuracy: 0.9 },
          ],
        }),
      ],
    });

    expect(result.recommendation?.candidate.id).toBe('t2-lesson');
    expect(
      result.recommendation?.factors.find(
        (factor) => factor.key === 'weak-lane-match',
      ),
    ).toMatchObject({ value: 0.8 });
    expect(result.recommendation?.lessonPlan).toMatchObject({
      bpmStart: 60,
      bpmTarget: 80,
      prerequisiteIds: ['07.01'],
      assessmentBoundary:
        'MIDI assesses timing and pad choice; sticking/form cue is not assessed.',
    });
  });

  it('uses persisted exact Coach evidence for its supported reachable lesson, never a locked skip', () => {
    const result = recommend({
      candidates: [
        makeCandidate('foundation', {
          kind: 'lesson',
          curriculumId: '07.01',
          mastered: true,
          sequence: 0,
        }),
        makeCandidate('supported-route', {
          kind: 'lesson',
          curriculumId: '07.03',
          prerequisiteIds: ['07.01'],
          skills: ['pad-accuracy'],
          challengeLevel: 0.3,
          sequence: 1,
        }),
        makeCandidate('locked-skip', {
          kind: 'lesson',
          curriculumId: '07.04',
          prerequisiteIds: ['07.03'],
          skills: ['pad-accuracy'],
          unlocked: true,
          challengeLevel: 0.3,
          sequence: 2,
        }),
      ],
      history: [history('weak-song', '2026-08-08T12:00:00.000Z')],
      coachEvidence: [
        {
          id: 'pad-tom2-tom3',
          kind: 'pad-confusion',
          severity: 'high',
          skillTag: 'pad-accuracy',
          sampleCount: 3,
          barStart: 4,
          barEnd: 4,
          remediationLessonId: '07.03',
        },
      ],
    });

    expect(result.recommendation?.candidate.id).toBe('supported-route');
    expect(result.ranking.map(({ candidate }) => candidate.id)).not.toContain(
      'locked-skip',
    );
    expect(
      result.recommendation?.factors.find(
        (factor) => factor.key === 'weak-skill-match',
      )?.value,
    ).toBeGreaterThan(0.5);
  });

  it('routes three persisted direct findings ahead of better-scoring generic songs when lesson taxonomy differs', () => {
    const result = recommend({
      candidates: [
        makeCandidate('generic-timing-song', {
          liked: true,
          skills: ['timing'],
          targetSpeed: 0.8,
        }),
        makeCandidate('generic-timing-song-2', {
          liked: true,
          skills: ['timing'],
          targetSpeed: 0.8,
        }),
        makeCandidate('lesson-01-01', {
          kind: 'lesson',
          curriculumId: '01.01',
          skills: ['sixteenth-notes'],
          difficulty: 'expert',
          challengeLevel: 0.1,
          sequence: 1,
        }),
      ],
      history: [
        history('generic-timing-song', '2026-08-08T12:00:00.000Z', {
          overallAccuracy: 0.96,
          totalHits: 96,
          totalMisses: 4,
          playbackSpeed: 0.8,
        }),
      ],
      coachEvidence: ['timing-1', 'timing-2', 'timing-3'].map((id) => ({
        id,
        kind: 'timing-bias',
        severity: 'high' as const,
        skillTag: 'timing',
        sampleCount: 12,
        remediationLessonId: '01.01',
      })),
    });
    const direct = result.ranking.find(
      ({ candidate }) => candidate.id === 'lesson-01-01',
    );
    const generic = result.ranking.find(
      ({ candidate }) => candidate.id === 'generic-timing-song',
    );

    expect(result.recommendation?.candidate.id).toBe('lesson-01-01');
    expect(direct).toMatchObject({
      directRemediation: { findingCount: 3 },
      reason: '3 saved Coach findings route directly to this lesson.',
    });
    expect(direct?.score).toBeLessThan(generic?.score ?? 0);
    expect(
      [...result.ranking]
        .sort((left, right) => right.score - left.score)
        .map(({ candidate }) => candidate.id)[0],
    ).toMatch(/^generic-timing-song/);
  });

  it('does not route cleared lessons or resolved findings as current remediation', () => {
    const candidates = [
      makeCandidate('generic-timing-song', {
        liked: true,
        skills: ['timing'],
        targetSpeed: 0.8,
      }),
      makeCandidate('lesson-01-01', {
        kind: 'lesson',
        curriculumId: '01.01',
        skills: ['sixteenth-notes'],
        challengeLevel: 0.1,
        sequence: 1,
      }),
    ];
    const historyEntries = [
      history('generic-timing-song', '2026-08-08T12:00:00.000Z', {
        overallAccuracy: 0.96,
        totalHits: 96,
        totalMisses: 4,
        playbackSpeed: 0.8,
      }),
    ];
    const finding = {
      id: 'timing-1',
      kind: 'timing-bias',
      severity: 'high' as const,
      skillTag: 'timing',
      sampleCount: 12,
      remediationLessonId: '01.01',
    };
    const cleared = recommend({
      candidates: candidates.map((candidate) =>
        candidate.id === 'lesson-01-01'
          ? { ...candidate, mastered: true }
          : candidate,
      ),
      history: historyEntries,
      coachEvidence: [finding],
    });
    const resolved = recommend({
      candidates,
      history: historyEntries,
      coachEvidence: [{ ...finding, resolved: true }],
    });

    expect(
      cleared.ranking.find(({ candidate }) => candidate.id === 'lesson-01-01')
        ?.directRemediation,
    ).toBeUndefined();
    expect(
      resolved.ranking.find(({ candidate }) => candidate.id === 'lesson-01-01')
        ?.directRemediation,
    ).toBeUndefined();
  });

  it('orders direct remediation before deadline pacing before generic evidence', () => {
    const result = recommend({
      candidates: [
        makeCandidate('generic-song', {
          liked: true,
          targetSpeed: 0.8,
        }),
        makeCandidate('hihat-control-song', {
          skills: ['sixteenth-hihat'],
          targetSpeed: 0.8,
        }),
        makeCandidate('direct-lesson', {
          kind: 'lesson',
          curriculumId: 'deadline-route',
          skills: ['timing'],
          challengeLevel: 0.2,
          sequence: 1,
        }),
      ],
      history: [
        history('generic-song', '2026-08-26T12:00:00.000Z', {
          overallAccuracy: 0.96,
          totalHits: 96,
          totalMisses: 4,
          playbackSpeed: 0.8,
        }),
      ],
      coachEvidence: [
        {
          id: 'route-first',
          kind: 'timing-bias',
          severity: 'high',
          skillTag: 'timing',
          sampleCount: 12,
          remediationLessonId: 'deadline-route',
        },
      ],
      goalDate: PACING_GOAL_DATE,
      learningProfile: learningProfile({ 'hand-control': 40 }),
      nowMs: PACING_NOW,
    });
    const paced = result.ranking.find(
      ({ candidate }) => candidate.id === 'hihat-control-song',
    );

    expect(result.ranking.map(({ candidate }) => candidate.id)).toEqual([
      'direct-lesson',
      'hihat-control-song',
      'generic-song',
    ]);
    expect(paced?.deadlinePacing).toMatchObject({
      axisId: 'hand-control',
      weeklyTarget: 60,
      behindBy: 20,
    });
    expect(
      paced?.factors.find((factor) => factor.key === 'deadline-pacing'),
    ).toMatchObject({ value: 1 });
    expect(paced?.reason).toContain(
      '2 weeks left: Hand Control is 20 points behind its weekly target of 60/100.',
    );
    expect(result.deadlinePacing?.targets).toContainEqual(
      expect.objectContaining({
        axisId: 'hand-control',
        prerequisiteAxisIds: ['pulse-timing'],
      }),
    );
  });

  it('keeps current ranking behavior when deadline pacing lacks goal or profile evidence', () => {
    const input = {
      candidates: [
        makeCandidate('generic-song', { liked: true }),
        makeCandidate('other-song'),
      ],
      history: [history('generic-song', '2026-08-08T12:00:00.000Z')],
      nowMs: NOW,
    };
    const current = recommendNextPractice(input);
    const withoutProfile = recommendNextPractice({
      ...input,
      goalDate: PACING_GOAL_DATE,
    });
    const insufficientProfile = recommendNextPractice({
      ...input,
      goalDate: PACING_GOAL_DATE,
      learningProfile: { ...learningProfile(), evidenceRuns: 2 },
    });

    expect(withoutProfile).toEqual(current);
    expect(insufficientProfile).toEqual(current);
    expect(withoutProfile.deadlinePacing).toBeUndefined();
    expect(
      withoutProfile.ranking.some(({ deadlinePacing }) => deadlinePacing),
    ).toBe(false);
  });

  it('penalizes same-song fatigue across the last three sessions', () => {
    const result = recommend({
      candidates: [makeCandidate('repeat-a'), makeCandidate('variety-b')],
      history: [
        history('variety-b', '2026-08-05T12:00:00.000Z'),
        history('variety-b', '2026-08-06T12:00:00.000Z'),
        history('repeat-a', '2026-08-07T12:00:00.000Z'),
        history('repeat-a', '2026-08-08T12:00:00.000Z'),
      ],
    });
    const repeated = result.ranking.find(
      ({ candidate }) => candidate.id === 'repeat-a',
    );
    const variety = result.ranking.find(
      ({ candidate }) => candidate.id === 'variety-b',
    );

    expect(result.recommendation?.candidate.id).toBe('variety-b');
    expect(
      repeated?.factors.find((factor) => factor.key === 'same-song-fatigue')
        ?.contribution,
    ).toBeLessThan(
      variety?.factors.find((factor) => factor.key === 'same-song-fatigue')
        ?.contribution ?? 0,
    );
  });

  it('breaks exact evidence ties by stable candidate id', () => {
    const input = {
      history: [history('baseline', '2026-08-01T12:00:00.000Z')],
      nowMs: NOW,
    };
    const forward = recommendNextPractice({
      ...input,
      candidates: [makeCandidate('alpha'), makeCandidate('beta')],
    });
    const reverse = recommendNextPractice({
      ...input,
      candidates: [makeCandidate('beta'), makeCandidate('alpha')],
    });

    expect(forward.ranking.map(({ candidate }) => candidate.id)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(reverse.ranking.map(({ candidate }) => candidate.id)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('exposes difficulty, target-speed, reason, and confidence evidence', () => {
    const result = recommend({
      candidates: [
        makeCandidate('tempo-step', {
          difficulty: 'hard',
          challengeLevel: 0.65,
          targetSpeed: 1,
        }),
      ],
      history: [
        history('tempo-step', '2026-08-01T12:00:00.000Z', {
          difficulty: 'hard',
          overallAccuracy: 0.92,
          playbackSpeed: 0.8,
        }),
        history('tempo-step', '2026-08-04T12:00:00.000Z', {
          difficulty: 'hard',
          overallAccuracy: 0.94,
          playbackSpeed: 0.8,
        }),
      ],
    });
    const recommendation = result.recommendation;

    expect(recommendation?.suggestedSpeed).toBe(0.9);
    expect(recommendation?.reason.length).toBeGreaterThan(0);
    expect(recommendation?.confidence).toMatchObject({
      level: 'medium',
      evidenceRuns: 2,
    });
    expect(recommendation?.factors.map((factor) => factor.key)).toEqual(
      expect.arrayContaining(['difficulty-fit', 'speed-readiness']),
    );
  });

  it('does not borrow another song clean speed for a failed item', () => {
    const result = recommend({
      candidates: [makeCandidate('failed-at-speed')],
      history: [
        history('other-song', '2026-08-01T12:00:00.000Z', {
          overallAccuracy: 0.98,
          playbackSpeed: 1,
          mode: 'perform',
        }),
        history('failed-at-speed', '2026-08-08T12:00:00.000Z', {
          overallAccuracy: 0.55,
          playbackSpeed: 1,
        }),
      ],
    });

    expect(
      result.recommendation?.factors.find(
        (factor) => factor.key === 'speed-readiness',
      ),
    ).toMatchObject({ value: 0, contribution: 0 });
    expect(result.recommendation?.suggestedSpeed).toBe(0.8);
  });

  it('does not borrow clean speed from the same item at another difficulty', () => {
    const result = recommend({
      candidates: [
        makeCandidate('multi-chart', {
          difficulty: 'hard',
          availableDifficulties: ['medium', 'hard'],
        }),
      ],
      history: [
        history('multi-chart', '2026-08-08T12:00:00.000Z', {
          difficulty: 'medium',
          overallAccuracy: 0.98,
          playbackSpeed: 1,
        }),
      ],
    });
    const speedFactor = result.recommendation?.factors.find(
      (factor) => factor.key === 'speed-readiness',
    );

    expect(speedFactor).toMatchObject({ value: 0, contribution: 0 });
    expect(speedFactor?.detail).toContain('Item-specific');
  });

  it('reports an explicit mastered override consistently', () => {
    const result = recommend({
      candidates: [makeCandidate('completed', { mastered: true })],
      history: [history('other-item', '2026-08-08T12:00:00.000Z')],
    });

    expect(result.recommendation?.mastery).toBe(100);
    expect(
      result.recommendation?.factors.find(
        (factor) => factor.key === 'recent-mastery',
      ),
    ).toMatchObject({ value: -1, contribution: -25 });
  });

  it('sanitizes non-finite evidence and clock values', () => {
    const result = recommend({
      candidates: [
        makeCandidate('malformed', {
          targetSpeed: Number.NaN,
          challengeLevel: Number.NaN,
          sequence: Number.NaN,
          targetLanes: [{ element: 'kick', weight: 1 }],
        }),
      ],
      history: [
        history('malformed', '2026-08-08T12:00:00.000Z', {
          totalHits: Number.POSITIVE_INFINITY,
          totalMisses: Number.NaN,
          totalWrong: Number.NEGATIVE_INFINITY,
          overallAccuracy: Number.NaN,
          playbackSpeed: Number.NaN,
          laneAccuracy: [
            {
              element: 'kick',
              hits: Number.NaN,
              misses: Number.POSITIVE_INFINITY,
              accuracy: Number.NaN,
            },
          ],
        }),
      ],
      nowMs: Number.NaN,
    });
    const recommendation = result.recommendation;

    expect(recommendation).toBeDefined();
    expect(
      [
        recommendation?.score,
        recommendation?.predictedSuccess,
        recommendation?.suggestedSpeed,
        recommendation?.mastery,
        recommendation?.confidence.value,
        ...(recommendation?.factors.flatMap((factor) => [
          factor.value,
          factor.weight,
          factor.contribution,
        ]) ?? []),
      ].every((value) => Number.isFinite(value)),
    ).toBe(true);
    expect(JSON.stringify(recommendation)).not.toContain('NaN');
  });

  it('orders non-finite sequences and equal-time evidence deterministically', () => {
    const candidates = [
      makeCandidate('beta', { sequence: Number.NaN }),
      makeCandidate('alpha', { sequence: Number.NaN }),
    ];
    const sameTimeHistory = [0.45, 0.55, 0.65, 0.75, 0.85, 0.95].map(
      (overallAccuracy) =>
        history('baseline', '2026-08-08T12:00:00.000Z', {
          overallAccuracy,
        }),
    );
    const forward = recommend({ candidates, history: sameTimeHistory });
    const reversed = recommend({
      candidates: [...candidates].reverse(),
      history: [...sameTimeHistory].reverse(),
    });
    const evidence = (result: typeof forward) =>
      result.ranking.map(({ candidate, score, predictedSuccess }) => ({
        id: candidate.id,
        score,
        predictedSuccess,
      }));

    expect(evidence(forward)).toEqual(evidence(reversed));
    expect(evidence(forward).map(({ id }) => id)).toEqual(['alpha', 'beta']);
  });

  it('returns an honest empty result when nothing is playable', () => {
    const result = recommend({
      candidates: [makeCandidate('missing', { available: false })],
      history: [history('baseline', '2026-08-01T12:00:00.000Z')],
    });

    expect(result).toEqual({ strategy: 'none-available', ranking: [] });
  });
});
