import { describe, expect, it } from 'vitest';
import type { RunSummary } from '../practice-stats';
import type { PatternPlayerProfile } from '../pattern-model';
import type { StruggleReport } from '../struggle';
import {
  buildRunInsights,
  focusSectionFromStruggle,
  hasSectionCoverageMismatch,
  lessonRecommendationsFromPatternProfile,
  recommendedActionReplaySpeed,
  recommendedReplaySpeed,
} from './index';

function run(
  completedAt: string,
  hits: number,
  misses: number,
  playbackSpeed: number,
): RunSummary {
  return {
    completedAt,
    totalHits: hits,
    totalMisses: misses,
    totalWrong: 0,
    overallAccuracy: hits / (hits + misses),
    laneAccuracy: [],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: hits,
      sampleCount: hits,
    },
    wrongHitCounts: [],
    mode: 'practice',
    playbackSpeed,
  };
}

describe('run insights', () => {
  it('includes the current pass once and keeps the eight latest song runs chronological', () => {
    const history = Array.from({ length: 10 }, (_, index) =>
      run(
        `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
        index + 1,
        10 - index,
        0.7,
      ),
    );
    const current = history[9];
    const insight = buildRunInsights(current, history);

    expect(insight?.trend.points).toHaveLength(8);
    expect(insight?.trend.points.at(-1)).toMatchObject({
      completedAt: current.completedAt,
      hitRate: current.overallAccuracy,
    });
  });

  it('marks a first song run as a baseline instead of inventing movement', () => {
    const current = run('2026-08-15T12:00:00.000Z', 84, 16, 0.8);

    expect(buildRunInsights(current, [])?.trend.summary).toBe(
      'First saved run — this is the baseline.',
    );
  });

  it('surfaces every per-run atomic skill contribution in player language', () => {
    const current: RunSummary = {
      ...run('2026-08-15T12:00:00.000Z', 84, 16, 0.8),
      atomicSkillEvidence: [
        {
          run_id: 'run:1',
          chart_revision: 'chart:1',
          manifest_revision: 'manifest:1',
          skill_id: 'pulse.eighth',
          item_id: '01.03',
          context_signature: 'rock',
          evidence_kind: 'acquisition',
          quality: 0.84,
          weight: 0.5,
          playback_speed: 0.8,
          completed_at: '2026-08-15T12:00:00.000Z',
        },
        {
          run_id: 'run:1',
          chart_revision: 'chart:1',
          manifest_revision: 'manifest:1',
          skill_id: 'coord.rock_three_way',
          item_id: '01.03',
          context_signature: 'rock',
          evidence_kind: 'retention',
          quality: 0.78,
          weight: 0.4,
          playback_speed: 0.8,
          completed_at: '2026-08-15T12:00:00.000Z',
        },
      ],
    };

    expect(buildRunInsights(current, [])?.skills).toEqual([
      expect.objectContaining({
        skillId: 'pulse.eighth',
        label: 'Eighth-note pulse',
        movement: 'First evidence',
        qualityPercent: 84,
        positiveEvidence: 0.42,
      }),
      expect.objectContaining({
        skillId: 'coord.rock_three_way',
        label: 'Rock three-way coordination',
        movement: 'Held on revisit',
        qualityPercent: 78,
        positiveEvidence: 0.31,
      }),
    ]);
  });

  it('recommends one visible tempo step down only for a pass that did not connect', () => {
    expect(
      recommendedReplaySpeed(run('2026-08-15T12:00:00.000Z', 24, 1054, 0.7)),
    ).toBe(0.6);
    expect(
      recommendedReplaySpeed(run('2026-08-15T12:00:00.000Z', 940, 138, 1)),
    ).toBeUndefined();
  });

  it('adapts lane B collapse evidence into one bounded section action', () => {
    const report: StruggleReport = {
      status: 'available',
      analyzedSections: 4,
      collapseSections: [
        {
          barStart: 17,
          barEnd: 20,
          startTimeSeconds: 32,
          endTimeSeconds: 40,
          expectedNotes: 32,
          hits: 8,
          misses: 24,
          wrongHits: 2,
          hitRate: 0.25,
          patternSignatures: ['pattern:a'],
          novelPatternSignatures: ['pattern:a'],
          novelty: 'new',
          isNovel: true,
          drill: {
            barStart: 17,
            barEnd: 20,
            startTimeSeconds: 32,
            endTimeSeconds: 40,
            tempoMultiplier: 0.5,
            targetTempoMultiplier: 0.7,
            maximumAttempts: 6,
            terminalOutcomes: ['mastered', 'deferred'],
            passCriteria: {
              minimumResolvedNotes: 32,
              minimumAccuracy: 0.82,
              maximumMisses: 1,
              maximumWrongHits: 1,
              requiredConsecutiveCleanPasses: 3,
            },
          },
        },
      ],
    };
    const focus = focusSectionFromStruggle(report);

    expect(focus).toEqual({
      label: 'Bars 17–20',
      barStart: 17,
      barEnd: 20,
      tempoMultiplier: 0.5,
      passCriteria: 'Land 32 notes at 82%+ for 3 clean passes.',
      novel: true,
    });

    const summary: RunSummary = {
      ...run('2026-08-15T12:00:00.000Z', 24, 1054, 0.7),
      sectionEvidence: [
        {
          barStart: 17,
          barEnd: 20,
          startTick: 32,
          endTick: 40,
          startTimeSeconds: 32,
          endTimeSeconds: 40,
          expectedNotes: 32,
          hits: 8,
          misses: 24,
          wrongHits: 2,
          patternSignature: 'pattern:a',
          attempted: true,
        },
      ],
    };

    expect(hasSectionCoverageMismatch(summary, focus)).toBe(true);
    expect(recommendedActionReplaySpeed(summary, focus)).toBe(0.5);
  });

  it('recommends lessons from the weakest played lane C families', () => {
    const family = (label: string, lessonId: string) => ({
      family_id: `family:${lessonId}`,
      label,
      subdivision: 'eighth' as const,
      groove: 'eighth-groove' as const,
      contains_rests: false,
      rest_ratio: 0,
      limb_combinations: ['kick+snare'],
      rhythmic_signature: label,
      skill_weights: [{ skill_id: 'pulse.eighth', weight: 1 }],
      lesson_ids: [lessonId],
      occurrence_count: 1,
      source_item_ids: ['song:1'],
      exemplar: { dsl: '', rhythmic_signature: label },
    });
    const profile = {
      families: [
        {
          family: family('Strong groove', '01.04'),
          coverage: 'played',
          strength: 82,
          trend: 'stable',
          trend_delta: 0,
          evidence_event_count: 4,
          played_run_count: 4,
        },
        {
          family: family('Weak backbeat', '04.02'),
          coverage: 'played',
          strength: 31,
          trend: 'declining',
          trend_delta: -12,
          evidence_event_count: 3,
          played_run_count: 3,
        },
      ],
      played_family_count: 2,
      total_family_count: 2,
      evidence_event_count: 7,
    } satisfies PatternPlayerProfile;

    expect(lessonRecommendationsFromPatternProfile(profile)).toEqual([
      { lessonId: '04.02', family: 'Weak backbeat' },
      { lessonId: '01.04', family: 'Strong groove' },
    ]);
  });
});
