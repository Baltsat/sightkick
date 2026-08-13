import { CSSProperties } from 'react';
import '../PracticeEdgeCaption/PracticeEdgeCaption.css';
import './CountIn.css';

interface CountInProps {
  count: number | undefined;
  total?: number | undefined;
  beatMs: number | undefined;
  animated?: boolean;
}

export function CountIn({
  count,
  total,
  beatMs,
  animated = true,
}: CountInProps) {
  if (count === undefined || count <= 0) {
    return undefined;
  }

  const beatCount = Math.max(count, total ?? 4);
  const style = {
    '--count-in-beat-duration': `${Math.max(180, beatMs ?? 800)}ms`,
    '--count-in-columns': Math.min(beatCount, 4),
    '--count-in-progress': count / beatCount,
  } as CSSProperties;

  return (
    <div
      className="drumroll-practice-edge-caption drumroll-count-in"
      data-animated={animated}
      data-tone="count"
      data-testid="count-in"
      data-edge-caption="count-in"
      aria-live="assertive"
      aria-label={`Count in ${count} of ${beatCount}`}
      style={style}
    >
      <p className="drumroll-count-in__label">Count in</p>
      <ol className="drumroll-count-in__beats" aria-hidden="true">
        {Array.from({ length: beatCount }, (_, index) => {
          const beat = index + 1;

          return (
            <li
              key={beat}
              className="drumroll-count-in__beat"
              data-state={
                beat === count ? 'active' : beat < count ? 'passed' : 'next'
              }
            >
              <span key={beat === count ? `${beat}-${count}` : beat}>
                {beat}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
