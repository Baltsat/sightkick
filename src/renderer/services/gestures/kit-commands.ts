import type { KitElement } from '../practice-stats';
import type { DrumGestureAction } from './types';

export interface KitCommandSpec {
  /** Recognizer definition id, stable across UI rewrites. */
  id: string;
  action: DrumGestureAction;
  element: KitElement;
  /** Verb shown on the result screen, in the player's language. */
  label: string;
}

/**
 * What the kit does on the result screen — one pad, one outcome.
 *
 * The result screen is read from the stool, several feet back, with sticks
 * already in hand: a four-strike signature is something to memorise and get
 * wrong, and its printed form ("Ride › Kick › Ride › Crash" in small type)
 * is unreadable from there. A single strike per outcome is the whole
 * instruction, and the pad's own colour carries it — the same standard drum
 * colours the player already reads in the score and on the home kit (snare
 * red, hi-hat yellow, ride blue, crash green; see HOME_KIT_ZONE_LANES and
 * KitCommandPrompt's STEP_PRESENTATION).
 *
 * Single strikes are safe here for the same reason they are safe on the home
 * kit and on `ready` (`kit-command-start-kick`): no music is being judged on
 * this surface, so a strike cannot be anything but a command. The playing
 * surface deliberately keeps its four-hit pause signature — there, single
 * hits are music.
 *
 * This is the single source of truth for the mapping: the recognizer builds
 * its `result` definitions from it, and the result screen prints the same
 * list, so the pad the player is told to hit is by construction the pad the
 * recognizer is listening for.
 */
export const RESULT_KIT_COMMANDS: readonly KitCommandSpec[] = [
  {
    id: 'kit-command-continue',
    action: 'continue',
    element: 'crash',
    label: 'Next step',
  },
  {
    id: 'kit-command-retry',
    action: 'retry',
    element: 'snare',
    label: 'Play again',
  },
  {
    id: 'kit-command-end',
    action: 'end',
    element: 'ride',
    label: 'Leave session',
  },
  {
    id: 'kit-command-coach',
    action: 'open-coach',
    element: 'hihat',
    label: 'Coach',
  },
];
