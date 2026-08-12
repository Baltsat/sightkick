import { useState } from 'react';
import { StreakInfo } from '../../services/streaks';
import { GoalOption } from '../../hooks/useGamification';
import { cn } from '../../cn';
import type { PracticeRhythm } from '../../services/pedagogy';
import { StreakFlame } from './StreakFlame';
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
  justCrossedGoal = false,
  onOpenStats,
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

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-xl border border-border-soft bg-surface p-1 pr-1.5 transition-colors hover:border-accent-soft-border focus-within:border-accent-soft-border',
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenStats}
        data-testid="gamification-header-strip"
        data-loaded="true"
        aria-label="Open your practice stats"
        className="flex min-w-0 items-center gap-2 rounded-lg p-0.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <StreakFlame
          streakDays={streak.current}
          todayXp={todayXp}
          goalXp={goalXp}
          justCrossedGoal={justCrossedGoal}
          size={36}
        />
        <div className="min-w-0">
          <span
            className="whitespace-nowrap text-sm font-semibold tabular-nums text-text"
            data-testid="today-xp-label"
          >
            Today’s set · {todayXp} / {goalXp} XP
          </span>
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
