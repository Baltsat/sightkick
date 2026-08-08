import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFire, faStar } from '@fortawesome/free-solid-svg-icons';
import { StreakInfo } from '../../services/streaks';
import { LaneAccuracy } from '../../services/practice-stats';
import { AchievementViewModel } from '../../hooks/useGamification';
import { LaneAccuracyBars } from '../PracticeStats/LaneAccuracyBars';
import { WeeklyXpChart, WeeklyXpPoint } from './WeeklyXpChart';
import { AchievementGrid } from './AchievementGrid';

export interface StatsPanelProps {
  streak: StreakInfo;
  weeklyXp: WeeklyXpPoint[];
  goalXp: number;
  totalStars: number;
  laneAccuracy: LaneAccuracy[];
  achievements: AchievementViewModel[] | undefined;
}

function StatTile({
  label,
  value,
  icon,
  iconColor,
  testId,
}: {
  label: string;
  value: string | number;
  icon: typeof faFire;
  iconColor: string;
  testId: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-fill p-3"
      data-testid={testId}
    >
      <FontAwesomeIcon icon={icon} style={{ color: iconColor }} />
      <div className="font-display text-xl font-semibold tabular-nums text-text">
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-[0.1em] text-text-faint">
        {label}
      </div>
    </div>
  );
}

export function StatsPanel({
  streak,
  weeklyXp,
  goalXp,
  totalStars,
  laneAccuracy,
  achievements,
}: StatsPanelProps) {
  return (
    <div className="flex flex-col gap-6" data-testid="stats-panel">
      <div className="flex gap-2">
        <StatTile
          testId="stat-current-streak"
          label="Day streak"
          value={streak.current}
          icon={faFire}
          iconColor="var(--color-orange)"
        />
        <StatTile
          testId="stat-longest-streak"
          label="Best streak"
          value={streak.longest}
          icon={faFire}
          iconColor="var(--color-text-faint)"
        />
        <StatTile
          testId="stat-total-stars"
          label="Total stars"
          value={totalStars}
          icon={faStar}
          iconColor="var(--color-yellow)"
        />
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          This week&apos;s XP
        </h3>
        <WeeklyXpChart points={weeklyXp} goalXp={goalXp} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Accuracy per drum, all-time
        </h3>
        {laneAccuracy.length > 0 ? (
          <LaneAccuracyBars laneAccuracy={laneAccuracy} />
        ) : (
          <div
            className="rounded-xl bg-fill p-4 text-center text-sm text-text-faint"
            data-testid="lane-accuracy-empty"
          >
            Play a few runs to see your per-drum accuracy.
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Achievements
        </h3>
        <AchievementGrid achievements={achievements} />
      </section>
    </div>
  );
}
