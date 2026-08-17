import { useCallback, useState } from 'react';

export function songAutoSpeedKey(
  songId: string | undefined,
): string | undefined {
  return songId ? `song.${songId}.autoPracticeSpeed` : undefined;
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

export function useAutoPracticeSpeed(
  songId: string | undefined,
): [number | null, (speed: number) => void] {
  const storageKey = songAutoSpeedKey(songId);
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
