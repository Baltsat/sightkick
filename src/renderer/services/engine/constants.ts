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

// Practice is a learning surface, not an audition. The real Boulevard run
// showed same-lane pulse drift centred near 144 ms, so an 180 ms nearest-note
// window keeps that developing player inside the phrase while Perform retains
// the original 100 ms accuracy contract.
export const PRACTICE_HIT_TOLERANCE_SECONDS = 0.18;

export const ACCENT_VALUE_THRESHOLD = 90;

export const GHOST_VALUE_THRESHOLD = 50;

export const ACTIVE_CLASS = 'vf-note-active';

export const POP_CLASS = 'vf-note-pop';

export const MISS_CLASS = 'vf-note-miss';

export const HIT_CLASS = 'vf-note-hit';

export const MISSED_CLASS = 'vf-note-missed';

export const HIDDEN_CLASS = 'vf-note-hidden';

export const WRONG_HIT_MARKER_CLASS = 'vf-wronghit-marker';

export const HIHAT_PEDAL_CONTROL_IDS = new Set(['midi:44']);

export const WRONG_HIT_FADE_DELAY_SECONDS = 0.6;

export const WRONG_HIT_FADE_DURATION_SECONDS = 3;

export const WRONG_HIT_MIN_OPACITY = 0.48;

export function isHihatPedalControl(controlId: string): boolean {
  return HIHAT_PEDAL_CONTROL_IDS.has(controlId);
}

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
  'countInBeats',
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
