import { cn } from '../../cn';

interface Props {
  /** Oldest-first, today last - see `services/streaks/recentActivity`. */
  activity: boolean[];
  className?: string;
}

const DAY_LABELS = [
  '6 days ago',
  '5 days ago',
  '4 days ago',
  '3 days ago',
  '2 days ago',
  'Yesterday',
  'Today',
];

export function WeekDots({ activity, className }: Props) {
  return (
    <div
      className={cn('flex items-center gap-1', className)}
      data-testid="week-dots"
      role="img"
      aria-label={`${activity.filter(Boolean).length} of the last ${
        activity.length
      } days practiced`}
    >
      {activity.map((practiced, index) => {
        const isToday = index === activity.length - 1;
        const label =
          DAY_LABELS[index] ?? `${activity.length - 1 - index} days ago`;

        return (
          <span
            key={index}
            title={`${label}${practiced ? ' - practiced' : ''}`}
            data-testid={`week-dot-${index}`}
            data-practiced={practiced}
            className={cn(
              'size-1.5 rounded-full',
              practiced ? 'bg-accent' : 'bg-fill-strong',
              isToday &&
                'outline outline-1 outline-offset-1 outline-text-faint',
            )}
            style={{
              background: practiced ? 'var(--color-accent)' : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
