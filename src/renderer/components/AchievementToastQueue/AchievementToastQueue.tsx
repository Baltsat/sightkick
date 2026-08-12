import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrophy } from '@fortawesome/free-solid-svg-icons';
import { AchievementDef } from '../../services/achievements';
import { cn } from '../../cn';

interface Props {
  /** Newly-unlocked achievements for the run that just ended. A new array
   * identity (even an equal-length one) resets the queue to its first
   * item — the caller is expected to pass a fresh array per run. */
  queue: AchievementDef[];
  /** Auto-advance delay in ms; 0 disables auto-advance (dismiss-only). */
  autoAdvanceMs?: number;
  className?: string;
}

const DEFAULT_AUTO_ADVANCE_MS = 4200;

/**
 * One badge at a time, calm — never a wall of every unlock at once (the
 * brief's explicit "queue, one at a time, calm"). Mounted inside
 * ScoreSummary, alongside the rest of the run-end summary.
 */
export function AchievementToastQueue({
  queue,
  autoAdvanceMs = DEFAULT_AUTO_ADVANCE_MS,
  className,
}: Props) {
  const [index, setIndex] = useState(0);
  // A fresh unlock list (a new run ending) always restarts at the front,
  // regardless of where a previous list's queue had gotten to. Reset
  // during render (React's documented pattern for "state that depends on
  // a prop change") rather than in an effect, which would cause an extra
  // render pass.
  const [trackedQueue, setTrackedQueue] = useState(queue);

  if (queue !== trackedQueue) {
    setTrackedQueue(queue);
    setIndex(0);
  }

  const current = queue[index];

  useEffect(() => {
    if (!current || autoAdvanceMs <= 0) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setIndex((i) => i + 1);
    }, autoAdvanceMs);

    return () => clearTimeout(timeout);
  }, [current, autoAdvanceMs]);

  if (!current) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-accent-soft-border bg-accent-soft-bg p-3',
        className,
      )}
      data-testid="achievement-toast"
      data-remaining={queue.length - index}
      role="status"
      aria-live="polite"
    >
      <FontAwesomeIcon
        icon={faTrophy}
        size="lg"
        style={{ color: 'var(--color-yellow)' }}
      />
      <div className="min-w-0 grow">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
          Achievement unlocked
        </div>
        <div className="font-display text-base font-semibold text-text-body">
          {current.title}
        </div>
        <div className="text-xs text-text-faint">{current.description}</div>
      </div>
      <button
        type="button"
        data-testid="achievement-toast-dismiss"
        aria-label="Dismiss"
        onClick={() => setIndex((i) => i + 1)}
        className="shrink-0 rounded-full px-2 py-1 text-xs text-text-faint hover:bg-fill hover:text-text-body"
      >
        Nice!
      </button>
    </div>
  );
}
