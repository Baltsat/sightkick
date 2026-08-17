import { StreakStage } from './types';

/**
 * Decay vs. reset: the owner explicitly wants a hard reset on any miss or
 * wrong hit, not a gradual bleed-down of the streak count - "resets feel
 * right for rage modes". Kept as a single named constant (rather than the
 * choice being implicit in `streak-tracker.ts`'s control flow) so a future
 * decay mode is a one-line flip to make, and so anyone re-litigating the
 * decision finds one doc comment instead of archaeology across the
 * module. Flipping this would change `registerFailure` in
 * `streak-tracker.ts` to subtract/decay `count` instead of zeroing it; the
 * `didShatter` signal and the UI treatment behind it stay meaningful
 * either way (whatever "a real setback just happened" means for the
 * chosen behavior).
 */
export const STREAK_RESET_ON_MISS = true;

/**
 * The drum-domain streak ladder. Thresholds are hand-tuned so the top of
 * the ladder is genuinely rare - reaching "Buzz Roll Berserker" means 500
 * unbroken correct hits, not a couple of measures of luck. Names lean on
 * real drum vocabulary (pocket, groove, backbeat, fill, buzz roll) laced
 * with the Guitar-Hero/Dota-spree energy the owner asked for, without
 * lifting any trademarked spree name outright.
 *
 * Ordered ascending by `threshold`; `tier` mirrors array index and is what
 * the CSS escalation in `base.css` keys off of via `data-tier`.
 */
export const STREAK_STAGES: readonly StreakStage[] = [
  { id: 'warm-up', name: 'Warm-Up', threshold: 16, tier: 0 },
  { id: 'in-the-pocket', name: 'In the Pocket', threshold: 32, tier: 1 },
  { id: 'groove-machine', name: 'Groove Machine', threshold: 64, tier: 2 },
  { id: 'backbeat-boss', name: 'Backbeat Boss', threshold: 96, tier: 3 },
  { id: 'fill-wizard', name: 'Fill Wizard', threshold: 128, tier: 4 },
  { id: 'drumroll', name: 'DRUMROLL!', threshold: 192, tier: 5 },
  { id: 'thunderstruck', name: 'Thunderstruck', threshold: 256, tier: 6 },
  { id: 'rhythm-deity', name: 'Rhythm Deity', threshold: 384, tier: 7 },
  { id: 'possessed', name: 'POSSESSED', threshold: 512, tier: 8 },
  {
    id: 'buzz-roll-berserker',
    name: 'Buzz Roll Berserker',
    threshold: 768,
    tier: 9,
  },
] as const;
