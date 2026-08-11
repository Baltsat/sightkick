import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Song } from '../../../types';
import {
  aggregateLaneAccuracy,
  computeLongitudinalProgress,
  LaneAccuracy,
  LongitudinalProgress,
  PracticeRunArchiveBySong,
  RunSummary,
} from '../../services/practice-stats';
import {
  addDays,
  computeCurrentStreak,
  computeLongestStreak,
  computeStreak,
  localDateKey,
  PracticeDays,
  recentActivity,
  StreakInfo,
} from '../../services/streaks';
import { computeRunXp } from '../../services/xp';
import {
  computeRecentLaneSignals,
  RecentLaneSignal,
} from '../../services/mastery';
import {
  ACHIEVEMENTS,
  AchievementDef,
  AchievementRun,
  computeAchievements,
  totalStarsAcrossLibrary,
} from '../../services/achievements';
import { pickNudge } from '../../services/achievements/nudge';
import { usePersisted } from '../usePersisted';
import { loadSeenAchievements, saveSeenAchievements } from './seenAchievements';
import {
  DEFAULT_GOAL_OPTION,
  GOAL_XP_BY_OPTION,
  GoalOption,
  RecordRunInput,
  RecordRunResult,
} from './types';

export type { GoalOption, RecordRunInput, RecordRunResult } from './types';

export { GOAL_OPTIONS, GOAL_XP_BY_OPTION } from './types';

export interface AchievementViewModel extends AchievementDef {
  unlocked: boolean;
}

export interface UseGamificationResult {
  isLoaded: boolean;
  days: PracticeDays;
  streak: StreakInfo;
  todayXp: number;
  goalXp: number;
  goalOption: GoalOption;
  setGoalOption: (option: GoalOption) => void;
  goalCrossedToday: boolean;
  weekActivity: boolean[];
  totalStars: number;
  /** undefined until `loadAchievements()` (or a `recordRun()` reply) has
   * populated the run-history cache achievements are derived from. */
  achievements: AchievementViewModel[] | undefined;
  /** Same run-history cache, aggregated per lane across every stored run -
   * undefined on the same "not loaded yet" schedule as `achievements`. */
  laneAccuracy: LaneAccuracy[] | undefined;
  /** Home's explicitly-windowed signal: 28 days of scored lane outcomes,
   * exponentially weighted with a seven-day half-life. */
  recentLaneSignals: RecentLaneSignal[] | undefined;
  /** The newest stored run with its owning song. This keeps Home and Coach
   * attached to real evidence instead of guessing from score-card progress. */
  latestRun: { songId: string; summary: RunSummary } | undefined;
  /** Versioned summaries grouped by their stable song/lesson id. The
   * recommendation layer consumes this evidence without reaching into IPC. */
  runsBySong?: Readonly<Record<string, RunSummary[]>>;
  /** Bounded monthly plus all-history evidence. Archived (evicted) summaries
   * and recent verbatim summaries are each counted exactly once. */
  longitudinalProgress?: LongitudinalProgress;
  loadAchievements: () => void;
  recordRun: (
    input: RecordRunInput,
    onResult?: (result: RecordRunResult) => void,
  ) => void;
}

interface LoadDaysReply {
  days: PracticeDays;
}

interface RecordDayReply {
  days: PracticeDays;
  wasFirstRunOfDay: boolean;
}

interface LoadRunsReply {
  runs: RunSummary[];
  runsBySong?: Record<string, RunSummary[]>;
  archiveBySong?: PracticeRunArchiveBySong;
}

function isErrorReply(reply: object): reply is { error: string } {
  return 'error' in reply;
}

function cleanRecoveryCount(run: RunSummary): number {
  return [
    ...Object.values(run.learningEvidence?.bars ?? {}),
    ...Object.values(run.learningEvidence?.skills ?? {}),
  ].reduce((count, evidence) => count + (evidence.recoveryCleanCount ?? 0), 0);
}

function toAchievementRun(run: RunSummary, songId?: string): AchievementRun {
  return {
    overallAccuracy: run.overallAccuracy,
    laneAccuracy: run.laneAccuracy,
    mode: run.mode,
    songId,
    completedAt: run.completedAt,
    difficulty: run.difficulty,
    playbackSpeed: run.playbackSpeed,
    timingMeanMs: run.timingBias.meanMs,
    timingSampleCount: run.timingBias.sampleCount,
    retainedSkillCount:
      run.atomicSkillEvidence?.filter(
        ({ evidence_kind }) => evidence_kind === 'retention',
      ).length ?? 0,
    cleanRecoveryCount: cleanRecoveryCount(run),
    scoredAttempts: run.totalHits + run.totalMisses,
  };
}

function achievementRunsFor(
  runs: RunSummary[],
  runsBySong: Record<string, RunSummary[]> | undefined,
): AchievementRun[] {
  if (!runsBySong) {
    return runs.map((run) => toAchievementRun(run));
  }

  return Object.entries(runsBySong).flatMap(([songId, summaries]) =>
    summaries.map((summary) => toAchievementRun(summary, songId)),
  );
}

/**
 * Owns the whole gamification surface's state: daily-streak rollups, XP
 * vs. today's goal, and (lazily) the achievement badge list. One instance
 * of this hook is mounted in the library header (SongListView) and
 * another inside the currently-open song (SongView) — both stay in sync
 * off the same `record-practice-day` broadcast, the same way
 * `useSongList`'s `update-song` listener keeps multiple mounted consumers
 * consistent without a shared context provider.
 */
export function useGamification(
  songList: Song[],
  activeGoalSongId?: string,
): UseGamificationResult {
  const [days, setDays] = useState<PracticeDays>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [runsCache, setRunsCache] = useState<RunSummary[]>();
  const [runsBySongCache, setRunsBySongCache] =
    useState<Record<string, RunSummary[]>>();
  const [archiveBySongCache, setArchiveBySongCache] =
    useState<PracticeRunArchiveBySong>();
  const [goalOption, setGoalOption] = usePersisted<GoalOption>(
    'settings.dailyGoalOption',
    DEFAULT_GOAL_OPTION,
  );
  const loadDaysOffRef = useRef<(() => void) | undefined>(undefined);
  const loadRunsOffRef = useRef<(() => void) | undefined>(undefined);
  const recordDayOffRef = useRef<(() => void) | undefined>(undefined);
  const recordRunsOffRef = useRef<(() => void) | undefined>(undefined);
  const daysRef = useRef(days);
  const goalXp = GOAL_XP_BY_OPTION[goalOption];
  const goalXpRef = useRef(goalXp);

  // Refs mirroring state are only ever read from inside the recordRun
  // callback (an event handler, not render) - written here via effects
  // rather than directly in the render body, matching the
  // playbackSpeedRef pattern in SongView.tsx.
  useEffect(() => {
    daysRef.current = days;
  }, [days]);
  useEffect(() => {
    goalXpRef.current = goalXp;
  }, [goalXp]);

  // Initial load, once per mount.
  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('load-practice-days');
    loadDaysOffRef.current = window.electron.ipcRenderer.once<
      LoadDaysReply | { error: string }
    >('load-practice-days', (reply) => {
      loadDaysOffRef.current = undefined;

      if (!isErrorReply(reply)) {
        setDays(reply.days);
      }

      setIsLoaded(true);
    });

    return () => loadDaysOffRef.current?.();
  }, []);

  // Stays live-updated whenever *any* mounted instance (this one or the
  // other one, header vs. song view) records a run - see the doc comment
  // above.
  useEffect(() => {
    return window.electron.ipcRenderer.on<RecordDayReply | { error: string }>(
      'record-practice-day',
      (reply) => {
        if (!isErrorReply(reply)) {
          setDays(reply.days);
        }
      },
    );
  }, []);

  useEffect(() => {
    return () => {
      loadRunsOffRef.current?.();
      recordDayOffRef.current?.();
      recordRunsOffRef.current?.();
    };
  }, []);

  const loadAchievements = useCallback(() => {
    loadRunsOffRef.current?.();
    window.electron.ipcRenderer.sendMessage('load-all-practice-runs');
    loadRunsOffRef.current = window.electron.ipcRenderer.once<
      LoadRunsReply | { error: string }
    >('load-all-practice-runs', (reply) => {
      loadRunsOffRef.current = undefined;

      if (!isErrorReply(reply)) {
        setRunsCache(reply.runs);
        setRunsBySongCache(reply.runsBySong);
        setArchiveBySongCache(reply.archiveBySong ?? {});
      }
    });
  }, []);
  const today = new Date();
  const todayKey = localDateKey(today);
  const streak = computeStreak(days, today);
  const todayXp = days[todayKey]?.xp ?? 0;
  const goalCrossedToday = todayXp >= goalXp;
  const weekActivity = recentActivity(days, today);
  const totalStars = useMemo(
    () => totalStarsAcrossLibrary(songList),
    [songList],
  );
  const achievements = useMemo<AchievementViewModel[] | undefined>(() => {
    if (!runsCache) {
      return undefined;
    }

    const achievementRuns = achievementRunsFor(runsCache, runsBySongCache);
    const results = computeAchievements({
      runs: achievementRuns,
      songList,
      longestStreak: streak.longest,
      activeGoalSongId,
    });

    return results.map((result) => ({
      ...ACHIEVEMENTS.find((def) => def.id === result.id)!,
      unlocked: result.unlocked,
    }));
  }, [activeGoalSongId, runsBySongCache, runsCache, songList, streak.longest]);
  const laneAccuracy = useMemo<LaneAccuracy[] | undefined>(() => {
    if (!runsCache) {
      return undefined;
    }

    return aggregateLaneAccuracy(runsCache);
  }, [runsCache]);
  const recentLaneSignals = useMemo<RecentLaneSignal[] | undefined>(() => {
    if (!runsCache) {
      return undefined;
    }

    return computeRecentLaneSignals(runsCache, new Date().getTime());
  }, [runsCache]);
  const latestRun = useMemo(() => {
    if (!runsBySongCache) {
      return undefined;
    }

    return Object.entries(runsBySongCache)
      .flatMap(([songId, runs]) => runs.map((summary) => ({ songId, summary })))
      .sort(
        (a, b) =>
          Date.parse(b.summary.completedAt) - Date.parse(a.summary.completedAt),
      )[0];
  }, [runsBySongCache]);
  const longitudinalProgress = useMemo<LongitudinalProgress | undefined>(() => {
    if (!runsCache || !archiveBySongCache) {
      return undefined;
    }

    const recentRunsBySong =
      runsBySongCache ?? (runsCache.length > 0 ? { unknown: runsCache } : {});

    return computeLongitudinalProgress(archiveBySongCache, recentRunsBySong);
  }, [archiveBySongCache, runsBySongCache, runsCache]);
  const recordRun = useCallback(
    (input: RecordRunInput, onResult?: (result: RecordRunResult) => void) => {
      const now = new Date();
      const dateKey = localDateKey(now);
      const isFirstRunOfDay = (daysRef.current[dateKey]?.runs ?? 0) === 0;
      const prevTodayXp = daysRef.current[dateKey]?.xp ?? 0;
      const xp = computeRunXp({
        totalHits: input.totalHits,
        overallAccuracy: input.overallAccuracy,
        difficulty: input.difficulty,
        isFirstRunOfDay,
      });

      recordDayOffRef.current?.();
      recordDayOffRef.current = window.electron.ipcRenderer.once<
        RecordDayReply | { error: string }
      >('record-practice-day', (reply) => {
        recordDayOffRef.current = undefined;

        if (isErrorReply(reply)) {
          return;
        }

        const newDays = reply.days;

        setDays(newDays);

        const newTodayXp = newDays[dateKey]?.xp ?? 0;
        const goalCrossed =
          prevTodayXp < goalXpRef.current && newTodayXp >= goalXpRef.current;
        const currentStreak = computeCurrentStreak(newDays, now);
        const longestStreak = computeLongestStreak(newDays);

        recordRunsOffRef.current?.();
        window.electron.ipcRenderer.sendMessage('load-all-practice-runs');
        recordRunsOffRef.current = window.electron.ipcRenderer.once<
          LoadRunsReply | { error: string }
        >('load-all-practice-runs', (runsReply) => {
          recordRunsOffRef.current = undefined;

          const runs = isErrorReply(runsReply) ? [] : runsReply.runs;
          const runsBySong = isErrorReply(runsReply)
            ? undefined
            : runsReply.runsBySong;
          const archiveBySong = isErrorReply(runsReply)
            ? undefined
            : runsReply.archiveBySong || {};

          setRunsCache(runs);
          setRunsBySongCache(runsBySong);
          setArchiveBySongCache(archiveBySong);

          const achievementRuns = achievementRunsFor(runs, runsBySong);
          const results = computeAchievements({
            runs: achievementRuns,
            songList,
            longestStreak,
            activeGoalSongId,
          });
          const seen = loadSeenAchievements();
          const unlockedIds = results
            .filter((result) => result.unlocked)
            .map((result) => result.id);
          const newlyUnlocked = unlockedIds
            .filter((id) => !seen.has(id))
            .map((id) => ACHIEVEMENTS.find((def) => def.id === id)!)
            .filter((achievement) => !achievement.quietArchive)
            .sort((left, right) => left.proofRank - right.proofRank);

          saveSeenAchievements(new Set([...seen, ...unlockedIds]));

          const nudge = pickNudge({
            runs: achievementRuns,
            songList,
            currentStreak,
            longestStreak,
          });

          onResult?.({
            xpEarned: xp,
            goalCrossed,
            streakCurrent: currentStreak,
            newlyUnlocked,
            nudge,
          });
        });
      });

      window.electron.ipcRenderer.sendMessage('record-practice-day', {
        date: dateKey,
        xp,
        stars: input.starsEarned,
        minutes: input.minutes,
      });
    },
    [activeGoalSongId, songList],
  );

  return {
    isLoaded,
    days,
    streak,
    todayXp,
    goalXp,
    goalOption,
    setGoalOption,
    goalCrossedToday,
    weekActivity,
    totalStars,
    achievements,
    laneAccuracy,
    recentLaneSignals,
    latestRun,
    runsBySong: runsBySongCache,
    longitudinalProgress,
    loadAchievements,
    recordRun,
  };
}

// Re-exported for convenience so header/stats-panel components can build a
// "last 7 calendar dates" label strip without importing services/streaks
// directly.
export function last7Dates(today: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
}
