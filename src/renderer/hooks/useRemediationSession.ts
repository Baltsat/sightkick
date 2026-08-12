import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Measure, ParsedChart } from '../../chart-parser/types';
import { Engine, ResolvedJudgement } from '../services/engine';
import {
  RemediationQueue,
  deserializeRemediationQueue,
  getActiveRemediationTask,
  recordRemediationPass,
  serializeRemediationQueue,
} from '../services/remediation';

interface PersistedRemediationState {
  storageKey?: string;
  queue: RemediationQueue | null;
}

interface PassCounters {
  ids: Set<string>;
  resolvedNotes: number;
  misses: number;
  wrongHits: number;
}

interface UseRemediationSessionParams {
  engine?: Engine;
  chart: ParsedChart | null;
  measures: Measure[];
  isLooping: boolean;
  storageKey?: string;
}

function emptyCounters(): PassCounters {
  return {
    ids: new Set(),
    resolvedNotes: 0,
    misses: 0,
    wrongHits: 0,
  };
}

/**
 * Owns durable Coach-loop evidence without making the transport or Judge
 * remediation-aware. A pass closes only on Transport's explicit natural-loop
 * event. Every administrative seek clears the in-flight counters, so manual
 * scrubs and inactivity rewinds can neither fabricate nor splice a pass.
 */
export function useRemediationSession({
  engine,
  chart,
  measures,
  isLooping,
  storageKey,
}: UseRemediationSessionParams) {
  const [persisted, setPersisted] = useState<PersistedRemediationState>(() => ({
    storageKey,
    queue: storageKey
      ? deserializeRemediationQueue(localStorage.getItem(storageKey))
      : null,
  }));

  if (persisted.storageKey !== storageKey) {
    setPersisted({
      storageKey,
      queue: storageKey
        ? deserializeRemediationQueue(localStorage.getItem(storageKey))
        : null,
    });
  }

  const queue = persisted.storageKey === storageKey ? persisted.queue : null;
  const activeTask = useMemo(
    () => (queue ? getActiveRemediationTask(queue) : null),
    [queue],
  );

  useEffect(() => {
    if (!persisted.storageKey || !persisted.queue) {
      return;
    }

    localStorage.setItem(
      persisted.storageKey,
      serializeRemediationQueue(persisted.queue),
    );
  }, [persisted]);

  const begin = useCallback(
    (nextQueue: RemediationQueue) => {
      if (!storageKey) {
        return;
      }

      localStorage.setItem(storageKey, serializeRemediationQueue(nextQueue));
      setPersisted({ storageKey, queue: nextQueue });
    },
    [storageKey],
  );
  const clear = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }

    setPersisted({ storageKey, queue: null });
  }, [storageKey]);
  const countersRef = useRef<PassCounters>(emptyCounters());

  useEffect(() => {
    countersRef.current = emptyCounters();

    if (!engine || !chart || !activeTask || !isLooping) {
      return undefined;
    }

    const startMeasure = measures[activeTask.barStart - 1];
    const endMeasure = measures[activeTask.barEnd - 1];

    if (!startMeasure || !endMeasure) {
      return undefined;
    }

    const inTask = (judgement: ResolvedJudgement) =>
      judgement.measureIndex !== undefined &&
      judgement.measureIndex >= activeTask.barStart - 1 &&
      judgement.measureIndex <= activeTask.barEnd - 1;
    const offJudgement = engine.onJudgement((judgement) => {
      if (
        !inTask(judgement) ||
        (judgement.verdict !== 'wrong' && !judgement.scoreable) ||
        countersRef.current.ids.has(judgement.id)
      ) {
        return;
      }

      countersRef.current.ids.add(judgement.id);

      if (judgement.verdict === 'wrong') {
        countersRef.current.wrongHits += 1;

        return;
      }

      countersRef.current.resolvedNotes += 1;

      if (judgement.verdict === 'miss') {
        countersRef.current.misses += 1;
      }
    });
    const offLoopRestart = engine.onLoopRestart(() => {
      const pass = countersRef.current;

      countersRef.current = emptyCounters();
      setPersisted((current) => {
        if (
          current.storageKey !== storageKey ||
          !current.queue ||
          current.queue.status !== 'active'
        ) {
          return current;
        }

        return {
          ...current,
          queue: recordRemediationPass(current.queue, {
            completedAt: new Date().toISOString(),
            resolvedNotes: pass.resolvedNotes,
            misses: pass.misses,
            wrongHits: pass.wrongHits,
          }),
        };
      });
    });
    const offReset = engine.onReset(() => {
      countersRef.current = emptyCounters();
    });

    return () => {
      offJudgement();
      offLoopRestart();
      offReset();
    };
  }, [activeTask, chart, engine, isLooping, measures, storageKey]);

  return {
    queue,
    activeTask,
    begin,
    clear,
  };
}
