import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer } from 'antd';
import { Difficulty } from 'scan-chart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faFolder, faPlay } from '@fortawesome/free-solid-svg-icons';
import {
  Outlet,
  useNavigate,
  useOutlet,
  useSearchParams,
} from 'react-router-dom';
import songArtPlaceholder from '../../../../assets/song-art-placeholder.svg';
import { isPlayableEvidence } from '../../../library-sources/playability';
import { cn } from '../../cn';
import {
  ControlMapping,
  IpcResolveLibraryCandidatesResponse,
  IpcResult,
  isIpcError,
  LibraryCandidateResolution,
  LibrarySourceTrackProvenance,
  Song,
  YandexPlaylistCandidate,
  YandexPlaylistCandidateCollection,
} from '../../../types';
import { SettingsButton } from '../../components/SettingsButton';
import { SongSearch } from '../../components/SongSearch';
import { LessonsView } from '../../components/LessonsView';
import { useApp } from '../../context/AppContext';
import { useInput } from '../../context/InputContext';
import { StemToolsProvider } from '../../context/StemToolsContext';
import { useStemTools } from '../../hooks/useStemTools';
import { useSongList } from '../../hooks/useSongList';
import { useLibraryCandidates } from '../../hooks/useLibraryCandidates';
import {
  InputControlHandlers,
  useInputControls,
} from '../../hooks/useInputControls';
import { useGameModeSelector } from '../../hooks/useGameModeSelector';
import { usePersisted } from '../../hooks/usePersisted';
import {
  highestAvailableDifficulty,
  isLessonSong,
  LessonEntry,
  useLessonAutoRescan,
  useLessons,
} from '../../hooks/useLessons';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { Stars } from '../../components/Stars';
import { last7Dates, useGamification } from '../../hooks/useGamification';
import { GamificationHeaderStrip } from '../../components/GamificationHeaderStrip';
import { StatsPanel } from '../../components/StatsPanel';
import { localDateKey } from '../../services/streaks';
import { useGoals } from '../../components/Goals';
import { AppShell, ArenaView } from '../../components/AppShell';
import { HomeCockpit } from '../../components/HomeCockpit';
import { KitCommandPrompt } from '../../components/KitCommandPrompt';
import ProfileView from '../../components/Profile';
import { buildDrumLearningProfile } from '../../services/learning-profile';
import {
  build_pattern_player_profile,
  cluster_pattern_figures,
  decompose_chart_patterns,
} from '../../services/pattern-model';
import {
  buildPracticeWave,
  composeHomeSession,
  OneKickHomeSession,
  PracticeCandidate,
  PracticeHistoryEntry,
  PracticeWaveResult,
  RankedPracticeCandidate,
  recommendNextPractice,
} from '../../services/next-practice';
import {
  bestSongSectionAudition,
  buildWeeklyMusicalRecap,
  buildWeeklyRhythm,
  composePracticeCards,
  CURRICULUM_ITEM_MANIFESTS,
  dueReviews,
  replayAtomicSkillState,
  selectWeeklyPracticeSet,
  SongGoal,
} from '../../services/pedagogy';
import type {
  PracticeCardKind,
  PracticeCardOption,
  PracticeRhythm,
} from '../../services/pedagogy';
import { PracticeOutletContext } from '../practice-context';
import { LibraryCandidateList } from '../../components/LibraryCandidateList';
import {
  build_unified_library,
  filter_unified_library,
  order_unified_library,
  search_unified_library,
  should_offer_youtube,
  UnifiedLibraryFilter,
  UnifiedLibrarySort,
} from '../../services/library/unified-library';
import { buildLessonManifests, EMPTY_YANDEX_SOURCES } from './unified-sources';
import { useLibraryDifficultyCharts } from './use-library-difficulty-charts';
import {
  LIBRARY_SORT_OPTIONS,
  nextDifficulty,
  nextSongIndex,
  sortForIndex,
  sortIndexForKey,
  wrapSortIndex,
} from './helpers';
import { resolveLibraryControls } from './library-controls';
import { ActionableSongShelves } from './ActionableSongShelves';
import {
  build_actionable_library_shelves,
  favourite_song_ids,
  yandex_taste_seeded_song_ids,
} from './actionable-shelves';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

interface PracticeLaunchContext {
  card?: PracticeCardOption;
  audition?: NonNullable<PracticeCardOption['audition']>;
}

export function candidateDifficulty(
  song: Song,
  selected: Difficulty,
): Difficulty | undefined {
  // A song with no charted drum difficulty at all has nothing playable to
  // recommend. Returning `selected` here used to fabricate a difficulty for
  // it, which let a broken/uncharted song reach My Wave with `available:
  // true` and auto-launch straight into a chart-parse failure — see
  // docs/bug-hunt-20260812.md "Song grid and My Wave fabricate a playable
  // difficulty for songs with zero charted difficulties".
  if (!song.drumDifficulties || song.drumDifficulties.length === 0) {
    return undefined;
  }

  if (song.drumDifficulties.includes(selected)) {
    return selected;
  }

  return [...DIFFICULTIES]
    .reverse()
    .find((difficulty) => song.drumDifficulties?.includes(difficulty));
}

function song_ready_for_practice(song: Song): boolean {
  if (!song.drumDifficulties || song.drumDifficulties.length === 0) {
    return false;
  }

  if (song.sourceLinked || song.sourceProvenance) {
    return isPlayableEvidence(song.playability);
  }

  return song.audio.length > 0;
}

function LibraryInputControls({
  mapping,
  handlers,
}: {
  mapping: ControlMapping;
  handlers: InputControlHandlers;
}) {
  useInputControls(mapping, handlers);

  return null;
}

function appendCompletedRun(
  history: PracticeHistoryEntry[],
  completedRun: PracticeHistoryEntry | undefined,
): PracticeHistoryEntry[] {
  if (!completedRun) {
    return history;
  }

  const sessionId = completedRun.summary.context?.sessionId;
  const exists = history.some(
    (entry) =>
      entry.candidateId === completedRun.candidateId &&
      sessionId !== undefined &&
      entry.summary.context?.sessionId === sessionId,
  );

  return exists ? history : [...history, completedRun];
}

function candidateProvenance(
  source: YandexPlaylistCandidateCollection,
  track: YandexPlaylistCandidate,
): LibrarySourceTrackProvenance {
  return {
    provider: 'yandex-music',
    collectionId: source.playlist.id,
    collectionName: source.playlist.name,
    trackId: track.id,
    title: track.title,
    artists: [...track.artists],
    ...(track.durationSeconds !== null
      ? { durationSeconds: track.durationSeconds }
      : {}),
    ...(track.sourceTrackUrl ? { sourceUrl: track.sourceTrackUrl } : {}),
  };
}

export function SongListView() {
  const { currentPath, difficulty, setDifficulty } = useApp();
  const [hoverPreviewEnabled, setHoverPreviewEnabled] = usePersisted(
    'settings.songHoverPreview',
    true,
  );
  const { controlMapping, inputMapping } = useInput();
  const libraryControls = useMemo(
    () => resolveLibraryControls(controlMapping, inputMapping),
    [controlMapping, inputMapping],
  );
  const libraryMoveSteps = [
    ...(libraryControls.kitActions.includes('up') ? (['tom1'] as const) : []),
    ...(libraryControls.kitActions.includes('down') ? (['tom2'] as const) : []),
  ];
  const libraryMoveHints = [
    ...(libraryControls.kitActions.includes('up') ? ['Previous'] : []),
    ...(libraryControls.kitActions.includes('down') ? ['Next'] : []),
  ];
  const platformCapabilities = window.drumrollPlatform?.capabilities;
  const youtubeImportAvailable = platformCapabilities?.youtubeImport ?? true;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const songOpen = useOutlet() !== null;
  const stemTools = useStemTools();
  const {
    songList,
    scanProgress,
    addSong,
    handleLikeChange,
    handleSplit,
    splittingIds,
  } = useSongList();
  const scanPercent =
    scanProgress && scanProgress.total > 0
      ? Math.round((scanProgress.current / scanProgress.total) * 100)
      : undefined;
  // Full songList (lesson songs included) - Century/Season Finale/Speed
  // Demon all need to see the whole library, not just the non-lesson
  // subset `librarySongs` (below) filters down to for the songs grid.
  // Mounted once here, passed to SongView via <Outlet context> below
  // (SongView renders inside this component's Outlet - see App.tsx's
  // nested route - so one instance is enough for both surfaces to share
  // live state without a separate context provider).
  const goals = useGoals();
  const activeGoalRecord = goals.primaryGoal ?? goals.goals[0];
  const gamification = useGamification(songList, activeGoalRecord?.songId);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const weeklyXp = useMemo(() => {
    const today = new Date();

    return last7Dates(today).map((date) => ({
      date,
      xp: gamification.days[localDateKey(date)]?.xp ?? 0,
    }));
  }, [gamification.days]);
  const [nameFilter, setNameFilter] = useState('');
  const [sort, setSort] = useState<UnifiedLibrarySort>('difficulty');
  const [readinessFilter, setReadinessFilter] =
    useState<UnifiedLibraryFilter>('all');
  const [showEntireLibrary, setShowEntireLibrary] = useState(false);
  const libraryCandidates = useLibraryCandidates();
  // The player's own songs must never wait on the Drums/Favorites IPC round
  // trip — this stands in until it resolves, then the shelf quietly grows.
  const yandexSources =
    libraryCandidates.candidates?.yandex ?? EMPTY_YANDEX_SOURCES;
  const yandexTasteSeededSongIds = useMemo(
    () => yandex_taste_seeded_song_ids(songList, yandexSources),
    [songList, yandexSources],
  );
  const [focusedSongIndex, setFocusedSongIndex] = useState<number | undefined>(
    undefined,
  );
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [focusedSortIndex, setFocusedSortIndex] = useState(0);
  const [prevNameFilter, setPrevNameFilter] = useState(nameFilter);
  const [prevSort, setPrevSort] = useState(sort);
  const [prevReadinessFilter, setPrevReadinessFilter] =
    useState(readinessFilter);
  const gameModeSelector = useGameModeSelector();
  const [view, setView] = useState<ArenaView>('home');
  const [candidateResolutions, setCandidateResolutions] = useState<
    Record<string, LibraryCandidateResolution>
  >({});
  const [resolvingCandidateIds, setResolvingCandidateIds] = useState<
    Set<string>
  >(new Set());
  const [recommendationNowMs, setRecommendationNowMs] = useState(() =>
    Date.now(),
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setRecommendationNowMs(Date.now()),
      60_000,
    );

    return () => window.clearInterval(timer);
  }, []);

  // The Lessons unlock chain always looks at every lesson song, regardless
  // of the app's globally selected difficulty tab — lesson charts only ever
  // carry an Expert drum track, so filtering by difficulty here would hide
  // the whole curriculum whenever the tab isn't set to Expert.
  const lessonProgress = useLessons(songList);
  const practiceCandidates = useMemo<PracticeCandidate[]>(() => {
    const lessonState = new Map(
      lessonProgress.entries.map((entry, index) => [
        entry.song.id,
        { entry, index },
      ]),
    );
    const finalLessonIndex = Math.max(1, lessonProgress.entries.length - 1);

    return songList.flatMap<PracticeCandidate>((song) => {
      const targetDifficulty = candidateDifficulty(song, difficulty);

      if (!targetDifficulty) {
        return [];
      }

      const lesson = lessonState.get(song.id);

      if (lesson) {
        return [
          {
            id: song.id,
            title: lesson.entry.lesson.title,
            kind: 'lesson' as const,
            difficulty: targetDifficulty,
            available: true,
            unlocked: lesson.entry.unlocked,
            sequence: lesson.index,
            skills: lesson.entry.lesson.skills,
            curriculumId: lesson.entry.lesson.id,
            prerequisiteIds: lesson.entry.lesson.prerequisiteIds,
            targetLanes: lesson.entry.lesson.targetLanes,
            bpmStart: lesson.entry.lesson.bpmStart,
            bpmTarget: lesson.entry.lesson.bpmTarget,
            doseRule: lesson.entry.lesson.doseRule,
            masteryRule: lesson.entry.lesson.masteryRule,
            cue: lesson.entry.lesson.cue,
            assessmentBoundary: lesson.entry.lesson.assessmentBoundary,
            challengeLevel: 0.12 + (lesson.index / finalLessonIndex) * 0.76,
            mastered: lesson.entry.cleared,
            availableDifficulties: song.drumDifficulties,
            chartTotalNotes: song.scoreData?.[targetDifficulty]?.totalNotes,
          },
        ];
      }

      return [
        {
          id: song.id,
          title: song.name,
          kind: 'song' as const,
          difficulty: targetDifficulty,
          available: song_ready_for_practice(song),
          liked: song.liked || yandexTasteSeededSongIds.has(song.id),
          skills: [
            ...new Set(
              (gamification.runsBySong?.[song.id] ?? []).flatMap((run) =>
                (run.coachEvidence ?? []).map((finding) => finding.skillTag),
              ),
            ),
          ],
          targetSpeed: 1,
          availableDifficulties: song.drumDifficulties,
          chartTotalNotes: song.scoreData?.[targetDifficulty]?.totalNotes,
        },
      ];
    });
  }, [
    difficulty,
    gamification.runsBySong,
    lessonProgress.entries,
    songList,
    yandexTasteSeededSongIds,
  ]);
  const practiceHistory = useMemo<PracticeHistoryEntry[]>(
    () =>
      Object.entries(gamification.runsBySong ?? {}).flatMap(
        ([candidateId, runs]) =>
          runs.map((summary) => ({ candidateId, summary })),
      ),
    [gamification.runsBySong],
  );
  const activeGoal = useMemo<SongGoal | undefined>(
    () =>
      activeGoalRecord
        ? {
            song_id: activeGoalRecord.songId,
            preferred: true,
            goal_kind: 'full_song',
          }
        : undefined,
    [activeGoalRecord],
  );
  const activeGoalPayoffCandidate = useMemo(
    () =>
      activeGoal
        ? practiceCandidates.find(
            (candidate) =>
              candidate.id === activeGoal.song_id && candidate.kind === 'song',
          )
        : undefined,
    [activeGoal, practiceCandidates],
  );
  const atomicStateReplay = useMemo(
    () =>
      replayAtomicSkillState(
        practiceHistory.flatMap(
          ({ summary }) => summary.atomicSkillEvidence ?? [],
        ),
        { manifests: CURRICULUM_ITEM_MANIFESTS },
      ),
    [practiceHistory],
  );
  const atomicStates = atomicStateReplay.states;
  const atomicReviews = useMemo(
    () => dueReviews(atomicStates, new Date(recommendationNowMs).toISOString()),
    [atomicStates, recommendationNowMs],
  );
  const learningProfile = useMemo(
    () =>
      buildDrumLearningProfile(practiceHistory.map(({ summary }) => summary)),
    [practiceHistory],
  );
  const persistedCoachEvidence = useMemo(
    () => practiceHistory.flatMap(({ summary }) => summary.coachEvidence ?? []),
    [practiceHistory],
  );
  const nextPractice = useMemo(
    () =>
      recommendNextPractice({
        candidates: practiceCandidates,
        history: practiceHistory,
        coachEvidence: persistedCoachEvidence,
        weakLanes: gamification.laneAccuracy,
        nowMs: recommendationNowMs,
        goalDate: activeGoalRecord?.targetDate,
        learningProfile,
        pedagogy: {
          atomicStates,
          itemManifests: CURRICULUM_ITEM_MANIFESTS,
          ...(activeGoal ? { activeGoal } : {}),
          dueReviews: atomicReviews,
        },
        limit: 12,
      }),
    [
      activeGoal,
      activeGoalRecord?.targetDate,
      atomicReviews,
      atomicStates,
      gamification.laneAccuracy,
      learningProfile,
      practiceCandidates,
      practiceHistory,
      persistedCoachEvidence,
      recommendationNowMs,
    ],
  );
  const practiceWave = useMemo(
    () =>
      buildPracticeWave({
        ranking: nextPractice.ranking,
        history: practiceHistory,
      }),
    [nextPractice.ranking, practiceHistory],
  );
  const [practiceRhythm, setPracticeRhythm] = usePersisted<PracticeRhythm>(
    'practice.rhythm',
    'weekly',
  );
  const [practiceSetRotation, setPracticeSetRotation] = usePersisted<
    Partial<Record<PracticeCardKind, number>>
  >('practice.weeklySetRotation', {});
  const profileHomeSession = useMemo(
    () =>
      composeHomeSession({
        intent: 'learning',
        size: 'full',
        ranking: nextPractice.ranking,
        pedagogyRanking: nextPractice.pedagogyRanking,
        practiceWave,
        activeGoal,
        goalPayoffCandidate: activeGoalPayoffCandidate,
        goalTargetDate: activeGoalRecord?.targetDate,
        deadlinePacing: nextPractice.deadlinePacing,
        atomicStates,
        now: new Date(recommendationNowMs).toISOString(),
      }),
    [
      activeGoal,
      activeGoalPayoffCandidate,
      activeGoalRecord?.targetDate,
      atomicStates,
      nextPractice.deadlinePacing,
      nextPractice.pedagogyRanking,
      nextPractice.ranking,
      practiceWave,
      recommendationNowMs,
    ],
  );
  const practiceCards = useMemo(() => {
    const composed = composePracticeCards({
      plan: profileHomeSession?.plan,
      ranking: nextPractice.pedagogyRanking ?? [],
      due_reviews: atomicReviews,
      ...(profileHomeSession?.goalPath
        ? { goal_path: profileHomeSession.goalPath }
        : {}),
    });
    const playable = composed.cards.flatMap((card) => {
      const options = card.options.filter((option) =>
        nextPractice.ranking.some(
          (ranked) => ranked.candidate.id === option.candidate_id,
        ),
      );

      return options.length > 0 ? [{ ...card, options }] : [];
    });

    return {
      cards: playable,
      evidence_signature: composed.evidence_signature,
    };
  }, [
    atomicReviews,
    nextPractice.pedagogyRanking,
    nextPractice.ranking,
    profileHomeSession,
  ]);
  const weeklyPracticeSet = useMemo(
    () =>
      selectWeeklyPracticeSet({
        cards: practiceCards,
        rhythm: practiceRhythm,
        rotation: practiceSetRotation,
      }),
    [practiceCards, practiceRhythm, practiceSetRotation],
  );
  const weeklyRhythm = useMemo(
    () =>
      buildWeeklyRhythm({
        days: gamification.days,
        rhythm: practiceRhythm,
        now: new Date(recommendationNowMs),
      }),
    [gamification.days, practiceRhythm, recommendationNowMs],
  );
  const weeklyRecap = useMemo(
    () =>
      buildWeeklyMusicalRecap({
        runs: practiceHistory.map(({ summary }) => summary),
        states: atomicStates,
        recommendation: nextPractice.recommendation,
        now: new Date(recommendationNowMs),
      }),
    [
      atomicStates,
      nextPractice.recommendation,
      practiceHistory,
      recommendationNowMs,
    ],
  );
  const bestAudition = useMemo(
    () =>
      bestSongSectionAudition(
        practiceHistory.map(({ summary }) => summary),
        activeGoal?.song_id,
      ),
    [activeGoal?.song_id, practiceHistory],
  );
  const [activePracticeWave, setActivePracticeWave] = useState<{
    result: PracticeWaveResult;
    index: number;
  }>();
  const rescanLibrary = useCallback(() => {
    window.electron.ipcRenderer.sendMessage('rescan-songs', false);
  }, []);

  useLessonAutoRescan({
    songList,
    isLessonsTabActive: !songOpen && view === 'journey',
    totalLessons: lessonProgress.totalLessons,
    isScanning: scanProgress !== undefined,
    rescan: rescanLibrary,
  });

  const librarySongs = useMemo(
    () => songList.filter((song) => !isLessonSong(song)),
    [songList],
  );
  // Background, bounded-concurrency parse of the player's own local charts
  // so the shelf's default "Difficulty" sort can use the real My Wave
  // learner-relative score instead of a fabricated tie — see
  // use-library-difficulty-charts.ts. Only requested while Songs is the
  // open tab; a song whose chart never resolves stays honestly unrated.
  const { charts: libraryDifficultyCharts, settled: libraryDifficultySettled } =
    useLibraryDifficultyCharts(
      librarySongs,
      !songOpen && (view === 'songs' || view === 'insights'),
    );
  const patternFamilies = useMemo(
    () =>
      cluster_pattern_figures(
        [...libraryDifficultyCharts.entries()].flatMap(
          ([itemId, chart]) =>
            decompose_chart_patterns(chart, { item_id: itemId }).figures,
        ),
      ),
    [libraryDifficultyCharts],
  );
  const patternProfile = useMemo(
    () =>
      patternFamilies.length === 0
        ? undefined
        : build_pattern_player_profile({
            families: patternFamilies,
            history: {
              runs: practiceHistory.map(({ summary }) => summary),
              archived_events: Object.values(
                gamification.atomicSkillEvidenceArchiveBySong ?? {},
              ).flat(),
            },
          }),
    [
      gamification.atomicSkillEvidenceArchiveBySong,
      patternFamilies,
      practiceHistory,
    ],
  );
  // Every song whose parse settled with no learner-relative score — a
  // ready song row says "Unrated" once instead of leaving the rated/
  // unrated boundary invisible. Never includes a song still parsing.
  const unratedSongIds = useMemo(
    () =>
      new Set(
        librarySongs
          .filter(
            (song) =>
              libraryDifficultySettled.has(song.id) &&
              !libraryDifficultyCharts.has(song.id),
          )
          .map((song) => song.id),
      ),
    [librarySongs, libraryDifficultySettled, libraryDifficultyCharts],
  );
  const { loadAchievements } = gamification;

  useEffect(() => {
    if (view === 'home') {
      loadAchievements();
    }
  }, [loadAchievements, view]);

  const handleSearchImported = useCallback(
    (song: Song) => {
      addSong(song);
      navigate(`/${song.id}`);
    },
    [addSong, navigate],
  );
  // One continuous shelf: the unified model merges local songs with the
  // Drums/Favorites source rows, in learner-relative difficulty order by
  // default. Lesson songs stay out of the default view (Journey owns them)
  // but a deliberate search still surfaces one, same as before.
  const lessonManifests = useMemo(
    () => buildLessonManifests(lessonProgress.entries),
    [lessonProgress.entries],
  );
  const libraryNow = useMemo(
    () => new Date(recommendationNowMs).toISOString(),
    [recommendationNowMs],
  );
  const unifiedEntries = useMemo(
    () =>
      build_unified_library({
        songs: songList,
        sources: yandexSources,
        manifests: lessonManifests,
        charts: libraryDifficultyCharts,
        atomicStates,
        now: libraryNow,
      }),
    [
      songList,
      yandexSources,
      lessonManifests,
      libraryDifficultyCharts,
      atomicStates,
      libraryNow,
    ],
  );
  // The default shelf never shows a lesson song — Journey owns the
  // curriculum, and mixing it into "Songs" would put the same content on
  // two routes. The header count must describe that same population, or it
  // makes a claim the row list can never back up: this fixture's real
  // local library is entirely the lesson curriculum (170 songs, all
  // lessons), so counting them here used to produce "170 ready to play"
  // on a screen that can never show a single one of those 170 rows — see
  // docs/design-qa/2026-08-13-finish/critique.md, Songs finding 2.
  const browsableEntries = useMemo(
    () =>
      unifiedEntries.filter(
        (entry) => !(entry.song && isLessonSong(entry.song)),
      ),
    [unifiedEntries],
  );
  const searchableEntries = useMemo(
    () => (nameFilter.trim() ? unifiedEntries : browsableEntries),
    [unifiedEntries, browsableEntries, nameFilter],
  );
  const matches = useMemo(
    () => search_unified_library(searchableEntries, nameFilter),
    [searchableEntries, nameFilter],
  );
  const visibleEntries = useMemo(() => {
    const ordered = order_unified_library(
      filter_unified_library(matches, readinessFilter),
      sort,
    );

    // `order_unified_library`'s 'difficulty' sort ranks by each entry's
    // real My Wave learner-relative score (unified-library.ts's
    // `song_difficulty`, fed by `libraryDifficultyCharts` above). A song
    // whose chart has not resolved yet (still parsing, or a source-row
    // suggestion with no local chart at all) has no known difficulty and
    // ties at the end of its readiness group rather than fabricating a
    // value — see docs/visual-system-v3.md's "difficulty" rule and
    // docs/design-acceptance-notes.md. Readiness still wins the outer
    // partition: an unresolved "Needs proof" suggestion from
    // Favorites/Drums must never rank ahead of a song the header's own "N
    // ready to play" count already promises can play right now, formerly
    // tracked as docs/design-qa/2026-08-13-finish/critique.md, Songs
    // finding 2. This mirrors the existing 'ready' sort's own tie-break —
    // the 'Difficulty' chip stays the default and keeps its real order
    // within each group as charts finish parsing in the background.
    if (sort !== 'difficulty') {
      return ordered;
    }

    const ready = ordered.filter((entry) => entry.ready);
    const notReady = ordered.filter((entry) => !entry.ready);

    return [...ready, ...notReady];
  }, [matches, readinessFilter, sort]);
  const trimmedNameFilter = nameFilter.trim();
  const favouriteSongIds = useMemo(
    () => favourite_song_ids(songList, yandexTasteSeededSongIds),
    [songList, yandexTasteSeededSongIds],
  );
  const inZoneSongIds = useMemo(
    () =>
      nextPractice.ranking
        .filter(
          ({ candidate, predictedSuccess }) =>
            candidate.kind === 'song' &&
            predictedSuccess >= 0.45 &&
            predictedSuccess <= 0.9,
        )
        .map(({ candidate }) => candidate.id),
    [nextPractice.ranking],
  );
  const actionableLibrary = useMemo(
    () =>
      build_actionable_library_shelves({
        entries: browsableEntries,
        inZoneSongIds,
        favouriteSongIds,
      }),
    [browsableEntries, favouriteSongIds, inZoneSongIds],
  );
  const isBrowsingLibrary =
    showEntireLibrary ||
    trimmedNameFilter.length > 0 ||
    readinessFilter !== 'all' ||
    sort !== 'difficulty';
  const offerYoutube = useMemo(
    () =>
      youtubeImportAvailable &&
      should_offer_youtube(unifiedEntries, nameFilter),
    [youtubeImportAvailable, unifiedEntries, nameFilter],
  );
  // "In your library" must mean songs he actually owns — a source-row
  // entry is an unresolved suggestion pulled from a Yandex playlist, never
  // downloaded, charted, or added. Folding it into the same count produced
  // a header that argued with its own rows: "N in your library" over a
  // screen where every visible row says "Not in your library yet" (see
  // docs/design-qa/2026-08-13-finish/critique.md, Songs finding 2 — the
  // fix for the alphabetical-order half of that finding must not
  // reintroduce the same contradiction from the other side).
  const songCount = useMemo(
    () => browsableEntries.filter((entry) => entry.kind === 'song').length,
    [browsableEntries],
  );
  const suggestionCount = browsableEntries.length - songCount;
  const readyCount = useMemo(
    () => browsableEntries.filter((entry) => entry.ready).length,
    [browsableEntries],
  );
  // A song can carry a past score yet no longer be playable — its audio or
  // chart went missing after a bad download/rescan (see
  // docs/bug-hunt-20260812.md's downloadSong.ts audio-gate gap). The
  // featured "Continue practicing" row must honor the same honest `ready`
  // state every other row does, or it becomes the single most prominent
  // dead play button in the view.
  const readySongIds = useMemo(
    () =>
      new Set(
        unifiedEntries
          .filter((entry) => entry.kind === 'song' && entry.ready)
          .map((entry) => entry.song!.id),
      ),
    [unifiedEntries],
  );
  const continuedSong = librarySongs.find(
    (song) =>
      song.scoreData?.[difficulty] !== undefined && readySongIds.has(song.id),
  );
  const continuedScore = continuedSong?.scoreData?.[difficulty];
  const continuedAccuracy = continuedScore
    ? calculateAccuracy(continuedScore)
    : undefined;
  const shelfSubtitle = trimmedNameFilter
    ? `${matches.length} ${
        matches.length === 1 ? 'match' : 'matches'
      } for “${trimmedNameFilter}”`
    : suggestionCount > 0
    ? `${songCount} in your library · ${readyCount} ready to play · ${suggestionCount} to add from your playlists`
    : `${songCount} in your library · ${readyCount} ready to play`;

  useEffect(() => {
    return window.electron.ipcRenderer.on<
      IpcResult<IpcResolveLibraryCandidatesResponse>
    >('resolve-library-candidates', (response) => {
      if (isIpcError(response)) {
        setResolvingCandidateIds(new Set());

        return;
      }

      setCandidateResolutions((previous) => ({
        ...previous,
        ...Object.fromEntries(
          response.results.map((result) => [result.trackId, result]),
        ),
      }));
      setResolvingCandidateIds((previous) => {
        const next = new Set(previous);

        for (const result of response.results) {
          next.delete(result.trackId);
        }

        return next;
      });
    });
  }, []);

  const resolveCandidate = useCallback(
    (track: YandexPlaylistCandidate) => {
      const collection = yandexSources.drums.tracks.some(
        ({ id }) => id === track.id,
      )
        ? yandexSources.drums
        : yandexSources.favorites;

      setResolvingCandidateIds((previous) => new Set(previous).add(track.id));
      window.electron.ipcRenderer.sendMessage('resolve-library-candidates', {
        sources: [candidateProvenance(collection, track)],
      });
    },
    [yandexSources],
  );
  const autoChartCandidate = useCallback(
    (track: YandexPlaylistCandidate) => {
      if (track.durationSeconds === null) {
        return;
      }

      const collection = yandexSources.drums.tracks.some(
        ({ id }) => id === track.id,
      )
        ? yandexSources.drums
        : yandexSources.favorites;

      window.electron.ipcRenderer.sendMessage('create-auto-chart', {
        localFile: true,
        sourceProvenance: candidateProvenance(collection, track),
      });
    },
    [yandexSources],
  );
  // The row-level "Use local audio" fix for a song already linked to a
  // source track — same IPC shape as `autoChartCandidate` above, just keyed
  // off the song's own carried provenance instead of a still-unresolved
  // source row.
  const autoChartSong = useCallback((song: Song) => {
    if (!song.sourceProvenance) {
      return;
    }

    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      localFile: true,
      sourceProvenance: song.sourceProvenance,
    });
  }, []);

  if (
    nameFilter !== prevNameFilter ||
    sort !== prevSort ||
    readinessFilter !== prevReadinessFilter
  ) {
    setPrevNameFilter(nameFilter);
    setPrevSort(sort);
    setPrevReadinessFilter(readinessFilter);
    setFocusedSongIndex(undefined);
  }

  const moveSortFocus = (delta: number) => {
    const next = wrapSortIndex(focusedSortIndex, delta);

    setFocusedSortIndex(next);
    setSort(sortForIndex(next));
  };
  const openSort = () => {
    setFocusedSortIndex(sortIndexForKey(sort));
    setIsSortOpen(true);
  };
  const openManualPractice = (id: string) => {
    const recommendation = recommendNextPractice({
      candidates: practiceCandidates.filter((candidate) => candidate.id === id),
      history: practiceHistory,
      coachEvidence: persistedCoachEvidence,
      weakLanes: gamification.laneAccuracy,
      nowMs: Date.now(),
      limit: 1,
    }).recommendation;
    const params = new URLSearchParams({ gameMode: 'practice' });

    if (recommendation) {
      params.set('practiceSpeed', recommendation.suggestedSpeed.toFixed(1));
    }

    navigate(`/${id}?${params.toString()}`);
  };
  const play = async (id: string) => {
    if (gameModeSelector.isOpen) {
      return;
    }

    const song = songList.find((s) => s.id === id);
    const gameMode = await gameModeSelector.open(song?.drumDifficulties);

    if (gameMode === 'practice') {
      openManualPractice(id);
    } else if (gameMode) {
      navigate(`/${id}?gameMode=${gameMode}`);
    }
  };
  const playLesson = (entry: LessonEntry) => {
    // Lesson charts only ever have one charted difficulty (Expert). Force
    // the app to that difficulty before opening it, regardless of whatever
    // difficulty tab the user had selected for the regular library — else
    // the song view can try to load a track the lesson never charted.
    const targetDifficulty = highestAvailableDifficulty(entry.song);

    if (targetDifficulty && targetDifficulty !== difficulty) {
      setDifficulty(targetDifficulty);
    }

    // A lesson is already an instructional choice. Showing the general
    // song-mode picker here makes a seated player walk back to the laptop
    // just to repeat that choice. Lessons therefore always enter their own
    // chart directly in Practice; SongView remains responsible for its
    // deliberate ready cue and count-in, so this does not start audio early.
    const authoredStartSpeed =
      entry.lesson.bpmStart && entry.lesson.bpmTarget
        ? entry.lesson.bpmStart / entry.lesson.bpmTarget
        : 0.8;
    const practiceSpeed = Math.min(1, Math.max(0.7, authoredStartSpeed));
    const params = new URLSearchParams({
      gameMode: 'practice',
      practiceSpeed: practiceSpeed.toFixed(1),
    });

    navigate(`/${entry.song.id}?${params.toString()}`);
  };
  const startRecommendedPractice = useCallback(
    (completedRun?: PracticeHistoryEntry) => {
      const history = appendCompletedRun(practiceHistory, completedRun);
      const activeCurrentId =
        activePracticeWave?.result.stops[activePracticeWave.index]
          ?.recommendation.candidate.id;
      const activeNextStop =
        completedRun &&
        activePracticeWave &&
        activeCurrentId === completedRun.candidateId
          ? activePracticeWave.result.stops[activePracticeWave.index + 1]
          : undefined;
      let wave = activePracticeWave?.result;
      let waveIndex = activePracticeWave?.index ?? 0;

      if (activeNextStop) {
        waveIndex += 1;
      } else {
        const result = recommendNextPractice({
          candidates: practiceCandidates,
          history,
          coachEvidence: [
            ...persistedCoachEvidence,
            ...(completedRun?.summary.coachEvidence ?? []),
          ],
          nowMs: Date.now(),
          limit: 12,
        });

        wave = buildPracticeWave({ ranking: result.ranking, history });
        waveIndex = 0;
      }

      const recommendation =
        activeNextStop?.recommendation ??
        wave?.stops[waveIndex]?.recommendation;

      if (!recommendation) {
        setActivePracticeWave(undefined);
        setView('songs');

        return;
      }

      if (wave) {
        setActivePracticeWave({ result: wave, index: waveIndex });
      }

      if (recommendation.candidate.difficulty !== difficulty) {
        setDifficulty(recommendation.candidate.difficulty);
      }

      const params = new URLSearchParams({
        gameMode: 'practice',
        autoStart: '1',
        practiceSpeed: recommendation.suggestedSpeed.toFixed(1),
      });

      navigate(`/${recommendation.candidate.id}?${params.toString()}`);
    },
    [
      activePracticeWave,
      difficulty,
      navigate,
      persistedCoachEvidence,
      practiceCandidates,
      practiceHistory,
      setDifficulty,
    ],
  );
  const launchPractice = useCallback(
    (
      recommendation: RankedPracticeCandidate,
      practiceSpeed: number,
      context?: PracticeLaunchContext,
    ) => {
      const waveIndex = practiceWave.stops.findIndex(
        ({ recommendation: waveRecommendation }) =>
          waveRecommendation.candidate.id === recommendation.candidate.id,
      );
      const wave =
        waveIndex === -1
          ? buildPracticeWave({
              ranking: [recommendation],
              history: practiceHistory,
            })
          : practiceWave;

      setActivePracticeWave({
        result: wave,
        index: Math.max(0, waveIndex),
      });

      if (recommendation.candidate.difficulty !== difficulty) {
        setDifficulty(recommendation.candidate.difficulty);
      }

      const params = new URLSearchParams({
        gameMode: 'practice',
        practiceSpeed: practiceSpeed.toFixed(1),
      });

      if (!context?.audition) {
        params.set('autoStart', '1');
      }

      if (context?.card) {
        params.set('practiceCardKind', context.card.kind);
        params.set('practiceCardCandidate', context.card.candidate_id);
        params.set('practiceCardSource', context.card.source_label);
      }

      if (context?.audition) {
        params.set('audition', '1');
        params.set('auditionStart', String(context.audition.start_bar));
        params.set('auditionEnd', String(context.audition.end_bar));
        params.set('auditionLabel', context.audition.section_label);
        params.set('auditionTest', context.audition.test_label);
        params.set('auditionSkill', context.audition.required_skill_id);
      }

      navigate(`/${recommendation.candidate.id}?${params.toString()}`);
    },
    [difficulty, navigate, practiceHistory, practiceWave, setDifficulty],
  );
  const startComposedSession = useCallback(
    (session: OneKickHomeSession) =>
      launchPractice(session.launch, session.launchSpeed),
    [launchPractice],
  );
  const startTargetedPractice = useCallback(() => {
    if (nextPractice.recommendation) {
      launchPractice(
        nextPractice.recommendation,
        nextPractice.recommendation.suggestedSpeed,
      );
    }
  }, [launchPractice, nextPractice.recommendation]);
  const startPracticeCard = useCallback(
    (option: PracticeCardOption) => {
      const recommendation = nextPractice.ranking.find(
        (ranked) => ranked.candidate.id === option.candidate_id,
      );

      if (recommendation) {
        launchPractice(recommendation, option.speed, {
          card: option,
          ...(option.audition ? { audition: option.audition } : {}),
        });
      }
    },
    [launchPractice, nextPractice.ranking],
  );
  const startSectionAudition = useCallback(() => {
    const audition = profileHomeSession?.goalPath?.next_song_probe;
    const recommendation = audition
      ? nextPractice.ranking.find(
          (ranked) => ranked.candidate.id === audition.song_id,
        )
      : undefined;

    if (audition && recommendation) {
      launchPractice(recommendation, audition.speed, { audition });
    }
  }, [launchPractice, nextPractice.ranking, profileHomeSession?.goalPath]);
  const refreshPracticeSet = useCallback(() => {
    setPracticeSetRotation(
      (current) =>
        Object.fromEntries(
          ['review', 'build', 'apply'].map((kind) => [
            kind,
            (current[kind as PracticeCardKind] ?? 0) + 1,
          ]),
        ) as Partial<Record<PracticeCardKind, number>>,
    );
  }, [setPracticeSetRotation]);

  useEffect(() => {
    const lessonId = searchParams.get('coachLesson');

    if (!lessonId) {
      return;
    }

    const entry = lessonProgress.groups
      .flatMap((group) => group.entries)
      .find((candidate) => candidate.lesson.id === lessonId);

    if (!entry) {
      return;
    }

    const targetDifficulty = highestAvailableDifficulty(entry.song);

    if (targetDifficulty && targetDifficulty !== difficulty) {
      setDifficulty(targetDifficulty);
    }

    const authoredStartSpeed =
      entry.lesson.bpmStart && entry.lesson.bpmTarget
        ? entry.lesson.bpmStart / entry.lesson.bpmTarget
        : 0.8;
    const practiceSpeed = Math.min(1, Math.max(0.7, authoredStartSpeed));
    const params = new URLSearchParams({
      gameMode: 'practice',
      practiceSpeed: practiceSpeed.toFixed(1),
    });

    navigate(`/${entry.song.id}?${params.toString()}`, { replace: true });
  }, [difficulty, lessonProgress, navigate, searchParams, setDifficulty]);

  const libraryInputHandlers: InputControlHandlers = isSortOpen
    ? {
        up: () => moveSortFocus(-1),
        down: () => moveSortFocus(1),
        confirm: () => setIsSortOpen(false),
        back: () => setIsSortOpen(false),
      }
    : {
        up: () => {
          if (!isBrowsingLibrary) {
            setShowEntireLibrary(true);
          }

          setFocusedSongIndex((index) =>
            nextSongIndex(index, visibleEntries.length, -1),
          );
        },
        down: () => {
          if (!isBrowsingLibrary) {
            setShowEntireLibrary(true);
          }

          setFocusedSongIndex((index) =>
            nextSongIndex(index, visibleEntries.length, 1),
          );
        },
        confirm: () => {
          if (!isBrowsingLibrary) {
            setShowEntireLibrary(true);

            return;
          }

          if (focusedSongIndex === undefined) {
            return;
          }

          const entry = visibleEntries[focusedSongIndex];

          // Rows that are not playable must never act playable, from a
          // physical pad exactly as from a click.
          if (!entry || !entry.ready || !entry.song) {
            return;
          }

          if (libraryControls.kitActions.includes('confirm')) {
            // The kit path never shows the mode/difficulty picker `play()`
            // opens for a mouse click — it goes straight to Practice. A row
            // can be `ready` while only charted at a difficulty other than
            // the globally selected tab (e.g. hard-only while Expert is
            // selected), so a strike here must land on the song's own
            // honest difficulty, not silently try to load a track it never
            // charted — same fix as `playLesson` already applies.
            const targetDifficulty = candidateDifficulty(
              entry.song,
              difficulty,
            );

            if (targetDifficulty && targetDifficulty !== difficulty) {
              setDifficulty(targetDifficulty);
            }

            openManualPractice(entry.song.id);
          } else {
            play(entry.song.id);
          }
        },
        back: () => setView('home'),
        sort: () => openSort(),
        difficulty: () => setDifficulty(nextDifficulty(difficulty)),
      };

  return (
    <StemToolsProvider value={stemTools}>
      {gameModeSelector.element}

      {!songOpen && !gameModeSelector.isOpen && view === 'songs' && (
        <LibraryInputControls
          mapping={libraryControls.mapping}
          handlers={libraryInputHandlers}
        />
      )}

      <AppShell
        view={view}
        onViewChange={setView}
        runOpen={songOpen}
        statusSlot={
          <GamificationHeaderStrip
            isLoaded={gamification.isLoaded}
            streak={gamification.streak}
            todayXp={gamification.todayXp}
            goalXp={gamification.goalXp}
            goalOption={gamification.goalOption}
            onChangeGoal={gamification.setGoalOption}
            weekActivity={gamification.weekActivity}
            totalStars={gamification.totalStars}
            practiceRhythm={practiceRhythm}
            onOpenStats={() => {
              gamification.loadAchievements();
              setIsStatsOpen(true);
            }}
          />
        }
        settingsSlot={
          <SettingsButton
            page="song-list"
            scanPercent={scanPercent}
            hoverPreviewEnabled={hoverPreviewEnabled}
            onHoverPreviewEnabledChange={setHoverPreviewEnabled}
          />
        }
        onOpenProfile={() => {
          gamification.loadAchievements();
          setView('insights');
        }}
      >
        {!songOpen && view === 'home' && (
          <HomeCockpit
            songList={songList}
            gamification={gamification}
            recommendation={nextPractice.recommendation}
            practiceRanking={nextPractice.ranking}
            pedagogyRanking={nextPractice.pedagogyRanking}
            practiceWave={practiceWave}
            activeGoal={activeGoal}
            goalPayoffCandidate={activeGoalPayoffCandidate}
            goalTargetDate={activeGoalRecord?.targetDate}
            deadlinePacing={nextPractice.deadlinePacing}
            atomicStates={atomicStates}
            dueReviews={atomicReviews}
            onStartRecommended={() => startRecommendedPractice()}
            onStartSession={startComposedSession}
            onStartPracticeCard={startPracticeCard}
            onOpenSongs={() => setView('songs')}
            onOpenJourney={() => setView('journey')}
            onFindNewMusic={() => {
              setView('songs');
              window.requestAnimationFrame(() => {
                document
                  .querySelector<HTMLInputElement>(
                    '[data-testid="song-search"]',
                  )
                  ?.focus();
              });
            }}
            onStartSong={(song) => openManualPractice(song.id)}
            onOpenProfile={() => {
              gamification.loadAchievements();
              setView('insights');
            }}
          />
        )}

        {!songOpen && view === 'insights' && (
          <ProfileView
            songList={librarySongs}
            goals={goals.goals}
            isGoalsLoaded={goals.isLoaded}
            onSaveGoal={goals.saveGoal}
            onSetPrimaryGoal={goals.setPrimaryGoal}
            gamification={gamification}
            insights={{
              recommendation: nextPractice.recommendation,
              atomicStates,
              dueReviews: atomicReviews,
              deadlinePacing: nextPractice.deadlinePacing,
              rejectedAtomicEvidenceCount:
                atomicStateReplay.rejected_events.length,
              latestRun: gamification.latestRun?.summary,
              patternProfile,
              practiceCards,
              weeklySet: weeklyPracticeSet,
              weeklyRhythm,
              weeklyRecap,
              bestAudition,
              auditionAvailable: Boolean(
                profileHomeSession?.goalPath?.next_song_probe &&
                  nextPractice.ranking.some(
                    (ranked) =>
                      ranked.candidate.id ===
                      profileHomeSession.goalPath?.next_song_probe?.song_id,
                  ),
              ),
            }}
            onStartTargetedPractice={startTargetedPractice}
            onStartPracticeCard={startPracticeCard}
            onPracticeRhythmChange={setPracticeRhythm}
            onRefreshPracticeSet={refreshPracticeSet}
            onStartAudition={startSectionAudition}
            onOpenLesson={(lessonId) => {
              const entry = lessonProgress.entries.find(
                ({ lesson }) => lesson.id === lessonId,
              );

              if (entry) {
                playLesson(entry);
              }
            }}
          />
        )}

        {!songOpen && view === 'journey' && (
          <LessonsView
            progress={lessonProgress}
            onPlay={playLesson}
            scanPercent={scanPercent}
            onRescan={rescanLibrary}
            onBack={() => setView('home')}
          />
        )}

        {!songOpen && view === 'songs' && (
          <section
            className="flex h-full min-h-0 flex-col"
            id="library-content"
          >
            <header className="border-b border-divider bg-transparent px-5 py-5">
              <div className="mx-auto flex w-full max-w-360 flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--dr-wine)]">
                      Practice library
                    </div>
                    <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.02em] text-text">
                      Your drum library
                    </h1>
                    <p
                      className="mt-1 text-sm text-text-muted"
                      role="status"
                      aria-live="polite"
                    >
                      {shelfSubtitle}
                    </p>
                  </div>
                </div>

                {continuedSong && continuedScore && (
                  <section
                    className="flex min-w-0 max-w-xl items-center gap-3 border-b border-border-soft pb-4"
                    data-testid="continue-practicing"
                    aria-labelledby="continue-practicing-title"
                  >
                    <img
                      src={continuedSong.albumCover ?? songArtPlaceholder}
                      alt=""
                      className="size-14 shrink-0 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-white/10"
                      onError={(event) => {
                        event.currentTarget.src = songArtPlaceholder;
                      }}
                    />
                    <div className="min-w-0 grow">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dr-wine)]">
                        Continue practicing
                      </div>
                      <h2
                        id="continue-practicing-title"
                        className="truncate font-display text-xl font-semibold leading-tight text-text-body"
                        title={continuedSong.name}
                      >
                        {continuedSong.name}
                      </h2>
                      <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                        <Stars
                          rating={getStarRating(continuedScore)}
                          perfect={continuedAccuracy === 1}
                          size="xs"
                          className="gap-1"
                        />
                        <span className="tabular-nums">
                          {Math.round((continuedAccuracy ?? 0) * 100)}% best
                        </span>
                      </div>
                    </div>
                    <Button
                      type="primary"
                      size="large"
                      className="min-h-11 shrink-0 border-none !bg-[var(--dr-ember)] hover:!bg-[var(--dr-ember-pressed)] focus:!bg-[var(--dr-ember-pressed)]"
                      icon={<FontAwesomeIcon icon={faPlay} />}
                      aria-label={`Play ${continuedSong.name}`}
                      onClick={() => play(continuedSong.id)}
                    >
                      Play
                    </Button>
                  </section>
                )}

                <div
                  className="flex flex-col gap-3"
                  data-testid="library-toolbar"
                >
                  <div
                    className="flex min-w-0 flex-wrap items-center gap-3"
                    data-testid="library-song-controls"
                  >
                    <div
                      className="min-w-64 grow"
                      data-testid="library-name-filter"
                    >
                      <SongSearch
                        disabled={currentPath === null}
                        inputTestId="song-search"
                        onQueryChange={setNameFilter}
                        active={offerYoutube}
                        onImported={handleSearchImported}
                      />
                    </div>

                    <div
                      className="flex shrink-0 flex-wrap items-center gap-1 rounded-xl bg-fill p-1"
                      role="group"
                      aria-label="Sort"
                    >
                      {LIBRARY_SORT_OPTIONS.map((option) => (
                        <Button
                          key={option.key}
                          size="small"
                          type="text"
                          className={cn(
                            sort === option.key &&
                              '!bg-[var(--dr-paper)] !text-[var(--dr-ink)] !outline-2 !-outline-offset-2 !outline-[var(--dr-wine)]',
                          )}
                          data-testid={`sort-option-${option.key}`}
                          aria-pressed={sort === option.key}
                          onClick={() => setSort(option.key)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>

                    <Button
                      size="small"
                      type="text"
                      className={cn(
                        readinessFilter === 'ready' &&
                          '!bg-[var(--dr-paper)] !text-[var(--dr-ink)] !outline-2 !-outline-offset-2 !outline-[var(--dr-wine)]',
                      )}
                      data-testid="library-ready-filter"
                      aria-pressed={readinessFilter === 'ready'}
                      onClick={() =>
                        setReadinessFilter((current) =>
                          current === 'ready' ? 'all' : 'ready',
                        )
                      }
                    >
                      Ready only
                    </Button>

                    {showEntireLibrary &&
                    trimmedNameFilter.length === 0 &&
                    readinessFilter === 'all' &&
                    sort === 'difficulty' ? (
                      <Button
                        size="small"
                        type="text"
                        data-testid="show-actionable-shelves"
                        onClick={() => {
                          setShowEntireLibrary(false);
                          setFocusedSongIndex(undefined);
                        }}
                      >
                        Back to picks
                      </Button>
                    ) : null}
                  </div>
                  {
                    // With no kit or keyboard control mapped at all, there is
                    // nothing honest to say here — "Navigation unavailable ·
                    // Set library controls in Configure input" is a debug
                    // string about missing settings, not something he would
                    // ever say himself, and it has no business sitting under
                    // the filter chips of the main library route (see
                    // docs/design-qa/2026-08-13-finish/critique.md, Songs
                    // finding 3). Mouse and Tab/Enter still work with no
                    // legend at all; the real fact — no kit control mapped —
                    // belongs in Settings, one intentional action away.
                    libraryControls.source !== 'unavailable' && (
                      <div
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted"
                        role="status"
                        aria-live="polite"
                        data-testid="library-control-legend"
                        data-control-source={libraryControls.source}
                      >
                        <span className="font-semibold text-text-body">
                          {libraryControls.source === 'kit-lanes'
                            ? 'Kit navigation'
                            : libraryControls.source === 'mixed'
                            ? 'Mixed navigation'
                            : 'Mapped navigation'}
                        </span>
                        {(libraryControls.source === 'kit-lanes' ||
                          libraryControls.source === 'mixed') && (
                          <div
                            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
                            data-testid="library-kit-control-commands"
                          >
                            {libraryMoveSteps.length > 0 && (
                              <KitCommandPrompt
                                compact
                                model={{
                                  label: 'Move',
                                  steps: libraryMoveSteps,
                                  relationship: 'alternatives',
                                  stepHints: libraryMoveHints,
                                }}
                              />
                            )}
                            {libraryControls.kitActions.includes('confirm') && (
                              <KitCommandPrompt
                                compact
                                model={{ label: 'Choose', steps: ['snare'] }}
                              />
                            )}
                            {libraryControls.kitActions.includes(
                              'difficulty',
                            ) && (
                              <KitCommandPrompt
                                compact
                                model={{
                                  label: 'Difficulty',
                                  steps: ['hihat'],
                                }}
                              />
                            )}
                            {libraryControls.kitActions.includes('sort') && (
                              <KitCommandPrompt
                                compact
                                model={{ label: 'Sort', steps: ['tom3'] }}
                              />
                            )}
                            {libraryControls.kitActions.includes('back') && (
                              <KitCommandPrompt
                                compact
                                model={{ label: 'Back', steps: ['crash'] }}
                              />
                            )}
                          </div>
                        )}
                        <span
                          className={
                            libraryControls.source === 'kit-lanes' ||
                            libraryControls.source === 'mixed'
                              ? 'sr-only'
                              : undefined
                          }
                        >
                          {libraryControls.legend}
                        </span>
                        {libraryControls.kitActions.includes('confirm') && (
                          <span>Local choices open directly in Practice.</span>
                        )}
                      </div>
                    )
                  }
                  {libraryCandidates.error && (
                    <p
                      className="text-xs text-[var(--dr-warning)]"
                      role="status"
                    >
                      Drums and Favorites didn’t load: {libraryCandidates.error}
                      . Your own songs still work.
                    </p>
                  )}
                </div>
              </div>
            </header>

            <div className="relative mx-auto flex min-h-0 w-full max-w-360 grow flex-col overflow-hidden bg-transparent">
              {!isBrowsingLibrary && visibleEntries.length > 0 ? (
                <ActionableSongShelves
                  shelves={actionableLibrary.shelves}
                  sourceSeededSongIds={yandexTasteSeededSongIds}
                  restCount={actionableLibrary.rest.length}
                  difficulty={difficulty}
                  splittingIds={splittingIds}
                  onPlaySong={play}
                  onLikeChange={handleLikeChange}
                  onSplit={handleSplit}
                  onBrowseAll={() => setShowEntireLibrary(true)}
                />
              ) : visibleEntries.length > 0 ? (
                <LibraryCandidateList
                  entries={visibleEntries}
                  difficulty={difficulty}
                  previewEnabled={hoverPreviewEnabled}
                  focusedIndex={!isSortOpen ? focusedSongIndex : undefined}
                  scrollKey={`${nameFilter}:${sort}:${readinessFilter}:${showEntireLibrary}`}
                  resolutions={candidateResolutions}
                  resolvingTrackIds={resolvingCandidateIds}
                  canUseLocalAudio={currentPath !== null}
                  onPlaySong={play}
                  onResolveSource={resolveCandidate}
                  onUseLocalAudioForSource={autoChartCandidate}
                  onUseLocalAudioForSong={autoChartSong}
                  unratedSongIds={unratedSongIds}
                />
              ) : currentPath === null ? (
                <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-fill text-[var(--dr-wine)]">
                    <FontAwesomeIcon icon={faFolder} />
                  </div>
                  <h2 className="font-display text-2xl font-semibold text-text-body">
                    Choose your library folder
                  </h2>
                  <p className="text-sm leading-relaxed text-text-muted">
                    Open Settings, then select the folder where Drumroll will
                    keep your songs and progress.
                  </p>
                  <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-raised px-4 text-sm text-text-body">
                    <FontAwesomeIcon icon={faCog} />
                    <span>Settings</span>
                    <span aria-hidden="true">→</span>
                    <FontAwesomeIcon icon={faFolder} />
                    <span>Select folder</span>
                  </div>
                </section>
              ) : matches.length > 0 ? (
                <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
                  <h2 className="font-display text-2xl font-semibold text-text-body">
                    No ready songs
                    {trimmedNameFilter ? ` for “${trimmedNameFilter}”` : ''}
                  </h2>
                  <p className="text-sm leading-relaxed text-text-muted">
                    {matches.length} {matches.length === 1 ? "isn't" : "aren't"}{' '}
                    ready to play yet.
                  </p>
                  <Button
                    size="large"
                    className="min-h-11"
                    onClick={() => setReadinessFilter('all')}
                  >
                    Show all matches
                  </Button>
                </section>
              ) : trimmedNameFilter ? (
                offerYoutube ? (
                  <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
                    <h2 className="font-display text-2xl font-semibold text-text-body">
                      No matches in your library for “{trimmedNameFilter}”
                    </h2>
                    <p className="text-sm leading-relaxed text-text-muted">
                      Pick a result above to add it from YouTube.
                    </p>
                  </section>
                ) : (
                  <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
                    <h2 className="font-display text-2xl font-semibold text-text-body">
                      No matches for “{trimmedNameFilter}”
                    </h2>
                    <p className="text-sm leading-relaxed text-text-muted">
                      Try another title or artist, or clear the search to return
                      to your library.
                    </p>
                    <Button
                      size="large"
                      className="min-h-11"
                      onClick={() => setNameFilter('')}
                    >
                      Clear search
                    </Button>
                  </section>
                )
              ) : (
                <section className="m-auto flex max-w-md flex-col items-center gap-3 px-6 text-center">
                  <h2 className="font-display text-2xl font-semibold text-text-body">
                    Build your practice library
                  </h2>
                  <p className="text-sm leading-relaxed text-text-muted">
                    Search above to find and add any song.
                  </p>
                </section>
              )}
            </div>
          </section>
        )}
      </AppShell>

      <Drawer
        title="Your practice stats"
        open={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        destroyOnHidden
      >
        <StatsPanel
          streak={gamification.streak}
          weeklyXp={weeklyXp}
          goalXp={gamification.goalXp}
          totalStars={gamification.totalStars}
          laneAccuracy={gamification.laneAccuracy ?? []}
          achievements={gamification.achievements}
          practiceRhythm={practiceRhythm}
        />
      </Drawer>

      <div className="fixed inset-0 pointer-events-none z-100">
        <Outlet
          context={
            {
              gamification,
              recommendation:
                activePracticeWave?.result.stops[activePracticeWave.index]
                  ?.recommendation ?? nextPractice.recommendation,
              recommendationReason:
                activePracticeWave?.result.stops[activePracticeWave.index]
                  ?.reason ?? nextPractice.recommendation?.reason,
              continuePractice: startRecommendedPractice,
            } satisfies PracticeOutletContext
          }
        />
      </div>
    </StemToolsProvider>
  );
}
