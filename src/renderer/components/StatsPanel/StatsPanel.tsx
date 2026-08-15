import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFire, faStar } from '@fortawesome/free-solid-svg-icons';
import { StreakInfo } from '../../services/streaks';
import { LaneAccuracy } from '../../services/practice-stats';
import { AchievementViewModel } from '../../hooks/useGamification';
import { LaneAccuracyBars } from '../PracticeStats/LaneAccuracyBars';
import { WeeklyXpChart, WeeklyXpPoint } from './WeeklyXpChart';
import { AchievementGrid } from './AchievementGrid';
import type { PracticeRhythm } from '../../services/pedagogy';
import { KitActionChip } from '../GamificationHeaderStrip/KitActionChip';

export interface StatsPanelProps {
  streak: StreakInfo;
  weeklyXp: WeeklyXpPoint[];
  goalXp: number;
  totalStars: number;
  laneAccuracy: LaneAccuracy[];
  achievements: AchievementViewModel[] | undefined;
  practiceRhythm?: PracticeRhythm;
  kitConnected?: boolean;
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
      className="flex flex-1 flex-col items-center gap-2 border-l-2 border-border-soft px-4 py-3"
      data-testid={testId}
    >
      <FontAwesomeIcon icon={icon} style={{ color: iconColor }} />
      <div className="font-display text-4xl font-semibold tabular-nums text-text">
        {value}
      </div>
      <div className="text-base text-text-muted">{label}</div>
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
  practiceRhythm,
  kitConnected = false,
}: StatsPanelProps) {
  return (
    <div className="flex flex-col gap-8" data-testid="stats-panel">
      {kitConnected && (
        <div className="flex items-center justify-end gap-2 text-base text-text-muted">
          <span>Close stats</span>
          <KitActionChip action="end" />
        </div>
      )}
      <div className="flex gap-2">
        <StatTile
          testId="stat-current-streak"
          label="Practice streak"
          value={streak.current}
          icon={faFire}
          iconColor="var(--color-orange)"
        />
        <StatTile
          testId="stat-longest-streak"
          label="Longest practice streak"
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

      {streak.current === 0 && streak.longest > 0 && (
        <p
          className="border-l-2 border-border-soft px-4 py-3 text-base leading-relaxed text-text-muted"
          data-testid="streak-reentry"
        >
          New set, same progress. Your saved practice, stars, and goal path stay
          with you.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-2xl font-semibold text-text">
          Today&apos;s set · daily XP
        </h3>
        <p
          className="text-base leading-relaxed text-text-muted"
          data-testid="today-set-definition"
        >
          This is today&apos;s effort target. A practice streak counts
          consecutive qualifying saved practice days.
        </p>
        <WeeklyXpChart
          points={weeklyXp}
          goalXp={goalXp}
          rhythm={practiceRhythm}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="font-display text-2xl font-semibold text-text">
          Accuracy per drum, all-time
        </h3>
        {laneAccuracy.length > 0 ? (
          <LaneAccuracyBars laneAccuracy={laneAccuracy} />
        ) : (
          <div
            className="border-l-2 border-border-soft p-4 text-center text-base text-text-muted"
            data-testid="lane-accuracy-empty"
          >
            Play a few runs to see your per-drum accuracy.
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="font-display text-2xl font-semibold text-text">
          Achievements
        </h3>
        <AchievementGrid achievements={achievements} />
      </section>
    </div>
  );
}
