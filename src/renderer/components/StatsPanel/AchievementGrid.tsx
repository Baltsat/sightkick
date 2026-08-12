import { Spin } from 'antd';
import { AchievementViewModel } from '../../hooks/useGamification';
import { AchievementBadge } from './AchievementBadge';

interface Props {
  achievements: AchievementViewModel[] | undefined;
}

export function AchievementGrid({ achievements }: Props) {
  if (!achievements) {
    return (
      <div
        className="flex justify-center py-6"
        data-testid="achievement-grid-loading"
      >
        <Spin />
      </div>
    );
  }

  const ranked = [...achievements].sort(
    (left, right) => left.proofRank - right.proofRank,
  );
  const primary = ranked.filter((achievement) => !achievement.quietArchive);
  const archive = ranked.filter((achievement) => achievement.quietArchive);

  return (
    <div className="flex flex-col gap-3" data-testid="achievement-grid">
      <div className="grid grid-cols-3 gap-2">
        {primary.map((achievement) => (
          <AchievementBadge key={achievement.id} achievement={achievement} />
        ))}
      </div>
      {archive.length > 0 && (
        <details data-testid="achievement-archive">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-text-faint">
            Archive records
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {archive.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
