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
  const { announceSeq, announceStage } = ui;

  if (!announceStage) {
    return null;
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-20 grid place-items-center',
        className,
      )}
      data-testid="streak-meter"
    >
      <div className="relative">
        <div
          key={`sk-streak-vfx-${announceSeq}`}
          className={cn(
            'sk-streak-meter',
            animated && 'sk-streak-pulse',
            animated && 'sk-streak-tier-up',
          )}
          data-tier={announceStage.tier}
          data-testid="streak-meter-pill"
          aria-live="polite"
        >
          <span className="sk-streak-energy" aria-hidden="true" />
          <strong className="sk-streak-title" data-testid="streak-stage-name">
            {announceStage.name}
          </strong>
          <span className="sk-streak-proof" data-testid="streak-proof">
            <b>{announceStage.threshold} clean 16ths</b> · target window · 0.8×+
          </span>
          {animated && announceStage.tier >= PARTICLE_TIER_THRESHOLD && (
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
        <span
          key={`sk-streak-announce-${announceSeq}`}
          className={cn(
            'sk-streak-announce-text sr-only',
            animated && 'sk-streak-announce',
          )}
          data-tier={announceStage.tier}
          data-testid="streak-announce"
          aria-live="polite"
        >
          {announceStage.name}
        </span>
      </div>
    </div>
  );
}
