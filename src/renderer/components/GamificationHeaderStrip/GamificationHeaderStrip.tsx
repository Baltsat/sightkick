import { useState } from 'react';
import { StreakInfo } from '../../services/streaks';
import { GoalOption } from '../../hooks/useGamification';
import { cn } from '../../cn';
import type { PracticeRhythm } from '../../services/pedagogy';
import { StreakFlame } from './StreakFlame';
import { GoalPopover } from './GoalPopover';
import { KitActionChip } from './KitActionChip';

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
  kitConnected?: boolean;
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
  kitConnected = false,
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
        'flex shrink-0 items-center gap-2 border-l border-border-soft pl-3',
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenStats}
        data-testid="gamification-header-strip"
        data-loaded="true"
        aria-label="Open your practice stats"
        className="flex min-h-12 min-w-0 items-center gap-3 rounded p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <StreakFlame
          streakDays={streak.current}
          todayXp={todayXp}
          goalXp={goalXp}
          justCrossedGoal={justCrossedGoal}
          size={44}
        />
        <div className="min-w-0">
          <span
            className="whitespace-nowrap text-base font-semibold tabular-nums text-text"
            data-testid="today-xp-label"
          >
            Today’s set · {todayXp} / {goalXp} XP
          </span>
        </div>
        {kitConnected && <KitActionChip action="open-coach" compact />}
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
