import { useCallback, useState } from 'react';

/**
 * Learner-owned tempo, "and the next session": once he has ever explicitly
 * set a speed for a given song (the speed control or the faster/slower
 * shortcut), it is his from then on - a fresh recommendation must never
 * silently override it on a later launch. `null` means "he has never
 * touched it for this song," the only case a recommendation may pre-fill.
 *
 * This is deliberately NOT `usePersisted`. A caller like SongView is
 * mounted on a route `id` param, and React Router does not remount it when
 * the same player navigates song A -> song B without visiting a parent
 * route in between (several practice-launch paths do exactly that).
 * `usePersisted`'s `useState` initializer only runs once per mount, so a
 * plain `usePersisted` keyed by `songId` would carry song A's speed in
 * memory across the transition, and its own `[key, value]` effect would
 * then write that stale value under song B's key - silently marking a song
 * the player never touched as "his" and permanently blocking its own
 * recommendations. The `storageKey !== songKey` check below is the same
 * render-time self-correction `useKitInactivityRecovery` and
 * `useRemediationSession` already use for the identical "dynamic storage
 * key, no remount" shape.
 */
export function songLearnerSpeedKey(
  songId: string | undefined,
): string | undefined {
  return songId ? `song.${songId}.learnerPlaybackSpeed` : undefined;
}

function load(key: string | undefined): number | null {
  if (!key) {
    return null;
  }

  try {
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    return typeof parsed === 'number' && Number.isFinite(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function useLearnerPlaybackSpeed(
  songId: string | undefined,
): [number | null, (speed: number) => void] {
  const storageKey = songLearnerSpeedKey(songId);
  const [state, setState] = useState<{
    storageKey: string | undefined;
    value: number | null;
  }>(() => ({ storageKey, value: load(storageKey) }));

  if (state.storageKey !== storageKey) {
    setState({ storageKey, value: load(storageKey) });
  }

  const value = state.storageKey === storageKey ? state.value : null;
  const setValue = useCallback(
    (speed: number) => {
      if (!storageKey) {
        return;
      }

      localStorage.setItem(storageKey, JSON.stringify(speed));
      setState({ storageKey, value: speed });
    },
    [storageKey],
  );

  return [value, setValue];
}
