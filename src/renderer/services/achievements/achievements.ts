import { Song } from '../../../types';
import { ALL_DIFFICULTIES } from '../../../constants';
import { GameMode } from '../../types';
import { KIT_ELEMENTS } from '../../constants';
import { LaneAccuracy } from '../practice-stats';
import { calculateAccuracy, getStarRating } from '../../scoring';

export type AchievementId =
  | 'first-blood'
  | 'perfect-10'
  | 'week-one'
  | 'century'
  | 'full-kit'
  | 'season-finale'
  | 'night-owl'
  | 'early-bird'
  | 'speed-demon';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  hint: string;
  evidenceEvent: string;
  proofRank: number;
  quietArchive?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-blood',
    title: 'Retained skill',
    description: 'A delayed skill check held after the first pass.',
    hint: 'Save a retained skill check after its first acquisition.',
    evidenceEvent: 'saved retention evidence',
    proofRank: 1,
  },
  {
    id: 'perfect-10',
    title: 'Timing settled',
    description: 'Timing bias improved across comparable saved runs.',
    hint: 'Repeat the same song, pace, and setup to compare timing.',
    evidenceEvent: 'comparable timing-bias improvement',
    proofRank: 2,
  },
  {
    id: 'early-bird',
    title: 'Clean recovery',
    description: 'A targeted recovery loop ended cleanly.',
    hint: 'Finish a saved Tutor recovery on its focused bar.',
    evidenceEvent: 'saved clean recovery',
    proofRank: 3,
  },
  {
    id: 'night-owl',
    title: 'Goal-song safety pass',
    description: 'A qualifying pass was saved on the active goal song.',
    hint: 'Save a complete, qualifying pass on your current goal song.',
    evidenceEvent: 'qualifying saved goal-song pass',
    proofRank: 4,
  },
  {
    id: 'speed-demon',
    title: 'Song personal best',
    description: 'A later comparable song pass exceeded your saved best.',
    hint: 'Beat a saved result on the same song, pace, and difficulty.',
    evidenceEvent: 'comparable saved song personal best',
    proofRank: 5,
  },
  {
    id: 'full-kit',
    title: 'Full-kit balance',
    description: 'Every drum lane held 80% or better in one saved run.',
    hint: 'Keep kick, snare, cymbals, and toms above 80% together.',
    evidenceEvent: 'all-lane accuracy in one saved run',
    proofRank: 6,
  },
  {
    id: 'season-finale',
    title: 'Method unit complete',
    description: 'Every lesson in one Method unit met the clear evidence gate.',
    hint: 'Clear each lesson in one Method unit at 90%+ accuracy.',
    evidenceEvent: 'lesson-unit completion evidence',
    proofRank: 7,
  },
  {
    id: 'week-one',
    title: 'Practice rhythm',
    description: 'Seven consecutive qualifying practice days are saved.',
    hint: 'Keep a qualifying practice rhythm for seven days.',
    evidenceEvent: 'seven-day saved practice streak',
    proofRank: 8,
  },
  {
    id: 'century',
    title: '100 stars archived',
    description: 'Your library has 100 earned performance stars.',
    hint: 'Keep collecting verified performance stars.',
    evidenceEvent: '100 library performance stars',
    proofRank: 99,
    quietArchive: true,
  },
];

export interface AchievementRun {
  overallAccuracy: number;
  laneAccuracy: LaneAccuracy[];
  mode?: GameMode;
  songId?: string;
  completedAt?: string;
  difficulty?: string;
  playbackSpeed?: number;
  timingMeanMs?: number;
  timingSampleCount?: number;
  retainedSkillCount?: number;
  cleanRecoveryCount?: number;
  scoredAttempts?: number;
}

export interface AchievementsInput {
  runs: AchievementRun[];
  songList: Song[];
  longestStreak: number;
  activeGoalSongId?: string;
}

export interface AchievementResult {
  id: AchievementId;
  unlocked: boolean;
}

const CENTURY_STARS = 100;
const WEEK_ONE_STREAK = 7;
const MIN_TIMING_SAMPLES = 10;
const MIN_TIMING_IMPROVEMENT_MS = 8;
const MIN_PERSONAL_BEST_GAIN = 0.03;
const GOAL_SAFETY_ACCURACY = 0.82;
const GOAL_SAFETY_ATTEMPTS = 12;
const LESSON_CLEAR_ACCURACY = 0.9;

export function bestStarsForSong(song: Song): number {
  if (!song.scoreData) {
    return 0;
  }

  return ALL_DIFFICULTIES.reduce((best, difficulty) => {
    const data = song.scoreData?.[difficulty];

    return data ? Math.max(best, getStarRating(data)) : best;
  }, 0);
}

function bestAccuracyForSong(song: Song): number {
  if (!song.scoreData) {
    return 0;
  }

  return ALL_DIFFICULTIES.reduce((best, difficulty) => {
    const data = song.scoreData?.[difficulty];

    return data ? Math.max(best, calculateAccuracy(data)) : best;
  }, 0);
}

export function totalStarsAcrossLibrary(songList: Song[]): number {
  return songList.reduce((sum, song) => sum + bestStarsForSong(song), 0);
}

function comparableKey(run: AchievementRun): string | undefined {
  if (!run.songId || !run.completedAt || !run.difficulty) {
    return undefined;
  }

  return [
    run.songId,
    run.mode ?? 'unknown',
    run.difficulty,
    (run.playbackSpeed ?? 1).toFixed(3),
  ].join(':');
}

function comparableGroups(runs: AchievementRun[]): AchievementRun[][] {
  const groups = new Map<string, AchievementRun[]>();

  for (const run of runs) {
    const key = comparableKey(run);

    if (key) {
      groups.set(key, [...(groups.get(key) ?? []), run]);
    }
  }

  return [...groups.values()].map((group) =>
    [...group].sort((left, right) =>
      left.completedAt!.localeCompare(right.completedAt!),
    ),
  );
}

function hasRetainedSkill(runs: AchievementRun[]): boolean {
  return runs.some((run) => (run.retainedSkillCount ?? 0) > 0);
}

function hasTimingSettled(runs: AchievementRun[]): boolean {
  return comparableGroups(runs).some((group) =>
    group.some((run, index) => {
      const previous = group[index - 1];

      return (
        previous !== undefined &&
        (run.timingSampleCount ?? 0) >= MIN_TIMING_SAMPLES &&
        (previous.timingSampleCount ?? 0) >= MIN_TIMING_SAMPLES &&
        Number.isFinite(previous.timingMeanMs) &&
        Number.isFinite(run.timingMeanMs) &&
        Math.abs(previous.timingMeanMs!) - Math.abs(run.timingMeanMs!) >=
          MIN_TIMING_IMPROVEMENT_MS
      );
    }),
  );
}

function hasCleanRecovery(runs: AchievementRun[]): boolean {
  return runs.some((run) => (run.cleanRecoveryCount ?? 0) > 0);
}

function hasGoalSafetyPass(
  runs: AchievementRun[],
  activeGoalSongId: string | undefined,
): boolean {
  return Boolean(
    activeGoalSongId &&
      runs.some(
        (run) =>
          run.songId === activeGoalSongId &&
          (run.scoredAttempts ?? 0) >= GOAL_SAFETY_ATTEMPTS &&
          run.overallAccuracy >= GOAL_SAFETY_ACCURACY,
      ),
  );
}

function hasSongPersonalBest(runs: AchievementRun[]): boolean {
  return comparableGroups(runs).some((group) =>
    group.some((run, index) => {
      const earlier = group.slice(0, index);

      return (
        earlier.length > 0 &&
        run.overallAccuracy >=
          Math.max(...earlier.map(({ overallAccuracy }) => overallAccuracy)) +
            MIN_PERSONAL_BEST_GAIN
      );
    }),
  );
}

function hasFullKit(runs: AchievementRun[]): boolean {
  const laneCount = KIT_ELEMENTS.size;

  return runs.some(
    (run) =>
      run.laneAccuracy.length === laneCount &&
      run.laneAccuracy.every((lane) => lane.accuracy >= 0.8),
  );
}

function hasMethodUnit(songList: Song[]): boolean {
  const byUnit = new Map<string, Song[]>();

  for (const song of songList) {
    if (!song.lesson) {
      continue;
    }

    byUnit.set(song.lesson.unit, [
      ...(byUnit.get(song.lesson.unit) ?? []),
      song,
    ]);
  }

  return [...byUnit.values()].some(
    (unitSongs) =>
      unitSongs.length > 0 &&
      unitSongs.every(
        (song) => bestAccuracyForSong(song) >= LESSON_CLEAR_ACCURACY,
      ),
  );
}

export function computeAchievements(
  input: AchievementsInput,
): AchievementResult[] {
  const { runs, songList, longestStreak, activeGoalSongId } = input;
  const unlockedById: Record<AchievementId, boolean> = {
    'first-blood': hasRetainedSkill(runs),
    'perfect-10': hasTimingSettled(runs),
    'early-bird': hasCleanRecovery(runs),
    'night-owl': hasGoalSafetyPass(runs, activeGoalSongId),
    'speed-demon': hasSongPersonalBest(runs),
    'full-kit': hasFullKit(runs),
    'season-finale': hasMethodUnit(songList),
    'week-one': longestStreak >= WEEK_ONE_STREAK,
    century: totalStarsAcrossLibrary(songList) >= CENTURY_STARS,
  };

  return ACHIEVEMENTS.map(({ id }) => ({ id, unlocked: unlockedById[id] }));
}
