import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Progress } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBolt,
  faMusic,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { Difficulty } from 'scan-chart';
import { Song } from '../../../types';
import { useInput } from '../../context/InputContext';
import { inputBus } from '../../input';
import { UseGamificationResult } from '../../hooks/useGamification';
import { LessonProgress } from '../../hooks/useLessons';
import { calculateAccuracy } from '../../scoring';
import {
  MIN_RECENT_LANE_SAMPLES,
  RecentLaneSignal,
  RECENT_LANE_TREND_WINDOW_DAYS,
  RECENT_READINESS_WINDOW_DAYS,
} from '../../services/mastery';
import {
  composeHomeSession,
  DeadlinePacingSummary,
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
import {
  useKitColorMaturity,
  type KitColorLane,
} from '../../services/kit-color-maturity';
import { EvidencePracticeCards } from '../PracticeCards';
import { playKitPreview } from '../../services/kit-preview-audio';
import homeKitStudio from '../../assets/daybreak/home-kit-studio.png';
import drumstickCursor from '../../assets/daybreak/drumstick-cursor-reversed.png';
import { fitKitZone, HOME_KIT_ZONE_MAP } from './kit-zone-map';
import './HomeCockpit.css';
import './KitHome.css';

export type CockpitSurface = 'home' | 'coach';

interface HomeCockpitProps {
  surface: CockpitSurface;
  songList: Song[];
  difficulty: Difficulty;
  lessonProgress: LessonProgress;
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
  onOpenJourney: () => void;
  onOpenCoach: () => void;
  onOpenProfile: () => void;
}

interface KitHotspot {
  element: KitElement;
  label: string;
}

const KIT_COLOR_LANE: Record<KitElement, KitColorLane> = {
  kick: 'orange',
  snare: 'red',
  hihat: 'yellow',
  tom1: 'yellow',
  ride: 'blue',
  tom2: 'blue',
  crash: 'green',
  tom3: 'green',
};
const KIT_HOTSPOTS: KitHotspot[] = [
  { element: 'hihat', label: 'Hi-hat' },
  { element: 'crash', label: 'Crash' },
  { element: 'tom1', label: 'Tom 1' },
  { element: 'tom2', label: 'Tom 2' },
  { element: 'ride', label: 'Ride' },
  { element: 'snare', label: 'Snare' },
  { element: 'tom3', label: 'Floor tom' },
  { element: 'kick', label: 'Kick' },
];

function trendSummary(trendPp: number | undefined) {
  if (trendPp === undefined) {
    return {
      compact: `trend needs 2 × ${MIN_RECENT_LANE_SAMPLES}`,
      detailed: `Raw trend needs ${MIN_RECENT_LANE_SAMPLES} scored hits or misses in each ${RECENT_LANE_TREND_WINDOW_DAYS}-day half.`,
    };
  }

  const rounded = Math.round(Math.abs(trendPp));

  if (rounded === 0) {
    return {
      compact: 'steady',
      detailed: `Raw trend is steady versus the preceding ${RECENT_LANE_TREND_WINDOW_DAYS} days.`,
    };
  }

  return {
    compact: `${trendPp > 0 ? '↑' : '↓'} ${rounded} pp`,
    detailed: `Raw trend is ${
      trendPp > 0 ? 'up' : 'down'
    } ${rounded} percentage points versus the preceding ${RECENT_LANE_TREND_WINDOW_DAYS} days.`,
  };
}

function bestPlayableSong(
  songList: Song[],
  difficulty: Difficulty,
  preferredSongId?: string,
) {
  const regularSongs = songList.filter((song) => !song.lesson);

  return (
    regularSongs.find((song) => song.id === preferredSongId) ??
    regularSongs.find((song) => song.scoreData?.[difficulty]) ??
    regularSongs[0] ??
    songList.find((song) => !song.lesson)
  );
}

function weakestLane(signals: RecentLaneSignal[] | undefined) {
  const measured = signals?.filter(
    (signal) => signal.evidenceState === 'measured',
  );

  if (!measured || measured.length === 0) {
    return undefined;
  }

  return [...measured].sort((a, b) => a.accuracy - b.accuracy)[0];
}

export function HomeCockpit({
  surface,
  songList,
  difficulty,
  lessonProgress,
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
}: HomeCockpitProps) {
  const { inputMapping, inputReadiness, selectedDevice } = useInput();
  const [activeLane, setActiveLane] = useState<KitElement>();
  const [pointerStrikeLane, setPointerStrikeLane] = useState<KitElement>();
  const [sessionState, setSessionState] = useState<'armed' | 'count-in'>(
    'armed',
  );
  const [studioSize, setStudioSize] = useState({ width: 0, height: 0 });
  const clearPulseRef = useRef<number | undefined>(undefined);
  const clearPointerStrikeRef = useRef<number | undefined>(undefined);
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
        { label: 'Play', stop: homeSession?.payoff },
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
  const currentSong = useMemo(
    () =>
      recommendedSong ??
      bestPlayableSong(songList, difficulty, gamification.latestRun?.songId),
    [difficulty, gamification.latestRun?.songId, recommendedSong, songList],
  );
  const nextLesson =
    lessonProgress.continueEntry ??
    lessonProgress.entries.find((entry) => entry.unlocked);
  const weakest = weakestLane(gamification.recentLaneSignals);
  const practiceTarget = targetRecommendation ? recommendedSong : undefined;
  const hasPracticeTarget = Boolean(practiceTarget && targetRecommendation);
  const kitColorRuns = useMemo(
    () => Object.values(gamification.runsBySong ?? {}).flat(),
    [gamification.runsBySong],
  );
  const kitColors = useKitColorMaturity(kitColorRuns);

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
  const pulseLane = useCallback((element: KitElement) => {
    window.clearTimeout(clearPulseRef.current);
    setActiveLane(element);
    clearPulseRef.current = window.setTimeout(() => {
      setActiveLane(undefined);
    }, 120);
  }, []);
  const startCurrentPractice = useCallback(
    (element: KitElement) => {
      pulseLane(element);
      setSessionState('count-in');

      if (homeSession && onStartSession) {
        onStartSession(homeSession);

        return;
      }

      onStartRecommended();
    },
    [homeSession, onStartRecommended, onStartSession, pulseLane],
  );
  const handlePointerStrike = useCallback(
    (element: KitElement) => {
      playKitPreview(element);
      window.clearTimeout(clearPointerStrikeRef.current);
      setPointerStrikeLane(element);
      clearPointerStrikeRef.current = window.setTimeout(() => {
        setPointerStrikeLane(undefined);
      }, 120);

      if (hasPracticeTarget) {
        startCurrentPractice(element);
      } else {
        pulseLane(element);
      }
    },
    [hasPracticeTarget, pulseLane, startCurrentPractice],
  );
  const handlePadClick = useCallback(
    (element: KitElement) => {
      handlePointerStrike(element);

      if (!hasPracticeTarget) {
        onOpenSongs();
      }
    },
    [handlePointerStrike, hasPracticeTarget, onOpenSongs],
  );

  useEffect(() => {
    if (surface !== 'home') {
      return;
    }

    const unsubscribe = inputBus.subscribe((event) => {
      const element = elementByControlId.get(event.controlId);

      if (element && event.value > 0) {
        if (hasPracticeTarget) {
          startCurrentPractice(element);
        } else {
          pulseLane(element);
        }
      }
    });

    return () => {
      unsubscribe();
      window.clearTimeout(clearPulseRef.current);
      window.clearTimeout(clearPointerStrikeRef.current);
    };
  }, [
    elementByControlId,
    hasPracticeTarget,
    pulseLane,
    startCurrentPractice,
    surface,
  ]);

  const currentScore = currentSong?.scoreData?.[difficulty];
  const latestRunForSong =
    gamification.latestRun && currentSong?.id === gamification.latestRun.songId
      ? gamification.latestRun.summary
      : undefined;
  const currentAccuracy =
    latestRunForSong === undefined
      ? currentScore
        ? Math.round(calculateAccuracy(currentScore) * 100)
        : undefined
      : Math.round(latestRunForSong.overallAccuracy * 100);
  const rootStyle = {
    '--drumstick-cursor': `url(${drumstickCursor}) 6 6`,
    ...kitColors.properties,
  } as CSSProperties;

  if (surface === 'coach') {
    return (
      <section
        className="coach-desk"
        data-testid="coach-desk"
        aria-labelledby="coach-desk-title"
      >
        <div className="coach-desk__spotlight">
          <div>
            <p className="daybreak-kicker">
              <FontAwesomeIcon icon={faWandMagicSparkles} aria-hidden="true" />{' '}
              Coach briefing
            </p>
            <h1 id="coach-desk-title">Your next useful reps.</h1>
            <p>
              This view uses your saved practice. Play another run to make its
              advice more personal.
            </p>
          </div>
          <div className="coach-desk__halo" aria-hidden="true">
            <FontAwesomeIcon icon={faBolt} />
          </div>
        </div>

        <div className="coach-desk__grid">
          <article className="coach-desk__card coach-desk__card--focus">
            <p className="coach-desk__label">Focus area</p>
            {weakest ? (
              <>
                <h2>
                  {KIT_HOTSPOTS.find((item) => item.element === weakest.element)
                    ?.label ?? weakest.element}
                </h2>
                <strong>{Math.round(weakest.accuracy * 100)}%</strong>
                <p>
                  {weakest.sampleCount} scored hits or misses across{' '}
                  {weakest.runCount} {weakest.runCount === 1 ? 'run' : 'runs'}{' '}
                  in the current {RECENT_READINESS_WINDOW_DAYS}-day,
                  time-decayed window. {trendSummary(weakest.trendPp).detailed}
                </p>
              </>
            ) : (
              <>
                <h2>Calibrate your kit</h2>
                <p>
                  Finish one scored song and the coach will identify the lane
                  that needs the most care.
                </p>
              </>
            )}
            <Button type="primary" onClick={onOpenJourney}>
              {nextLesson
                ? `Train · ${nextLesson.lesson.title}`
                : 'Open journey'}
              <FontAwesomeIcon icon={faArrowRight} />
            </Button>
          </article>

          <article className="coach-desk__card">
            <p className="coach-desk__label">Today</p>
            <h2>{gamification.todayXp} XP</h2>
            <Progress
              percent={Math.min(
                100,
                Math.round((gamification.todayXp / gamification.goalXp) * 100),
              )}
              showInfo={false}
              strokeColor="var(--color-magenta)"
              railColor="rgb(17 23 34 / 10%)"
            />
            <p>
              {gamification.goalXp - gamification.todayXp > 0
                ? `${
                    gamification.goalXp - gamification.todayXp
                  } XP to your daily goal.`
                : 'Daily goal reached. Keep the streak musical.'}
            </p>
          </article>

          <article className="coach-desk__card">
            <p className="coach-desk__label">Current song</p>
            <h2>{currentSong?.name ?? 'Choose a song'}</h2>
            <p>
              {currentSong
                ? `${currentSong.artist} · ${
                    currentAccuracy === undefined
                      ? 'no saved score yet'
                      : `${currentAccuracy}% best`
                  }`
                : 'Your song library is ready when you are.'}
            </p>
            <Button onClick={onOpenSongs}>
              <FontAwesomeIcon icon={faMusic} /> Browse songs
            </Button>
          </article>
        </div>
      </section>
    );
  }

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
      <aside className="kit-home__context" aria-label="Current practice">
        <div
          className="kit-home__manifest"
          data-testid="home-session-manifest"
          data-state={sessionState}
        >
          <h1 id="home-cockpit-title">
            {practiceTarget?.name ?? 'Choose a song'}
          </h1>
          <button
            type="button"
            className="kit-home__primary-action"
            data-testid={
              hasPracticeTarget ? 'home-start-practice' : 'home-choose-song'
            }
            onClick={() =>
              hasPracticeTarget ? startCurrentPractice('kick') : onOpenSongs()
            }
          >
            {hasPracticeTarget ? 'Start practice' : 'Choose a song'}
          </button>
        </div>

        <section
          className="kit-home__session-summary"
          aria-label="Today’s practice"
          data-testid="home-session-summary"
        >
          <strong>{sessionSummary?.title ?? 'Choose a song to begin'}</strong>
          <span>
            {sessionSummary?.detail ??
              'Pick a song, then strike a highlighted drum to start.'}
          </span>
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
      </aside>

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
        <div className="kit-home__wash" aria-hidden="true" />

        <p
          className="sr-only"
          data-testid="home-input-readiness"
          data-state={inputReadiness}
        >
          {inputReadiness === 'connected'
            ? `${selectedDevice?.name ?? 'MIDI kit'} mapped · ready`
            : inputReadiness === 'reconnecting'
            ? 'Kit reconnecting · your target stays armed'
            : 'Mouse works now · connect MIDI when ready'}
        </p>

        <div className="kit-home__pads" role="group" aria-label="Practice kit">
          {KIT_HOTSPOTS.map((hotspot) => {
            const isActive = activeLane === hotspot.element;
            const isPointerStrike = pointerStrikeLane === hotspot.element;
            const targetLabel =
              practiceTarget?.name ?? 'the selected practice target';

            return (
              <button
                key={hotspot.element}
                type="button"
                data-testid={`kit-hotspot-${hotspot.element}`}
                className="kit-home__pad"
                data-active={isActive}
                data-color-lane={KIT_COLOR_LANE[hotspot.element]}
                style={
                  fitKitZone(
                    HOME_KIT_ZONE_MAP.zones[hotspot.element],
                    HOME_KIT_ZONE_MAP.image,
                    studioSize,
                  ) as CSSProperties
                }
                aria-label={
                  hasPracticeTarget
                    ? `${hotspot.label}. Start ${targetLabel}.`
                    : `${hotspot.label}. Choose a song to arm practice.`
                }
                onClick={() => handlePadClick(hotspot.element)}
              >
                <span className="kit-home__pad-head" aria-hidden="true" />
                <span className="kit-home__pad-impact" aria-hidden="true" />
                <img
                  className="kit-home__pad-stick"
                  data-active={isPointerStrike}
                  src={drumstickCursor}
                  alt=""
                  aria-hidden="true"
                />
                <span className="kit-home__pad-label">{hotspot.label}</span>
              </button>
            );
          })}
        </div>

        <p
          className="kit-home__hit-feedback sr-only"
          data-testid="home-hit-feedback"
        >
          {activeLane
            ? `${KIT_HOTSPOTS.find((item) => item.element === activeLane)
                ?.label} hit`
            : ''}
        </p>
      </section>

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="home-session-status"
      >
        {sessionState === 'count-in'
          ? `Count-in for ${practiceTarget?.name ?? 'your selected target'}.`
          : hasPracticeTarget && targetRecommendation
          ? `${practiceTarget?.name} is armed at ${(
              homeSession?.launchSpeed ?? targetRecommendation.suggestedSpeed
            ).toFixed(1)} times speed. Any mapped pad starts it.`
          : 'Choose a song to arm a practice target. Any mapped drum then starts it.'}
      </p>
    </section>
  );
}
