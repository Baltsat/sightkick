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
  const { streak, announceSeq, announceStage, returnSeq, returnBest } = ui;

  // The meter represents a live streak, not run history. Once the current
  // streak is broken, the best value remains available in Results; keeping a
  // 0/best pill over the score is both distracting and visually collides with
  // the location HUD at exactly the moment the player needs to recover.
  if (streak.count <= 0 && !returnBest) {
    return null;
  }

  if (streak.count <= 0) {
    return (
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center',
          className,
        )}
        data-testid="streak-meter"
      >
        <div
          key={`sk-streak-return-${returnSeq}`}
          className="sk-streak-return"
          data-testid="streak-return"
          aria-live="polite"
        >
          Back to the phrase · best {returnBest} clean hit
          {returnBest === 1 ? '' : 's'}
        </div>
      </div>
    );
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
      <div className="relative">
        <div
          key={`sk-streak-vfx-${announceSeq}`}
          className={cn(
            'sk-streak-meter',
            animated && 'sk-streak-pulse',
            animated && announceSeq > 0 && 'sk-streak-tier-up',
          )}
          data-tier={tier}
          data-testid="streak-meter-pill"
        >
          <span className="sk-streak-energy" aria-hidden="true" />
          {streak.stage && (
            <strong className="sk-streak-title" data-testid="streak-stage-name">
              {streak.stage.name}
            </strong>
          )}
          <span key={streak.count} className="sk-streak-proof">
            Phrase tier · <b data-testid="streak-count">{streak.count}</b>
            {' clean hits'}
          </span>
          {streak.best > streak.count && (
            <span className="sk-streak-best" data-testid="streak-best">
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
        )}
      </div>
    </div>
  );
}
