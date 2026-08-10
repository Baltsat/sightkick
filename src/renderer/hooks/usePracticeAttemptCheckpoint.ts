import { useCallback, useEffect, useRef } from 'react';
import type { Difficulty } from 'scan-chart';
import type { HitRecord } from '../services/practice-stats';
import type { GameMode } from '../types';

/** A short interval limits loss to a few seconds without churning the store on every MIDI hit. */
export const PRACTICE_ATTEMPT_CHECKPOINT_INTERVAL_MS = 4_000;

export interface PracticeAttemptCheckpointSeed {
  songId: string;
  sessionId: string;
  startedAt: string;
  chartRevision: string;
  mode: GameMode;
  difficulty: Difficulty;
  playbackSpeed: number;
  /** Returns the current authored chart tick at persistence time. */
  positionTick: () => number;
}

export interface PracticeAttemptEvidenceSource {
  /** Append-only snapshot, including passes superseded by a seek/rewind. */
  getAttemptRecords: () => HitRecord[];
}

type CheckpointChannel =
  | 'save-practice-attempt-checkpoint'
  | 'finalize-practice-attempt-checkpoint';

export interface PracticeAttemptCheckpointControllerOptions {
  readSeed: () => PracticeAttemptCheckpointSeed | undefined;
  evidence: PracticeAttemptEvidenceSource;
  /** Dependency injection makes the reliability boundary testable. */
  send?: (channel: CheckpointChannel, payload: unknown) => void;
  now?: () => Date;
  intervalMs?: number;
  lifecycleTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  visibilityTarget?: Pick<Document, 'addEventListener' | 'removeEventListener'>;
}

export interface PracticeAttemptCheckpointController {
  start: () => void;
  flush: () => boolean;
  /**
   * Persist the final in-progress snapshot, then stop without deleting it.
   * The atomic completed-run save owns deletion after durable success.
   */
  prepareForCompletion: () => boolean;
  /** Call only after `save-practice-run` has acknowledged durable completion. */
  finalize: () => boolean;
  /** Flushes before teardown, preserving interrupted evidence. */
  dispose: () => void;
}

function defaultSend(channel: CheckpointChannel, payload: unknown): void {
  window.electron.ipcRenderer.sendMessage(channel, payload);
}

/**
 * Lifecycle owner for incomplete run evidence.
 *
 * The controller has deliberately narrow semantics: it persists observed
 * records as `in-progress`, it never calculates a score, and it only clears
 * the draft on an explicit post-completion finalization call. This makes an
 * unexpected close recoverable without fabricating a completed performance.
 */
export function createPracticeAttemptCheckpointController(
  options: PracticeAttemptCheckpointControllerOptions,
): PracticeAttemptCheckpointController {
  const send = options.send ?? defaultSend;
  const now = options.now ?? (() => new Date());
  const intervalMs =
    options.intervalMs ?? PRACTICE_ATTEMPT_CHECKPOINT_INTERVAL_MS;
  const lifecycleTarget =
    options.lifecycleTarget ??
    (typeof window === 'undefined' ? undefined : window);
  const visibilityTarget =
    options.visibilityTarget ??
    (typeof document === 'undefined' ? undefined : document);
  let timer: ReturnType<typeof setInterval> | undefined;
  let started = false;
  let finalized = false;
  const flush = (): boolean => {
    if (finalized) {
      return false;
    }

    const seed = options.readSeed();

    if (!seed) {
      return false;
    }

    send('save-practice-attempt-checkpoint', {
      checkpoint: {
        songId: seed.songId,
        sessionId: seed.sessionId,
        startedAt: seed.startedAt,
        updatedAt: now().toISOString(),
        chartRevision: seed.chartRevision,
        mode: seed.mode,
        difficulty: seed.difficulty,
        playbackSpeed: seed.playbackSpeed,
        positionTick: seed.positionTick(),
        records: options.evidence.getAttemptRecords(),
      },
    });

    return true;
  };
  const flushForLifecycle = () => {
    flush();
  };
  const start = (): void => {
    if (started || finalized) {
      return;
    }

    started = true;
    flush();
    timer = setInterval(flush, intervalMs);
    lifecycleTarget?.addEventListener('pagehide', flushForLifecycle);
    lifecycleTarget?.addEventListener('beforeunload', flushForLifecycle);
    visibilityTarget?.addEventListener('visibilitychange', flushForLifecycle);
  };
  const stop = (): void => {
    if (!started) {
      return;
    }

    started = false;

    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }

    lifecycleTarget?.removeEventListener('pagehide', flushForLifecycle);
    lifecycleTarget?.removeEventListener('beforeunload', flushForLifecycle);
    visibilityTarget?.removeEventListener(
      'visibilitychange',
      flushForLifecycle,
    );
  };

  return {
    start,
    flush,
    prepareForCompletion: () => {
      if (finalized) {
        return false;
      }

      const flushed = flush();

      finalized = true;
      stop();

      return flushed;
    },
    finalize: () => {
      if (finalized) {
        return false;
      }

      const seed = options.readSeed();

      if (!seed) {
        return false;
      }

      finalized = true;
      stop();
      send('finalize-practice-attempt-checkpoint', {
        songId: seed.songId,
        sessionId: seed.sessionId,
      });

      return true;
    },
    dispose: () => {
      if (!finalized) {
        flush();
      }

      stop();
    },
  };
}

export interface UsePracticeAttemptCheckpointOptions
  extends PracticeAttemptCheckpointControllerOptions {
  enabled: boolean;
}

/**
 * React bridge for SongView. `readSeed` keeps the controller pointed at the
 * newest identity, transport position, and speed without needing to recreate
 * its lifecycle listeners on every scored hit.
 */
export function usePracticeAttemptCheckpoint(
  options: UsePracticeAttemptCheckpointOptions,
): {
  prepareForCompletion: () => boolean;
  finalize: () => boolean;
  flush: () => boolean;
} {
  const controllerRef = useRef<PracticeAttemptCheckpointController | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!options.enabled) {
      controllerRef.current?.dispose();
      controllerRef.current = undefined;

      return undefined;
    }

    const controller = createPracticeAttemptCheckpointController(options);

    controllerRef.current = controller;
    controller.start();

    return () => {
      controller.dispose();

      if (controllerRef.current === controller) {
        controllerRef.current = undefined;
      }
    };
  }, [options]);

  const finalize = useCallback(
    () => controllerRef.current?.finalize() ?? false,
    [],
  );
  const prepareForCompletion = useCallback(
    () => controllerRef.current?.prepareForCompletion() ?? false,
    [],
  );
  const flush = useCallback(() => controllerRef.current?.flush() ?? false, []);

  return { prepareForCompletion, finalize, flush };
}
