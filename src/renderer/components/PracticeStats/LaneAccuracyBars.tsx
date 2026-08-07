import { KIT_ELEMENTS } from '../../constants';
import { LaneAccuracy } from '../../services/practice-stats';

interface Props {
  laneAccuracy: LaneAccuracy[];
}

export function LaneAccuracyBars({ laneAccuracy }: Props) {
  return (
    <div className="flex flex-col gap-2" data-testid="lane-accuracy-bars">
      {[...KIT_ELEMENTS.values()].map((element) => {
        const lane = laneAccuracy.find(
          (entry) => entry.element === element.value,
        );
        const attempts = lane ? lane.hits + lane.misses : 0;
        const percent = lane ? Math.round(lane.accuracy * 100) : 0;

        return (
          <div
            key={element.value}
            className="flex items-center gap-3 text-sm"
            data-testid={`lane-row-${element.value}`}
          >
            <div className="w-16 shrink-0 text-text-muted">
              {element.displayName}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-fill">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${percent}%`,
                  background: attempts > 0 ? element.color : 'transparent',
                }}
              />
            </div>
            <div className="w-24 shrink-0 text-right tabular-nums text-text-faint">
              {attempts === 0 ? 'No hits yet' : `${percent}% (${attempts})`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
