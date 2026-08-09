import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Button, Drawer, Modal, Spin, Tooltip } from 'antd';
import { Difficulty } from 'scan-chart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMusic, faPlay } from '@fortawesome/free-solid-svg-icons';
import {
  Outlet,
  useNavigate,
  useOutlet,
  useSearchParams,
} from 'react-router-dom';
import appIcon from '../../../../assets/icon.png';
import { Song, YandexPlaylistCandidate } from '../../../types';
import { SongFilter } from '../../components/SongFilter';
import { SongList } from '../../components/SongList';
import { SettingsButton } from '../../components/SettingsButton';
import { SortButton } from '../../components/SortButton';
import { SplittingQueue } from '../../components/SplittingQueue';
import { EmptySongState } from '../../components/EmptySongState';
import { AutoChart } from '../../components/AutoChart';
import { SongImport } from '../../components/SongImport';
import { SongSearch } from '../../components/SongSearch';
import type { SongSearchRequest } from '../../components/SongSearch';
import { MyMusic } from '../../components/MyMusic';
import { LessonsView } from '../../components/LessonsView';
import { useApp } from '../../context/AppContext';
import { useInput } from '../../context/InputContext';
import { StemToolsProvider } from '../../context/StemToolsContext';
import { useStemTools } from '../../hooks/useStemTools';
import { useSongList } from '../../hooks/useSongList';
import { useDownload } from '../../hooks/useDownload';
import { useSongFilter } from '../../hooks/useSongFilter';
import { useLibraryCandidates } from '../../hooks/useLibraryCandidates';
import { useInputControls } from '../../hooks/useInputControls';
import { useGameModeSelector } from '../../hooks/useGameModeSelector';
import {
  highestAvailableDifficulty,
  isLessonSong,
  LessonEntry,
  LESSON_MASTERED_STARS,
  useLessonAutoRescan,
  useLessons,
} from '../../hooks/useLessons';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { Stars } from '../../components/Stars';
import { last7Dates, useGamification } from '../../hooks/useGamification';
import { GamificationHeaderStrip } from '../../components/GamificationHeaderStrip';
import { StatsPanel } from '../../components/StatsPanel';
import { localDateKey } from '../../services/streaks';
import { SaveGoalInput, SetGoalModal, useGoals } from '../../components/Goals';
import { AppShell, ArenaView } from '../../components/AppShell';
import { HomeCockpit } from '../../components/HomeCockpit';
import {
  PracticeCandidate,
  PracticeHistoryEntry,
  recommendNextPractice,
} from '../../services/next-practice';
import { PracticeOutletContext } from '../practice-context';
import {
  filterLibraryCandidates,
  LibraryCandidateList,
} from '../../components/LibraryCandidateList';
import {
  nextDifficulty,
  nextSongIndex,
  sortForFocusedIndex,
  sortIndexForKey,
  toggledSortForIndex,
  wrapSortIndex,
} from './helpers';

// Lazy-loaded: recharts (the Profile's mastery graph) is a meaningfully
// sized dependency the library header/song list never otherwise needs, so
// it ships in its own chunk that only loads the first time a player opens
// the Profile drawer, not on every app launch.
const ProfileView = lazy(() => import('../../components/Profile'));
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

function candidateDifficulty(
  song: Song,
  selected: Difficulty,
): Difficulty | undefined {
  if (!song.drumDifficulties || song.drumDifficulties.length === 0) {
    return selected;
  }

  if (song.drumDifficulties.includes(selected)) {
    return selected;
  }

  return [...DIFFICULTIES]
    .reverse()
    .find((difficulty) => song.drumDifficulties?.includes(difficulty));
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

export function SongListView() {
  const { currentPath, difficulty, setDifficulty } = useApp();
  const { controlMapping } = useInput();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const songOpen = useOutlet() !== null;
  const stemTools = useStemTools();
  const {
    songList,
    splittingIds,
    splitProgress,
    scanProgress,
    handleSplit,
    handleLikeChange,
    addSong,
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
  const gamification = useGamification(songList);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  // One goals instance, shared by the Profile drawer and the per-song "Set
  // a goal" menu entry below — mirrors `gamification` above: mounted once
  // here so both surfaces stay in sync off the same IPC round trips rather
  // than each keeping its own, possibly-stale copy.
  const goals = useGoals();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSetGoalOpen, setIsSetGoalOpen] = useState(false);
  const [goalModalSongId, setGoalModalSongId] = useState<string | undefined>(
    undefined,
  );
  const weeklyXp = useMemo(() => {
    const today = new Date();

    return last7Dates(today).map((date) => ({
      date,
      xp: gamification.days[localDateKey(date)]?.xp ?? 0,
    }));
  }, [gamification.days]);
  const {
    nameFilter,
    setNameFilter,
    libraryMode,
    setLibraryMode,
    sort,
    setSort,
    filteredSongList,
    onlineResults,
    onlineHasExactMatch,
    onlineTotal,
    onlineLoading,
    loadMore,
  } = useSongFilter(songList, difficulty);
  const libraryCandidates = useLibraryCandidates();
  const yandexSources = libraryCandidates.candidates?.yandex;
  const isYandexMode = libraryMode === 'drums' || libraryMode === 'favorites';
  const candidateSource =
    libraryMode === 'drums'
      ? yandexSources?.drums
      : libraryMode === 'favorites'
      ? yandexSources?.favorites
      : undefined;
  const filteredLibraryCandidates = useMemo(
    () => filterLibraryCandidates(candidateSource?.tracks ?? [], nameFilter),
    [candidateSource?.tracks, nameFilter],
  );
  const linkedCandidateIds = useMemo(() => {
    if (!candidateSource) {
      return new Set<string>();
    }

    return new Set(
      songList
        .map((song) => song.sourceProvenance)
        .filter(
          (source) =>
            source?.provider === candidateSource.source &&
            source.collectionId === candidateSource.playlist.id,
        )
        .map((source) => source!.trackId),
    );
  }, [candidateSource, songList]);
  const { downloadingIds, handleDownload } = useDownload(
    onlineResults,
    addSong,
  );
  const [focusedSongIndex, setFocusedSongIndex] = useState<number | undefined>(
    undefined,
  );
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [focusedSortIndex, setFocusedSortIndex] = useState(0);
  const sortAvailable = libraryMode === 'local';
  const [prevNameFilter, setPrevNameFilter] = useState(nameFilter);
  const [prevLibraryMode, setPrevLibraryMode] = useState(libraryMode);
  const [prevSort, setPrevSort] = useState(sort);
  const [prevSortAvailable, setPrevSortAvailable] = useState(sortAvailable);
  const gameModeSelector = useGameModeSelector();
  const [view, setView] = useState<ArenaView>('home');
  const [myMusicOpen, setMyMusicOpen] = useState(false);
  const [requestedSongSearch, setRequestedSongSearch] =
    useState<SongSearchRequest>();
  const [recommendationNowMs] = useState(() => Date.now());
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
            mastered: lesson.entry.bestStars >= LESSON_MASTERED_STARS,
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
          available: true,
          liked: song.liked,
          targetSpeed: 1,
          availableDifficulties: song.drumDifficulties,
          chartTotalNotes: song.scoreData?.[targetDifficulty]?.totalNotes,
        },
      ];
    });
  }, [difficulty, lessonProgress.entries, songList]);
  const practiceHistory = useMemo<PracticeHistoryEntry[]>(
    () =>
      Object.entries(gamification.runsBySong ?? {}).flatMap(
        ([candidateId, runs]) =>
          runs.map((summary) => ({ candidateId, summary })),
      ),
    [gamification.runsBySong],
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
        limit: 5,
      }),
    [
      gamification.laneAccuracy,
      practiceCandidates,
      practiceHistory,
      persistedCoachEvidence,
      recommendationNowMs,
    ],
  );
  const rescanLibrary = useCallback(() => {
    window.electron.ipcRenderer.sendMessage('rescan-songs', false);
  }, []);

  useLessonAutoRescan({
    songList,
    isLessonsTabActive: view === 'journey',
    totalLessons: lessonProgress.totalLessons,
    isScanning: scanProgress !== undefined,
    rescan: rescanLibrary,
  });

  const librarySongs = useMemo(
    () => songList.filter((song) => !isLessonSong(song)),
    [songList],
  );
  const continuedSong = librarySongs.find(
    (song) => song.scoreData?.[difficulty] !== undefined,
  );
  const continuedScore = continuedSong?.scoreData?.[difficulty];
  const continuedAccuracy = continuedScore
    ? calculateAccuracy(continuedScore)
    : undefined;
  const songsWithProgress = librarySongs.filter(
    (song) => song.scoreData?.[difficulty] !== undefined,
  ).length;
  const { loadAchievements } = gamification;

  // Home and Coach expose saved lane analytics on their first paint. The
  // request is intentionally scoped to those surfaces: the detailed Songs
  // library remains as light as it was before the cockpit existed.
  useEffect(() => {
    if (view === 'home' || view === 'coach') {
      loadAchievements();
    }
  }, [loadAchievements, view]);

  const handleSongImported = useCallback(
    (song: Song) => {
      addSong(song);
      setLibraryMode('local');
    },
    [addSong, setLibraryMode],
  );
  const findAndChartCandidate = useCallback(
    (track: YandexPlaylistCandidate) => {
      if (!candidateSource) {
        return;
      }

      const query = [track.title, ...track.artists].filter(Boolean).join(' ');

      setRequestedSongSearch((previous) => ({
        id: (previous?.id ?? 0) + 1,
        query,
        sourceProvenance: {
          provider: 'yandex-music',
          collectionId: candidateSource.playlist.id,
          collectionName: candidateSource.playlist.name,
          trackId: track.id,
          title: track.title,
          artists: [...track.artists],
          ...(track.sourceTrackUrl ? { sourceUrl: track.sourceTrackUrl } : {}),
        },
      }));
    },
    [candidateSource],
  );

  if (
    nameFilter !== prevNameFilter ||
    libraryMode !== prevLibraryMode ||
    sort !== prevSort
  ) {
    setPrevNameFilter(nameFilter);
    setPrevLibraryMode(libraryMode);
    setPrevSort(sort);
    setFocusedSongIndex(undefined);
  }

  if (sortAvailable !== prevSortAvailable) {
    setPrevSortAvailable(sortAvailable);

    if (!sortAvailable) {
      setIsSortOpen(false);
    }
  }

  const moveSortFocus = (delta: number) => {
    const next = wrapSortIndex(focusedSortIndex, delta);

    setFocusedSortIndex(next);
    setSort(sortForFocusedIndex(next, sort));
  };
  const toggleFocusedSortDirection = () => {
    const next = toggledSortForIndex(focusedSortIndex, sort);

    if (next) {
      setSort(next);
    }
  };
  const openSort = () => {
    if (!sortAvailable) {
      return;
    }

    setFocusedSortIndex(sortIndexForKey(sort.key));
    setIsSortOpen(true);
  };
  const play = async (id: string) => {
    if (gameModeSelector.isOpen) {
      return;
    }

    const song = songList.find((s) => s.id === id);
    const gameMode = await gameModeSelector.open(song?.drumDifficulties);

    if (gameMode) {
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

    play(entry.song.id);
  };
  const startRecommendedPractice = useCallback(
    (completedRun?: PracticeHistoryEntry) => {
      const result = recommendNextPractice({
        candidates: practiceCandidates,
        history: appendCompletedRun(practiceHistory, completedRun),
        coachEvidence: [
          ...persistedCoachEvidence,
          ...(completedRun?.summary.coachEvidence ?? []),
        ],
        nowMs: Date.now(),
        limit: 5,
      });
      const recommendation = result.recommendation;

      if (!recommendation) {
        setView('songs');

        return;
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
      difficulty,
      navigate,
      persistedCoachEvidence,
      practiceCandidates,
      practiceHistory,
      setDifficulty,
    ],
  );

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

    navigate(`/${entry.song.id}?gameMode=practice`, { replace: true });
  }, [difficulty, lessonProgress, navigate, searchParams, setDifficulty]);

  useInputControls(
    controlMapping,
    isSortOpen
      ? {
          up: () => moveSortFocus(-1),
          down: () => moveSortFocus(1),
          confirm: toggleFocusedSortDirection,
          back: () => setIsSortOpen(false),
        }
      : {
          up: () =>
            setFocusedSongIndex((index) =>
              nextSongIndex(index, filteredSongList.length, -1),
            ),
          down: () =>
            setFocusedSongIndex((index) =>
              nextSongIndex(index, filteredSongList.length, 1),
            ),
          confirm: () => {
            if (focusedSongIndex === undefined) {
              return;
            }

            const song = filteredSongList[focusedSongIndex];

            if (!song) {
              return;
            }

            if (libraryMode === 'local') {
              play(song.id);
            } else if (
              libraryMode === 'online' &&
              !songList.find(({ id }) => song.id === id)
            ) {
              handleDownload(song.id);
            }
          },
          sort: openSort,
          library: () =>
            setLibraryMode(libraryMode === 'online' ? 'local' : 'online'),
          difficulty: () => setDifficulty(nextDifficulty(difficulty)),
        },
    !songOpen && !gameModeSelector.isOpen && view === 'songs',
  );

  const openHomeCoach = () => {
    const coachSong =
      songList.find(
        (song) => song.id === nextPractice.recommendation?.candidate.id,
      ) ??
      librarySongs.find((song) => song.id === gamification.latestRun?.songId) ??
      continuedSong ??
      librarySongs[0];

    if (!coachSong) {
      setView('songs');

      return;
    }

    navigate(`/${coachSong.id}?gameMode=practice&coachOpen=1`);
  };

  return (
    <StemToolsProvider value={stemTools}>
      {gameModeSelector.element}

      <AppShell
        view={view}
        onViewChange={setView}
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
            onOpenStats={() => {
              gamification.loadAchievements();
              setIsStatsOpen(true);
            }}
          />
        }
        settingsSlot={
          <SettingsButton page="song-list" scanPercent={scanPercent} />
        }
        onOpenProfile={() => {
          gamification.loadAchievements();
          setIsProfileOpen(true);
        }}
      >
        {view === 'home' && (
          <HomeCockpit
            surface="home"
            songList={songList}
            difficulty={difficulty}
            lessonProgress={lessonProgress}
            gamification={gamification}
            recommendation={nextPractice.recommendation}
            onStartRecommended={() => startRecommendedPractice()}
            onOpenSongs={() => setView('songs')}
            onOpenJourney={() => setView('journey')}
            onOpenCoach={openHomeCoach}
          />
        )}

        {view === 'coach' && (
          <HomeCockpit
            surface="coach"
            songList={songList}
            difficulty={difficulty}
            lessonProgress={lessonProgress}
            gamification={gamification}
            recommendation={nextPractice.recommendation}
            onStartRecommended={() => startRecommendedPractice()}
            onOpenSongs={() => setView('songs')}
            onOpenJourney={() => setView('journey')}
            onOpenCoach={openHomeCoach}
          />
        )}

        {view === 'journey' && (
          <LessonsView
            progress={lessonProgress}
            onPlay={playLesson}
            scanPercent={scanPercent}
            onRescan={rescanLibrary}
          />
        )}

        {view === 'songs' && (
          <section
            className="flex h-full min-h-0 flex-col"
            id="library-content"
          >
            <header className="border-b border-divider bg-surface-raised/76 px-5 py-5">
              <div className="mx-auto flex w-full max-w-360 flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
                      Practice library
                    </div>
                    <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.02em] text-text">
                      Your drum library
                    </h1>
                    <p className="mt-1 text-sm text-text-muted">
                      {isYandexMode
                        ? `${
                            candidateSource?.tracks.length ?? 0
                          } metadata candidates · not playable yet`
                        : `${librarySongs.length} ${
                            librarySongs.length === 1 ? 'song' : 'songs'
                          } · ${songsWithProgress} with progress on ${difficulty}`}
                    </p>
                  </div>

                  {libraryMode === 'local' &&
                    continuedSong &&
                    continuedScore && (
                      <section
                        className="flex min-w-0 max-w-xl items-center gap-3 rounded-2xl border border-accent-soft-border bg-accent-soft-bg p-2.5 shadow-accent-soft"
                        data-testid="continue-practicing"
                        aria-labelledby="continue-practicing-title"
                      >
                        <img
                          src={continuedSong.albumCover ?? appIcon}
                          alt=""
                          className="size-16 shrink-0 rounded-xl object-cover outline outline-1 -outline-offset-1 outline-white/10"
                          onError={(event) => {
                            event.currentTarget.src = appIcon;
                          }}
                        />
                        <div className="min-w-0 grow">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
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
                          className="min-h-11 shrink-0"
                          icon={<FontAwesomeIcon icon={faPlay} />}
                          aria-label={`Play ${continuedSong.name}`}
                          onClick={() => play(continuedSong.id)}
                        >
                          Play
                        </Button>
                      </section>
                    )}
                </div>

                <div
                  className="flex flex-col gap-3"
                  data-testid="library-toolbar"
                >
                  <div
                    className="flex min-w-0 flex-wrap items-center gap-3"
                    data-testid="library-song-controls"
                  >
                    <SongFilter
                      className="w-full"
                      nameFilter={nameFilter}
                      onChangeFilter={setNameFilter}
                      difficulty={difficulty}
                      setDifficulty={setDifficulty}
                      filteredSongsCount={
                        isYandexMode
                          ? filteredLibraryCandidates.length
                          : libraryMode === 'online' &&
                            onlineTotal !== undefined
                          ? onlineTotal
                          : filteredSongList.length
                      }
                      libraryMode={libraryMode}
                      onChangeLibraryMode={setLibraryMode}
                    />
                    <div
                      className="flex min-w-fit shrink-0 flex-wrap items-center gap-2 rounded-2xl bg-fill p-1.5 *:shrink-0"
                      data-testid="add-music-actions"
                      aria-label="Add music"
                    >
                      <span className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-faint">
                        Add music
                      </span>
                      <SongSearch
                        disabled={currentPath === null}
                        requestedSearch={requestedSongSearch}
                      />
                      <SongImport
                        disabled={currentPath === null}
                        onImported={handleSongImported}
                      />
                      <Tooltip
                        title={
                          currentPath === null
                            ? 'Select a library folder first'
                            : 'Add songs from your YouTube Music Liked playlist'
                        }
                      >
                        <Button
                          icon={<FontAwesomeIcon icon={faMusic} />}
                          size="large"
                          data-testid="my-music-trigger"
                          disabled={currentPath === null}
                          onClick={() => setMyMusicOpen(true)}
                        >
                          My Music
                        </Button>
                      </Tooltip>
                      <AutoChart
                        disabled={currentPath === null}
                        onImported={handleSongImported}
                      />
                    </div>
                    <SortButton
                      sort={sort}
                      disabled={!sortAvailable}
                      onSortChange={setSort}
                      isOpen={isSortOpen}
                      onOpenChange={setIsSortOpen}
                      focusedIndex={isSortOpen ? focusedSortIndex : undefined}
                    />
                  </div>
                </div>
                <SplittingQueue
                  splittingIds={splittingIds}
                  splitProgress={splitProgress}
                  songList={songList}
                />
              </div>
            </header>

            <div className="relative mx-auto flex min-h-0 w-full max-w-360 grow flex-col overflow-hidden bg-bg">
              {isYandexMode ? (
                !libraryCandidates.isLoaded ? (
                  <div
                    className="m-auto flex min-h-40 items-center justify-center"
                    data-testid="playlist-candidate-loading"
                  >
                    <Spin size="large" />
                  </div>
                ) : libraryCandidates.error ? (
                  <div
                    className="m-auto max-w-lg px-6 text-center text-sm text-red"
                    role="alert"
                    data-testid="playlist-candidate-error"
                  >
                    The playlist source could not be loaded:{' '}
                    {libraryCandidates.error}
                  </div>
                ) : candidateSource ? (
                  <LibraryCandidateList
                    source={candidateSource}
                    tracks={filteredLibraryCandidates}
                    query={nameFilter}
                    linkedTrackIds={linkedCandidateIds}
                    canFindAndChart={currentPath !== null}
                    onFindAndChart={findAndChartCandidate}
                  />
                ) : (
                  <div
                    className="m-auto max-w-lg px-6 text-center text-sm text-red"
                    role="alert"
                  >
                    The playlist source returned no collection.
                  </div>
                )
              ) : filteredSongList.length > 0 ||
                (libraryMode === 'online' && onlineLoading) ? (
                <>
                  {libraryMode === 'online' &&
                    nameFilter.trim() &&
                    !onlineLoading &&
                    !onlineHasExactMatch && (
                      <div
                        className="mx-2 mt-2 rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm text-text-muted"
                        role="status"
                      >
                        No exact matches for “{nameFilter.trim()}”. Showing
                        fuzzy results.
                      </div>
                    )}
                  <SongList
                    className="grow min-h-0"
                    songList={filteredSongList}
                    scrollKey={nameFilter}
                    downloadingIds={downloadingIds}
                    downloadingDisabled={currentPath === null}
                    difficulty={difficulty}
                    onClickSong={(id) => {
                      if (libraryMode === 'local') {
                        play(id);
                      }
                    }}
                    downloadedIds={
                      libraryMode === 'online'
                        ? new Set(songList.map((s) => s.id))
                        : undefined
                    }
                    splittingIds={splittingIds}
                    onSplit={handleSplit}
                    onSetGoal={(song) => {
                      setGoalModalSongId(song.id);
                      setIsSetGoalOpen(true);
                    }}
                    onDownload={handleDownload}
                    onLikeChange={handleLikeChange}
                    onLoadMore={libraryMode === 'online' ? loadMore : undefined}
                    focusedIndex={!isSortOpen ? focusedSongIndex : undefined}
                  />
                </>
              ) : (
                <EmptySongState
                  libraryMode={libraryMode}
                  hasFolder={currentPath !== null}
                  hasSongs={librarySongs.length > 0}
                  query={nameFilter}
                  onClearFilter={() => setNameFilter('')}
                  onBrowseOnline={() => setLibraryMode('online')}
                />
              )}

              {libraryMode === 'online' && onlineLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 pointer-events-none">
                  <Spin size="large" />
                </div>
              )}
            </div>
          </section>
        )}
      </AppShell>

      <Modal
        open={myMusicOpen}
        onCancel={() => setMyMusicOpen(false)}
        footer={null}
        width={640}
      >
        <MyMusic librarySongs={librarySongs} disabled={currentPath === null} />
      </Modal>

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
        />
      </Drawer>

      <Drawer
        title="Your profile"
        open={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        size={480}
        destroyOnHidden
      >
        <Suspense
          fallback={
            <div className="flex min-h-64 items-center justify-center">
              <Spin size="large" />
            </div>
          }
        >
          <ProfileView
            songList={librarySongs}
            goals={goals.goals}
            isGoalsLoaded={goals.isLoaded}
            onSaveGoal={goals.saveGoal}
            onSetPrimaryGoal={goals.setPrimaryGoal}
            gamification={gamification}
          />
        </Suspense>
      </Drawer>

      <SetGoalModal
        open={isSetGoalOpen}
        onClose={() => setIsSetGoalOpen(false)}
        songList={librarySongs}
        initialSongId={goalModalSongId}
        isFirstGoal={goals.goals.length === 0}
        onSave={(input: SaveGoalInput) => goals.saveGoal(input)}
      />

      <div className="fixed inset-0 pointer-events-none z-100">
        <Outlet
          context={
            {
              gamification,
              recommendation: nextPractice.recommendation,
              continuePractice: startRecommendedPractice,
            } satisfies PracticeOutletContext
          }
        />
      </div>
    </StemToolsProvider>
  );
}
