import { AchievementId } from '../../services/achievements';

/**
 * The "lightweight cache" the brief asks for: which achievement ids the
 * player has already been shown an unlock toast for. Lives in
 * localStorage (like every other simple per-user preference in this app -
 * see `usePersisted`), not the main-process store — achievements
 * themselves are always recomputed fresh from real data, this cache only
 * decides whether an unlock is "new" enough to interrupt the player with
 * a toast.
 */

const SEEN_KEY = 'gamification.seenAchievements.v2';

export function loadSeenAchievements(): Set<AchievementId> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);

    return new Set(raw ? (JSON.parse(raw) as AchievementId[]) : []);
  } catch {
    return new Set();
  }
}

export function saveSeenAchievements(ids: Set<AchievementId>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // Best-effort - a lost cache just means an already-earned badge might
    // toast again once, which is harmless.
  }
}
