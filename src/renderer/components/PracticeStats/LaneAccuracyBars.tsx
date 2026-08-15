import { KIT_ELEMENTS } from '../../constants';
import { LaneAccuracy } from '../../services/practice-stats';

interface Props {
  laneAccuracy: LaneAccuracy[];
}

export function LaneAccuracyBars({ laneAccuracy }: Props) {
  const measured = [...KIT_ELEMENTS.values()]
    .map((element) => ({
      element,
      lane: laneAccuracy.find((entry) => entry.element === element.value),
    }))
    .filter(({ lane }) => lane && lane.hits + lane.misses > 0);
  const sampleCount = measured.reduce(
    (total, { lane }) => total + (lane?.hits ?? 0) + (lane?.misses ?? 0),
    0,
  );

  if (measured.length === 0) {
    return (
      <p
        className="text-base text-text-muted"
        data-testid="lane-accuracy-empty"
      >
        No matched notes by pad in this evidence window.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="lane-accuracy-bars">
      {measured.map(({ element, lane }) => {
        const percent = Math.round((lane?.accuracy ?? 0) * 100);

        return (
          <div
            key={element.value}
            className="grid gap-2"
            data-testid={`lane-row-${element.value}`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <strong className="text-lg font-semibold text-text-body">
                {element.displayName}
              </strong>
              <span className="font-display text-2xl font-semibold tabular-nums text-text">
                {percent}%
              </span>
            </div>
            <div
              className="h-4 overflow-hidden rounded-full bg-fill"
              role="meter"
              aria-label={`${element.displayName} accuracy`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${percent}%`,
                  background: element.color,
                }}
              />
            </div>
          </div>
        );
      })}
      <p
        className="m-0 text-sm leading-relaxed text-text-muted"
        data-testid="lane-accuracy-evidence"
      >
        Based on {sampleCount} matched note{sampleCount === 1 ? '' : 's'} in
        this evidence window.
      </p>
    </div>
  );
}
