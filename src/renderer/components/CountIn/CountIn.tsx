import { CSSProperties } from 'react';
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
      className="drumroll-count-in"
      data-animated={animated}
      data-testid="count-in"
      aria-live="assertive"
      aria-label={`Count in ${count} of ${beatCount}`}
      style={style}
    >
      <div className="drumroll-count-in__surface">
        <p>Listen. Play after {beatCount}.</p>
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
        <div className="drumroll-count-in__progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
