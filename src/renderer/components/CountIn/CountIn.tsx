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
    '--count-in-columns': beatCount,
    '--count-in-progress': count / beatCount,
  } as CSSProperties;

  return (
    <div
      className="drumroll-count-in"
      data-animated={animated}
      data-edge-caption="count-in"
      data-testid="count-in"
      data-fullscreen-moment="count-in"
      data-total={beatCount}
      aria-live="assertive"
      aria-label={`Count in ${count} of ${beatCount}`}
      style={style}
    >
      <span
        key={count}
        className="drumroll-count-in__current"
        data-count={count}
        aria-hidden="true"
      />
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
              <span>{beat}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
