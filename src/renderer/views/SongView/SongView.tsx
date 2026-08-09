import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Divider,
  Drawer,
  InputNumber,
  Layout,
  Select,
  Spin,
  Switch,
} from 'antd';
import { Content } from 'antd/es/layout/layout';
import { Difficulty } from 'scan-chart';
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Playback } from '../../components/Playback';
import { SettingsButton } from '../../components/SettingsButton';
import { SheetMusic } from '../../components/SheetMusic';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faChartLine,
  faPause,
  faPlay,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '../../context/AppContext';
import { useInput } from '../../context/InputContext';
import { useSongViewSettings } from '../../context/SongViewSettingsContext';
import { ClickControls } from '../../components/ClickControls';
import { usePersisted } from '../../hooks/usePersisted';
import { useSongLoader } from '../../hooks/useSongLoader';
import { useEngine } from '../../hooks/useEngine';
import { useVolumeControls } from '../../hooks/useVolumeControls';
import { useMuteToggle } from '../../hooks/useMuteToggle';
import { ticksToSeconds } from '../../../chart-parser/timing';
import { calculateAccuracy, getStarRating } from '../../scoring';
import {
  RecordRunResult,
  UseGamificationResult,
} from '../../hooks/useGamification';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useSheetMusic } from '../../hooks/useSheetMusic';
import { useInputControls } from '../../hooks/useInputControls';
import { useTransportShortcuts } from '../../hooks/useTransportShortcuts';
import { ScoreSummary } from '../../components/ScoreSummary';
import { CountIn } from '../../components/CountIn';
import { StreakMeter, useStreakEngine } from '../../components/StreakMeter';
import { ScoreData } from '../../../types';
import {
  computeRunsTrend,
  RunSummary,
  StoredPracticeRun,
} from '../../services/practice-stats';
import { PracticeStats } from '../../components/PracticeStats';
import { buildSheetPdfHtml } from '../../services/pdf-export';
import { serializeMeasureToDsl } from '../../components/SheetMusic';
import { AudioVolume } from '../../components/AudioVolume';
import { GameMode, PracticeRange } from '../../types';
import { resolveModePolicy } from '../../modes';
import { RenderData } from '../../../chart-parser/types';
import { AICoach } from '../../components/AICoach';
import { analyzePracticeRuns, buildCoachChart } from '../../services/coach';

export function SongView() {
  const { difficulty, setDifficulty, isDev } = useApp();
  const { inputMapping, controlMapping, kitControlIds } = useInput();
  const {
    playheadStyle,
    enableColors,
    showBarNumbers,
    showTempo,
    countIn,
    showReference,
    zoom,
  } = useSongViewSettings();
  const { notification, message } = App.useApp();
  const [scoreData, setScoreData] = useState<ScoreData>();
  const [practiceSummary, setPracticeSummary] = useState<RunSummary>();
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [songRuns, setSongRuns] = useState<RunSummary[]>();
  const [fullRuns, setFullRuns] = useState<StoredPracticeRun[]>();
  const [gamificationResult, setGamificationResult] =
    useState<RecordRunResult>();
  const exportPdfOffRef = useRef<(() => void) | undefined>(undefined);
  const loadRunsOffRef = useRef<(() => void) | undefined>(undefined);
  // Provided by SongListView, which mounts <Outlet context={gamification}>
  // around this route (see SongListView.tsx) - one hook instance shared by
  // the library header and whichever song is open, so both read/update the
  // same streak/XP state. Optional because a test (or any future caller)
  // that mounts SongView outside that Outlet simply gets no gamification
  // rather than a crash.
  const gamification = useOutletContext<UseGamificationResult | undefined>();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const gameMode = useMemo<GameMode | undefined>(() => {
    return (searchParams.get('gameMode') as GameMode) ?? undefined;
  }, [searchParams]);
  const policy = useMemo(() => resolveModePolicy(gameMode), [gameMode]);
  // usePracticeSession (below) owns playbackSpeed, but it needs `engine`
  // from useEngine (below that), and useEngine's onEnded (right here) needs
  // the speed to stamp onto the saved run summary. Mirror the ref-sync
  // pattern useEngine itself already uses for onEnded/isDev/player: this
  // ref is kept current by an effect once playbackSpeed exists, and by the
  // time a run actually ends (a later event, never the same tick as render)
  // it always holds this render's value.
  const playbackSpeedRef = useRef(1);
  // Same ref-sync reasoning as playbackSpeedRef above: onEnded (in the same
  // useEngine call below) wants the song's real length to turn "one
  // completed run" into practice minutes, and `duration` is itself part of
  // useEngine's return value - kept fresh via an effect rather than relied
  // on directly, matching the established pattern in this file.
  const durationRef = useRef(0);
  // Same ref-sync reasoning again: onEnded wants the run's best streak at
  // the moment it fires to stamp onto the saved summary, but the streak
  // itself lives in `useStreakEngine` (below, after `engine` exists) - see
  // that ref-sync effect further down.
  const bestStreakRef = useRef(0);
  const navigate = useNavigate();
  const { fileData, format, songData, trackData } = useSongLoader(id);
  // The difficulties this specific chart actually carries - auto-charted
  // songs usually have all four, lesson charts often only Expert. Falls
  // back to just the currently-loaded difficulty (rather than every
  // possible value) when a song predates drumDifficulties being recorded,
  // so the selector never lists an option the chart can't parse.
  const availableDifficulties: Difficulty[] = songData?.drumDifficulties?.length
    ? songData.drumDifficulties
    : [difficulty];
  const { chart, parsedMidi, renderData, vexflowContainerRef } = useSheetMusic({
    fileData,
    format,
    fiveLaneDrums: songData?.fiveLaneDrums ?? false,
    proDrums: songData?.proDrums ?? false,
    songId: songData?.id,
    difficulty,
    showBarNumbers: isDev && showBarNumbers,
    enableColors,
    showTempo,
  });
  const measures = useMemo(
    () => renderData.map((rd) => rd.measure),
    [renderData],
  );
  const coachResult = useMemo(() => {
    if (!chart || !parsedMidi || !fullRuns) {
      return undefined;
    }

    return analyzePracticeRuns({
      runs: fullRuns,
      chart: buildCoachChart(chart, parsedMidi.measures),
    });
  }, [chart, parsedMidi, fullRuns]);
  const coachRecords = useMemo(
    () => fullRuns?.flatMap((run) => run.records) ?? [],
    [fullRuns],
  );
  const delaySeconds = songData?.delaySeconds ?? 0;
  const minDurationSeconds = useMemo(() => {
    const measureList = parsedMidi?.measures;
    const lastMeasure = chart && measureList?.[measureList.length - 1];

    if (!lastMeasure) {
      return 0;
    }

    return (
      ticksToSeconds(lastMeasure.endTick, chart.resolution, chart.tempos) +
      delaySeconds
    );
  }, [chart, parsedMidi, delaySeconds]);
  const {
    engine,
    isReady,
    duration,
    timeStore,
    isPlaying,
    isCounting,
    isEnded,
    countInBeat,
    countInBeatMs,
    play,
    playFromTick,
    pause,
    cancel,
    seekSeconds,
    setStemVolume,
    setMasterVolume: setEngineMasterVolume,
  } = useEngine({
    trackData,
    isDev,
    chart,
    measures,
    renderData,
    delaySeconds,
    minDurationSeconds,
    countInEnabled: countIn,
    player: policy.player,
    playheadStyle: policy.playheadOverride ?? playheadStyle,
    mapping: inputMapping,
    onEnded: (score, summary, records) => {
      // Star rating / high-score submission stay Perform-only (see
      // ModePolicy.scoring's doc comment), but per-hit analytics capture,
      // save-practice-run, and showing the stats summary are NOT
      // Perform-only — a Practice run with looping/speed dialed in is still
      // real evidence of progression, so it earns the same analytics as a
      // Perform run even though it never earns stars. `mode`/`playbackSpeed`
      // are stamped on here (not in the pure summarizeRun) so stored runs
      // can tell a Practice rep at 0.7x apart from a full-speed Perform
      // pass.
      const runSummary: RunSummary = {
        ...summary,
        mode: gameMode ?? 'perform',
        playbackSpeed: playbackSpeedRef.current,
        difficulty,
        bestStreak: bestStreakRef.current,
      };
      const isAttempt = (score.hitNotes ?? 0) > 0;

      setPracticeSummary(runSummary);
      // Cleared synchronously so a still-open modal from a prior run never
      // shows last run's XP for a frame while this run's recordRun IPC
      // round trip (below) is in flight.
      setGamificationResult(undefined);
      setIsScoreModalOpen(true);

      if (policy.scoring) {
        setScoreData(score);

        const previousScore = songData?.scoreData?.[difficulty];
        const isHighScore =
          !previousScore ||
          calculateAccuracy(score) > calculateAccuracy(previousScore);

        if (id && isHighScore && isAttempt) {
          window.electron.ipcRenderer.sendMessage('update-song', {
            id,
            scoreData: { [difficulty]: score },
          });
        }
      }

      if (id && isAttempt) {
        window.electron.ipcRenderer.sendMessage('save-practice-run', {
          songId: id,
          summary: runSummary,
          records,
        });

        // Gated on the same isAttempt check as save-practice-run above, and
        // sent strictly after it: an untouched play-through must not mint a
        // streak day or XP, and gamification.recordRun's own
        // load-all-practice-runs round trip (inside the hook) depends on
        // this run already being persisted in the practiceRuns store by
        // the time it reads it back - save-practice-run's store.set is
        // synchronous, so that's guaranteed by send order alone.
        gamification?.recordRun(
          {
            totalHits: runSummary.totalHits,
            overallAccuracy: runSummary.overallAccuracy,
            difficulty,
            starsEarned: policy.scoring ? getStarRating(score) : 0,
            minutes: durationRef.current / 60 / playbackSpeedRef.current,
          },
          setGamificationResult,
        );
      }
    },
  });
  // Additive: subscribes to this same `engine` instance's public
  // onHit/onFalseHit/onMiss/onReset events (see engine.ts) and turns them
  // into in-play streak state, without touching anything above. Perform
  // and Practice both render the meter - it's motivation, not scoring, so
  // it isn't gated on `policy.scoring` the way the star-rating block above
  // is.
  const streakUi = useStreakEngine(engine);
  const { volumeSliders } = useVolumeControls(
    trackData,
    setStemVolume,
    isReady,
  );
  const [clickVolume, setClickVolume] = usePersisted('settings.clickVolume', 0);
  const [clickTone, setClickTone] = usePersisted('settings.clickTone', 50);
  const [masterVolume, setMasterVolume] = usePersisted(
    'settings.masterVolume',
    100,
  );
  const {
    isMuted: isMasterMuted,
    toggleMute: handleMasterMute,
    handleChange: handleMasterChange,
  } = useMuteToggle(masterVolume, setMasterVolume, 100);
  const audioLoading = trackData.length > 0 && !isReady;
  const isLoading = !songData || audioLoading;
  const onNextSong = () => {
    setIsScoreModalOpen(false);
    navigate('/');
  };
  const onRetry = () => {
    setIsScoreModalOpen(false);
    playFromTick(0);
  };
  const loadStoredRuns = useCallback(
    (forCoach: boolean) => {
      if (!id) {
        return;
      }

      if (forCoach) {
        setIsCoachLoading(true);
      }

      loadRunsOffRef.current?.();
      loadRunsOffRef.current = window.electron.ipcRenderer.once<
        | {
            songId: string;
            runs: RunSummary[];
            fullRuns?: StoredPracticeRun[];
          }
        | { error: string }
      >('load-practice-runs', (result) => {
        loadRunsOffRef.current = undefined;
        setIsCoachLoading(false);

        if ('runs' in result) {
          setSongRuns(result.runs);
          setFullRuns(result.fullRuns ?? []);
        }
      });
      window.electron.ipcRenderer.sendMessage('load-practice-runs', id);
    },
    [id],
  );
  const onOpenStats = useCallback(() => {
    setIsStatsOpen(true);
    loadStoredRuns(false);
  }, [loadStoredRuns]);
  const onOpenCoach = useCallback(() => {
    setIsScoreModalOpen(false);
    setIsCoachOpen(true);
    loadStoredRuns(true);
  }, [loadStoredRuns]);
  const onExportPdf = useCallback(() => {
    if (!vexflowContainerRef.current || !songData) {
      return;
    }

    const html = buildSheetPdfHtml({
      name: songData.name,
      artist: songData.artist,
      charter: songData.charter,
      vexflowContainer: vexflowContainerRef.current,
    });
    const fileName = `${songData.name} - ${songData.artist}.pdf`.replace(
      /[/\\:*?"<>|]/g,
      '-',
    );

    setIsExporting(true);
    exportPdfOffRef.current?.();
    exportPdfOffRef.current = window.electron.ipcRenderer.once<{
      ok?: boolean;
      canceled?: boolean;
      filePath?: string;
      error?: string;
    }>('export-pdf', (result) => {
      exportPdfOffRef.current = undefined;
      setIsExporting(false);

      if (result.error) {
        notification.error({
          title: 'Export failed',
          description: result.error,
          placement: 'bottomRight',
        });

        return;
      }

      if (result.ok) {
        notification.success({
          title: 'PDF exported',
          description: result.filePath,
          placement: 'bottomRight',
        });
      }
    });
    window.electron.ipcRenderer.sendMessage('export-pdf', { html, fileName });
  }, [vexflowContainerRef, songData, notification]);
  const {
    controlHandlers: practiceControlHandlers,
    focusIndex,
    practiceRange,
    playbackSpeed,
    setPlaybackSpeed,
    stepSpeed,
    isLooping,
    setIsLooping,
    onPracticeRangeChange,
    clearSelection,
  } = usePracticeSession({
    engine,
    policy,
    chart,
    renderData,
    delaySeconds,
    isEnded,
    onExit: () => navigate('/'),
  });
  const applyCoachLoop = useCallback(
    (barStart: number, barEnd: number, speed: number): boolean => {
      const start = barStart - 1;
      const end = Math.min(barEnd - 1, renderData.length - 1);
      const startMeasure = renderData[start]?.measure;

      if (!chart || !startMeasure || end < start) {
        return false;
      }

      pause();
      setPlaybackSpeed(speed);
      setIsLooping(true);
      onPracticeRangeChange({ start, end });
      seekSeconds(
        ticksToSeconds(startMeasure.startTick, chart.resolution, chart.tempos) +
          delaySeconds,
      );
      setIsCoachOpen(false);

      return true;
    },
    [
      chart,
      delaySeconds,
      onPracticeRangeChange,
      pause,
      renderData,
      seekSeconds,
      setIsLooping,
      setPlaybackSpeed,
    ],
  );
  const onPracticeBars = useCallback(
    (barStart: number, barEnd: number, speed: number) => {
      if (!id) {
        return;
      }

      if (gameMode !== 'practice') {
        navigate(
          `/${id}?gameMode=practice&coachStart=${barStart}&coachEnd=${barEnd}&coachSpeed=${speed}`,
        );

        return;
      }

      applyCoachLoop(barStart, barEnd, speed);
    },
    [applyCoachLoop, gameMode, id, navigate],
  );
  const onTrainSkill = useCallback(
    (lessonId: string) => navigate(`/?coachLesson=${lessonId}`),
    [navigate],
  );

  useEffect(() => {
    if (gameMode !== 'practice') {
      return;
    }

    const barStart = Number(searchParams.get('coachStart'));
    const barEnd = Number(searchParams.get('coachEnd'));
    const speed = Number(searchParams.get('coachSpeed'));

    if (
      !Number.isInteger(barStart) ||
      !Number.isInteger(barEnd) ||
      !Number.isFinite(speed)
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (!applyCoachLoop(barStart, barEnd, speed)) {
        return;
      }

      const next = new URLSearchParams(searchParams);

      next.delete('coachStart');
      next.delete('coachEnd');
      next.delete('coachSpeed');
      setSearchParams(next, { replace: true });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [applyCoachLoop, gameMode, searchParams, setSearchParams]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    bestStreakRef.current = streakUi.streak.best;
  }, [streakUi.streak.best]);

  // Snapshot taken at the moment the user picks a new difficulty, consumed
  // once the reparsed chart's renderData actually lands (useSheetMusic
  // re-parses asynchronously - see its parsedMidi/renderData effect).
  const pendingDifficultySwitchRef = useRef<{
    time: number;
    range: PracticeRange | undefined;
    renderData: RenderData[];
  } | null>(null);
  const handleDifficultyChange = useCallback(
    (next: Difficulty) => {
      if (next === difficulty) {
        return;
      }

      pause();
      pendingDifficultySwitchRef.current = {
        time: timeStore.get(),
        range: practiceRange,
        renderData,
      };
      // App-global, same setter the library header tabs use - the choice
      // sticks, and it's also what keys scoreData on song end (below), so
      // a mid-run switch can never misattribute the run's score.
      setDifficulty(next);
    },
    [difficulty, pause, timeStore, practiceRange, renderData, setDifficulty],
  );

  useEffect(() => {
    const pending = pendingDifficultySwitchRef.current;

    if (!pending || !engine) {
      return;
    }

    pendingDifficultySwitchRef.current = null;

    // A difficulty switch reparses the chart at a different note density,
    // so a partial run's hits no longer line up with real notes. Seeking
    // to 0 first drives Engine's existing onSeek -> Judge.rewindTo(0) path
    // (the same one every other seek already goes through) to wipe every
    // hit/false-hit, then the second seek restores the on-screen position
    // without resurrecting any of the discarded judge state.
    seekSeconds(0);
    seekSeconds(pending.time);

    // A stale focus/loop-anchor index from the old renderData can point
    // past the end of a shorter new one - always clear it here, same as
    // toggling looping off already does.
    clearSelection();

    if (!pending.range) {
      return;
    }

    const startTick =
      pending.renderData[pending.range.start]?.measure.startTick;
    const endTick = pending.renderData[pending.range.end]?.measure.startTick;
    const newStart = renderData.findIndex(
      (rd) => rd.measure.startTick === startTick,
    );
    const newEnd = renderData.findIndex(
      (rd) => rd.measure.startTick === endTick,
    );
    const stillExists =
      startTick !== undefined &&
      endTick !== undefined &&
      newStart !== -1 &&
      newEnd !== -1;

    // Preserve the practice selection only if both its boundary measures
    // still exist at the new difficulty - otherwise clear it honestly
    // rather than keep a range that no longer means the same thing.
    onPracticeRangeChange(
      stillExists ? { start: newStart, end: newEnd } : undefined,
    );
  }, [renderData, engine, seekSeconds, onPracticeRangeChange, clearSelection]);

  useInputControls(
    controlMapping,
    policy.scoring
      ? {
          confirm: () => {
            if (isReady && !isPlaying && !isEnded && !isCounting) {
              play();

              return;
            }

            if (isEnded && isScoreModalOpen) {
              onNextSong();
            }
          },
          pause: () => {
            if (isCounting) {
              cancel();

              return;
            }

            if (!isEnded && isPlaying) {
              pause();
            }
          },
          back: () => {
            if (isEnded && isScoreModalOpen) {
              onRetry();

              return;
            }

            cancel();
            pause();
            navigate('/');
          },
        }
      : practiceControlHandlers,
    !isLoading,
    isPlaying || isCounting ? kitControlIds : undefined,
  );

  const transportIndicator = useTransportShortcuts({
    enabled: !isLoading,
    engine,
    duration,
    speedControl: policy.speedControl,
    onStepSpeed: stepSpeed,
    controlMapping,
  });

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('prevent-sleep');

    return () => {
      window.electron.ipcRenderer.sendMessage('resume-sleep');
    };
  }, []);

  useEffect(() => () => exportPdfOffRef.current?.(), []);

  useEffect(() => () => loadRunsOffRef.current?.(), []);

  useEffect(() => {
    engine?.setClickSettings(clickVolume / 100, clickTone / 100);
  }, [engine, clickVolume, clickTone]);

  useEffect(() => {
    if (isReady) {
      setEngineMasterVolume(masterVolume / 100);
    }
  }, [setEngineMasterVolume, masterVolume, isReady]);

  return (
    <Layout className="h-full pointer-events-auto">
      <ScoreSummary
        isOpen={isScoreModalOpen}
        onNextSong={onNextSong}
        onRetry={onRetry}
        onCoach={onOpenCoach}
        songData={songData}
        difficulty={difficulty}
        scoreData={scoreData}
        practiceSummary={practiceSummary}
        gamification={gamification}
        runResult={gamificationResult}
      />
      <Drawer
        title="Practice stats"
        open={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        destroyOnClose
      >
        <PracticeStats
          variant="panel"
          summary={songRuns?.[songRuns.length - 1]}
          trend={songRuns ? computeRunsTrend(songRuns) : []}
        />
      </Drawer>
      <Drawer
        title="AI practice coach"
        open={isCoachOpen}
        onClose={() => setIsCoachOpen(false)}
        destroyOnClose
        width={620}
      >
        <AICoach
          result={coachResult}
          song={{
            name: songData?.name ?? '',
            artist: songData?.artist ?? '',
            difficulty,
          }}
          measures={parsedMidi?.measures ?? []}
          records={coachRecords}
          loading={isCoachLoading}
          onPracticeBars={onPracticeBars}
          onTrainSkill={onTrainSkill}
        />
      </Drawer>
      <header
        className="flex min-h-20 items-center gap-4 border-b border-divider px-5 py-3"
        style={{ background: 'var(--gradient-header)' }}
      >
        <Button
          icon={<FontAwesomeIcon icon={faArrowLeft} />}
          data-testid="back-button"
          aria-label="Back to library"
          onClick={() => {
            cancel();
            pause();
            navigate('/');
          }}
          size="large"
          className="min-h-11 min-w-11 shrink-0"
        />

        <Button
          type="primary"
          icon={<FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />}
          loading={audioLoading}
          data-testid="play-toggle"
          aria-label={
            isCounting ? 'Cancel count-in' : isPlaying ? 'Pause' : 'Play'
          }
          onClick={() => {
            if (isCounting) {
              cancel();

              return;
            }

            if (isPlaying) {
              pause();

              return;
            }

            play();
          }}
          shape="circle"
          size="large"
          style={{ width: 52, height: 52 }}
          className="shrink-0"
        />

        <div className="min-w-0 max-w-72">
          <div className="mb-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
            {gameMode === 'practice' ? 'Practice mode' : 'Perform mode'}
          </div>
          <h1
            className="truncate font-display text-xl font-semibold leading-tight text-text-body"
            title={songData?.name}
          >
            {songData?.name}
          </h1>
          <div className="flex items-center gap-1 truncate text-sm text-text-faint">
            <span className="truncate" title={songData?.artist}>
              {songData?.artist}
            </span>
            <span aria-hidden="true">·</span>
            <Select
              size="small"
              className="capitalize shrink-0"
              popupMatchSelectWidth={false}
              value={difficulty}
              data-testid="song-difficulty-select"
              aria-label="Difficulty"
              disabled={availableDifficulties.length <= 1}
              onChange={(value) => handleDifficultyChange(value as Difficulty)}
              options={availableDifficulties.map((d) => ({
                value: d,
                label: d,
              }))}
            />
          </div>
        </div>

        <Playback
          timeStore={timeStore}
          disabled={!isReady}
          duration={duration}
          allowScrubbing={isDev || policy.allowScrubbing}
          onChange={(value) => {
            if (!isReady) {
              return;
            }

            seekSeconds((value / 100) * duration);
          }}
        />
        {(policy.speedControl || policy.looping) && (
          <div className="flex shrink-0 items-center gap-2 rounded-xl bg-fill px-3 py-2">
            {policy.speedControl && (
              <div className="flex gap-2 items-center">
                <div className="text-text-faint">Speed:</div>

                <InputNumber
                  mode="spinner"
                  size="medium"
                  min={0.3}
                  max={2}
                  step={0.1}
                  value={playbackSpeed}
                  onChange={(newValue) => {
                    if (newValue === null) {
                      return;
                    }

                    setPlaybackSpeed(newValue);
                  }}
                  styles={{
                    input: {
                      width: '5ch',
                    },
                  }}
                />
              </div>
            )}

            {policy.speedControl && policy.looping && <Divider vertical />}

            {policy.looping && (
              <div className="flex gap-2 items-center">
                <div className="text-text-faint">Loop:</div>

                <Switch
                  size="medium"
                  data-testid="loop-toggle"
                  checked={isLooping}
                  onChange={(checked) => {
                    setIsLooping(checked);
                    clearSelection();
                  }}
                />
              </div>
            )}
          </div>
        )}
        <SettingsButton
          page="song-view"
          volumeSliders={volumeSliders}
          gameMode={gameMode}
          clickControls={
            <ClickControls
              volume={clickVolume}
              onVolumeChange={setClickVolume}
              tone={clickTone}
              onToneChange={setClickTone}
            />
          }
          masterVolumeControl={
            <AudioVolume
              name="Master"
              volume={masterVolume}
              onChange={handleMasterChange}
              canSolo={false}
              onMuteClick={handleMasterMute}
              isMuted={isMasterMuted}
            />
          }
          onExportPdf={onExportPdf}
          isExporting={isExporting}
        />
        <Button
          icon={<FontAwesomeIcon icon={faWandMagicSparkles} />}
          data-testid="ai-coach-button"
          aria-label="AI practice coach"
          onClick={onOpenCoach}
          size="large"
          className="shrink-0"
        />
        <Button
          icon={<FontAwesomeIcon icon={faChartLine} />}
          data-testid="practice-stats-button"
          aria-label="Practice stats"
          onClick={onOpenStats}
          size="large"
          className="shrink-0"
        />
      </header>

      <div className="relative grow flex min-h-0">
        <Content className="grow p-6 m-0 overflow-auto flex flex-col items-center font-display text-ink">
          {songData && chart && parsedMidi && (
            <SheetMusic
              engine={engine}
              isLooping={isLooping}
              renderData={renderData}
              practiceRange={practiceRange}
              focusIndex={focusIndex}
              onPracticeRangeChange={onPracticeRangeChange}
              gameMode={gameMode}
              songData={songData}
              isDev={isDev}
              zoom={zoom}
              enableColors={enableColors}
              showReference={showReference}
              vexflowContainerRef={vexflowContainerRef}
              onSelectMeasure={(measure, event) => {
                if ((event.ctrlKey || event.metaKey) && chart) {
                  navigator.clipboard.writeText(
                    serializeMeasureToDsl(chart, measure),
                  );
                  message.success('Measure DSL copied');

                  return;
                } else if (
                  (isDev || (policy.allowScrubbing && !isLooping)) &&
                  chart
                ) {
                  playFromTick(measure.startTick);
                }
              }}
            />
          )}
        </Content>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 backdrop-blur-xs">
            <Spin size="large" />
          </div>
        )}
        <CountIn count={countInBeat} beatMs={countInBeatMs} />
        <StreakMeter ui={streakUi} />
        {transportIndicator && (
          <div
            data-testid="transport-indicator"
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          >
            <div className="rounded-full bg-bg/85 px-6 py-3 font-ui text-xl font-semibold text-text shadow-paper-strong">
              {transportIndicator.label}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
