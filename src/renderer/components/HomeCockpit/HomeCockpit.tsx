import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Song } from '../../../types';
import { useInput } from '../../context/InputContext';
import { inputBus } from '../../input';
import type { UseGamificationResult } from '../../hooks/useGamification';
import { computeStreak, localDateKey } from '../../services/streaks';
import {
  composeHomeSession,
  DeadlinePacingSummary,
  HomeSessionReceipt,
  OneKickHomeSession,
  PracticeCandidate,
  PracticeWaveResult,
  RankedPracticeCandidate,
} from '../../services/next-practice';
import type {
  AtomicSkillState,
  PracticeCardOption,
  SessionEnergy,
  SkillReview,
  SongGoal,
  ZpdRankedCandidate,
} from '../../services/pedagogy/types';
import { composePracticeCards } from '../../services/pedagogy';
import { KitElement } from '../../services/practice-stats';
import { useKitColorMaturity } from '../../services/kit-color-maturity';
import { EvidencePracticeCards } from '../PracticeCards';
import { playKitPreview } from '../../services/kit-preview-audio';
import homeKitStudio from '../../assets/daybreak/home-kit-studio.png';
import drumstickCursor from '../../assets/daybreak/drumstick-cursor-reversed.png';
import {
  fitKitZone,
  HOME_KIT_DOORS,
  HOME_KIT_ZONE_FILL_OPACITY,
  HOME_KIT_ZONE_LANES,
  HOME_KIT_ZONE_MAP,
  type HomeKitDoor,
} from './kit-zone-map';
import { computeKitTextSafeBands } from './kit-text-safe-bands';
import { resolveLibraryControls } from '../../views/SongListView/library-controls';
import './KitHome.css';

export interface HomeCockpitProps {
  songList: Song[];
  gamification: UseGamificationResult;
  recommendation?: RankedPracticeCandidate;
  practiceRanking?: readonly RankedPracticeCandidate[];
  pedagogyRanking?: readonly ZpdRankedCandidate[];
  practiceWave?: PracticeWaveResult;
  activeGoal?: SongGoal;
  goalPayoffCandidate?: PracticeCandidate;
  goalTargetDate?: string;
  deadlinePacing?: DeadlinePacingSummary;
  atomicStates?: readonly AtomicSkillState[];
  dueReviews?: readonly SkillReview[];
  sessionEnergy?: SessionEnergy;
  recentEarlyExits?: number;
  onStartRecommended: () => void;
  onStartSession?: (session: OneKickHomeSession) => void;
  onStartPracticeCard?: (option: PracticeCardOption) => void;
  onOpenSongs: () => void;
  onOpenJourney?: () => void;
  onFindNewMusic?: () => void;
  onStartSong?: (song: Song) => void;
  onOpenProfile: () => void;
}

interface KitHotspot {
  element: KitElement;
  drumLabel: string;
  door: HomeKitDoor;
}

interface ResolvedKitDoor {
  action: HomeKitDoor;
  label: string;
  detail: string;
  ariaLabel: string;
  song?: Song;
}

const KIT_HOTSPOTS: KitHotspot[] = [
  { element: 'hihat', drumLabel: 'Hi-hat', door: HOME_KIT_DOORS.hihat },
  { element: 'crash', drumLabel: 'Crash', door: HOME_KIT_DOORS.crash },
  { element: 'tom1', drumLabel: 'Tom 1', door: HOME_KIT_DOORS.tom1 },
  { element: 'tom2', drumLabel: 'Tom 2', door: HOME_KIT_DOORS.tom2 },
  { element: 'ride', drumLabel: 'Ride', door: HOME_KIT_DOORS.ride },
  { element: 'snare', drumLabel: 'Snare', door: HOME_KIT_DOORS.snare },
  { element: 'tom3', drumLabel: 'Floor tom', door: HOME_KIT_DOORS.tom3 },
  { element: 'kick', drumLabel: 'Kick', door: HOME_KIT_DOORS.kick },
];

export function rankHomeTopSongs(
  songList: readonly Song[],
  runsBySong: UseGamificationResult['runsBySong'] | undefined,
): Song[] {
  return songList
    .filter((song) => !song.lesson)
    .map((song) => ({ song, playCount: runsBySong?.[song.id]?.length ?? 0 }))
    .filter(({ playCount }) => playCount > 0)
    .sort(
      (left, right) =>
        right.playCount - left.playCount ||
        left.song.id.localeCompare(right.song.id),
    )
    .slice(0, 3)
    .map(({ song }) => song);
}

function lastWorkedSong(
  songList: readonly Song[],
  runsBySong: UseGamificationResult['runsBySong'] | undefined,
): Song | undefined {
  return songList
    .map((song) => ({
      song,
      lastCompletedAt: Math.max(
        Number.NEGATIVE_INFINITY,
        ...(runsBySong?.[song.id] ?? []).map(({ completedAt }) =>
          Number.isFinite(Date.parse(completedAt))
            ? Date.parse(completedAt)
            : Number.NEGATIVE_INFINITY,
        ),
      ),
    }))
    .filter(({ lastCompletedAt }) => Number.isFinite(lastCompletedAt))
    .sort(
      (left, right) =>
        right.lastCompletedAt - left.lastCompletedAt ||
        left.song.id.localeCompare(right.song.id),
    )[0]?.song;
}

/**
 * `useGamification`'s `todayXp`/`streak` are computed once per render of
 * the hook's *owner* (SongListView), from `new Date()` at that instant. If
 * nothing else re-renders that owner near local midnight, the header can
 * keep showing yesterday's numbers after the day has actually rolled over.
 * `days` itself stays live (it is pushed on every `record-practice-day`
 * broadcast), so Home re-derives "today" straight from it on every render
 * instead of trusting a value that can go stale - this is the one honest
 * source close enough to render time to self-correct across midnight.
 * Falls back to the hook's own numbers when `days` isn't supplied (e.g.
 * lightweight test doubles), so behaviour is unchanged wherever `days` is
 * unavailable.
 */
export function liveDailyProgress(gamification: UseGamificationResult): {
  todayXp: number;
  streakCurrent: number;
} {
  const { days } = gamification;

  if (!days) {
    return {
      todayXp: gamification.todayXp,
      streakCurrent: gamification.streak.current,
    };
  }

  const now = new Date();

  return {
    todayXp: days[localDateKey(now)]?.xp ?? 0,
    streakCurrent: computeStreak(days, now).current,
  };
}

/** One quiet, honest sentence - never a bare fraction once the day's set is
 * cleared, never a number the stored days map can't back up. */
export function describeStreak(streakDays: number): string {
  if (streakDays <= 0) {
    return 'No active streak';
  }

  return streakDays === 1 ? '1-day streak' : `${streakDays}-day streak`;
}

export function describeGoalProgress(todayXp: number, goalXp: number): string {
  if (todayXp >= goalXp) {
    return `Set complete · ${todayXp.toLocaleString('en-US')} XP`;
  }

  return `Today · ${todayXp.toLocaleString('en-US')} / ${goalXp.toLocaleString(
    'en-US',
  )} XP`;
}

export interface ShelfCopy {
  title: string;
  detail: string;
}

const EMPTY_SHELF_COPY: ShelfCopy = {
  title: 'Choose a song to begin',
  detail: 'Pick a song, then strike a highlighted drum to start.',
};
const ARMED_SHELF_FALLBACK_COPY: ShelfCopy = {
  title: 'No favourite-song payoff is ready',
  detail:
    'My Wave needs a playable saved favourite before it can name a song section.',
};

export function resolveShelfCopy(
  sessionSummary: HomeSessionReceipt | undefined,
  hasPracticeTarget: boolean,
): ShelfCopy {
  if (!hasPracticeTarget) {
    return EMPTY_SHELF_COPY;
  }

  if (!sessionSummary) {
    return ARMED_SHELF_FALLBACK_COPY;
  }

  return { title: sessionSummary.title, detail: sessionSummary.detail };
}

export function HomeCockpit({
  songList,
  gamification,
  recommendation,
  practiceRanking,
  pedagogyRanking,
  practiceWave,
  activeGoal,
  goalPayoffCandidate,
  goalTargetDate,
  deadlinePacing,
  atomicStates,
  dueReviews,
  sessionEnergy,
  recentEarlyExits,
  onStartRecommended,
  onStartSession,
  onStartPracticeCard,
  onOpenSongs,
  onOpenJourney,
  onFindNewMusic,
  onStartSong,
}: HomeCockpitProps) {
  const { inputMapping, controlMapping, inputReadiness, selectedDevice } =
    useInput();
  const [struckLane, setStruckLane] = useState<KitElement>();
  const [pointerStrikeLane, setPointerStrikeLane] = useState<KitElement>();
  const [pendingDoor, setPendingDoor] = useState<KitElement>();
  const [sessionState, setSessionState] = useState<'armed' | 'count-in'>(
    'armed',
  );
  const [studioSize, setStudioSize] = useState({ width: 0, height: 0 });
  const clearPulseRef = useRef<number | undefined>(undefined);
  const clearPointerStrikeRef = useRef<number | undefined>(undefined);
  const clearPendingDoorRef = useRef<number | undefined>(undefined);
  const studioRef = useRef<HTMLElement>(null);
  const homeRanking = useMemo(() => {
    const ranked: RankedPracticeCandidate[] = [];
    const seen = new Set<string>();

    [
      ...(practiceRanking ?? []),
      ...(practiceWave?.stops.map(
        ({ recommendation: candidate }) => candidate,
      ) ?? []),
      ...(recommendation ? [recommendation] : []),
    ].forEach((candidate) => {
      if (!seen.has(candidate.candidate.id)) {
        seen.add(candidate.candidate.id);
        ranked.push(candidate);
      }
    });

    return ranked;
  }, [practiceRanking, practiceWave, recommendation]);
  const homeSession = useMemo(
    () =>
      composeHomeSession({
        intent: 'learning',
        ranking: homeRanking,
        pedagogyRanking,
        practiceWave,
        activeGoal,
        goalPayoffCandidate,
        goalTargetDate,
        deadlinePacing,
        atomicStates,
        size: 'full',
        energy: sessionEnergy,
        recentEarlyExits,
      }),
    [
      activeGoal,
      atomicStates,
      deadlinePacing,
      goalPayoffCandidate,
      goalTargetDate,
      homeRanking,
      pedagogyRanking,
      practiceWave,
      recentEarlyExits,
      sessionEnergy,
    ],
  );
  const myWaveSession = useMemo(
    () =>
      composeHomeSession({
        intent: 'songs',
        ranking: homeRanking,
        pedagogyRanking,
        practiceWave,
        activeGoal,
        goalPayoffCandidate,
        goalTargetDate,
        deadlinePacing,
        atomicStates,
        size: 'full',
        energy: sessionEnergy,
        recentEarlyExits,
      }),
    [
      activeGoal,
      atomicStates,
      deadlinePacing,
      goalPayoffCandidate,
      goalTargetDate,
      homeRanking,
      pedagogyRanking,
      practiceWave,
      recentEarlyExits,
      sessionEnergy,
    ],
  );
  const targetRecommendation = homeSession?.launch ?? recommendation;
  const homePracticeCards = useMemo(
    () =>
      composePracticeCards({
        plan: homeSession?.plan,
        ranking: pedagogyRanking ?? [],
        due_reviews: dueReviews ?? [],
        ...(homeSession?.goalPath ? { goal_path: homeSession.goalPath } : {}),
      }),
    [dueReviews, homeSession, pedagogyRanking],
  );
  const sessionDetails = useMemo(
    () =>
      [
        { label: 'Warm up', stop: homeSession?.focus },
        { label: 'Build', stop: homeSession?.build },
        {
          label: 'Play',
          stop: homeSession?.payoff?.unavailable
            ? undefined
            : homeSession?.payoff,
        },
      ].filter(
        ({ stop }, index, stops) =>
          stop &&
          stops.findIndex(
            (candidate) => candidate.stop?.title === stop.title,
          ) === index,
      ),
    [homeSession],
  );
  const sessionSummary =
    homeSession?.payoff ?? homeSession?.build ?? homeSession?.focus;
  const recommendedSong = songList.find(
    (song) => song.id === targetRecommendation?.candidate.id,
  );
  const resumedSong = useMemo(
    () => lastWorkedSong(songList, gamification.runsBySong),
    [gamification.runsBySong, songList],
  );
  const continuationSong = recommendedSong ?? resumedSong;
  const hasContinuationTarget = Boolean(continuationSong);
  const topSongs = useMemo(
    () => rankHomeTopSongs(songList, gamification.runsBySong),
    [gamification.runsBySong, songList],
  );
  const nextLesson = homeRanking.find(
    ({ candidate }) =>
      candidate.kind === 'lesson' &&
      candidate.available &&
      candidate.unlocked !== false,
  );
  // The lesson library keeps the lesson number and the lesson name as two
  // separate fields (`song.lesson.id`/`.title` - see
  // `library/manifest.json`'s `sk_lesson_id`/`sk_lesson_title`); `song.name`
  // only concatenates them ("Lesson 01.01 — Alternating Singles Warm-Up")
  // for places that want one string. Reading the two fields back apart
  // here is what turns that concatenation into a small eyebrow plus one
  // confident title line (2026-08-13 critique, home item 17) instead of
  // wrapping the whole combined string across four lines.
  const heroEyebrow = continuationSong?.lesson
    ? `Lesson ${continuationSong.lesson.id}`
    : continuationSong?.artist;
  const heroTitle =
    continuationSong?.lesson?.title ??
    continuationSong?.name ??
    'Choose a song';
  const safeBands = useMemo(
    () => computeKitTextSafeBands(HOME_KIT_ZONE_MAP, studioSize),
    [studioSize],
  );
  const kitColorRuns = useMemo(
    () => Object.values(gamification.runsBySong ?? {}).flat(),
    [gamification.runsBySong],
  );
  const kitColors = useKitColorMaturity(kitColorRuns);
  const { title: shelfTitle, detail: shelfDetail } = resolveShelfCopy(
    sessionSummary,
    hasContinuationTarget,
  );

  useLayoutEffect(() => {
    const studio = studioRef.current;

    if (!studio) {
      return undefined;
    }

    const measure = () => {
      const { width, height } = studio.getBoundingClientRect();

      setStudioSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(measure);

    observer.observe(studio);

    return () => observer.disconnect();
  }, []);

  const elementByControlId = useMemo(() => {
    const map = new Map<string, KitElement>();

    (Object.entries(inputMapping) as Array<[KitElement, string[]]>).forEach(
      ([element, controlIds]) => {
        controlIds.forEach((controlId) => map.set(controlId, element));
      },
    );

    return map;
  }, [inputMapping]);
  const homeControls = useMemo(
    () => resolveLibraryControls(controlMapping, inputMapping),
    [controlMapping, inputMapping],
  );
  const homeConfirmControls = useMemo(
    () => homeControls.mapping.confirm ?? [],
    [homeControls.mapping.confirm],
  );
  const inputStatus =
    inputReadiness === 'connected'
      ? `Connected · ${selectedDevice?.name ?? 'Input device'}`
      : inputReadiness === 'reconnecting'
      ? `Reconnecting · ${selectedDevice?.name ?? 'MIDI kit'}`
      : 'No MIDI kit found';
  const kitDoors = useMemo<Record<KitElement, ResolvedKitDoor>>(
    () => ({
      kick: {
        action: 'continue',
        label: 'Continue',
        detail: continuationSong?.name ?? 'Choose a song first',
        ariaLabel: continuationSong
          ? `Kick. Continue ${continuationSong.name}.`
          : 'Kick. Choose a song before continuing.',
      },
      snare: {
        action: 'my-wave',
        label: 'My Wave',
        detail:
          myWaveSession?.launch.candidate.title ??
          'Add a song to build your stream',
        ariaLabel: myWaveSession
          ? `Snare. My Wave: start ${myWaveSession.launch.candidate.title}.`
          : 'Snare. My Wave needs a playable song.',
      },
      hihat: {
        action: 'next-lesson',
        label: 'Next lesson',
        detail: nextLesson?.candidate.title ?? 'Open Journey to choose one',
        ariaLabel: nextLesson
          ? `Hi-hat. Open your next lesson, ${nextLesson.candidate.title}.`
          : 'Hi-hat. Open Journey to choose your next lesson.',
      },
      ride: {
        action: 'songs',
        label: 'Your songs',
        detail: 'Open your library',
        ariaLabel: 'Ride. Open your songs library.',
      },
      crash: {
        action: 'discover',
        label: 'Find new',
        detail: 'Browse new practice music',
        ariaLabel: 'Crash. Find new practice music.',
      },
      tom1: {
        action: 'top-song-1',
        label: 'Top 1',
        detail: topSongs[0]?.name ?? 'Play to set this tom',
        ariaLabel: topSongs[0]
          ? `Tom 1. Top song: ${topSongs[0].name}. Start it.`
          : 'Tom 1. No top song yet. Play a song to set this tom.',
        song: topSongs[0],
      },
      tom2: {
        action: 'top-song-2',
        label: 'Top 2',
        detail: topSongs[1]?.name ?? 'Play to set this tom',
        ariaLabel: topSongs[1]
          ? `Tom 2. Second top song: ${topSongs[1].name}. Start it.`
          : 'Tom 2. No second top song yet. Play a song to set this tom.',
        song: topSongs[1],
      },
      tom3: {
        action: 'top-song-3',
        label: 'Top 3',
        detail: topSongs[2]?.name ?? 'Play to set this tom',
        ariaLabel: topSongs[2]
          ? `Floor tom. Third top song: ${topSongs[2].name}. Start it.`
          : 'Floor tom. No third top song yet. Play a song to set this tom.',
        song: topSongs[2],
      },
    }),
    [continuationSong, myWaveSession, nextLesson, topSongs],
  );
  const armedDoor = pendingDoor ?? (hasContinuationTarget ? 'kick' : undefined);
  const homeStartHint = pendingDoor
    ? `${kitDoors[pendingDoor].label} is selected. Use your confirm control to start it.`
    : homeControls.kitActions.includes('confirm') ||
      homeConfirmControls.length > 0
    ? 'Strike a labelled door, then use your confirm control to start it.'
    : 'Set a confirm control in Configure input to use the kit hands-free.';
  const pulseLane = useCallback((element: KitElement) => {
    window.clearTimeout(clearPulseRef.current);
    setStruckLane(element);
    clearPulseRef.current = window.setTimeout(() => {
      setStruckLane(undefined);
    }, 220);
  }, []);
  const selectDoor = useCallback((element: KitElement) => {
    window.clearTimeout(clearPendingDoorRef.current);
    setPendingDoor(element);
    clearPendingDoorRef.current = window.setTimeout(() => {
      setPendingDoor(undefined);
    }, 1_500);
  }, []);
  const clearSelectedDoor = useCallback(() => {
    window.clearTimeout(clearPendingDoorRef.current);
    setPendingDoor(undefined);
  }, []);
  const startSession = useCallback(
    (session: OneKickHomeSession | undefined) => {
      setSessionState('count-in');

      if (session && onStartSession) {
        onStartSession(session);

        return;
      }

      onStartRecommended();
    },
    [onStartRecommended, onStartSession],
  );
  const startSong = useCallback(
    (song: Song) => {
      if (!onStartSong) {
        onOpenSongs();

        return;
      }

      setSessionState('count-in');
      onStartSong(song);
    },
    [onOpenSongs, onStartSong],
  );
  const executeDoor = useCallback(
    (element: KitElement) => {
      const door = kitDoors[element];

      if (door.action === 'continue') {
        if (homeSession) {
          startSession(homeSession);
        } else if (targetRecommendation) {
          startSession(undefined);
        } else if (continuationSong) {
          startSong(continuationSong);
        } else {
          onOpenSongs();
        }

        return;
      }

      if (door.action === 'my-wave') {
        if (myWaveSession) {
          startSession(myWaveSession);
        } else {
          onOpenSongs();
        }

        return;
      }

      if (door.action === 'next-lesson') {
        (onOpenJourney ?? onOpenSongs)();

        return;
      }

      if (door.action === 'songs') {
        onOpenSongs();

        return;
      }

      if (door.action === 'discover') {
        (onFindNewMusic ?? onOpenSongs)();

        return;
      }

      if (door.song) {
        startSong(door.song);
      } else {
        onOpenSongs();
      }
    },
    [
      continuationSong,
      homeSession,
      kitDoors,
      myWaveSession,
      onFindNewMusic,
      onOpenJourney,
      onOpenSongs,
      startSession,
      startSong,
      targetRecommendation,
    ],
  );
  const handlePointerStrike = useCallback(
    (element: KitElement) => {
      playKitPreview(element);
      clearSelectedDoor();
      window.clearTimeout(clearPointerStrikeRef.current);
      setPointerStrikeLane(element);
      clearPointerStrikeRef.current = window.setTimeout(() => {
        setPointerStrikeLane(undefined);
      }, 120);

      pulseLane(element);
      executeDoor(element);
    },
    [clearSelectedDoor, executeDoor, pulseLane],
  );

  useEffect(() => {
    const unsubscribe = inputBus.subscribe((event) => {
      const element = elementByControlId.get(event.controlId);

      if (event.value <= 0) {
        return;
      }

      if (element) {
        pulseLane(element);
      }

      if (homeConfirmControls.includes(event.controlId)) {
        const door = pendingDoor ?? element ?? 'kick';

        clearSelectedDoor();
        executeDoor(door);
      } else if (element) {
        selectDoor(element);
      }
    });

    return () => {
      unsubscribe();
      window.clearTimeout(clearPulseRef.current);
      window.clearTimeout(clearPointerStrikeRef.current);
      window.clearTimeout(clearPendingDoorRef.current);
    };
  }, [
    clearSelectedDoor,
    elementByControlId,
    executeDoor,
    homeConfirmControls,
    pendingDoor,
    pulseLane,
    selectDoor,
  ]);

  const rootStyle = {
    '--drumstick-cursor': `url(${drumstickCursor}) 6 6`,
    '--kit-pad-fill-opacity': `${HOME_KIT_ZONE_FILL_OPACITY * 100}%`,
    ...kitColors.properties,
  } as CSSProperties;

  return (
    <section
      className="kit-home"
      style={rootStyle}
      data-testid="home-cockpit"
      data-session-state={sessionState}
      data-kit-color-mode={kitColors.override}
      data-kit-color-maturity={kitColors.presentation.maturity.toFixed(3)}
      aria-labelledby="home-cockpit-title"
    >
      <section
        ref={studioRef}
        className="kit-home__studio"
        data-testid="home-kit-stage"
      >
        <img
          className="kit-home__photo"
          src={homeKitStudio}
          alt="A pearl drum kit in a sunlit studio"
        />

        <div className="kit-home__pads" role="group" aria-label="Practice kit">
          {KIT_HOTSPOTS.map((hotspot) => {
            const isStruck = struckLane === hotspot.element;
            const isPointerStrike = pointerStrikeLane === hotspot.element;
            const isArmed = armedDoor === hotspot.element;
            const door = kitDoors[hotspot.element];

            return (
              <button
                key={hotspot.element}
                type="button"
                data-testid={`kit-hotspot-${hotspot.element}`}
                className="kit-home__pad"
                data-door={door.action}
                data-armed={isArmed || undefined}
                data-struck={isStruck || undefined}
                data-active={isStruck || undefined}
                data-color-lane={HOME_KIT_ZONE_LANES[hotspot.element]}
                style={
                  fitKitZone(
                    HOME_KIT_ZONE_MAP.zones[hotspot.element],
                    HOME_KIT_ZONE_MAP.image,
                    studioSize,
                  ) as CSSProperties
                }
                aria-label={door.ariaLabel}
                onClick={() => handlePointerStrike(hotspot.element)}
              >
                <span className="kit-home__pad-head" aria-hidden="true" />
                <span className="kit-home__pad-impact" aria-hidden="true" />
                <img
                  className="kit-home__pad-stick"
                  data-struck={isPointerStrike || undefined}
                  data-active={isPointerStrike}
                  src={drumstickCursor}
                  alt=""
                  aria-hidden="true"
                />
                <span className="kit-home__pad-label" aria-hidden="true">
                  <span>{door.label}</span>
                  <small>{door.detail}</small>
                </span>
              </button>
            );
          })}
        </div>

        <p
          className="kit-home__hit-feedback sr-only"
          data-testid="home-hit-feedback"
        >
          {struckLane
            ? `${KIT_HOTSPOTS.find((item) => item.element === struckLane)
                ?.drumLabel} hit`
            : ''}
        </p>
      </section>

      {/*
       * Two independent bands, each positioned from `safeBands` -
       * `computeKitTextSafeBands` re-derives them from `HOME_KIT_ZONE_MAP`
       * at the studio's real measured size, so they are the room around the
       * kit (the "window wall" above, the "floor, rug" below), never a
       * fixed-width column guessed to roughly clear the drums. Splitting
       * the manifest text from the primary action/shelf this way - title
       * up top, the "what do I do" cluster low - mirrors the reference's
       * own `My Vibe` capture, where the giant title and the play control
       * sit far apart, not stacked in one card (2026-08-13 critique, home
       * item 17 root cause: "the title/manifest column and the kit photo
       * are not laid out with any awareness of where the eight hotspots
       * actually sit"). `overflow: hidden` on both bands (KitHome.css) is
       * the hard backstop: even an unusually long title/copy string can
       * only be clipped by its own band, never bleed into a zone.
       */}
      <div
        className="kit-home__title-band"
        data-testid="home-session-manifest"
        data-state={sessionState}
        style={
          {
            top: safeBands.top.top,
            left: safeBands.top.left,
            width: safeBands.top.width,
            height: safeBands.top.height,
            '--kit-safe-band-height': `${safeBands.top.height}px`,
          } as CSSProperties
        }
      >
        <h1 id="home-cockpit-title" className="kit-home__hero">
          {heroEyebrow ? (
            <span className="kit-home__eyebrow">{heroEyebrow}</span>
          ) : null}
          {heroEyebrow ? ' ' : null}
          <span className="kit-home__hero-name">{heroTitle}</span>
        </h1>
        <p
          className="kit-home__input-readiness"
          data-testid="home-input-readiness"
          data-state={inputReadiness}
          role="status"
        >
          {inputStatus}
        </p>
      </div>

      <div
        className="kit-home__action-band"
        data-testid="home-action-band"
        style={
          {
            top: safeBands.bottom.top,
            left: safeBands.bottom.left,
            width: safeBands.bottom.width,
            height: safeBands.bottom.height,
            '--kit-safe-band-height': `${safeBands.bottom.height}px`,
          } as CSSProperties
        }
      >
        <section
          className="kit-home__session-summary"
          aria-label="Today’s practice"
          data-testid="home-session-summary"
        >
          <strong>{shelfTitle}</strong>
          <span>{shelfDetail}</span>
          <details>
            <summary>Session details</summary>
            <div className="kit-home__session-details">
              {sessionDetails.map(({ label, stop }) =>
                stop ? (
                  <p key={stop.title}>
                    <strong>{label}</strong>
                    <span>{stop.title}</span>
                  </p>
                ) : null,
              )}
              <EvidencePracticeCards
                compact
                cards={homePracticeCards.cards}
                onStart={onStartPracticeCard}
                testId="home-practice-card"
              />
            </div>
          </details>
        </section>
      </div>

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="home-session-status"
      >
        {sessionState === 'count-in'
          ? `Count-in for ${continuationSong?.name ?? 'your selected target'}.`
          : pendingDoor
          ? homeStartHint
          : hasContinuationTarget && continuationSong
          ? `${continuationSong.name} is armed on Kick${
              targetRecommendation
                ? ` at ${(
                    homeSession?.launchSpeed ??
                    targetRecommendation.suggestedSpeed
                  ).toFixed(1)} times speed`
                : ''
            }. ${homeStartHint}`
          : `Kick is waiting for a song. ${homeStartHint}`}
      </p>
    </section>
  );
}
