import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFire } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import { circleCircumference, ringDashOffset, ringProgress } from './ringMath';

interface Props {
  streakDays: number;
  todayXp: number;
  goalXp: number;
  /** True only on the run that just pushed today over goal - drives a
   * one-shot celebration pulse (a CSS animation, so it's automatically
   * neutralized by the app's global `prefers-reduced-motion` rule in
   * base.css). */
  justCrossedGoal?: boolean;
  size?: number;
}

const STROKE_WIDTH = 4;

export function StreakFlame({
  streakDays,
  todayXp,
  goalXp,
  justCrossedGoal = false,
  size = 56,
}: Props) {
  const radius = size / 2 - STROKE_WIDTH;
  const circumference = circleCircumference(radius);
  const progress = ringProgress(todayXp, goalXp);
  const dashOffset = ringDashOffset(progress, circumference);
  const isActive = streakDays > 0;

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        justCrossedGoal && 'sk-goal-celebrate',
      )}
      style={{ width: size, height: size }}
      data-testid="streak-flame"
      data-active={isActive}
      data-goal-crossed={progress >= 1}
      role="img"
      aria-label={
        isActive
          ? `${streakDays}-day practice streak. Today's set: ${todayXp} of ${goalXp} XP.`
          : `No active practice streak. Today's set: ${todayXp} of ${goalXp} XP.`
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-fill-strong)"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progress >= 1 ? 'var(--color-green)' : 'var(--color-accent)'}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          data-testid="streak-ring-progress"
          style={{ transition: 'stroke-dashoffset 0.4s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <FontAwesomeIcon
          icon={faFire}
          className={cn(isActive ? 'text-orange' : 'text-text-faint')}
          style={{
            color: isActive ? 'var(--color-orange)' : undefined,
          }}
        />
        <span
          className="mt-0.5 text-xs font-semibold tabular-nums text-text"
          data-testid="streak-count"
        >
          {streakDays}
        </span>
      </div>
    </div>
  );
}
