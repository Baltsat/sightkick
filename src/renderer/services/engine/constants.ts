import { InputElement } from '../../../types';
import { PlaybackSnapshot } from './types';

export const ELEMENT_TO_KEYS: Record<string, string[]> = {
  kick: ['f/4', 'e/4'],
  snare: ['c/5'],
  hihat: ['g/5'],
  tom1: ['e/5'],
  ride: ['f/5'],
  tom2: ['d/5'],
  crash: ['a/5'],
  tom3: ['a/4'],
} satisfies Partial<Record<InputElement, string[]>>;

export const KIT_SHORT_LABEL: Partial<Record<InputElement, string>> = {
  hihat: 'HH',
  ride: 'RD',
  crash: 'CR',
  snare: 'SN',
  tom1: 'T1',
  tom2: 'T2',
  tom3: 'T3',
  kick: 'KK',
};

export const HIT_TOLERANCE_SECONDS = 0.1;

export const ACCENT_VALUE_THRESHOLD = 90;

export const GHOST_VALUE_THRESHOLD = 50;

export const ACTIVE_CLASS = 'vf-note-active';

export const POP_CLASS = 'vf-note-pop';

export const MISS_CLASS = 'vf-note-miss';

export const HIT_CLASS = 'vf-note-hit';

export const MISSED_CLASS = 'vf-note-missed';

export const HIDDEN_CLASS = 'vf-note-hidden';

export const WRONG_HIT_MARKER_CLASS = 'vf-wronghit-marker';

export const LOOKAHEAD_SECONDS = 0.2;

export const COUNT_IN_MIN_VOLUME = 0.7;

export const CLICK_GAIN_RAMP_SECONDS = 0.03;

export const SNAPSHOT_KEYS: (keyof PlaybackSnapshot)[] = [
  'state',
  'isPlaying',
  'isCounting',
  'isStarted',
  'isEnded',
  'countInBeat',
  'countInBeatMs',
  'isReady',
  'duration',
];

/**
 * Inverse of `ELEMENT_TO_KEYS`: which kit lane a notated VexFlow key
 * belongs to. Used to derive misses (practice-stats) from the fixed
 * key-to-lane table used to draw the chart — not `InputMapping`, which is
 * the player's controller mapping and answers a different question.
 */
export const KEY_TO_ELEMENT: Record<string, InputElement> = Object.fromEntries(
  Object.entries(ELEMENT_TO_KEYS).flatMap(([element, keys]) =>
    keys.map((key) => [key, element as InputElement]),
  ),
);
