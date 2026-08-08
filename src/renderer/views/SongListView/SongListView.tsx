import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Modal, Spin, Tooltip } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGraduationCap,
  faMusic,
  faPlay,
} from '@fortawesome/free-solid-svg-icons';
import {
  Outlet,
  useNavigate,
  useOutlet,
  useSearchParams,
} from 'react-router-dom';
import appIcon from '../../../../assets/icon.png';
import { Song } from '../../../types';
import { SongFilter } from '../../components/SongFilter';
import { SongList } from '../../components/SongList';
import { SettingsButton } from '../../components/SettingsButton';
import { SortButton } from '../../components/SortButton';
import { SplittingQueue } from '../../components/SplittingQueue';
import { EmptySongState } from '../../components/EmptySongState';
import { AutoChart } from '../../components/AutoChart';
import { SongImport } from '../../components/SongImport';
import { SongSearch } from '../../components/SongSearch';
import { MyMusic } from '../../components/MyMusic';
import { LessonsView } from '../../components/LessonsView';
import { useApp } from '../../context/AppContext';
import { useInput } from '../../context/InputContext';
import { StemToolsProvider } from '../../context/StemToolsContext';
import { useStemTools } from '../../hooks/useStemTools';
import { useSongList } from '../../hooks/useSongList';
import { useDownload } from '../../hooks/useDownload';
import { useSongFilter } from '../../hooks/useSongFilter';
import { useInputControls } from '../../hooks/useInputControls';
import { useGameModeSelector } from '../../hooks/useGameModeSelector';
import {
  highestAvailableDifficulty,
  isLessonSong,
  LessonEntry,
  useLessonAutoRescan,
  useLessons,
} from '../../hooks/useLessons';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { Stars } from '../../components/Stars';
import { LibraryView } from '../../types';
import { last7Dates, useGamification } from '../../hooks/useGamification';
import { GamificationHeaderStrip } from '../../components/GamificationHeaderStrip';
import { StatsPanel } from '../../components/StatsPanel';
import { localDateKey } from '../../services/streaks';
import {
  nextDifficulty,
  nextSongIndex,
  sortForFocusedIndex,
  sortIndexForKey,
  toggledSortForIndex,
  wrapSortIndex,
} from './helpers';

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
  const { downloadingIds, handleDownload } = useDownload(
    onlineResults,
    addSong,
  );
  const [focusedSongIndex, setFocusedSongIndex] = useState<number | undefined>(
    undefined,
  );
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [focusedSortIndex, setFocusedSortIndex] = useState(0);
  const sortAvailable = libraryMode !== 'online';
  const [prevNameFilter, setPrevNameFilter] = useState(nameFilter);
  const [prevLibraryMode, setPrevLibraryMode] = useState(libraryMode);
  const [prevSort, setPrevSort] = useState(sort);
  const [prevSortAvailable, setPrevSortAvailable] = useState(sortAvailable);
  const gameModeSelector = useGameModeSelector();
  const [view, setView] = useState<LibraryView>('songs');
  const [myMusicOpen, setMyMusicOpen] = useState(false);
  // The Lessons unlock chain always looks at every lesson song, regardless
  // of the app's globally selected difficulty tab — lesson charts only ever
  // carry an Expert drum track, so filtering by difficulty here would hide
  // the whole curriculum whenever the tab isn't set to Expert.
  const lessonProgress = useLessons(songList);
  const rescanLibrary = useCallback(() => {
    window.electron.ipcRenderer.sendMessage('rescan-songs', false);
  }, []);

  useLessonAutoRescan({
    songList,
    isLessonsTabActive: view === 'lessons',
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
  const handleSongImported = useCallback(
    (song: Song) => {
      addSong(song);
      setLibraryMode('local');
    },
    [addSong, setLibraryMode],
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

  return (
    <StemToolsProvider value={stemTools}>
      {gameModeSelector.element}

      <div className="h-screen flex flex-col bg-bg">
        <header
          className="border-b border-divider px-5 py-4 z-10 flex flex-col gap-4"
          style={{ background: 'var(--gradient-header)' }}
        >
          <div className="mx-auto flex w-full max-w-360 items-center justify-between gap-6">
            <div className="min-w-0">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
                Practice space
              </div>
              <h1 className="font-display text-3xl font-semibold leading-tight tracking-[-0.02em] text-text">
                Your drum library
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                {librarySongs.length}{' '}
                {librarySongs.length === 1 ? 'song' : 'songs'} ·{' '}
                {songsWithProgress} with progress on {difficulty}
              </p>
            </div>

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

            {view === 'songs' &&
              libraryMode === 'local' &&
              continuedSong &&
              continuedScore && (
                <section
                  className="flex min-w-0 max-w-xl grow items-center gap-3 rounded-2xl border border-accent-soft-border bg-accent-soft-bg p-2.5 shadow-accent-soft"
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
            className="mx-auto flex w-full max-w-360 flex-col gap-3"
            data-testid="library-toolbar"
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex shrink-0 items-center gap-1 rounded-xl border border-border-soft bg-surface p-1"
                role="tablist"
                aria-label="Library view"
              >
                <Button
                  type={view === 'songs' ? 'primary' : 'default'}
                  data-testid="view-songs"
                  role="tab"
                  aria-selected={view === 'songs'}
                  onClick={() => setView('songs')}
                >
                  Songs
                </Button>
                <Button
                  type={view === 'lessons' ? 'primary' : 'default'}
                  data-testid="view-lessons"
                  role="tab"
                  aria-selected={view === 'lessons'}
                  icon={<FontAwesomeIcon icon={faGraduationCap} />}
                  onClick={() => setView('lessons')}
                >
                  Lessons
                  {lessonProgress.totalLessons > 0 &&
                    ` · ${lessonProgress.unlockedCount}/${lessonProgress.totalLessons}`}
                </Button>
              </div>
              <SettingsButton page="song-list" scanPercent={scanPercent} />
            </div>

            {view === 'songs' && (
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
                    libraryMode === 'online' && onlineTotal !== undefined
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
                  <SongSearch disabled={currentPath === null} />
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
            )}
          </div>
          <SplittingQueue
            splittingIds={splittingIds}
            splitProgress={splitProgress}
            songList={songList}
          />
        </header>

        <Modal
          open={myMusicOpen}
          onCancel={() => setMyMusicOpen(false)}
          footer={null}
          width={640}
        >
          <MyMusic
            librarySongs={librarySongs}
            disabled={currentPath === null}
          />
        </Modal>

        <Drawer
          title="Your practice stats"
          open={isStatsOpen}
          onClose={() => setIsStatsOpen(false)}
          destroyOnClose
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

        <main
          id="library-content"
          className="relative grow overflow-hidden w-full flex"
        >
          {view === 'lessons' ? (
            <LessonsView
              progress={lessonProgress}
              onPlay={playLesson}
              scanPercent={scanPercent}
              onRescan={rescanLibrary}
            />
          ) : (
            <div className="relative mx-auto flex w-full max-w-360 grow flex-col overflow-hidden bg-bg">
              {filteredSongList.length > 0 ||
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
            </div>
          )}

          {view === 'songs' && libraryMode === 'online' && onlineLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none z-10">
              <Spin size="large" />
            </div>
          )}
        </main>

        <div className="fixed inset-0 pointer-events-none z-100">
          <Outlet context={gamification} />
        </div>
      </div>
    </StemToolsProvider>
  );
}
