import { EvidenceBoundary, SkillNode, SkillPrerequisite } from './types';

export const ATOMIC_SKILL_GRAPH_VERSION = 'atomic-skill-graph-v3';

const default_review_days = [1, 3, 7, 14, 28] as const;

function node(
  id: string,
  label: string,
  family: string,
  evidence_boundary: EvidenceBoundary,
  prerequisites: readonly SkillPrerequisite[] = [],
): SkillNode {
  return {
    id,
    label,
    family,
    evidence_boundary,
    prerequisites,
    default_review_days,
  };
}

const hard = (id: string): SkillPrerequisite => ({ id, strength: 'hard' });
const supporting = (id: string): SkillPrerequisite => ({
  id,
  strength: 'supporting',
});
const transfer = (id: string): SkillPrerequisite => ({
  id,
  strength: 'transfer',
});

export const ATOMIC_SKILL_GRAPH: readonly SkillNode[] = [
  node('pulse.quarter', 'Quarter-note pulse', 'pulse and meter', 'midi'),
  node('pulse.eighth', 'Eighth-note pulse', 'pulse and meter', 'midi', [
    hard('pulse.quarter'),
  ]),
  node('pulse.sixteenth', 'Sixteenth-note pulse', 'pulse and meter', 'midi', [
    hard('pulse.eighth'),
  ]),
  node('pulse.triplet', 'Triplet pulse', 'pulse and meter', 'midi', [
    hard('pulse.eighth'),
  ]),
  node('pulse.shuffle', 'Shuffle pulse', 'pulse and meter', 'midi', [
    hard('pulse.eighth'),
  ]),
  node('meter.3_4', 'Three-four meter', 'pulse and meter', 'midi', [
    hard('pulse.quarter'),
  ]),
  node('meter.6_8', 'Six-eight meter', 'pulse and meter', 'midi', [
    hard('pulse.triplet'),
  ]),
  node('meter.12_8', 'Twelve-eight meter', 'pulse and meter', 'midi', [
    hard('pulse.triplet'),
  ]),
  node('meter.cut_time', 'Cut time', 'pulse and meter', 'midi', [
    hard('pulse.eighth'),
  ]),
  node(
    'reading.staff_map',
    'Staff-to-kit map',
    'rhythm reading',
    'partial_midi',
  ),
  node('reading.rests', 'Reading rests', 'rhythm reading', 'partial_midi', [
    hard('reading.staff_map'),
  ]),
  node('reading.ties', 'Reading ties', 'rhythm reading', 'partial_midi', [
    hard('reading.staff_map'),
  ]),
  node(
    'reading.syncopation',
    'Reading syncopation',
    'rhythm reading',
    'partial_midi',
    [hard('reading.staff_map')],
  ),
  node(
    'reading.subdivision_switch',
    'Subdivision switching',
    'rhythm reading',
    'partial_midi',
    [hard('reading.syncopation')],
  ),
  node(
    'reading.form_navigation',
    'Form navigation',
    'rhythm reading',
    'unsupported',
  ),
  node('hand.singles', 'Single strokes', 'hand vocabulary', 'partial_midi', [
    hard('pulse.eighth'),
  ]),
  node('hand.doubles', 'Double strokes', 'hand vocabulary', 'partial_midi', [
    hard('hand.singles'),
  ]),
  node('hand.triples', 'Triple strokes', 'hand vocabulary', 'partial_midi', [
    hard('hand.singles'),
  ]),
  node(
    'hand.paradiddle_single',
    'Single paradiddle',
    'hand vocabulary',
    'partial_midi',
    [hard('hand.singles')],
  ),
  node(
    'hand.paradiddle_double',
    'Double paradiddle',
    'hand vocabulary',
    'partial_midi',
    [hard('hand.paradiddle_single'), supporting('hand.doubles')],
  ),
  node(
    'hand.paradiddle_triple',
    'Triple paradiddle',
    'hand vocabulary',
    'partial_midi',
    [hard('hand.paradiddle_single'), supporting('hand.triples')],
  ),
  node(
    'hand.paradiddle_diddle',
    'Paradiddle-diddle',
    'hand vocabulary',
    'partial_midi',
    [hard('hand.paradiddle_single'), supporting('hand.doubles')],
  ),
  node(
    'hand.accent_control',
    'Accent control',
    'hand vocabulary',
    'partial_midi',
    [hard('hand.singles')],
  ),
  node('hand.ghost_note', 'Ghost notes', 'hand vocabulary', 'partial_midi', [
    hard('hand.singles'),
  ]),
  node('hand.cross_stick', 'Cross-stick', 'hand vocabulary', 'partial_midi', [
    hard('hand.singles'),
  ]),
  node('foot.kick_pulse', 'Kick pulse', 'foot control', 'midi', [
    hard('pulse.eighth'),
  ]),
  node('foot.kick_offbeat', 'Offbeat kick', 'foot control', 'midi', [
    hard('foot.kick_pulse'),
  ]),
  node('foot.hihat_chick', 'Hi-hat chick', 'foot control', 'partial_midi', [
    hard('pulse.eighth'),
  ]),
  node(
    'foot.hihat_open_close',
    'Hi-hat open and close',
    'foot control',
    'partial_midi',
    [hard('foot.hihat_chick')],
  ),
  node('coord.two_way', 'Two-way coordination', 'coordination', 'midi', [
    hard('hand.singles'),
    hard('foot.kick_pulse'),
  ]),
  node(
    'coord.rock_three_way',
    'Rock three-way coordination',
    'coordination',
    'midi',
    [hard('coord.two_way')],
  ),
  node(
    'coord.syncopated_kick',
    'Syncopated kick coordination',
    'coordination',
    'midi',
    [hard('coord.rock_three_way')],
  ),
  node('coord.ride_ostinato', 'Ride ostinato', 'coordination', 'midi', [
    hard('feel.jazz_ride'),
  ]),
  node('coord.linear', 'Linear coordination', 'coordination', 'midi', [
    hard('coord.two_way'),
  ]),
  node(
    'coord.hand_to_foot',
    'Hand-to-foot coordination',
    'coordination',
    'midi',
    [hard('coord.two_way')],
  ),
  node('kit.tom_t1_t2', 'High-to-mid tom movement', 'kit navigation', 'midi', [
    hard('hand.singles'),
  ]),
  node('kit.tom_t2_t3', 'Mid-to-floor tom movement', 'kit navigation', 'midi', [
    hard('hand.singles'),
  ]),
  node(
    'kit.tom_t1_t3',
    'High-to-floor tom movement',
    'kit navigation',
    'midi',
    [hard('hand.singles')],
  ),
  node('kit.tom_sweep', 'Tom sweep', 'kit navigation', 'midi', [
    hard('kit.tom_t1_t2'),
    hard('kit.tom_t2_t3'),
  ]),
  node('kit.fill_entry', 'Fill entry', 'kit navigation', 'midi', [
    hard('coord.rock_three_way'),
  ]),
  node('kit.fill_return', 'Fill return', 'kit navigation', 'midi', [
    hard('kit.fill_entry'),
    transfer('kit.tom_sweep'),
  ]),
  node('kit.crash_phrase', 'Crash phrase landing', 'kit navigation', 'midi', [
    hard('kit.fill_return'),
  ]),
  node(
    'dynamics.accent',
    'Dynamic accents',
    'dynamics and feel',
    'partial_midi',
    [hard('hand.accent_control')],
  ),
  node(
    'dynamics.ghost',
    'Dynamic ghost notes',
    'dynamics and feel',
    'partial_midi',
    [hard('hand.ghost_note')],
  ),
  node(
    'dynamics.loud_soft',
    'Loud-soft contrast',
    'dynamics and feel',
    'partial_midi',
    [hard('dynamics.accent')],
  ),
  node('feel.backbeat', 'Backbeat feel', 'dynamics and feel', 'partial_midi', [
    hard('coord.rock_three_way'),
  ]),
  node('feel.pocket', 'Pocket', 'dynamics and feel', 'partial_midi', [
    hard('feel.backbeat'),
  ]),
  node('feel.shuffle', 'Shuffle feel', 'dynamics and feel', 'partial_midi', [
    hard('pulse.shuffle'),
  ]),
  node(
    'feel.jazz_ride',
    'Jazz ride feel',
    'dynamics and feel',
    'partial_midi',
    [hard('pulse.triplet')],
  ),
  node(
    'music.groove_8th',
    'Eighth-note groove',
    'musical application',
    'midi',
    [hard('coord.rock_three_way')],
  ),
  node(
    'music.groove_16th',
    'Sixteenth-note groove',
    'musical application',
    'midi',
    [hard('pulse.sixteenth'), hard('coord.syncopated_kick')],
  ),
  node('music.fill_8th', 'Eighth-note fill', 'musical application', 'midi', [
    hard('kit.fill_return'),
  ]),
  node(
    'music.fill_16th',
    'Sixteenth-note fill',
    'musical application',
    'midi',
    [hard('music.fill_8th'), supporting('hand.accent_control')],
  ),
  node('music.song_form', 'Song form', 'musical application', 'partial_midi', [
    hard('music.groove_8th'),
  ]),
  node(
    'music.capstone',
    'Capstone application',
    'musical application',
    'midi',
    [hard('music.song_form')],
  ),
  node('grid.quarter', 'Quarter-note grid', 'subdivision grids', 'midi', [
    hard('pulse.quarter'),
  ]),
  node('grid.eighth', 'Eighth-note grid', 'subdivision grids', 'midi', [
    hard('pulse.eighth'),
  ]),
  node('grid.sixteenth', 'Sixteenth-note grid', 'subdivision grids', 'midi', [
    hard('pulse.sixteenth'),
  ]),
  node('grid.triplet', 'Triplet grid', 'subdivision grids', 'midi', [
    hard('pulse.triplet'),
  ]),
  node('tempo.60_79', 'Control at 60–79 BPM', 'tempo control', 'midi'),
  node('tempo.80_99', 'Control at 80–99 BPM', 'tempo control', 'midi'),
  node('tempo.100_119', 'Control at 100–119 BPM', 'tempo control', 'midi'),
  node('tempo.120_139', 'Control at 120–139 BPM', 'tempo control', 'midi'),
  node('tempo.140_plus', 'Control at 140+ BPM', 'tempo control', 'midi'),
  node('limb.snare_only', 'Snare-only control', 'limb independence', 'midi', [
    hard('hand.singles'),
  ]),
  node('limb.kick_only', 'Kick-only control', 'limb independence', 'midi', [
    hard('foot.kick_pulse'),
  ]),
  node('limb.hands_joint', 'Hands in unison', 'limb independence', 'midi', [
    hard('hand.singles'),
  ]),
  node(
    'limb.kick_snare',
    'Kick–snare independence',
    'limb independence',
    'midi',
    [hard('coord.two_way')],
  ),
  node(
    'limb.kick_hihat',
    'Kick–hi-hat independence',
    'limb independence',
    'midi',
    [hard('coord.rock_three_way')],
  ),
  node(
    'limb.kick_ride',
    'Kick–ride independence',
    'limb independence',
    'midi',
    [hard('coord.ride_ostinato')],
  ),
  node(
    'limb.three_way',
    'Three-way independence',
    'limb independence',
    'midi',
    [hard('coord.rock_three_way')],
  ),
  node(
    'limb.linear',
    'One-limb-at-a-time control',
    'limb independence',
    'midi',
    [hard('coord.linear')],
  ),
  node(
    'sticking.alternating',
    'Alternating sticking',
    'sticking',
    'partial_midi',
    [hard('hand.singles')],
  ),
  node(
    'sticking.single_lead',
    'Lead-hand singles',
    'sticking',
    'partial_midi',
    [hard('hand.singles')],
  ),
  node(
    'sticking.double_rebound',
    'Double-stroke rebound',
    'sticking',
    'partial_midi',
    [hard('hand.doubles')],
  ),
  node(
    'sticking.triple_rebound',
    'Triple-stroke rebound',
    'sticking',
    'partial_midi',
    [hard('hand.triples')],
  ),
  node(
    'sticking.paradiddle_accent',
    'Paradiddle accent path',
    'sticking',
    'partial_midi',
    [hard('hand.paradiddle_single')],
  ),
  node(
    'sticking.paradiddle_inversion',
    'Paradiddle inversions',
    'sticking',
    'partial_midi',
    [hard('hand.paradiddle_single')],
  ),
  node(
    'sticking.hand_foot_exchange',
    'Hand-to-foot sticking',
    'sticking',
    'midi',
    [hard('coord.hand_to_foot')],
  ),
  node(
    'dynamic.even_velocity',
    'Even stroke dynamics',
    'dynamic control',
    'partial_midi',
    [hard('hand.singles')],
  ),
  node(
    'dynamic.accent_grid',
    'Accents on the grid',
    'dynamic control',
    'partial_midi',
    [hard('dynamics.accent')],
  ),
  node(
    'dynamic.ghost_balance',
    'Ghost-note balance',
    'dynamic control',
    'partial_midi',
    [hard('dynamics.ghost')],
  ),
  node(
    'dynamic.backbeat_contrast',
    'Backbeat contrast',
    'dynamic control',
    'partial_midi',
    [hard('dynamics.loud_soft')],
  ),
  node(
    'dynamic.crescendo',
    'Crescendo control',
    'dynamic control',
    'partial_midi',
    [hard('dynamics.loud_soft')],
  ),
  node(
    'dynamic.decrescendo',
    'Decrescendo control',
    'dynamic control',
    'partial_midi',
    [hard('dynamics.loud_soft')],
  ),
  node(
    'groove.rock_eighth',
    'Eighth-note rock groove',
    'groove families',
    'midi',
    [hard('music.groove_8th')],
  ),
  node(
    'groove.rock_sixteenth',
    'Sixteenth-note rock groove',
    'groove families',
    'midi',
    [hard('music.groove_16th')],
  ),
  node('groove.half_time', 'Half-time groove', 'groove families', 'midi', [
    hard('feel.backbeat'),
  ]),
  node('groove.shuffle', 'Shuffle groove', 'groove families', 'midi', [
    hard('feel.shuffle'),
  ]),
  node('groove.jazz_ride', 'Jazz ride groove', 'groove families', 'midi', [
    hard('feel.jazz_ride'),
  ]),
  node('groove.three_four', 'Three-four groove', 'groove families', 'midi', [
    hard('meter.3_4'),
  ]),
  node('groove.six_eight', 'Six-eight groove', 'groove families', 'midi', [
    hard('meter.6_8'),
  ]),
  node('groove.linear', 'Linear groove', 'groove families', 'midi', [
    hard('coord.linear'),
  ]),
  node('fill.snare', 'Snare fill', 'fill vocabulary', 'midi', [
    hard('kit.fill_entry'),
  ]),
  node('fill.two_tom', 'Two-tom fill', 'fill vocabulary', 'midi', [
    hard('kit.tom_t1_t2'),
  ]),
  node('fill.three_tom', 'Three-tom fill', 'fill vocabulary', 'midi', [
    hard('kit.tom_sweep'),
  ]),
  node('fill.rudimental', 'Rudimental fill', 'fill vocabulary', 'midi', [
    hard('music.fill_16th'),
  ]),
  node('fill.crash_return', 'Fill-to-crash return', 'fill vocabulary', 'midi', [
    hard('kit.crash_phrase'),
  ]),
  node(
    'reading.multi_lane',
    'Multi-lane reading',
    'notation detail',
    'partial_midi',
    [hard('reading.staff_map')],
  ),
  node(
    'reading.dynamic_marks',
    'Dynamic-mark reading',
    'notation detail',
    'partial_midi',
    [hard('reading.staff_map')],
  ),
  node(
    'reading.sticking_cues',
    'Sticking-cue reading',
    'notation detail',
    'partial_midi',
    [hard('reading.staff_map')],
  ),
];

export interface SkillGraphValidation {
  valid: boolean;
  errors: readonly string[];
}

export function skillNodeById(
  nodes: readonly SkillNode[] = ATOMIC_SKILL_GRAPH,
): ReadonlyMap<string, SkillNode> {
  return new Map(nodes.map((skill) => [skill.id, skill]));
}

export function validateSkillGraph(
  nodes: readonly SkillNode[] = ATOMIC_SKILL_GRAPH,
): SkillGraphValidation {
  const errors: string[] = [];
  const by_id = skillNodeById(nodes);

  if (by_id.size !== nodes.length) {
    errors.push('Skill graph contains duplicate node ids.');
  }

  nodes.forEach((skill) => {
    if (!skill.id || !skill.label || !skill.family) {
      errors.push(
        `Skill node ${skill.id || '<missing>'} lacks identity metadata.`,
      );
    }

    if (!skill.evidence_boundary) {
      errors.push(`Skill node ${skill.id} lacks an evidence boundary.`);
    }

    skill.prerequisites.forEach((prerequisite) => {
      if (!by_id.has(prerequisite.id)) {
        errors.push(
          `Skill node ${skill.id} references unknown prerequisite ${prerequisite.id}.`,
        );
      }
    });
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, chain: readonly string[]): void => {
    if (visiting.has(id)) {
      errors.push(`Skill graph cycle: ${[...chain, id].join(' -> ')}.`);

      return;
    }

    if (visited.has(id)) {
      return;
    }

    const skill = by_id.get(id);

    if (!skill) {
      return;
    }

    visiting.add(id);
    skill.prerequisites.forEach(({ id: prerequisite_id }) =>
      visit(prerequisite_id, [...chain, id]),
    );
    visiting.delete(id);
    visited.add(id);
  };

  nodes.forEach((skill) => visit(skill.id, []));

  return { valid: errors.length === 0, errors };
}

export function hardPrerequisitesFor(
  skill_id: string,
  nodes: readonly SkillNode[] = ATOMIC_SKILL_GRAPH,
): readonly string[] {
  const by_id = skillNodeById(nodes);
  const seen = new Set<string>();
  const visit = (id: string): void => {
    const skill = by_id.get(id);

    if (!skill) {
      return;
    }

    skill.prerequisites
      .filter((prerequisite) => prerequisite.strength === 'hard')
      .forEach((prerequisite) => {
        if (!seen.has(prerequisite.id)) {
          seen.add(prerequisite.id);
          visit(prerequisite.id);
        }
      });
  };

  visit(skill_id);

  return [...seen].sort();
}
