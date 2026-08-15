import { noteFlags, noteTypes } from 'scan-chart';
import type { ParsedChart } from '../../../chart-parser/types';
import { ChartParser } from '../../../chart-parser/parser';
import { build_my_wave_item_profile } from '../pedagogy/my-wave';
import {
  replayAtomicSkillState,
  skillProbability,
} from '../pedagogy/skill-state';
import type { SkillEvidenceEvent } from '../pedagogy/types';
import { lessonsForAtomicSkills } from '../coach/lessons';
import type {
  AtomicPatternFigure,
  DecomposePatternChartOptions,
  PatternChartModel,
  PatternDynamics,
  PatternFamily,
  PatternFamilyProfile,
  PatternGroove,
  PatternIndependence,
  PatternLimb,
  PatternOnset,
  PatternPlayerProfile,
  PatternPracticeHistory,
  PatternSkillWeight,
  PatternSubdivision,
  PatternTrend,
} from './types';

export * from './types';

const CANONICAL_GRID = 48;
const DEFAULT_SIMILARITY_THRESHOLD = 0.78;
const TREND_THRESHOLD = 4;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}

function hash(value: string): string {
  let current = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    current ^= value.charCodeAt(index);
    current = Math.imul(current, 0x01000193);
  }

  return (current >>> 0).toString(36).padStart(7, '0');
}

function laneForNote(
  type: number,
  flags: number,
  isFiveLane: boolean,
): PatternLimb | undefined {
  if (type === noteTypes.kick) {
    return 'kick';
  }

  if (type === noteTypes.redDrum) {
    return 'snare';
  }

  if (type === noteTypes.yellowDrum) {
    return isFiveLane || (flags & noteFlags.cymbal) !== 0 ? 'hihat' : 'tom1';
  }

  if (type === noteTypes.blueDrum) {
    return (flags & noteFlags.cymbal) !== 0 ? 'ride' : 'tom2';
  }

  if (type === noteTypes.greenDrum) {
    return (flags & noteFlags.cymbal) !== 0 ? 'crash' : 'tom3';
  }

  return undefined;
}

function subdivisionFor(
  durations: readonly string[],
  hasTuplet: boolean,
): PatternSubdivision {
  if (hasTuplet) {
    return 'triplet';
  }

  const values = new Set(
    durations.map((duration) => duration.replace(/[^0-9qhw]/g, '')),
  );

  if (values.has('16')) {
    return 'sixteenth';
  }

  if (values.has('8')) {
    return 'eighth';
  }

  if (values.has('q') || values.has('h') || values.has('w')) {
    return 'quarter';
  }

  return 'mixed';
}

function hasRockBackbeat(onsets: readonly PatternOnset[]): boolean {
  const at = new Map(onsets.map((onset) => [onset.position, onset.limbs]));
  const time = (limbs: readonly PatternLimb[] | undefined) =>
    limbs?.some((limb) => ['hihat', 'ride', 'crash'].includes(limb)) === true;

  return (
    at.get(12)?.includes('snare') === true &&
    at.get(36)?.includes('snare') === true &&
    [...at.values()].some(time)
  );
}

function grooveFor(
  subdivision: PatternSubdivision,
  onsets: readonly PatternOnset[],
  skillIds: readonly string[],
): PatternGroove {
  const hasTom = onsets.some((onset) =>
    onset.limbs.some((limb) => limb.startsWith('tom')),
  );

  if (
    hasTom &&
    skillIds.some(
      (id) => id.startsWith('kit.fill') || id.startsWith('music.fill'),
    )
  ) {
    return 'fill';
  }

  if (skillIds.some((id) => id === 'pulse.shuffle' || id === 'feel.shuffle')) {
    return 'shuffle';
  }

  if (onsets.length > 1 && onsets.every((onset) => onset.limbs.length === 1)) {
    return 'linear';
  }

  if (hasRockBackbeat(onsets)) {
    return 'rock-backbeat';
  }

  if (subdivision === 'sixteenth') {
    return 'sixteenth-groove';
  }

  if (subdivision === 'triplet') {
    return 'triplet-groove';
  }

  return subdivision === 'eighth' ? 'eighth-groove' : 'quarter-pulse';
}

function dynamicsFor(onsets: readonly PatternOnset[]): PatternDynamics {
  const accented = onsets.some((onset) => onset.accented);
  const ghosted = onsets.some((onset) => onset.ghosted);

  return accented && ghosted
    ? 'mixed'
    : accented
    ? 'accented'
    : ghosted
    ? 'ghosted'
    : 'even';
}

function independenceFor(onsets: readonly PatternOnset[]): PatternIndependence {
  const limbs = new Set(onsets.flatMap((onset) => onset.limbs));

  if (onsets.every((onset) => onset.limbs.length === 1) && limbs.size > 1) {
    return 'linear';
  }

  if (limbs.size >= 3) {
    return 'three-way';
  }

  return limbs.size === 1 ? 'single-limb' : 'two-way';
}

function restRatioFor(
  subdivision: PatternSubdivision,
  onsets: readonly PatternOnset[],
): number {
  const step: Record<PatternSubdivision, number> = {
    quarter: 12,
    eighth: 6,
    sixteenth: 3,
    triplet: 4,
    mixed: 1,
  };
  const interval = step[subdivision];
  const expected = Array.from(
    { length: Math.ceil(CANONICAL_GRID / interval) },
    (_, index) => index * interval,
  );
  const occupied = new Set(onsets.map(({ position }) => position));
  const sounding = expected.filter((position) => occupied.has(position)).length;

  return round(1 - sounding / expected.length);
}

function structuralPulseSkill(
  subdivision: PatternSubdivision,
): string | undefined {
  return subdivision === 'mixed' ? undefined : `pulse.${subdivision}`;
}

function demandFitsFigure(
  skillId: string,
  subdivision: PatternSubdivision,
  onsets: readonly PatternOnset[],
): boolean {
  const pulseSkill = structuralPulseSkill(subdivision);
  const hasTom = onsets.some((onset) =>
    onset.limbs.some((limb) => limb.startsWith('tom')),
  );

  if (skillId.startsWith('pulse.')) {
    return skillId === pulseSkill || skillId === 'pulse.shuffle';
  }

  if (skillId.startsWith('kit.') || skillId.startsWith('music.fill')) {
    return hasTom;
  }

  if (skillId.startsWith('coord.')) {
    return onsets.some((onset) => onset.limbs.length > 1);
  }

  if (skillId.startsWith('foot.')) {
    return onsets.some((onset) => onset.limbs.includes('kick'));
  }

  if (skillId.startsWith('hand.')) {
    return onsets.some((onset) => onset.limbs.some((limb) => limb !== 'kick'));
  }

  return true;
}

function normalizedSkillWeights(
  weights: readonly PatternSkillWeight[],
): readonly PatternSkillWeight[] {
  const byId = new Map<string, number>();

  weights.forEach(({ skill_id, weight }) => {
    if (Number.isFinite(weight) && weight > 0) {
      byId.set(skill_id, (byId.get(skill_id) ?? 0) + weight);
    }
  });

  const total = [...byId.values()].reduce((sum, weight) => sum + weight, 0);

  return [...byId.entries()]
    .map(([skill_id, weight]) => ({
      skill_id,
      weight: round(weight / Math.max(total, 0.0001), 6),
    }))
    .sort((left, right) => left.skill_id.localeCompare(right.skill_id));
}

function rhythmicSignature(onsets: readonly PatternOnset[]): string {
  return onsets
    .map(
      ({ position, limbs, accented, ghosted }) =>
        `${position}:${limbs.join('+')}${accented ? '!' : ''}${
          ghosted ? 'g' : ''
        }`,
    )
    .join('|');
}

function dslToken(limb: PatternLimb): string {
  const tokens: Record<PatternLimb, string> = {
    kick: 'kick',
    snare: 'snare',
    hihat: 'yellow',
    ride: 'blue',
    crash: 'green',
    tom1: 'yellow:tom',
    tom2: 'blue:tom',
    tom3: 'green:tom',
  };

  return tokens[limb];
}

function exemplarDsl(meter: string, onsets: readonly PatternOnset[]): string {
  const [numeratorValue, denominatorValue] = meter.split('/').map(Number);
  const numerator = Number.isFinite(numeratorValue) ? numeratorValue : 4;
  const denominator = Number.isFinite(denominatorValue) ? denominatorValue : 4;
  const measureTicks = 480 * 4 * (numerator / denominator);
  const lines = onsets.map(
    ({ position, limbs }) =>
      `${Math.round((position / CANONICAL_GRID) * measureTicks)} ${limbs
        .map(dslToken)
        .join(' ')}`,
  );

  return [`res=480 ts=${numerator}/${denominator}`, ...lines].join('\n');
}

function figureSimilarity(
  left: AtomicPatternFigure,
  right: AtomicPatternFigure,
): number {
  if (left.subdivision !== right.subdivision || left.meter !== right.meter) {
    return 0;
  }

  const leftPositions = new Set(left.onsets.map(({ position }) => position));
  const rightPositions = new Set(right.onsets.map(({ position }) => position));
  const intersection = [...leftPositions].filter((position) =>
    rightPositions.has(position),
  );
  const union = new Set([...leftPositions, ...rightPositions]);
  const rhythm = intersection.length / Math.max(1, union.size);
  const limb =
    intersection.reduce((sum, position) => {
      const leftLimbs = new Set(
        left.onsets.find((onset) => onset.position === position)?.limbs ?? [],
      );
      const rightLimbs = new Set(
        right.onsets.find((onset) => onset.position === position)?.limbs ?? [],
      );
      const shared = [...leftLimbs].filter((value) => rightLimbs.has(value));
      const all = new Set([...leftLimbs, ...rightLimbs]);

      return sum + shared.length / Math.max(1, all.size);
    }, 0) / Math.max(1, intersection.length);
  const groove = left.groove === right.groove ? 1 : 0;
  const expression =
    left.dynamics === right.dynamics && left.independence === right.independence
      ? 1
      : 0;

  return round(
    0.62 * rhythm + 0.22 * limb + 0.08 * groove + 0.08 * expression,
    6,
  );
}

function dominant<T extends string>(values: readonly T[]): T {
  const counts = new Map<T, number>();

  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  return [...counts.entries()].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || leftValue.localeCompare(rightValue),
  )[0][0];
}

function familyLabel(
  subdivision: PatternSubdivision,
  groove: PatternGroove,
  containsRests: boolean,
  dynamics: PatternDynamics,
): string {
  const subdivisionLabel: Record<PatternSubdivision, string> = {
    quarter: 'Quarter-note',
    eighth: 'Eighth-note',
    sixteenth: 'Sixteenth-note',
    triplet: 'Triplet',
    mixed: 'Mixed-note',
  };
  const grooveLabel: Record<PatternGroove, string> = {
    'quarter-pulse': 'pulse',
    'eighth-groove': 'groove',
    'sixteenth-groove': 'groove',
    'triplet-groove': 'groove',
    shuffle: 'shuffle',
    'rock-backbeat': 'backbeat',
    linear: 'linear phrase',
    fill: 'fill',
    mixed: 'pattern',
  };
  const expression =
    dynamics === 'accented'
      ? ' with accents'
      : dynamics === 'ghosted'
      ? ' with ghost notes'
      : dynamics === 'mixed'
      ? ' with accents and ghosts'
      : '';

  return `${subdivisionLabel[subdivision]} ${grooveLabel[groove]}${
    containsRests ? ' with rests' : ''
  }${expression}`;
}

function familyForFigures(
  figures: readonly AtomicPatternFigure[],
): PatternFamily {
  const representative = [...figures].sort((left, right) => {
    const leftAverage = figures.reduce(
      (sum, figure) => sum + figureSimilarity(left, figure),
      0,
    );
    const rightAverage = figures.reduce(
      (sum, figure) => sum + figureSimilarity(right, figure),
      0,
    );

    return (
      rightAverage - leftAverage ||
      left.rhythmic_signature.localeCompare(right.rhythmic_signature)
    );
  })[0];
  const subdivision = dominant(figures.map((figure) => figure.subdivision));
  const groove = dominant(figures.map((figure) => figure.groove));
  const dynamics = dominant(figures.map((figure) => figure.dynamics));
  const independence = dominant(figures.map((figure) => figure.independence));
  const containsRests = figures.some((figure) => figure.contains_rests);
  const skillWeights = normalizedSkillWeights(
    figures.flatMap((figure) => figure.skill_weights),
  );
  const lessonIds = lessonsForAtomicSkills(
    skillWeights.map(({ skill_id }) => skill_id),
  ).map(({ id }) => id);
  const identity = [
    representative.meter,
    subdivision,
    groove,
    dynamics,
    independence,
    Number(containsRests),
    representative.rhythmic_signature,
  ].join('|');

  return {
    family_id: `pattern:${hash(identity)}`,
    label: familyLabel(subdivision, groove, containsRests, dynamics),
    subdivision,
    groove,
    dynamics,
    independence,
    contains_rests: containsRests,
    rest_ratio: round(
      figures.reduce((sum, figure) => sum + figure.rest_ratio, 0) /
        figures.length,
    ),
    limb_combinations: [
      ...new Set(figures.flatMap((figure) => figure.limb_combinations)),
    ].sort(),
    rhythmic_signature: representative.rhythmic_signature,
    skill_weights: skillWeights,
    lesson_ids: lessonIds,
    occurrence_count: figures.length,
    source_item_ids: [
      ...new Set(figures.map((figure) => figure.source_item_id)),
    ].sort(),
    exemplar: representative.exemplar,
  };
}

export function cluster_pattern_figures(
  figures: readonly AtomicPatternFigure[],
  similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
): readonly PatternFamily[] {
  const ordered = [...figures].sort(
    (left, right) =>
      left.rhythmic_signature.localeCompare(right.rhythmic_signature) ||
      left.figure_id.localeCompare(right.figure_id),
  );
  const visited = new Set<number>();
  const families: PatternFamily[] = [];

  ordered.forEach((_, start) => {
    if (visited.has(start)) {
      return;
    }

    const indices: number[] = [];
    const queue = [start];

    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift()!;

      indices.push(current);
      ordered.forEach((candidate, index) => {
        if (
          !visited.has(index) &&
          figureSimilarity(ordered[current], candidate) >= similarityThreshold
        ) {
          visited.add(index);
          queue.push(index);
        }
      });
    }

    families.push(familyForFigures(indices.map((index) => ordered[index])));
  });

  return families.sort((left, right) =>
    left.family_id.localeCompare(right.family_id),
  );
}

export function decompose_chart_patterns(
  chart: ParsedChart,
  options: DecomposePatternChartOptions = {},
): PatternChartModel {
  const itemId = options.item_id ?? 'chart';
  const itemProfile = build_my_wave_item_profile({
    id: itemId,
    title: options.title ?? itemId,
    kind: options.kind ?? 'song',
    chart,
  });
  const parser = new ChartParser(chart, chart.drumType === 2);
  const drum =
    chart.trackData.find(
      ({ instrument, difficulty }) =>
        instrument === 'drums' && difficulty === 'expert',
    ) ?? chart.trackData.find(({ instrument }) => instrument === 'drums');
  const isFiveLane = chart.drumType === 2;
  const figures = parser.measures.flatMap((measure, measureIndex) => {
    const span = measure.endTick - measure.startTick;

    if (!drum || span <= 0) {
      return [];
    }

    const onsets = drum.noteEventGroups
      .filter(
        (group) =>
          group[0]?.tick >= measure.startTick &&
          group[0]?.tick < measure.endTick,
      )
      .map((group) => ({
        position: Math.min(
          CANONICAL_GRID - 1,
          Math.max(
            0,
            Math.round(
              ((group[0].tick - measure.startTick) / span) * CANONICAL_GRID,
            ),
          ),
        ),
        limbs: [
          ...new Set(
            group.flatMap((note) => {
              const lane = laneForNote(note.type, note.flags, isFiveLane);

              return lane ? [lane] : [];
            }),
          ),
        ].sort() as PatternLimb[],
        accented: group.some(({ flags }) => (flags & noteFlags.accent) !== 0),
        ghosted: group.some(({ flags }) => (flags & noteFlags.ghost) !== 0),
      }))
      .filter(({ limbs }) => limbs.length > 0)
      .sort(
        (left, right) =>
          left.position - right.position ||
          left.limbs.join('+').localeCompare(right.limbs.join('+')),
      );

    if (onsets.length === 0) {
      return [];
    }

    const subdivision = subdivisionFor(
      measure.notes.map((note) => note.duration),
      measure.notes.some((note) => note.tupletId !== undefined),
    );
    const restRatio = restRatioFor(subdivision, onsets);
    const containsRests = restRatio > 0;
    const pulseSkill = structuralPulseSkill(subdivision);
    const baseWeights = itemProfile.demands
      .filter(({ skill_id }) => demandFitsFigure(skill_id, subdivision, onsets))
      .map(({ skill_id, weight }) => ({ skill_id, weight }));
    const skillWeights = normalizedSkillWeights([
      ...baseWeights,
      ...(pulseSkill &&
      !baseWeights.some(({ skill_id }) => skill_id === pulseSkill)
        ? [{ skill_id: pulseSkill, weight: 0.2 }]
        : []),
      ...(containsRests ? [{ skill_id: 'reading.rests', weight: 0.15 }] : []),
    ]);
    const groove = grooveFor(
      subdivision,
      onsets,
      skillWeights.map(({ skill_id }) => skill_id),
    );
    const dynamics = dynamicsFor(onsets);
    const independence = independenceFor(onsets);
    const signature = rhythmicSignature(onsets);
    const meter = `${measure.timeSig[0]}/${measure.timeSig[1]}`;

    return [
      {
        figure_id: `${itemId}:${measureIndex}:${hash(signature)}`,
        source_item_id: itemId,
        measure_index: measureIndex,
        meter,
        subdivision,
        groove,
        dynamics,
        independence,
        contains_rests: containsRests,
        rest_ratio: restRatio,
        limb_combinations: [
          ...new Set(onsets.map(({ limbs }) => limbs.join('+'))),
        ].sort(),
        onsets,
        rhythmic_signature: signature,
        skill_weights: skillWeights,
        exemplar: {
          dsl: exemplarDsl(meter, onsets),
          rhythmic_signature: signature,
        },
      } satisfies AtomicPatternFigure,
    ];
  });

  return {
    item_id: itemId,
    figures,
    families: cluster_pattern_figures(
      figures,
      options.similarity_threshold ?? DEFAULT_SIMILARITY_THRESHOLD,
    ),
    demand_skill_ids: itemProfile.demands
      .map(({ skill_id }) => skill_id)
      .sort(),
  };
}

function eventKey(event: SkillEvidenceEvent): string {
  return [
    event.run_id,
    event.chart_revision,
    event.manifest_revision,
    event.skill_id,
    event.item_id,
    event.context_signature,
  ].join('|');
}

function historyEvents(history: PatternPracticeHistory): SkillEvidenceEvent[] {
  const seen = new Set<string>();

  return [
    ...(history.archived_events ?? []),
    ...history.runs.flatMap((run) => run.atomicSkillEvidence ?? []),
  ]
    .filter((event) => {
      const key = eventKey(event);
      const valid =
        !seen.has(key) &&
        event.run_id.length > 0 &&
        Number.isFinite(Date.parse(event.completed_at)) &&
        Number.isFinite(event.quality) &&
        event.quality >= 0 &&
        event.quality <= 1 &&
        Number.isFinite(event.weight) &&
        event.weight > 0;

      if (valid) {
        seen.add(key);
      }

      return valid;
    })
    .sort(
      (left, right) =>
        Date.parse(left.completed_at) - Date.parse(right.completed_at) ||
        left.run_id.localeCompare(right.run_id) ||
        left.skill_id.localeCompare(right.skill_id),
    );
}

function weightedMean(
  events: readonly SkillEvidenceEvent[],
  weights: ReadonlyMap<string, number>,
): number {
  const total = events.reduce(
    (sum, event) => sum + event.weight * (weights.get(event.skill_id) ?? 0),
    0,
  );

  if (total <= 0) {
    return 0;
  }

  return (
    events.reduce(
      (sum, event) =>
        sum +
        event.quality *
          clamp01(event.playback_speed) *
          event.weight *
          (weights.get(event.skill_id) ?? 0),
      0,
    ) / total
  );
}

function trendFor(
  events: readonly SkillEvidenceEvent[],
  weights: ReadonlyMap<string, number>,
): { trend: PatternTrend; delta: number } {
  if (events.length < 2) {
    return { trend: 'unknown', delta: 0 };
  }

  const midpoint = Math.floor(events.length / 2);
  const earlier = weightedMean(events.slice(0, midpoint), weights);
  const recent = weightedMean(events.slice(midpoint), weights);
  const delta = round((recent - earlier) * 100, 1);
  let trend: PatternTrend = 'stable';

  if (delta >= TREND_THRESHOLD) {
    trend = 'improving';
  } else if (delta <= -TREND_THRESHOLD) {
    trend = 'declining';
  }

  return {
    trend,
    delta,
  };
}

function familyProfile(
  family: PatternFamily,
  events: readonly SkillEvidenceEvent[],
): PatternFamilyProfile {
  const weights = new Map(
    family.skill_weights.map(({ skill_id, weight }) => [skill_id, weight]),
  );
  const familyEvents = events.filter((event) => {
    if (!weights.has(event.skill_id)) {
      return false;
    }

    const subdivision = event.context_signature.match(
      /(?:^|;)subdivision=([^;]+)/,
    )?.[1];

    return (
      family.subdivision === 'mixed' ||
      subdivision === undefined ||
      subdivision === family.subdivision
    );
  });
  const states = replayAtomicSkillState(familyEvents, {
    skill_ids: family.skill_weights.map(({ skill_id }) => skill_id),
  }).states;
  const stateById = new Map(states.map((state) => [state.skill_id, state]));
  const matchedWeights = family.skill_weights.filter(
    ({ skill_id }) => stateById.get(skill_id)?.effective_trials,
  );
  const totalWeight = matchedWeights.reduce(
    (sum, { weight }) => sum + weight,
    0,
  );
  const strength =
    totalWeight > 0
      ? matchedWeights.reduce(
          (sum, { skill_id, weight }) =>
            sum + skillProbability(stateById.get(skill_id)) * weight,
          0,
        ) / totalWeight
      : 0;
  const { trend, delta } = trendFor(familyEvents, weights);

  return {
    family,
    coverage: familyEvents.length > 0 ? 'played' : 'never_played',
    strength: round(strength * 100, 1),
    trend,
    trend_delta: delta,
    evidence_event_count: familyEvents.length,
    played_run_count: new Set(familyEvents.map(({ run_id }) => run_id)).size,
    ...(familyEvents.at(-1)
      ? { last_played_at: familyEvents.at(-1)!.completed_at }
      : {}),
  };
}

export function build_pattern_player_profile({
  families,
  history,
}: {
  families: readonly PatternFamily[];
  history: PatternPracticeHistory;
}): PatternPlayerProfile {
  const events = historyEvents(history);
  const familyProfiles = families
    .map((family) => familyProfile(family, events))
    .sort(
      (left, right) =>
        Number(right.coverage === 'played') -
          Number(left.coverage === 'played') ||
        right.strength - left.strength ||
        left.family.family_id.localeCompare(right.family.family_id),
    );
  const computedThrough = events.at(-1)?.completed_at;

  return {
    families: familyProfiles,
    played_family_count: familyProfiles.filter(
      ({ coverage }) => coverage === 'played',
    ).length,
    total_family_count: familyProfiles.length,
    evidence_event_count: events.length,
    ...(computedThrough ? { computed_through: computedThrough } : {}),
  };
}

export function lesson_ids_for_pattern_family(
  family: PatternFamily,
): readonly string[] {
  return family.lesson_ids;
}
