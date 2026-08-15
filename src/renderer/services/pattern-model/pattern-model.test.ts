import { describe, expect, it } from 'vitest';
import { noteFlags } from 'scan-chart';
import { buildParsedChartFromDsl } from '../../components/SheetMusic/helpers';
import type { SkillEvidenceEvent } from '../pedagogy';
import {
  build_pattern_player_profile,
  cluster_pattern_figures,
  decompose_chart_patterns,
  lesson_ids_for_pattern_family,
} from '.';
import type { PatternFamily } from '.';

function bar(lines: readonly string[]): string {
  return ['res=480 ts=4/4', ...lines].join('\n');
}

function eighthGroove(extraKick = false): string {
  return bar([
    '0 kick yellow',
    extraKick ? '240 kick yellow' : '240 yellow',
    '480 snare yellow',
    '720 yellow',
    '960 kick yellow',
    '1200 yellow',
    '1440 snare yellow',
    '1680 yellow',
  ]);
}

function event(
  run_id: string,
  completed_at: string,
  skill_id: string,
  quality: number,
): SkillEvidenceEvent {
  return {
    run_id,
    chart_revision: 'chart:stable-v1',
    manifest_revision: 'manifest:stable-v1',
    skill_id,
    item_id: 'song:groove',
    context_signature: 'meter=4/4;subdivision=eighth',
    evidence_kind: 'acquisition',
    quality,
    weight: 1,
    playback_speed: 1,
    completed_at,
  };
}

function run(atomicSkillEvidence: readonly SkillEvidenceEvent[]) {
  return {
    completedAt: atomicSkillEvidence.at(-1)?.completed_at ?? '',
    totalHits: 16,
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
      onTimeCount: 16,
      sampleCount: 16,
    },
    wrongHitCounts: [],
    atomicSkillEvidence: [...atomicSkillEvidence],
  };
}

describe('pattern chart decomposition', () => {
  it('returns the same JSON model for the same chart and exposes musical atoms', () => {
    const chart = buildParsedChartFromDsl(
      [
        eighthGroove(),
        bar(['0 kick', '960 kick', '1440 snare']),
        bar(['0 kick yellow', '160 yellow', '320 yellow', '480 snare yellow']),
      ].join('\n\n'),
    );
    const first = decompose_chart_patterns(chart, { item_id: 'deterministic' });
    const second = decompose_chart_patterns(chart, {
      item_id: 'deterministic',
    });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.figures.map(({ subdivision }) => subdivision)).toEqual([
      'eighth',
      'quarter',
      'triplet',
    ]);
    expect(first.figures[1]).toMatchObject({
      contains_rests: true,
      limb_combinations: ['kick', 'snare'],
    });
    expect(first.figures[0].exemplar.dsl).toContain('ts=4/4');
  });

  it('clusters near-identical rhythmic figures into one family independent of input order', () => {
    const model = decompose_chart_patterns(
      buildParsedChartFromDsl(
        [eighthGroove(), eighthGroove(true)].join('\n\n'),
      ),
      { item_id: 'near-identical' },
    );
    const reversed = cluster_pattern_figures([...model.figures].reverse());

    expect(model.figures).toHaveLength(2);
    expect(model.families).toHaveLength(1);
    expect(model.families[0].occurrence_count).toBe(2);
    expect(reversed).toEqual(model.families);
  });

  it('routes fill and tom families to authored curriculum lessons', () => {
    const model = decompose_chart_patterns(
      buildParsedChartFromDsl(
        bar([
          '0 kick yellow',
          '120 yellow:tom',
          '240 blue:tom',
          '360 green:tom',
          '480 yellow:tom',
          '600 blue:tom',
          '720 green:tom',
          '960 kick yellow',
          '1440 snare yellow',
        ]),
      ),
      { item_id: 'fill' },
    );
    const lessons = lesson_ids_for_pattern_family(model.families[0]);

    expect(lessons).toContain('18.03');
    expect(lessons).toContain('07.02');
  });

  it('keeps authored accents and ghost notes as separate deterministic family evidence', () => {
    const chart = buildParsedChartFromDsl(eighthGroove());

    chart.trackData[0].noteEventGroups[0][0].flags |= noteFlags.accent;
    chart.trackData[0].noteEventGroups[2][0].flags |= noteFlags.ghost;

    const first = decompose_chart_patterns(chart, { item_id: 'dynamics' });
    const second = decompose_chart_patterns(chart, { item_id: 'dynamics' });

    expect(first).toEqual(second);
    expect(first.figures[0]).toMatchObject({
      dynamics: 'mixed',
      independence: 'three-way',
    });
    expect(first.figures[0].rhythmic_signature).toContain('!');
    expect(first.figures[0].rhythmic_signature).toContain('g');
    expect(first.families[0].label).toContain('accents and ghosts');
  });
});

describe('pattern player profile', () => {
  it('uses recent and archived atomic evidence for coverage, strength, and trend', () => {
    const family = decompose_chart_patterns(
      buildParsedChartFromDsl(eighthGroove()),
      { item_id: 'song:groove' },
    ).families[0];
    const skillId = family.skill_weights[0].skill_id;
    const archived = [
      event('run:1', '2026-01-01T10:00:00.000Z', skillId, 0.5),
      event('run:2', '2026-02-01T10:00:00.000Z', skillId, 0.58),
    ];
    const recent = [
      event('run:3', '2026-03-01T10:00:00.000Z', skillId, 0.84),
      event('run:4', '2026-04-01T10:00:00.000Z', skillId, 0.92),
    ];
    const unseen: PatternFamily = {
      ...family,
      family_id: 'pattern:unseen',
      label: 'Triplet groove',
      subdivision: 'triplet',
      skill_weights: family.skill_weights,
      lesson_ids: ['19.01'],
    };
    const profile = build_pattern_player_profile({
      families: [family, unseen],
      history: {
        archived_events: archived,
        runs: [run([archived[0], ...recent])],
      },
    });
    const played = profile.families.find(
      ({ family: candidate }) => candidate.family_id === family.family_id,
    )!;
    const never = profile.families.find(
      ({ family: candidate }) => candidate.family_id === unseen.family_id,
    )!;

    expect(profile).toMatchObject({
      played_family_count: 1,
      total_family_count: 2,
      evidence_event_count: 4,
      computed_through: '2026-04-01T10:00:00.000Z',
    });
    expect(played).toMatchObject({
      coverage: 'played',
      trend: 'improving',
      evidence_event_count: 4,
      played_run_count: 4,
    });
    expect(played.strength).toBeGreaterThan(50);
    expect(played.trend_delta).toBeGreaterThan(20);
    expect(never).toMatchObject({
      coverage: 'never_played',
      strength: 0,
      trend: 'unknown',
    });
  });
});
