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
  RECENT_LANE_TREND_WINDOW_DAYS,
  RECENT_READINESS_WINDOW_DAYS,
} from '../../services/mastery';
import { RankedPracticeCandidate } from '../../services/next-practice';
import { KitElement, RunSummary } from '../../services/practice-stats';
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

type CanonicalKitColorLane = 'orange' | 'red' | 'yellow' | 'blue' | 'green';

/**
 * The cockpit uses the same five notation lanes as the score: kick/orange,
 * snare/red, the first cymbal/tom lane/yellow, the second/blue, and the
 * third/green. Paired cymbal and tom voices deliberately share a color so
 * Home rehearses the exact visual vocabulary the player sees in practice.
 */
const KIT_COLOR_LANE: Record<KitElement, CanonicalKitColorLane> = {
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

interface RecentCompletedSong {
  song: Song;
  summary: RunSummary;
}

const RECENT_SONG_ACCENT_LANES = ['hihat', 'snare', 'kick'] as const;

function completedAtMs(summary: RunSummary) {
  const completedAt = Date.parse(summary.completedAt);

  return Number.isFinite(completedAt) ? completedAt : Number.NEGATIVE_INFINITY;
}

/**
 * Home only names songs that have a real completed run. A song can have
 * several stored attempts, so reduce each song to its newest `completedAt`
 * before ranking the three rows across the library. This prevents the
 * cockpit from mistaking an imported or merely-liked track for recent work.
 */
export function recentCompletedSongs(
  songList: Song[],
  runsBySong: Readonly<Record<string, RunSummary[]>> | undefined,
): RecentCompletedSong[] {
  if (!runsBySong) {
    return [];
  }

  const songsById = new Map(
    songList.filter((song) => !song.lesson).map((song) => [song.id, song]),
  );

  return Object.entries(runsBySong)
    .flatMap(([songId, runs]) => {
      const song = songsById.get(songId);

      if (!song || runs.length === 0) {
        return [];
      }

      const summary = runs.reduce((latest, candidate) =>
        completedAtMs(candidate) > completedAtMs(latest) ? candidate : latest,
      );

      return [{ song, summary }];
    })
    .sort(
      (left, right) =>
        completedAtMs(right.summary) - completedAtMs(left.summary),
    )
    .slice(0, 3);
}

function recentRunLabel(summary: RunSummary) {
  const accuracy = Math.round(summary.overallAccuracy * 100);
  const mode = summary.mode === 'perform' ? 'perform' : 'practice';

  return `${accuracy}% · ${mode}`;
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
  const { inputMapping, inputReadiness, selectedDevice } = useInput();
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
  const recentSongs = useMemo(
    () => recentCompletedSongs(songList, gamification.runsBySong),
    [gamification.runsBySong, songList],
  );
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
    if (inputReadiness !== 'connected') {
      return;
    }

    pulseLane('kick');
    onStartRecommended();
  }, [inputReadiness, onStartRecommended, pulseLane]);

  useDrumGestures({
    enabled:
      surface === 'home' &&
      recommendation !== undefined &&
      inputReadiness === 'connected',
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
  const inputStatus =
    inputReadiness === 'connected'
      ? `Connected · ${selectedDevice?.name ?? 'Input'}`
      : inputReadiness === 'reconnecting'
      ? `Reconnecting · ${
          selectedDevice?.name ?? 'your kit'
        } · Drumroll will resume automatically`
      : 'Waiting for a MIDI drum kit';
  const inputStateLabel =
    inputReadiness === 'connected'
      ? 'Connected'
      : inputReadiness === 'reconnecting'
      ? 'Reconnecting'
      : 'Waiting for kit';
  const inputStateDetail =
    inputReadiness === 'connected'
      ? selectedDevice?.name ?? 'Drum input ready'
      : inputReadiness === 'reconnecting'
      ? `${selectedDevice?.name ?? 'Remembered kit'} · automatic retry`
      : 'Connect USB MIDI · auto-detect is on';
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
          <p
            className="home-cockpit__input-readiness"
            data-state={inputReadiness}
            data-testid="home-input-readiness"
            role="status"
            aria-label={inputStatus}
          >
            <span aria-hidden="true" />
            <span className="home-cockpit__input-readiness-copy">
              <strong>{inputStateLabel}</strong>
              <small>{inputStateDetail}</small>
            </span>
          </p>
          <p className="home-cockpit__lede">
            {currentSong && recommendation
              ? `${
                  currentSong.artist
                } · ${recommendation.suggestedSpeed.toFixed(1)}× adaptive start`
              : currentSong
              ? `${currentSong.artist} · ${currentAccuracyLabel}`
              : 'Choose a chart once; after that, your kit starts the session.'}
          </p>
          <div className="home-cockpit__actions">
            {recommendation && (
              <Button
                size="large"
                data-testid="home-start-practice"
                className="home-cockpit__start-secondary"
                icon={<FontAwesomeIcon icon={faBolt} />}
                disabled={inputReadiness !== 'connected'}
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
                data-color-lane={KIT_COLOR_LANE[hotspot.element]}
                disabled={
                  hotspot.element === 'kick' &&
                  recommendation !== undefined &&
                  inputReadiness !== 'connected'
                }
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
                    {hotspot.element === 'kick'
                      ? inputReadiness === 'connected'
                        ? recommendation
                          ? 'Kick to start'
                          : 'Choose song'
                        : 'Waiting'
                      : hotspot.label}
                  </strong>
                  <small>
                    {hotspot.element === 'kick'
                      ? inputReadiness === 'reconnecting'
                        ? 'auto-connect armed'
                        : inputReadiness === 'waiting'
                        ? 'connect MIDI'
                        : currentSong && recommendation
                        ? `${recommendation.suggestedSpeed.toFixed(1)}× · ready`
                        : 'pick a chart'
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
            : ''}
        </p>
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="home-session-status"
        >
          {inputReadiness !== 'connected'
            ? inputStatus
            : recommendation
            ? `Practice recommendation ready: ${
                recommendation.candidate.title
              } at ${recommendation.suggestedSpeed.toFixed(1)} times speed.`
            : 'No practice recommendation is ready. Choose a song to begin.'}
        </p>
      </div>

      <div className="home-cockpit__below">
        <article className="home-cockpit__next">
          <div>
            <p className="home-cockpit__label">Current lesson</p>
            <h2>
              {nextLesson
                ? `Lesson · ${nextLesson.lesson.title}`
                : 'Your first lesson is ready'}
            </h2>
            <p className="home-cockpit__lesson-meta">
              {nextLesson
                ? `${nextLesson.lesson.unit} · ${
                    nextLesson.lesson.bpmStart ?? '—'
                  } → ${nextLesson.lesson.bpmTarget ?? '—'} BPM`
                : 'Open Journey to load the Drumroll Method into your library.'}
            </p>
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
        <article
          className="home-cockpit__recent-songs"
          data-testid="home-recent-songs"
          aria-labelledby="home-recent-songs-title"
        >
          <div className="home-cockpit__recent-heading">
            <p className="home-cockpit__label">Recent songs</p>
            <h2 id="home-recent-songs-title">Last completed passes</h2>
          </div>
          {recentSongs.length > 0 ? (
            <ol className="home-cockpit__recent-list">
              {recentSongs.map(({ song, summary }, index) => {
                const accent =
                  RECENT_SONG_ACCENT_LANES[
                    index % RECENT_SONG_ACCENT_LANES.length
                  ];

                return (
                  <li
                    key={song.id}
                    className="home-cockpit__recent-song"
                    data-testid={`home-recent-song-${song.id}`}
                    data-lane={accent}
                  >
                    <span className="home-cockpit__recent-song-copy">
                      <strong>{song.name}</strong>
                      <small>{song.artist}</small>
                    </span>
                    <span className="home-cockpit__recent-song-score">
                      {recentRunLabel(summary)}
                    </span>
                    <time dateTime={summary.completedAt} className="sr-only">
                      {summary.completedAt}
                    </time>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="home-cockpit__recent-empty">
              Your last three completed songs will appear here.
            </p>
          )}
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
