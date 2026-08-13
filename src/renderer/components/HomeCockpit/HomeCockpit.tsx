import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Song } from '../../../types';
import { useInput } from '../../context/InputContext';
import { inputBus } from '../../input';
import { UseGamificationResult } from '../../hooks/useGamification';
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
import {
  useKitColorMaturity,
  type KitColorLane,
} from '../../services/kit-color-maturity';
import { EvidencePracticeCards } from '../PracticeCards';
import { playKitPreview } from '../../services/kit-preview-audio';
import homeKitStudio from '../../assets/daybreak/home-kit-studio.png';
import drumstickCursor from '../../assets/daybreak/drumstick-cursor-reversed.png';
import { fitKitZone, HOME_KIT_ZONE_MAP } from './kit-zone-map';
import './KitHome.css';

interface HomeCockpitProps {
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
/**
 * `next-practice/home-session.ts`'s own last-resort placeholder when no
 * musical payoff can be ranked. Visual-system-v3 explicitly forbids
 * surfacing this verbatim ("dead-end proof claims ... framed as a payoff
 * rather than a truthful neutral state") - Home intercepts it and falls
 * back to the same honest "nothing chosen yet" copy used when there is no
 * session at all, rather than presenting an empty state as a completed one.
 */
const NO_PAYOFF_PLACEHOLDER = 'No musical payoff yet';

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
/**
 * Shown when a lesson/song target is already armed (the hero above already
 * reads "Start practice") but no musical payoff has been ranked yet. This
 * must never collapse to `EMPTY_SHELF_COPY` - "Choose a song to begin" is
 * idle-state copy, and showing it under an armed hero is exactly the
 * self-contradiction the 2026-08-13 critique flagged (item 1: "the hero
 * title reads a specific armed lesson ... the line directly beneath says
 * 'Choose a song to begin'"). Stays factual about what is (nothing ranked)
 * rather than promising a future state the store can't guarantee.
 */
const ARMED_SHELF_FALLBACK_COPY: ShelfCopy = {
  title: 'No song payoff yet',
  detail: 'No favourite-song section is ranked to play yet.',
};

/** The goal-song low shelf's copy, honest about the one state
 * `next-practice/home-session.ts` can hand back that isn't actually a
 * payoff: its own `NO_PAYOFF_PLACEHOLDER` fallback string. `hasPracticeTarget`
 * decides which "nothing to show" copy applies - idle copy only when no
 * target is armed at all, the armed-fallback copy when a target is armed but
 * simply has no ranked song payoff yet (see `ARMED_SHELF_FALLBACK_COPY`). */
export function resolveShelfCopy(
  sessionSummary: HomeSessionReceipt | undefined,
  hasPracticeTarget: boolean,
): ShelfCopy {
  if (!hasPracticeTarget) {
    return EMPTY_SHELF_COPY;
  }

  if (!sessionSummary || sessionSummary.title === NO_PAYOFF_PLACEHOLDER) {
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
  const practiceTarget = targetRecommendation ? recommendedSong : undefined;
  const hasPracticeTarget = Boolean(practiceTarget && targetRecommendation);
  const kitColorRuns = useMemo(
    () => Object.values(gamification.runsBySong ?? {}).flat(),
    [gamification.runsBySong],
  );
  const kitColors = useKitColorMaturity(kitColorRuns);
  const { title: shelfTitle, detail: shelfDetail } = resolveShelfCopy(
    sessionSummary,
    hasPracticeTarget,
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
  }, [elementByControlId, hasPracticeTarget, pulseLane, startCurrentPractice]);

  const rootStyle = {
    '--drumstick-cursor': `url(${drumstickCursor}) 6 6`,
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

        <div className="kit-home__shelf">
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
      </aside>

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
