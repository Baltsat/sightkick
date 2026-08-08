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

  return (
    <div className="grid grid-cols-3 gap-2" data-testid="achievement-grid">
      {achievements.map((achievement) => (
        <AchievementBadge key={achievement.id} achievement={achievement} />
      ))}
    </div>
  );
}
