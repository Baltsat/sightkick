import { KIT_ELEMENTS } from '../../constants';
import { DominantLaneProgress } from './useMastery';

export interface XpSkillLineProps {
  weekXp: number;
  dominantLaneProgress: DominantLaneProgress | undefined;
}

/**
 * The line that makes effort and skill visibly connect: "this week: +840
 * XP, kick accuracy 71→78%". `weekXp` is pure grinding evidence; the
 * lane delta is proof that grinding actually moved a number the goal
 * cares about (the goal song's own most-demanded lane, cross-song).
 */
export function XpSkillLine({
  weekXp,
  dominantLaneProgress,
}: XpSkillLineProps) {
  const laneName = dominantLaneProgress
    ? KIT_ELEMENTS.get(dominantLaneProgress.element)?.displayName ??
      dominantLaneProgress.element
    : undefined;
  const beforePercent = dominantLaneProgress
    ? Math.round(dominantLaneProgress.before * 100)
    : undefined;
  const afterPercent = dominantLaneProgress
    ? Math.round(dominantLaneProgress.after * 100)
    : undefined;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted"
      data-testid="xp-skill-line"
    >
      <span className="font-semibold text-text">This week:</span>
      <span
        className="tabular-nums text-accent-text"
        data-testid="xp-skill-line-xp"
      >
        +{weekXp} XP
      </span>
      {dominantLaneProgress && (
        <>
          <span>·</span>
          <span data-testid="xp-skill-line-lane">
            {laneName} accuracy{' '}
            <span className="tabular-nums text-text">
              {beforePercent}%→{afterPercent}%
            </span>
          </span>
        </>
      )}
    </div>
  );
}
