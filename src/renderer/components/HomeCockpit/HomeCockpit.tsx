import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Progress } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBolt,
  faBullseye,
  faDrum,
  faGraduationCap,
  faMusic,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { Difficulty } from 'scan-chart';
import { Song } from '../../../types';
import { cn } from '../../cn';
import { useInput } from '../../context/InputContext';
import { inputBus } from '../../input';
import { UseGamificationResult } from '../../hooks/useGamification';
import { LessonProgress } from '../../hooks/useLessons';
import { useDrumGestures } from '../../hooks/useDrumGestures';
import { calculateAccuracy } from '../../scoring';
import {
  MIN_RECENT_LANE_SAMPLES,
  RecentLaneSignal,
  RECENT_HALF_LIFE_DAYS,
  RECENT_LANE_TREND_WINDOW_DAYS,
  RECENT_READINESS_WINDOW_DAYS,
} from '../../services/mastery';
import { RankedPracticeCandidate } from '../../services/next-practice';
import { KitElement } from '../../services/practice-stats';
import homeKitStudio from '../../assets/daybreak/home-kit-studio.png';
import drumstickCursor from '../../assets/daybreak/drumstick-cursor.png';
import './HomeCockpit.css';

export type CockpitSurface = 'home' | 'coach';

interface HomeCockpitProps {
  surface: CockpitSurface;
  songList: Song[];
  difficulty: Difficulty;
  lessonProgress: LessonProgress;
  gamification: UseGamificationResult;
  recommendation?: RankedPracticeCandidate;
  onStartRecommended: () => void;
  onOpenSongs: () => void;
  onOpenJourney: () => void;
  onOpenCoach: () => void;
}

interface KitHotspot {
  element: KitElement;
  label: string;
  position: string;
}

const KIT_HOTSPOTS: KitHotspot[] = [
  { element: 'hihat', label: 'Hi-hat', position: 'hihat' },
  { element: 'crash', label: 'Crash', position: 'crash' },
  { element: 'tom1', label: 'Tom 1', position: 'tom1' },
  { element: 'tom2', label: 'Tom 2', position: 'tom2' },
  { element: 'ride', label: 'Ride', position: 'ride' },
  { element: 'snare', label: 'Snare', position: 'snare' },
  { element: 'tom3', label: 'Floor tom', position: 'tom3' },
  { element: 'kick', label: 'Kick', position: 'kick' },
];

interface LaneSignalSummary {
  compact: string;
  secondary: string;
  ariaDescription: string;
}

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

function laneSummary(
  lane: KitElement,
  signals: RecentLaneSignal[] | undefined,
): LaneSignalSummary {
  const signal = signals?.find((candidate) => candidate.element === lane);

  if (!signal) {
    return {
      compact: 'no recent data',
      secondary: `${RECENT_READINESS_WINDOW_DAYS}-day window`,
      ariaDescription: `No dated scored hits or misses in the last ${RECENT_READINESS_WINDOW_DAYS} days.`,
    };
  }

  const accuracy = `${Math.round(signal.accuracy * 100)}%`;
  const samples = `${signal.sampleCount} scored ${
    signal.sampleCount === 1 ? 'hit or miss' : 'hits or misses'
  } across ${signal.runCount} ${signal.runCount === 1 ? 'run' : 'runs'}`;
  const trend = trendSummary(signal.trendPp);

  if (signal.evidenceState === 'insufficient') {
    return {
      compact: `${accuracy} · ${signal.sampleCount}/${MIN_RECENT_LANE_SAMPLES}`,
      secondary: 'low sample',
      ariaDescription: `${accuracy} recent time-decayed hit accuracy from ${samples}; insufficient data until ${MIN_RECENT_LANE_SAMPLES} scored hits or misses. ${trend.detailed}`,
    };
  }

  return {
    compact: `${accuracy} · ${signal.sampleCount}`,
    secondary: trend.compact,
    ariaDescription: `${accuracy} recent time-decayed hit accuracy from ${samples}. ${trend.detailed}`,
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

/**
 * The central Home/Coach visual. The photograph is an authored product asset;
 * buttons layer only on real, mapped drums so all statistics and feedback map
 * to actual saved-kit lanes rather than decorative made-up values.
 */
export function HomeCockpit({
  surface,
  songList,
  difficulty,
  lessonProgress,
  gamification,
  recommendation,
  onStartRecommended,
  onOpenSongs,
  onOpenJourney,
  onOpenCoach,
}: HomeCockpitProps) {
  const { inputMapping } = useInput();
  const [activeLane, setActiveLane] = useState<KitElement>();
  const clearPulseRef = useRef<number | undefined>(undefined);
  const currentSong = useMemo(
    () =>
      songList.find((song) => song.id === recommendation?.candidate.id) ??
      bestPlayableSong(songList, difficulty, gamification.latestRun?.songId),
    [
      difficulty,
      gamification.latestRun?.songId,
      recommendation?.candidate,
      songList,
    ],
  );
  const nextLesson =
    lessonProgress.continueEntry ??
    lessonProgress.entries.find((entry) => entry.unlocked);
  const weakest = weakestLane(gamification.recentLaneSignals);
  const recentLaneSampleCount =
    gamification.recentLaneSignals?.reduce(
      (total, signal) => total + signal.sampleCount,
      0,
    ) ?? 0;
  const measuredLaneCount =
    gamification.recentLaneSignals?.filter(
      (signal) => signal.evidenceState === 'measured',
    ).length ?? 0;
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
    }, 530);
  }, []);
  const handleStartRecommended = useCallback(() => {
    pulseLane('kick');
    onStartRecommended();
  }, [onStartRecommended, pulseLane]);

  useDrumGestures({
    enabled: surface === 'home' && recommendation !== undefined,
    surface: 'home',
    mapping: inputMapping,
    onAction: (action) => {
      if (action === 'start') {
        handleStartRecommended();
      }
    },
  });

  useEffect(() => {
    const unsubscribe = inputBus.subscribe((event) => {
      const element = elementByControlId.get(event.controlId);

      if (element && event.value > 0) {
        pulseLane(element);
      }
    });

    return () => {
      unsubscribe();
      window.clearTimeout(clearPulseRef.current);
    };
  }, [elementByControlId, pulseLane]);

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
  const currentAccuracyLabel =
    currentAccuracy === undefined
      ? 'no saved score yet'
      : latestRunForSong
      ? `${currentAccuracy}% latest run`
      : `${currentAccuracy}% best at ${difficulty}`;
  const rootStyle = {
    '--drumstick-cursor': `url(${drumstickCursor}) 14 14`,
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
              This view only uses your saved scoring evidence. Play a scored run
              to give it more to work with.
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
      className="home-cockpit"
      style={rootStyle}
      data-testid="home-cockpit"
      aria-labelledby="home-cockpit-title"
    >
      <div className="home-cockpit__hero">
        <img
          className="home-cockpit__studio"
          src={homeKitStudio}
          alt="A pearl drum kit in a sunlit studio"
        />
        <div className="home-cockpit__wash" aria-hidden="true" />

        <div className="home-cockpit__intro">
          <p className="daybreak-kicker">
            <FontAwesomeIcon icon={faDrum} aria-hidden="true" /> Current room
          </p>
          <h1 id="home-cockpit-title">
            {currentSong?.name ?? 'Choose your next song'}
          </h1>
        </div>

        <div className="home-cockpit__launch">
          <p className="home-cockpit__lede">
            {currentSong && recommendation
              ? `${
                  currentSong.artist
                } · ${recommendation.suggestedSpeed.toFixed(1)}× start · ${
                  recommendation.reason
                }`
              : currentSong
              ? `${currentSong.artist} · ${currentAccuracyLabel}`
              : 'Your kit is ready. Pick a chart to make the bass drum your Play button.'}
          </p>
          <div className="home-cockpit__actions">
            {recommendation && (
              <Button
                size="large"
                data-testid="home-start-practice"
                className="home-cockpit__start-secondary"
                icon={<FontAwesomeIcon icon={faBolt} />}
                onClick={handleStartRecommended}
              >
                Start practice
              </Button>
            )}
            <Button
              size="large"
              data-testid="home-choose-song"
              icon={<FontAwesomeIcon icon={faMusic} />}
              onClick={onOpenSongs}
            >
              {currentSong ? 'Change song' : 'Choose song'}
            </Button>
          </div>
        </div>

        <div className="home-cockpit__status" aria-label="Practice status">
          <span>
            <strong>{gamification.streak.current}</strong>
            day streak
          </span>
          <span>
            <strong>{lessonProgress.unlockedCount}</strong>
            lessons open
          </span>
          <span>
            <strong>
              {recommendation
                ? `${Math.round(recommendation.predictedSuccess * 100)}%`
                : gamification.totalStars}
            </strong>
            {recommendation ? 'predicted success' : 'stars earned'}
          </span>
        </div>

        <button
          type="button"
          className="home-cockpit__coach-link"
          data-testid="home-open-coach"
          onClick={onOpenCoach}
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} aria-hidden="true" />
          <span>
            <small>AI Coach</small>
            <strong>
              {weakest
                ? `Tune your ${
                    KIT_HOTSPOTS.find(
                      (item) => item.element === weakest.element,
                    )?.label ?? weakest.element
                  }`
                : 'Open a focused run'}
            </strong>
          </span>
          <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
        </button>

        <div
          className="home-cockpit__kit"
          role="group"
          aria-label="Interactive drum kit"
        >
          {KIT_HOTSPOTS.map((hotspot) => {
            const isActive = activeLane === hotspot.element;
            const signal = laneSummary(
              hotspot.element,
              gamification.recentLaneSignals,
            );

            return (
              <button
                key={hotspot.element}
                type="button"
                data-testid={`kit-hotspot-${hotspot.element}`}
                className={cn(
                  'home-kit-hotspot',
                  `home-kit-hotspot--${hotspot.position}`,
                  isActive && 'home-kit-hotspot--active',
                )}
                aria-label={`${hotspot.label}: ${signal.ariaDescription} ${
                  hotspot.element === 'kick'
                    ? recommendation
                      ? `Start ${
                          recommendation.candidate.title
                        } at ${recommendation.suggestedSpeed.toFixed(
                          1,
                        )} times speed.`
                      : 'Choose a song.'
                    : `Pulse ${hotspot.label}.`
                }`}
                onClick={() => {
                  pulseLane(hotspot.element);

                  if (hotspot.element === 'kick') {
                    if (recommendation) {
                      handleStartRecommended();
                    } else {
                      onOpenSongs();
                    }
                  }
                }}
              >
                <span className="home-kit-hotspot__ring" aria-hidden="true" />
                <span className="home-kit-hotspot__copy">
                  <strong>
                    {hotspot.element === 'kick' ? 'Play' : hotspot.label}
                  </strong>
                  <small>
                    {hotspot.element === 'kick'
                      ? currentSong
                        ? recommendation
                          ? `${recommendation.suggestedSpeed.toFixed(1)}×`
                          : 'choose'
                        : 'choose'
                      : signal.compact}
                  </small>
                  {hotspot.element !== 'kick' && (
                    <small className="home-kit-hotspot__evidence">
                      {signal.secondary}
                    </small>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <p className="home-cockpit__live" data-testid="home-hit-feedback">
          {activeLane
            ? `${KIT_HOTSPOTS.find((item) => item.element === activeLane)
                ?.label} hit`
            : recommendation
            ? 'After a short silence: kick, crash, kick, crash starts the recommendation.'
            : 'Tap a drum, use its keyboard or MIDI mapping, or choose a song.'}
        </p>
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="home-session-status"
        >
          {recommendation
            ? `Practice recommendation ready: ${
                recommendation.candidate.title
              } at ${recommendation.suggestedSpeed.toFixed(1)} times speed.`
            : 'No practice recommendation is ready. Choose a song to begin.'}
        </p>
      </div>

      <div className="home-cockpit__below">
        <article
          className="home-cockpit__lane-evidence"
          data-testid="home-lane-evidence"
        >
          <div>
            <p className="home-cockpit__label">Evidence on this kit</p>
            <h2>Recent kit accuracy</h2>
          </div>
          <div className="home-cockpit__lane-evidence-copy">
            <p>
              {RECENT_READINESS_WINDOW_DAYS}-day time-decayed hit / (hit + miss)
              signal · {RECENT_HALF_LIFE_DAYS}-day half-life.
            </p>
            {gamification.recentLaneSignals === undefined ? (
              <p>Loading dated scored lane evidence from saved runs.</p>
            ) : gamification.recentLaneSignals.length === 0 ? (
              <p>
                No dated scored lane hits or misses in this window yet. Finish a
                scored run to create a current signal.
              </p>
            ) : (
              <p>
                {recentLaneSampleCount} raw scored hits or misses across{' '}
                {gamification.recentLaneSignals.length} observed lanes ·{' '}
                {measuredLaneCount} lane
                {measuredLaneCount === 1 ? '' : 's'} with{' '}
                {MIN_RECENT_LANE_SAMPLES}+ samples. Trend compares raw accuracy
                in the newest {RECENT_LANE_TREND_WINDOW_DAYS} days with the
                preceding {RECENT_LANE_TREND_WINDOW_DAYS} when both have{' '}
                {MIN_RECENT_LANE_SAMPLES}+ samples.
              </p>
            )}
          </div>
        </article>
        <article className="home-cockpit__next">
          <div>
            <p className="home-cockpit__label">Next on your path</p>
            <h2>
              {nextLesson
                ? 'Your next lesson is ready'
                : 'Your first lesson is ready'}
            </h2>
            <p>
              {nextLesson
                ? `${nextLesson.lesson.unit} · ${nextLesson.bestStars}/3 stars earned`
                : 'Open Journey to load the Drumroll Method into your library.'}
            </p>
            {nextLesson?.lesson.cue && (
              <div
                className="home-cockpit__lesson-plan"
                data-testid="home-current-lesson-plan"
              >
                <p>
                  <strong>Cue:</strong> {nextLesson.lesson.cue}
                </p>
                <p>
                  <strong>Tempo:</strong> {nextLesson.lesson.bpmStart ?? '—'} →{' '}
                  {nextLesson.lesson.bpmTarget ?? '—'} BPM
                  {nextLesson.lesson.prerequisiteIds?.length
                    ? ` · prerequisite: ${nextLesson.lesson.prerequisiteIds.join(
                        ', ',
                      )}`
                    : ' · no prerequisite'}
                </p>
                {nextLesson.lesson.doseRule && (
                  <p>
                    <strong>Dose:</strong> {nextLesson.lesson.doseRule}
                  </p>
                )}
                {nextLesson.lesson.masteryRule && (
                  <p>
                    <strong>Mastery:</strong> {nextLesson.lesson.masteryRule}
                  </p>
                )}
                <p data-testid="home-lesson-assessment-boundary">
                  {nextLesson.lesson.assessmentBoundary ??
                    'MIDI assesses timing and pad choice; sticking/form cue is not assessed.'}
                </p>
              </div>
            )}
          </div>
          <Button
            type="text"
            aria-label="Open your journey"
            onClick={onOpenJourney}
          >
            <FontAwesomeIcon icon={faGraduationCap} />
            <span>Journey</span>
          </Button>
        </article>
        <article className="home-cockpit__goal">
          <p className="home-cockpit__label">
            <FontAwesomeIcon icon={faBullseye} aria-hidden="true" /> Daily pulse
          </p>
          <strong>
            {gamification.todayXp} / {gamification.goalXp} XP
          </strong>
          <Progress
            percent={Math.min(
              100,
              Math.round((gamification.todayXp / gamification.goalXp) * 100),
            )}
            showInfo={false}
            strokeColor="var(--color-cyan)"
            railColor="rgb(17 23 34 / 12%)"
          />
        </article>
      </div>
    </section>
  );
}
