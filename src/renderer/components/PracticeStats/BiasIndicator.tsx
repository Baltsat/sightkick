import { KIT_ELEMENTS } from '../../constants';
import { LaneBias, TimingBiasStats } from '../../services/practice-stats';

interface Props {
  timingBias: TimingBiasStats;
  laneBias: LaneBias[];
}

type Direction = 'early' | 'late' | 'on time';

function directionOf(meanMs: number): Direction {
  if (meanMs < 0) {
    return 'early';
  }

  if (meanMs > 0) {
    return 'late';
  }

  return 'on time';
}

function worstOffender(laneBias: LaneBias[]): LaneBias | undefined {
  return laneBias.reduce<LaneBias | undefined>((worst, lane) => {
    if (!worst || Math.abs(lane.meanMs) > Math.abs(worst.meanMs)) {
      return lane;
    }

    return worst;
  }, undefined);
}

export function BiasIndicator({ timingBias, laneBias }: Props) {
  if (timingBias.sampleCount === 0) {
    return (
      <div
        className="text-base text-text-muted"
        data-testid="bias-indicator-empty"
      >
        Not enough timing data yet.
      </div>
    );
  }

  const direction = directionOf(timingBias.meanMs);

  if (direction === 'on time') {
    return (
      <div className="text-base text-text-body" data-testid="bias-indicator">
        Your timing is dead on average.
      </div>
    );
  }

  const magnitude = Math.round(Math.abs(timingBias.meanMs));
  const worst = worstOffender(laneBias);
  const worstName =
    worst && laneBias.length > 1 && Math.round(Math.abs(worst.meanMs)) > 0
      ? KIT_ELEMENTS.get(worst.element)?.displayName
      : undefined;

  return (
    <div className="text-base text-text-body" data-testid="bias-indicator">
      {`You hit ${magnitude} ms ${direction} on average${
        worstName ? ` — especially ${worstName}` : ''
      }.`}
    </div>
  );
}
