import {
  LESSON_MASTERED_STARS,
  LessonEntry,
  LessonProgress,
  LessonUnitGroup,
} from '../../hooks/useLessons';

/** Presentation-only state derived from a season's (unit's) entries. */
export type SeasonState = 'locked' | 'active' | 'completed';

/** Presentation-only state derived from a single exercise node. */
export type NodeState = 'locked' | 'next-up' | 'done' | 'available';

/**
 * A season is locked until its first entry unlocks, completed once every
 * entry in it is mastered, and active otherwise. Derived purely from the
 * existing unlock chain (`entry.unlocked` / `entry.bestStars`) — no new
 * unlock math.
 */
export function seasonState(group: LessonUnitGroup): SeasonState {
  const unlockedCount = group.entries.filter((entry) => entry.unlocked).length;

  if (unlockedCount === 0) {
    return 'locked';
  }

  const masteredCount = group.entries.filter(
    (entry) => entry.bestStars >= LESSON_MASTERED_STARS,
  ).length;

  return masteredCount === group.entries.length ? 'completed' : 'active';
}

/** Stars earned vs. the maximum obtainable (5 per exercise) across a season. */
export function seasonStars(group: LessonUnitGroup): {
  earned: number;
  possible: number;
  masteredCount: number;
} {
  const earned = group.entries.reduce((sum, entry) => sum + entry.bestStars, 0);
  const masteredCount = group.entries.filter(
    (entry) => entry.bestStars >= LESSON_MASTERED_STARS,
  ).length;

  return { earned, possible: group.entries.length * 5, masteredCount };
}

/**
 * Per-node path state. `next-up` is the single furthest unlocked-but-
 * unmastered lesson (the same pointer the existing Continue card uses),
 * `done` is a mastered exercise, `available` is unlocked but neither.
 */
export function nodeState(
  entry: LessonEntry,
  progress: LessonProgress,
): NodeState {
  if (!entry.unlocked) {
    return 'locked';
  }

  if (progress.continueEntry?.song.id === entry.song.id) {
    return 'next-up';
  }

  return entry.bestStars >= LESSON_MASTERED_STARS ? 'done' : 'available';
}

export interface CurrentSeasonInfo {
  group: LessonUnitGroup;
  /** 1-based position of the pointed-at entry within its season. */
  positionInSeason: number;
  seasonSize: number;
  entry: LessonEntry;
}

/**
 * "Where am I" pointer for the header strip: the season and in-season
 * position of the furthest unlocked-unmastered lesson, falling back to the
 * furthest locked lesson once everything unlocked is mastered. Undefined
 * once the whole curriculum is complete.
 */
export function currentSeasonInfo(
  progress: LessonProgress,
): CurrentSeasonInfo | undefined {
  const pointer = progress.continueEntry ?? progress.nextLockedEntry;

  if (!pointer) {
    return undefined;
  }

  const group = progress.groups.find((candidate) =>
    candidate.entries.some((entry) => entry.song.id === pointer.song.id),
  );

  if (!group) {
    return undefined;
  }

  const positionInSeason =
    group.entries.findIndex((entry) => entry.song.id === pointer.song.id) + 1;

  return {
    group,
    positionInSeason,
    seasonSize: group.entries.length,
    entry: pointer,
  };
}

const SNAKE_CENTER = 42;
const SNAKE_AMPLITUDE = 20;

/** Horizontal position (0-100) of the node at `index` along a winding path. */
export function snakeX(index: number): number {
  return SNAKE_CENTER + SNAKE_AMPLITUDE * Math.sin(index * 1.15);
}

/**
 * Node x-positions plus a smooth SVG path `d` string connecting them, all in
 * a `0 0 100 count` viewBox (one row of height 1 per node). Pure/deterministic
 * so tests can assert on it without rendering.
 */
export function buildSnakePath(count: number): { xs: number[]; d: string } {
  const xs = Array.from({ length: count }, (_, index) => snakeX(index));

  if (count === 0) {
    return { xs, d: '' };
  }

  const rowCenterY = (index: number) => index + 0.5;
  let d = `M ${xs[0]} ${rowCenterY(0)}`;

  for (let index = 1; index < count; index += 1) {
    const turnY = index;

    d += ` C ${xs[index - 1]} ${turnY} ${xs[index]} ${turnY} ${
      xs[index]
    } ${rowCenterY(index)}`;
  }

  return { xs, d };
}
