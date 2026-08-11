import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar } from '@fortawesome/free-solid-svg-icons';
import { StreakInfo } from '../../services/streaks';
import { GoalOption } from '../../hooks/useGamification';
import { cn } from '../../cn';
import type { PracticeRhythm } from '../../services/pedagogy';
import { StreakFlame } from './StreakFlame';
import { WeekDots } from './WeekDots';
import { GoalPopover } from './GoalPopover';

export interface GamificationHeaderStripProps {
  isLoaded: boolean;
  streak: StreakInfo;
  todayXp: number;
  goalXp: number;
  goalOption: GoalOption;
  onChangeGoal: (option: GoalOption) => void;
  weekActivity: boolean[];
  totalStars: number;
  justCrossedGoal?: boolean;
  onOpenStats: () => void;
  practiceRhythm?: PracticeRhythm;
  className?: string;
}

export function GamificationHeaderStrip({
  isLoaded,
  streak,
  todayXp,
  goalXp,
  goalOption,
  onChangeGoal,
  weekActivity,
  totalStars,
  justCrossedGoal = false,
  onOpenStats,
  practiceRhythm,
  className,
}: GamificationHeaderStripProps) {
  const [isGoalPopoverOpen, setIsGoalPopoverOpen] = useState(false);

  if (!isLoaded) {
    return (
      <div
        className={cn(
          'flex h-14 w-64 shrink-0 animate-pulse items-center gap-3 rounded-2xl border border-border-soft bg-surface p-2',
          className,
        )}
        data-testid="gamification-header-strip"
        data-loaded="false"
        aria-hidden="true"
      />
    );
  }

  const practiceStreakLabel =
    streak.current > 0
      ? `Practice streak · ${streak.current} days`
      : streak.longest > 0
      ? 'New set, same progress'
      : 'Practice streak';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-2xl border border-border-soft bg-surface p-1.5 pr-2 transition-colors hover:border-accent-soft-border focus-within:border-accent-soft-border',
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenStats}
        data-testid="gamification-header-strip"
        data-loaded="true"
        aria-label="Open your practice stats"
        className="flex min-w-0 items-center gap-3 rounded-xl p-0.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <StreakFlame
          streakDays={streak.current}
          todayXp={todayXp}
          goalXp={goalXp}
          justCrossedGoal={justCrossedGoal}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className="text-sm font-semibold tabular-nums text-text"
            data-testid="today-xp-label"
          >
            Today’s set · {todayXp} / {goalXp} XP
          </span>
          <div className="flex items-center gap-3">
            <span
              className="text-xs text-text-faint"
              data-testid="practice-streak-label"
            >
              {practiceStreakLabel}
            </span>
            {practiceRhythm && (
              <span
                className="text-xs text-text-faint"
                data-testid="practice-rhythm-label"
              >
                {practiceRhythm} rhythm
              </span>
            )}
            <WeekDots activity={weekActivity} />
            <div
              className="flex items-center gap-1 text-xs text-text-faint"
              data-testid="total-stars"
            >
              <FontAwesomeIcon
                icon={faStar}
                size="xs"
                style={{ color: 'var(--color-yellow)' }}
              />
              <span className="tabular-nums">{totalStars}</span>
            </div>
          </div>
        </div>
      </button>
      <GoalPopover
        goalOption={goalOption}
        onChange={onChangeGoal}
        isOpen={isGoalPopoverOpen}
        onOpenChange={setIsGoalPopoverOpen}
      />
    </div>
  );
}
