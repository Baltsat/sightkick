import type { ItemSkillManifest, SkillDemand } from './types';

export const CURRICULUM_TAXONOMY_VERSION = 'curriculum-taxonomy-v1';

const FACET_WEIGHT = 0.28;

function contextValues(signature: string): ReadonlyMap<string, string> {
  return new Map(
    signature.split(';').flatMap((part) => {
      const separator = part.indexOf('=');

      return separator > 0
        ? [[part.slice(0, separator), part.slice(separator + 1)] as const]
        : [];
    }),
  );
}

function tempoSkill(target_bpm: number | undefined): string | undefined {
  if (!target_bpm) {
    return undefined;
  }

  if (target_bpm < 80) {
    return 'tempo.60_79';
  }

  if (target_bpm < 100) {
    return 'tempo.80_99';
  }

  if (target_bpm < 120) {
    return 'tempo.100_119';
  }

  return target_bpm < 140 ? 'tempo.120_139' : 'tempo.140_plus';
}

function present(ids: ReadonlySet<string>, values: readonly string[]): boolean {
  return values.some((value) => ids.has(value));
}

export function curriculumSkillFacets(
  manifest: ItemSkillManifest,
): readonly string[] {
  const context = contextValues(manifest.context_signature);
  const ids = new Set(manifest.demands.map(({ skill_id }) => skill_id));
  const subdivision = context.get('subdivision');
  const meter = context.get('meter');
  const lanes = new Set(
    (context.get('lanes') ?? '').split(',').filter(Boolean),
  );
  const limbs = context.get('limbs');
  const phrase = context.get('phrase');
  const target_bpm = manifest.demands.find(
    ({ target_bpm: target }) => target !== undefined,
  )?.target_bpm;
  const facets = new Set<string>();

  if (
    subdivision &&
    ['quarter', 'eighth', 'sixteenth', 'triplet'].includes(subdivision)
  ) {
    facets.add(`grid.${subdivision}`);
  }

  const tempo = tempoSkill(target_bpm);

  if (tempo) {
    facets.add(tempo);
  }

  if (lanes.size === 1 && lanes.has('S')) {
    facets.add('limb.snare_only');
  } else if (lanes.size === 1 && lanes.has('K')) {
    facets.add('limb.kick_only');
  }

  if (limbs === 'joint' && !lanes.has('K')) {
    facets.add('limb.hands_joint');
  }

  if (lanes.has('K') && lanes.has('S')) {
    facets.add('limb.kick_snare');
  }

  if (lanes.has('K') && (lanes.has('H') || lanes.has('Y'))) {
    facets.add('limb.kick_hihat');
  }

  if (lanes.has('K') && (lanes.has('R') || lanes.has('B'))) {
    facets.add('limb.kick_ride');
  }

  if (lanes.size >= 3) {
    facets.add('limb.three_way');
  }

  if (ids.has('coord.linear')) {
    facets.add('limb.linear');
    facets.add('groove.linear');
  }

  if (ids.has('hand.singles')) {
    facets.add('sticking.alternating');
    facets.add('dynamic.even_velocity');
  }

  if (ids.has('hand.doubles')) {
    facets.add('sticking.double_rebound');
  }

  if (ids.has('hand.triples')) {
    facets.add('sticking.triple_rebound');
  }

  if (
    present(ids, [
      'hand.paradiddle_single',
      'hand.paradiddle_double',
      'hand.paradiddle_triple',
      'hand.paradiddle_diddle',
    ])
  ) {
    facets.add('sticking.paradiddle_accent');
    facets.add('sticking.paradiddle_inversion');
    facets.add('reading.sticking_cues');
  }

  if (ids.has('coord.hand_to_foot')) {
    facets.add('sticking.hand_foot_exchange');
  }

  if (present(ids, ['hand.accent_control', 'dynamics.accent'])) {
    facets.add('dynamic.accent_grid');
    facets.add('reading.dynamic_marks');
  }

  if (present(ids, ['hand.ghost_note', 'dynamics.ghost'])) {
    facets.add('dynamic.ghost_balance');
    facets.add('reading.dynamic_marks');
  }

  if (present(ids, ['dynamics.loud_soft', 'feel.backbeat'])) {
    facets.add('dynamic.backbeat_contrast');
  }

  if (ids.has('music.groove_8th')) {
    facets.add('groove.rock_eighth');
  }

  if (ids.has('music.groove_16th')) {
    facets.add('groove.rock_sixteenth');
  }

  if (ids.has('feel.shuffle')) {
    facets.add('groove.shuffle');
  }

  if (ids.has('feel.jazz_ride')) {
    facets.add('groove.jazz_ride');
  }

  if (meter === '3/4') {
    facets.add('groove.three_four');
  }

  if (meter === '6/8') {
    facets.add('groove.six_eight');
  }

  if (lanes.size > 1) {
    facets.add('reading.multi_lane');
  }

  if (phrase === 'fill') {
    if (lanes.size === 1 && lanes.has('S')) {
      facets.add('fill.snare');
    }

    const tom_count = [...lanes].filter((lane) =>
      ['T1', 'T2', 'T3', 'Y', 'B', 'G'].includes(lane),
    ).length;

    if (tom_count >= 3) {
      facets.add('fill.three_tom');
    } else if (tom_count >= 2) {
      facets.add('fill.two_tom');
    }

    if (
      present(ids, [
        'hand.paradiddle_single',
        'hand.paradiddle_double',
        'hand.paradiddle_triple',
        'hand.paradiddle_diddle',
      ])
    ) {
      facets.add('fill.rudimental');
    }

    if (present(ids, ['kit.fill_return', 'kit.crash_phrase'])) {
      facets.add('fill.crash_return');
    }
  }

  return [...facets].sort();
}

function roundWeight(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function expandCurriculumManifest(
  manifest: ItemSkillManifest,
): ItemSkillManifest {
  const facets = curriculumSkillFacets(manifest);

  if (facets.length === 0) {
    return manifest;
  }

  const base = manifest.demands.map((demand) => ({
    ...demand,
    weight: roundWeight(demand.weight * (1 - FACET_WEIGHT)),
  }));
  const target_bpm = manifest.demands.find(
    ({ target_bpm: target }) => target !== undefined,
  )?.target_bpm;
  const facet_weight = FACET_WEIGHT / facets.length;
  const detail: SkillDemand[] = facets.map((skill_id) => ({
    skill_id,
    weight: roundWeight(facet_weight),
    ...(target_bpm ? { target_bpm } : {}),
    context: manifest.context_signature,
  }));
  const demands = [...base, ...detail];
  const remainder = roundWeight(
    1 - demands.reduce((total, demand) => total + demand.weight, 0),
  );

  demands[demands.length - 1] = {
    ...demands[demands.length - 1],
    weight: roundWeight(demands[demands.length - 1].weight + remainder),
  };

  return {
    ...manifest,
    source_revision: `${manifest.source_revision};${CURRICULUM_TAXONOMY_VERSION}`,
    demands,
  };
}

export function expandCurriculumManifests(
  manifests: readonly ItemSkillManifest[],
): readonly ItemSkillManifest[] {
  return manifests.map(expandCurriculumManifest);
}

export function curriculumTaxonomyCoverage(
  manifests: readonly ItemSkillManifest[],
): { item_count: number; skill_count: number; skill_ids: readonly string[] } {
  const skill_ids = [
    ...new Set(
      manifests.flatMap(({ demands }) =>
        demands.map(({ skill_id }) => skill_id),
      ),
    ),
  ].sort();

  return {
    item_count: manifests.length,
    skill_count: skill_ids.length,
    skill_ids,
  };
}
