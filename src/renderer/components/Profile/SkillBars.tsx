import { LaneAccuracy } from '../../services/practice-stats';
import { LaneAccuracyBars } from '../PracticeStats/LaneAccuracyBars';

export interface SkillBarsProps {
  laneAccuracy: LaneAccuracy[];
}

/** Per-drum accuracy over the last 30 days, across every song — reuses
 * `PracticeStats/LaneAccuracyBars` (the same bars already shown in the
 * all-time Stats panel) rather than a second bespoke bar chart, scoped
 * here to a rolling 30-day window instead of all-time. */
export function SkillBars({ laneAccuracy }: SkillBarsProps) {
  if (laneAccuracy.length === 0) {
    return (
      <div
        className="rounded-xl bg-fill p-4 text-center text-sm text-text-faint"
        data-testid="skill-bars-empty"
      >
        No runs in the last 30 days yet.
      </div>
    );
  }

  return <LaneAccuracyBars laneAccuracy={laneAccuracy} />;
}
