import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faTrophy } from '@fortawesome/free-solid-svg-icons';
import { cn } from '../../cn';
import { AchievementViewModel } from '../../hooks/useGamification';

interface Props {
  achievement: AchievementViewModel;
}

export function AchievementBadge({ achievement }: Props) {
  const { title, description, hint, unlocked } = achievement;

  return (
    <div
      data-testid={`achievement-${achievement.id}`}
      data-unlocked={unlocked}
      title={unlocked ? description : hint}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors',
        unlocked
          ? 'border-accent-soft-border bg-accent-soft-bg'
          : 'border-border-soft bg-fill opacity-60',
      )}
    >
      <FontAwesomeIcon
        icon={unlocked ? faTrophy : faLock}
        size="lg"
        style={{
          color: unlocked ? 'var(--color-yellow)' : 'var(--color-text-faint)',
        }}
      />
      <div className="text-xs font-semibold text-text-body">{title}</div>
      <div className="text-[11px] leading-tight text-text-faint">
        {unlocked ? description : hint}
      </div>
    </div>
  );
}
