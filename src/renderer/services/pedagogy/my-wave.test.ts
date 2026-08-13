import { noteFlags } from 'scan-chart';
import { describe, expect, it } from 'vitest';
import type { ParsedChart } from '../../../chart-parser/types';
import { buildParsedChartFromDsl } from '../../components/SheetMusic/helpers';
import type { AtomicSkillState, ItemSkillManifest } from './types';
import {
  build_my_wave,
  build_my_wave_item_profile,
  extract_drum_chart_features,
  score_my_wave_difficulty,
} from './my-wave';

const NOW = '2026-08-12T10:00:00.000Z';

function chart_fixture(blocks: readonly string[], bpm: number): ParsedChart {
  const chart = buildParsedChartFromDsl(blocks.join('\n\n'));

  return {
    ...chart,
    tempos: [{ tick: 0, beatsPerMinute: bpm, msTime: 0 }],
  };
}

function bar(lines: readonly string[]): string {
  return ['res=480 ts=4/4', ...lines].join('\n');
}

function eighth_groove(): string {
  return bar([
    '0 kick yellow',
    '240 yellow',
    '480 snare yellow',
    '720 yellow',
    '960 kick yellow',
    '1200 yellow',
    '1440 snare yellow',
    '1680 yellow',
  ]);
}

function sixteenth_groove(): string {
  return bar([
    '0 kick yellow',
    '120 kick yellow',
    '240 yellow',
    '360 yellow',
    '480 snare yellow',
    '600 yellow',
    '720 kick yellow',
    '840 yellow',
    '960 snare yellow',
    '1080 yellow',
    '1200 kick yellow',
    '1320 kick yellow',
    '1440 snare yellow',
    '1560 yellow',
    '1680 kick yellow',
    '1800 yellow',
  ]);
}

function quarter_groove(): string {
  return bar([
    '0 kick yellow',
    '480 snare yellow',
    '960 kick yellow',
    '1440 snare yellow',
  ]);
}

function triplet_groove(): string {
  return bar([
    '0 kick yellow',
    '160 yellow',
    '320 yellow',
    '480 snare yellow',
    '640 yellow',
    '800 yellow',
    '960 kick yellow',
    '1120 yellow',
    '1280 yellow',
    '1440 snare yellow',
    '1600 yellow',
    '1760 yellow',
  ]);
}

function fill_bar(): string {
  return bar([
    '0 kick yellow',
    '120 yellow:tom',
    '240 blue:tom',
    '360 green:tom',
    '480 kick yellow:tom',
    '600 blue:tom',
    '720 green:tom',
    '840 yellow:tom',
    '960 kick yellow',
    '1200 snare yellow',
    '1440 kick yellow',
    '1680 snare yellow',
  ]);
}

function manifest(
  item_id: string,
  skill_id = 'hand.singles',
  target_bpm = 120,
): ItemSkillManifest {
  return {
    item_id,
    source: 'manual_song_review',
    source_revision: `${item_id}:manifest-v1`,
    chart_revision: `${item_id}:chart-v1`,
    demands: [
      {
        skill_id,
        weight: 1,
        target_bpm,
        context: 'meter=4/4;subdivision=sixteenth;pattern=groove',
      },
    ],
    context_signature: 'meter=4/4;subdivision=sixteenth;pattern=groove',
    assessment_confidence: 0.95,
  };
}

function state(
  skill_id: string,
  alpha: number,
  beta: number,
  best_supported_bpm = 120,
  stage: AtomicSkillState['stage'] = 'provisional',
): AtomicSkillState {
  return {
    skill_id,
    alpha,
    beta,
    effective_trials: 8,
    best_supported_bpm,
    last_acquisition_at: '2026-08-11T10:00:00.000Z',
    stage,
    evidence_boundary: 'partial_midi',
  };
}

describe('my wave', () => {
  it('extracts charted musical and motor features from a real parsed drum chart fixture', () => {
    const chart = chart_fixture(
      [sixteenth_groove(), sixteenth_groove(), fill_bar()],
      132,
    );

    chart.trackData[0].noteEventGroups[0][0].flags |= noteFlags.accent;
    chart.trackData[0].noteEventGroups.at(-1)![0].flags |= noteFlags.ghost;

    const features = extract_drum_chart_features(chart);

    expect(features).toMatchObject({
      tempo_bpm: 132,
      subdivision: 'sixteenth',
      meter: '4/4',
    });
    expect(features?.subdivision_density).toBeGreaterThan(0.8);
    expect(features?.limb_independence_load).toBeGreaterThan(0.2);
    expect(features?.kick_snare_hat_interplay).toBeGreaterThan(0.2);
    expect(features?.fill_density).toBeGreaterThan(0.1);
    expect(features?.syncopation).toBeGreaterThan(0.1);
    expect(features?.dynamic_range).toBeGreaterThan(0);
    expect(features?.section_repetition).toBeGreaterThan(0);
  });

  it('calibrates the same chart difficulty against measured atomic skill state', () => {
    const item = {
      id: 'same-chart',
      title: 'same chart',
      kind: 'lesson' as const,
      chart: chart_fixture([sixteenth_groove()], 128),
      manifest: manifest('same-chart', 'hand.singles', 128),
    };
    const profile = build_my_wave_item_profile(item);
    const confident = score_my_wave_difficulty({
      profile,
      atomic_states: [state('hand.singles', 18, 2, 128, 'retained')],
      now: NOW,
    });
    const developing = score_my_wave_difficulty({
      profile,
      atomic_states: [state('hand.singles', 2, 10, 80, 'assessed')],
      now: NOW,
    });

    expect(confident.chart_difficulty).toBe(developing.chart_difficulty);
    expect(confident.learner_relative_difficulty).toBeLessThan(
      developing.learner_relative_difficulty,
    );
    expect(confident.skill_readiness).toBeGreaterThan(
      developing.skill_readiness,
    );
  });

  it('ranks same-skill chart similarity ahead of a generic tempo match and records the evidence', () => {
    const source = {
      id: 'played-16ths',
      title: 'played 16ths',
      kind: 'song' as const,
      chart: chart_fixture([sixteenth_groove()], 120),
      chart_revision: 'played-16ths:chart-v1',
      manifest: manifest('played-16ths', 'hand.singles', 120),
      playback_speed: 1,
    };
    const result = build_my_wave({
      played: source,
      candidates: [
        {
          id: 'same-16ths-faster',
          title: 'same 16ths faster',
          kind: 'song',
          available: true,
          liked: true,
          chart: chart_fixture([sixteenth_groove()], 132),
          chart_revision: 'same-16ths-faster:chart-v1',
          manifest: manifest('same-16ths-faster', 'hand.singles', 132),
        },
        {
          id: 'different-triplet-tempo',
          title: 'different triplet tempo',
          kind: 'song',
          available: true,
          chart: chart_fixture([triplet_groove()], 132),
          chart_revision: 'different-triplet-tempo:chart-v1',
          manifest: manifest('different-triplet-tempo', 'pulse.triplet', 132),
        },
      ],
      atomic_states: [state('hand.singles', 6, 2, 120)],
      now: NOW,
      intent: 'songs',
      limit: 1,
    });
    const first = result.recommendations[0];

    expect(result.strategy).toBe('skill_zpd_wave');
    expect(first).toMatchObject({
      candidate: { id: 'same-16ths-faster' },
      reason: 'a saved favourite; same 16th-hat groove, one notch faster.',
      receipt: {
        source_item_id: 'played-16ths',
        candidate_item_id: 'same-16ths-faster',
        evidence: {
          level: 'chart_and_manifest',
          source_manifest_revision: 'played-16ths:manifest-v1',
          candidate_manifest_revision: 'same-16ths-faster:manifest-v1',
        },
      },
    });
    expect(first.similarity.matched_skills).toEqual(['hand.singles']);
  });

  it('uses planned zpd steps, excludes unavailable songs, and keeps a scaffolded stretch finite', () => {
    const source = {
      id: 'played-eighths',
      title: 'played eighths',
      kind: 'song' as const,
      chart: chart_fixture([eighth_groove()], 110),
      manifest: manifest('played-eighths', 'hand.singles', 110),
    };
    const result = build_my_wave({
      played: source,
      candidates: [
        {
          id: 'step-one',
          title: 'step one',
          kind: 'song',
          available: true,
          chart: chart_fixture([sixteenth_groove()], 124),
          manifest: manifest('step-one', 'hand.singles', 124),
        },
        {
          id: 'consolidate',
          title: 'consolidate',
          kind: 'song',
          available: true,
          chart: chart_fixture([quarter_groove()], 90),
          manifest: manifest('consolidate', 'hand.singles', 90),
        },
        {
          id: 'step-two',
          title: 'step two',
          kind: 'song',
          available: true,
          chart: chart_fixture([sixteenth_groove(), fill_bar()], 136),
          manifest: manifest('step-two', 'hand.singles', 136),
        },
        {
          id: 'stretch',
          title: 'stretch',
          kind: 'song',
          available: true,
          chart: chart_fixture([sixteenth_groove(), fill_bar()], 190),
          manifest: manifest('stretch', 'hand.singles', 190),
        },
        {
          id: 'not-playable',
          title: 'not playable',
          kind: 'song',
          available: false,
          chart: chart_fixture([sixteenth_groove()], 124),
          manifest: manifest('not-playable', 'hand.singles', 124),
        },
      ],
      atomic_states: [state('hand.singles', 6, 2, 120)],
      now: NOW,
      intent: 'songs',
      limit: 4,
    });

    expect(
      result.recommendations.map(({ candidate }) => candidate.id),
    ).not.toContain('not-playable');
    expect(
      result.recommendations.map(({ receipt }) => receipt.planned_step),
    ).toEqual(['step_up', 'consolidate', 'step_up', 'stretch']);
    expect(result.recommendations.at(-1)?.receipt).toMatchObject({
      candidate_item_id: 'stretch',
      selected_step: 'stretch',
      zpd_state: 'scaffold_first',
    });
  });

  it('keeps songs outside the ZPD out of the continuation stream', () => {
    const result = build_my_wave({
      played: {
        id: 'played-safe',
        title: 'played safe',
        kind: 'song',
        chart: chart_fixture([eighth_groove()], 100),
        manifest: manifest('played-safe', 'hand.singles', 100),
      },
      candidates: [
        {
          id: 'goal-preview-only',
          title: 'goal preview only',
          kind: 'song',
          available: true,
          chart: chart_fixture([sixteenth_groove(), fill_bar()], 220),
          manifest: manifest('goal-preview-only', 'hand.singles', 220),
        },
      ],
      atomic_states: [state('hand.singles', 1, 100, 60, 'assessed')],
      now: NOW,
      intent: 'songs',
    });

    expect(result).toMatchObject({
      strategy: 'no_zpd_candidate',
      recommendations: [],
    });
  });

  it('honors learning intent without making songs unavailable', () => {
    const source = {
      id: 'played-for-learning',
      title: 'played for learning',
      kind: 'song' as const,
      chart: chart_fixture([sixteenth_groove()], 120),
      manifest: manifest('played-for-learning', 'hand.singles', 120),
    };
    const result = build_my_wave({
      played: source,
      candidates: [
        {
          id: 'song-application',
          title: 'song application',
          kind: 'song',
          available: true,
          chart: chart_fixture([sixteenth_groove()], 128),
          manifest: manifest('song-application', 'hand.singles', 128),
        },
        {
          id: 'lesson-application',
          title: 'lesson application',
          kind: 'lesson',
          available: true,
          chart: chart_fixture([sixteenth_groove()], 128),
          manifest: manifest('lesson-application', 'hand.singles', 128),
        },
      ],
      atomic_states: [state('hand.singles', 6, 2, 120)],
      now: NOW,
      intent: 'learning',
      limit: 1,
    });

    expect(result.recommendations[0]?.candidate).toMatchObject({
      id: 'lesson-application',
    });
  });

  it('lets a loved, replayed song just beyond the frontier beat a neutral exercise that is perfectly placed', () => {
    const source = {
      id: 'played-foundation',
      title: 'played foundation',
      kind: 'song' as const,
      chart: chart_fixture([eighth_groove()], 108),
      manifest: manifest('played-foundation', 'hand.singles', 108),
    };
    const result = build_my_wave({
      played: source,
      candidates: [
        {
          id: 'neutral-exercise',
          title: 'neutral exercise',
          kind: 'lesson',
          available: true,
          chart: chart_fixture([eighth_groove()], 118),
          manifest: manifest('neutral-exercise', 'hand.singles', 118),
        },
        {
          id: 'beloved-next-step',
          title: 'beloved next step',
          kind: 'song',
          available: true,
          liked: true,
          replay_count: 9,
          chart: chart_fixture([sixteenth_groove()], 124),
          manifest: manifest('beloved-next-step', 'hand.singles', 124),
        },
      ],
      atomic_states: [state('hand.singles', 6, 2, 112)],
      now: NOW,
      intent: 'learning',
      limit: 1,
    });

    expect(result.recommendations[0]).toMatchObject({
      candidate: { id: 'beloved-next-step' },
      receipt: {
        affection: {
          favourite: true,
          replay_count: 9,
          replay_share: 1,
        },
      },
    });
    expect(result.recommendations[0]?.reason).toContain('saved favourite');
  });

  it('keeps a beloved song that is far beyond reach behind a neutral exercise in the current step', () => {
    const source = {
      id: 'played-foundation',
      title: 'played foundation',
      kind: 'song' as const,
      chart: chart_fixture([eighth_groove()], 108),
      manifest: manifest('played-foundation', 'hand.singles', 108),
    };
    const result = build_my_wave({
      played: source,
      candidates: [
        {
          id: 'neutral-exercise',
          title: 'neutral exercise',
          kind: 'lesson',
          available: true,
          chart: chart_fixture([eighth_groove()], 118),
          manifest: manifest('neutral-exercise', 'hand.singles', 118),
        },
        {
          id: 'beloved-too-far',
          title: 'beloved too far',
          kind: 'song',
          available: true,
          liked: true,
          replay_count: 24,
          chart: chart_fixture([sixteenth_groove(), fill_bar()], 220),
          manifest: manifest('beloved-too-far', 'hand.singles', 220),
        },
      ],
      atomic_states: [state('hand.singles', 6, 2, 112)],
      now: NOW,
      intent: 'learning',
      limit: 1,
    });

    expect(result.recommendations[0]?.candidate.id).toBe('neutral-exercise');
  });

  it('uses replay history when favourites alone do not distinguish two reachable songs', () => {
    const source = {
      id: 'played-foundation',
      title: 'played foundation',
      kind: 'song' as const,
      chart: chart_fixture([eighth_groove()], 108),
      manifest: manifest('played-foundation', 'hand.singles', 108),
    };
    const result = build_my_wave({
      played: source,
      candidates: [
        {
          id: 'a-neutral-song',
          title: 'neutral song',
          kind: 'song',
          available: true,
          chart: chart_fixture([sixteenth_groove()], 124),
          manifest: manifest('a-neutral-song', 'hand.singles', 124),
        },
        {
          id: 'z-replayed-song',
          title: 'replayed song',
          kind: 'song',
          available: true,
          replay_count: 8,
          chart: chart_fixture([sixteenth_groove()], 124),
          manifest: manifest('z-replayed-song', 'hand.singles', 124),
        },
      ],
      atomic_states: [state('hand.singles', 6, 2, 112)],
      now: NOW,
      intent: 'songs',
      limit: 1,
    });

    expect(result.recommendations[0]).toMatchObject({
      candidate: { id: 'z-replayed-song' },
      receipt: {
        affection: {
          favourite: false,
          replay_count: 8,
          replay_share: 1,
        },
      },
    });
    expect(result.recommendations[0]?.reason).toContain('keep returning');
  });

  it('degrades honestly when chart and atomic evidence are thin', () => {
    const result = build_my_wave({
      played: {
        id: 'played-thin',
        title: 'played thin',
        kind: 'song',
      },
      candidates: [
        {
          id: 'available-thin',
          title: 'available thin',
          kind: 'song',
          available: true,
        },
        {
          id: 'missing-thin',
          title: 'missing thin',
          kind: 'song',
          available: false,
        },
      ],
      atomic_states: [],
      now: NOW,
      intent: 'songs',
      limit: 1,
    });

    expect(result).toMatchObject({
      strategy: 'thin_evidence_wave',
      recommendations: [
        {
          candidate: { id: 'available-thin' },
          reason:
            'playable continuation; chart and atomic-skill evidence are still thin.',
          receipt: { evidence: { level: 'thin' } },
        },
      ],
    });
  });
});
