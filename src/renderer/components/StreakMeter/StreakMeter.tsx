import { cn } from '../../cn';
import { StreakUiState } from './useStreakEngine';

export interface StreakMeterProps {
  ui: StreakUiState;
  /**
   * Set false only to keep tests deterministic (no CSS animation classes
   * applied, so nothing depends on fake timers or `animationend`).
   * Mirrors `CountIn`'s own `animated` prop for the same reason.
   * `prefers-reduced-motion` is handled separately and automatically, in
   * CSS (base.css) - this prop is not that switch.
   */
  animated?: boolean;
  className?: string;
}

// Particles only show from this tier up (see base.css's [data-tier] ramp) -
// they're the "animated energy" the owner asked for at high stages, not a
// baseline decoration.
const PARTICLE_TIER_THRESHOLD = 5;
const PARTICLE_COUNT = 6;

/**
 * The in-play streak/rage HUD: pinned near the top of the play view,
 * `pointer-events-none` so it never intercepts input, and positioned to
 * sit above the sheet music rather than over it (see SongView's mount
 * point). Escalating visuals are almost entirely CSS, keyed off
 * `data-tier` (see base.css's `.sk-streak-meter[data-tier='N']` ramp) -
 * this component's job is picking the right tier and text, not the fire
 * ramp itself.
 */
export function StreakMeter({
  ui,
  animated = true,
  className,
}: StreakMeterProps) {
  const { streak, announceSeq, announceStage, shatterSeq } = ui;

  // The meter represents a live streak, not run history. Once the current
  // streak is broken, the best value remains available in Results; keeping a
  // 0/best pill over the score is both distracting and visually collides with
  // the location HUD at exactly the moment the player needs to recover.
  if (streak.count <= 0) {
    return null;
  }

  const tier = streak.stage?.tier ?? -1;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center',
        className,
      )}
      data-testid="streak-meter"
    >
      {/* `relative` anchor sized by the pill alone - the announce flash
          below is `absolute inset-0`, so it grows outward from (and
          settles back into) the pill's own footprint instead of stacking
          a second block underneath it. That keeps the whole overlay's
          layout height pinned to the small pill regardless of whether a
          flash is playing, which is what keeps it clear of the sheet
          music below (see SongView's mount point) even at the exact
          instant a stage-up fires. */}
      <div className="relative">
        <div
          key={`sk-streak-pill-${shatterSeq}`}
          className={cn(
            'sk-streak-meter flex items-center gap-2 rounded-full border border-border px-4 py-1.5',
            animated && 'sk-streak-pulse',
            animated && shatterSeq > 0 && 'sk-streak-shatter',
          )}
          data-tier={tier}
          data-testid="streak-meter-pill"
        >
          <span
            className="font-display text-2xl font-bold leading-none tabular-nums"
            data-testid="streak-count"
          >
            {streak.count}
          </span>
          {streak.stage && (
            <span
              className="font-ui text-xs font-semibold uppercase leading-none tracking-[0.08em]"
              data-testid="streak-stage-name"
            >
              {streak.stage.name}
            </span>
          )}
          {streak.best > streak.count && (
            <span
              className="font-ui text-[10px] font-medium leading-none text-text-faint"
              data-testid="streak-best"
            >
              best {streak.best}
            </span>
          )}
          {animated && tier >= PARTICLE_TIER_THRESHOLD && (
            <span
              className="sk-streak-particles"
              aria-hidden="true"
              data-testid="streak-particles"
            >
              {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
                <span key={i} className="sk-streak-particle" />
              ))}
            </span>
          )}
        </div>
        {announceStage && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              key={`sk-streak-announce-${announceSeq}`}
              className={cn(
                'sk-streak-announce-text',
                animated && 'sk-streak-announce',
              )}
              data-tier={announceStage.tier}
              data-testid="streak-announce"
              aria-live="polite"
            >
              {announceStage.name}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
