import { KitElement } from '../practice-stats';
import { DrumSkillAxisId } from './types';

const EXACT_TAG_AXES: Readonly<Record<string, readonly DrumSkillAxisId[]>> = {
  timing: ['pulse-timing', 'groove-pocket'],
  pulse: ['pulse-timing'],
  tempo: ['pulse-timing'],
  metronome: ['pulse-timing'],
  'quarter-notes': ['reading-subdivision'],
  'eighth-notes': ['reading-subdivision'],
  'sixteenth-notes': ['reading-subdivision'],
  'sixteenth-hihat': ['reading-subdivision', 'hand-control'],
  triplets: ['reading-subdivision'],
  shuffle: ['reading-subdivision', 'groove-pocket'],
  syncopation: ['reading-subdivision', 'groove-pocket'],
  reading: ['reading-subdivision'],
  notation: ['reading-subdivision'],
  rests: ['reading-subdivision'],
  rudiments: ['hand-control'],
  'single-strokes': ['hand-control'],
  'double-strokes': ['hand-control'],
  paradiddles: ['hand-control', 'limb-coordination'],
  flams: ['hand-control'],
  drags: ['hand-control'],
  rolls: ['hand-control'],
  'kick-independence': ['foot-control', 'limb-coordination'],
  'foot-control': ['foot-control'],
  'bass-drum': ['foot-control'],
  'double-kick': ['foot-control'],
  coordination: ['limb-coordination'],
  independence: ['limb-coordination'],
  ostinato: ['limb-coordination', 'groove-pocket'],
  dynamics: ['dynamics-touch'],
  accents: ['dynamics-touch', 'hand-control'],
  'ghost-notes': ['dynamics-touch', 'groove-pocket'],
  velocity: ['dynamics-touch'],
  touch: ['dynamics-touch'],
  groove: ['groove-pocket'],
  pocket: ['groove-pocket'],
  backbeat: ['groove-pocket'],
  swing: ['groove-pocket', 'reading-subdivision'],
  fills: ['fills-kit-navigation'],
  orchestration: ['fills-kit-navigation'],
  'kit-navigation': ['fills-kit-navigation'],
  'pad-accuracy': ['fills-kit-navigation', 'limb-coordination'],
  toms: ['fills-kit-navigation'],
  cymbals: ['fills-kit-navigation'],
};
const FRAGMENT_AXES: readonly [string, readonly DrumSkillAxisId[]][] = [
  ['timing', ['pulse-timing', 'groove-pocket']],
  ['subdivision', ['reading-subdivision']],
  ['sixteenth', ['reading-subdivision']],
  ['eighth', ['reading-subdivision']],
  ['quarter', ['reading-subdivision']],
  ['triplet', ['reading-subdivision']],
  ['shuffle', ['reading-subdivision', 'groove-pocket']],
  ['rudiment', ['hand-control']],
  ['stroke', ['hand-control']],
  ['paradiddle', ['hand-control', 'limb-coordination']],
  ['flam', ['hand-control']],
  ['kick', ['foot-control']],
  ['pedal', ['foot-control']],
  ['coordination', ['limb-coordination']],
  ['independence', ['limb-coordination']],
  ['dynamic', ['dynamics-touch']],
  ['accent', ['dynamics-touch', 'hand-control']],
  ['ghost', ['dynamics-touch', 'groove-pocket']],
  ['groove', ['groove-pocket']],
  ['pocket', ['groove-pocket']],
  ['backbeat', ['groove-pocket']],
  ['fill', ['fills-kit-navigation']],
  ['tom', ['fills-kit-navigation']],
  ['navigation', ['fills-kit-navigation']],
  ['pad-accuracy', ['fills-kit-navigation', 'limb-coordination']],
];
const LANE_AXES: Readonly<Record<KitElement, readonly DrumSkillAxisId[]>> = {
  kick: ['foot-control', 'limb-coordination'],
  snare: ['hand-control', 'limb-coordination'],
  hihat: ['hand-control', 'groove-pocket'],
  ride: ['hand-control', 'groove-pocket', 'fills-kit-navigation'],
  crash: ['hand-control', 'fills-kit-navigation'],
  tom1: ['hand-control', 'fills-kit-navigation'],
  tom2: ['hand-control', 'fills-kit-navigation'],
  tom3: ['hand-control', 'fills-kit-navigation'],
};

/** Normalizes authored and Coach tags without trusting their serialized shape. */
export function normalizeDrumSkillTag(tag: unknown): string {
  if (typeof tag !== 'string') {
    return '';
  }

  return tag
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Maps a curriculum or persisted Coach skill tag onto the stable profile axes.
 * Unknown tags deliberately return no axes: the profile never invents evidence.
 */
export function axesForDrumSkillTag(tag: unknown): DrumSkillAxisId[] {
  const normalized = normalizeDrumSkillTag(tag);

  if (!normalized) {
    return [];
  }

  const exact = EXACT_TAG_AXES[normalized];
  const matches = exact
    ? [...exact]
    : FRAGMENT_AXES.flatMap(([fragment, axes]) =>
        normalized.includes(fragment) ? axes : [],
      );

  return [...new Set(matches)];
}

/** Alias named for downstream Coach/recommender call sites. */
export const axesForCoachSkillTag = axesForDrumSkillTag;

/** Maps a scored kit lane onto the axes it can directly evidence. */
export function axesForKitElement(element: unknown): DrumSkillAxisId[] {
  return typeof element === 'string' && element in LANE_AXES
    ? [...LANE_AXES[element as KitElement]]
    : [];
}

export const DRUM_SKILL_TAG_AXIS_MAP = EXACT_TAG_AXES;
