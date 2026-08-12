const SIZE = 116;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColor(mastery: number): string {
  if (mastery >= 90) {
    return 'var(--color-green)';
  }

  if (mastery >= 50) {
    return 'var(--color-accent)';
  }

  return 'var(--color-yellow)';
}

export interface MasteryRingProps {
  /** 0..100 */
  mastery: number;
}

/** A circular progress ring reading the overall mastery percentage —
 * the Profile goal card's headline number. Color shifts warm-to-green as
 * mastery climbs, matching the app's warm-dark palette (amber while
 * building, accent through the mid-range, green once it reads as "there"). */
export function MasteryRing({ mastery }: MasteryRingProps) {
  const clamped = Math.min(Math.max(mastery, 0), 100);
  const dashOffset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      data-testid="mastery-ring"
      role="img"
      aria-label={`Mastery ${Math.round(clamped)} percent`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-fill)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={ringColor(clamped)}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{
            transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease',
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-3xl font-semibold tabular-nums text-text">
          {Math.round(clamped)}%
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-faint">
          mastery
        </span>
      </div>
    </div>
  );
}
