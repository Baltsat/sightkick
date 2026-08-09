import { useEffect, useRef, useState } from 'react';
import { Song } from '../../../types';
import {
  aggregateLaneAccuracy,
  RunSummary,
} from '../../services/practice-stats';
import {
  computeLaneWeights,
  computeMastery,
  MasteryBreakdown,
  MasteryGoal,
  masteryTimeline,
  MasteryTimelinePoint,
  MasteryTrendProjection,
  needleMoverLine,
  projectMasteryTrend,
  scopeRunsToDifficulty,
} from '../../services/mastery';
import { KitElement, LaneAccuracy } from '../../services/practice-stats/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface DominantLaneProgress {
  element: KitElement;
  /** Global (cross-song) accuracy for this lane, as of 7 days ago vs now —
   * "kick accuracy 71→78%" reads directly off `before`/`after`. */
  before: number;
  after: number;
}

export interface UseMasteryResult {
  isLoaded: boolean;
  song: Song | undefined;
  breakdown: MasteryBreakdown | undefined;
  timeline: MasteryTimelinePoint[];
  trend: MasteryTrendProjection | undefined;
  needleLine: string | undefined;
  /** The goal song's single most lane-demanding drum, with the player's
   * global accuracy on it a week ago vs now — the concrete "effort ↔
   * skill" pairing the Profile's XP line shows next to this week's XP. */
  dominantLaneProgress: DominantLaneProgress | undefined;
  /** Per-drum accuracy aggregated over every run in the last 30 days,
   * across the whole library — independent of any goal, so it's populated
   * even before a goal exists. Feeds the Profile's skill-bars section. */
  last30DaysLaneAccuracy: LaneAccuracy[];
}

interface RunsReply {
  songId: string;
  runs: RunSummary[];
}

interface AllRunsReply {
  runs: RunSummary[];
}

function isErrorReply(reply: object): reply is { error: string } {
  return 'error' in reply;
}

function findDominantLaneProgress(
  scopedSongRuns: RunSummary[],
  allRuns: RunSummary[],
  now: number,
): DominantLaneProgress | undefined {
  const laneWeights = computeLaneWeights(scopedSongRuns);

  if (laneWeights.length === 0) {
    return undefined;
  }

  const dominant = laneWeights.reduce((best, lane) =>
    lane.weight > best.weight ? lane : best,
  );
  const weekAgo = now - WEEK_MS;
  const pastRuns = allRuns.filter(
    (run) => new Date(run.completedAt).getTime() < weekAgo,
  );
  const lookup = (accuracies: LaneAccuracy[]): number =>
    accuracies.find((lane) => lane.element === dominant.element)?.accuracy ?? 0;

  return {
    element: dominant.element,
    before: lookup(aggregateLaneAccuracy(pastRuns)),
    after: lookup(aggregateLaneAccuracy(allRuns)),
  };
}

/**
 * Loads the run history a mastery goal needs (the goal song's own runs, and
 * every run library-wide for the sub-readiness term) and derives the whole
 * Profile mastery surface from it: the current breakdown, the convergence
 * timeline for the graph, the trend projection, the "what moves the needle
 * next" line, and the one dominant-lane XP↔skill pairing.
 *
 * Reads run history exclusively through the pre-existing
 * `load-practice-runs` / `load-all-practice-runs` IPC channels — the same
 * ones `SongView` and `useGamification` already use — never touching
 * `practiceStats.ts` itself.
 */
export function useMastery(
  goal: MasteryGoal | undefined,
  song: Song | undefined,
): UseMasteryResult {
  const [songRuns, setSongRuns] = useState<RunSummary[]>([]);
  const [allRuns, setAllRuns] = useState<RunSummary[]>([]);
  // Tracks *which* songId's runs are currently in `songRuns`, rather than a
  // plain boolean flag reset synchronously inside the effect — resetting a
  // "loaded" boolean to false in the effect body (before the round trip
  // resolves) is exactly the setState-in-effect pattern this codebase's
  // lint config forbids (see `react-hooks/set-state-in-effect`). Deriving
  // "loaded" by comparing against the current goal's songId gets the same
  // behavior — stale while a new song's runs are in flight — without ever
  // calling setState outside a reply/event callback.
  const [loadedSongId, setLoadedSongId] = useState<string | undefined>(
    undefined,
  );
  const [allRunsLoaded, setAllRunsLoaded] = useState(false);
  const songRunsOffRef = useRef<(() => void) | undefined>(undefined);
  const allRunsOffRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!goal) {
      return undefined;
    }

    songRunsOffRef.current?.();
    window.electron.ipcRenderer.sendMessage('load-practice-runs', goal.songId);
    songRunsOffRef.current = window.electron.ipcRenderer.once<
      RunsReply | { error: string }
    >('load-practice-runs', (reply) => {
      songRunsOffRef.current = undefined;

      if (!isErrorReply(reply)) {
        setSongRuns(reply.runs);
      }

      setLoadedSongId(goal.songId);
    });

    return () => songRunsOffRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch keyed on songId alone, not the whole goal object identity.
  }, [goal?.songId]);

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('load-all-practice-runs');
    allRunsOffRef.current = window.electron.ipcRenderer.once<
      AllRunsReply | { error: string }
    >('load-all-practice-runs', (reply) => {
      allRunsOffRef.current = undefined;

      if (!isErrorReply(reply)) {
        setAllRuns(reply.runs);
      }

      setAllRunsLoaded(true);
    });

    return () => allRunsOffRef.current?.();
  }, []);

  const isLoaded = loadedSongId === goal?.songId && allRunsLoaded;
  // `new Date()` (not the bare `Date.now`/`Math.random` style impure calls
  // this codebase's `react-hooks/purity` lint rule flags) — same idiom
  // `useGamification` already uses for "now" in its render body.
  const thirtyDaysAgo = new Date().getTime() - THIRTY_DAYS_MS;
  const last30DaysLaneAccuracy = aggregateLaneAccuracy(
    allRuns.filter(
      (run) => new Date(run.completedAt).getTime() >= thirtyDaysAgo,
    ),
  );

  if (!goal || !isLoaded) {
    return {
      isLoaded,
      song,
      breakdown: undefined,
      timeline: [],
      trend: undefined,
      needleLine: undefined,
      dominantLaneProgress: undefined,
      last30DaysLaneAccuracy,
    };
  }

  const songDifficulties = song?.drumDifficulties;
  const chartTotalNotes = song?.scoreData?.[goal.difficulty]?.totalNotes;
  const breakdown = computeMastery({
    goal,
    songRuns,
    allRuns,
    songDifficulties,
    chartTotalNotes,
    nowMs: new Date().getTime(),
  });
  const timeline = masteryTimeline({
    goal,
    songRuns,
    allRuns,
    songDifficulties,
    chartTotalNotes,
  });
  const trend = projectMasteryTrend(timeline, goal.targetDate);
  const scopedSongRuns = scopeRunsToDifficulty(
    songRuns,
    goal.difficulty,
    songDifficulties,
  );

  return {
    isLoaded,
    song,
    breakdown,
    timeline,
    trend,
    needleLine: needleMoverLine(breakdown),
    dominantLaneProgress: findDominantLaneProgress(
      scopedSongRuns,
      allRuns,
      thirtyDaysAgo + THIRTY_DAYS_MS,
    ),
    last30DaysLaneAccuracy,
  };
}
