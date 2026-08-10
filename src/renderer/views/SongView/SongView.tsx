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
import { cn } from '../../cn';
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
import { InputMapping, ScoreData } from '../../../types';
import {
  computeRunsTrend,
  decideRunEvidence,
  learningEvidenceForTutorRun,
  PRACTICE_RUN_SCHEMA_VERSION,
  RunSummary,
  SCORING_POLICY_VERSION,
  StoredPracticeRun,
  TutorRunEvidence,
} from '../../services/practice-stats';
import { PracticeStats } from '../../components/PracticeStats';
import { buildSheetPdfHtml } from '../../services/pdf-export';
import { serializeMeasureToDsl } from '../../components/SheetMusic';
import { AudioVolume } from '../../components/AudioVolume';
import { GameMode, PracticeRange } from '../../types';
import { resolveModePolicy } from '../../modes';
import { RenderData } from '../../../chart-parser/types';
import { SheetMusicLayout } from '../../../chart-parser/renderer';
import { AICoach } from '../../components/AICoach';
import {
  analyzePracticeRuns,
  buildCoachChart,
  summarizeCoachFindings,
} from '../../services/coach';
import { TutorHud } from '../../components/TutorHud';
import { useTutorSession } from '../../hooks/useTutorSession';
import { useDrumGestures } from '../../hooks/useDrumGestures';
import { DrumGestureAction, DrumGestureSurface } from '../../services/gestures';
import { TutorState } from '../../services/tutor';
import { SettingLabel } from '../../components/SettingsButton/SettingLabel';
import { PracticeOutletContext } from '../practice-context';

interface PracticeRunIdentity {
  sessionId: string;
  startedAt?: string;
}

const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development';

function createPracticeRunIdentity(): PracticeRunIdentity {
  const randomId = globalThis.crypto?.randomUUID?.();

  return {
    sessionId:
      randomId ??
      `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  };
}

function snapshotInputMapping(mapping: InputMapping): InputMapping {
  return Object.fromEntries(
    Object.entries(mapping).map(([element, controls]) => [
      element,
      [...(controls ?? [])],
    ]),
  ) as InputMapping;
}

export function SongView() {
  const { difficulty, setDifficulty, isDev } = useApp();
  const {
    inputMapping,
    controlMapping,
    kitControlIds,
    selectedDevice,
    inputLatencyMs,
  } = useInput();
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
  const [practicePersistenceState, setPracticePersistenceState] = useState<
    'saving' | 'saved' | 'failed' | 'no-evidence'
  >('no-evidence');
  const [isExporting, setIsExporting] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [songRuns, setSongRuns] = useState<RunSummary[]>();
  const [fullRuns, setFullRuns] = useState<StoredPracticeRun[]>();
  const [gamificationResult, setGamificationResult] =
    useState<RecordRunResult>();
  const [notationLayout, setNotationLayout] = usePersisted<SheetMusicLayout>(
    'settings.practiceNotationLayout',
    'flow',
  );
  const [adaptiveTutorEnabled, setAdaptiveTutorEnabled] = usePersisted<boolean>(
    'settings.adaptiveTutorEnabled',
    true,
  );
  const [tutorAutoRewind, setTutorAutoRewind] = usePersisted<boolean>(
    'settings.tutorAutoRewind',
    true,
  );
  const [tutorLivesEnabled, setTutorLivesEnabled] = usePersisted<boolean>(
    'settings.tutorLivesEnabled',
    true,
  );
  const [autoContinueEnabled, setAutoContinueEnabled] = usePersisted<boolean>(
    'settings.autoContinueEnabled',
    true,
  );
  const [handsFreeControlsEnabled, setHandsFreeControlsEnabled] =
    usePersisted<boolean>('settings.handsFreeControlsEnabled', true);
  const exportPdfOffRef = useRef<(() => void) | undefined>(undefined);
  const loadRunsOffRef = useRef<(() => void) | undefined>(undefined);
  const saveRunOffRef = useRef<(() => void) | undefined>(undefined);
  // Provided by SongListView's route outlet. Tests and isolated callers may
  // still mount SongView without that parent, so the context remains optional.
  // around this route (see SongListView.tsx) - one hook instance shared by
  // the library header and whichever song is open, so both read/update the
  // same streak/XP state. Optional because a test (or any future caller)
  // that mounts SongView outside that Outlet simply gets no gamification
  // rather than a crash.
  const outletContext = useOutletContext<
    PracticeOutletContext | UseGamificationResult | undefined
  >();
  const gamification =
    outletContext && 'gamification' in outletContext
      ? outletContext.gamification
      : outletContext;
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const gameMode = useMemo<GameMode | undefined>(() => {
    return (searchParams.get('gameMode') as GameMode) ?? undefined;
  }, [searchParams]);
  const requestedPracticeSpeed = useMemo(() => {
    const configured = searchParams.get('practiceSpeed');
    const value = configured === null ? Number.NaN : Number(configured);

    return gameMode === 'practice' && Number.isFinite(value)
      ? Math.min(2, Math.max(0.3, value))
      : 1;
  }, [gameMode, searchParams]);
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
  const [runIdentity, setRunIdentity] = useState<PracticeRunIdentity>(
    createPracticeRunIdentity,
  );
  const runIdentityRef = useRef<PracticeRunIdentity>(runIdentity);
  // A ready-state kit command is explicit practice intent even though the
  // two command strikes happen while Judge is deliberately disabled. This
  // distinguishes a hands-free attempt from an untouched autoplay run.
  const guidedReadyRef = useRef(false);
  // Updated synchronously by useTutorSession before transport onEnded is
  // delivered, so failed evidence survives any recovery seek and is stored
  // with the canonical run.
  const tutorEvidenceRef = useRef<TutorRunEvidence | undefined>(undefined);
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
    layout: notationLayout,
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
    state: playbackState,
    duration,
    timeStore,
    isPlaying,
    isCounting,
    isStarted,
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
      const identity = runIdentityRef.current;
      const tutorEvidence =
        gameMode === 'practice' && tutorEvidenceRef.current
          ? {
              settings: { ...tutorEvidenceRef.current.settings },
              interventions: [...tutorEvidenceRef.current.interventions],
              recoveryAttempts: [...tutorEvidenceRef.current.recoveryAttempts],
            }
          : undefined;
      const runPlaybackSpeed = policy.speedControl
        ? playbackSpeedRef.current
        : 1;
      const chartRevision = `${id ?? 'unknown'}:${difficulty}:${
        songData?.updatedAt ?? songData?.lesson?.id ?? 'unversioned'
      }`;
      const learningEvidence = learningEvidenceForTutorRun({
        chartRevision,
        tutor: tutorEvidence,
        authoredSkills: songData?.lesson?.skills,
      });
      const baseRunSummary: RunSummary = {
        ...summary,
        mode: gameMode ?? 'perform',
        playbackSpeed: runPlaybackSpeed,
        difficulty,
        bestStreak: bestStreakRef.current,
        context: {
          sessionId: identity.sessionId,
          schemaVersion: PRACTICE_RUN_SCHEMA_VERSION,
          appVersion: APP_VERSION,
          scoringPolicyVersion: SCORING_POLICY_VERSION,
          startedAt: identity.startedAt ?? new Date().toISOString(),
          chartRevision,
          deviceId: selectedDevice?.id,
          deviceName: selectedDevice?.name,
          inputLatencyMs,
          inputMapping: snapshotInputMapping(inputMapping),
        },
        ...(tutorEvidence ? { tutor: tutorEvidence } : {}),
        ...(learningEvidence ? { learningEvidence } : {}),
      };
      const coachEvidence =
        chart && parsedMidi
          ? summarizeCoachFindings(
              analyzePracticeRuns({
                runs: [{ summary: baseRunSummary, records }],
                chart: buildCoachChart(chart, parsedMidi.measures),
              }).findings,
            )
          : [];
      const runSummary: RunSummary = {
        ...baseRunSummary,
        ...(coachEvidence.length > 0 ? { coachEvidence } : {}),
      };
      const { persistEligible, rewardEligible } = decideRunEvidence({
        score,
        records,
        guidedReady: guidedReadyRef.current,
        tutor: tutorEvidence,
      });

      setPracticeSummary(runSummary);
      setPracticePersistenceState(
        gameMode === 'practice' && id && persistEligible
          ? 'saving'
          : 'no-evidence',
      );
      // Cleared synchronously so a still-open modal from a prior run never
      // shows last run's XP for a frame while this run's recordRun IPC
      // round trip (below) is in flight.
      setGamificationResult(undefined);
      setIsScoreModalOpen(true);

      const previousScore = songData?.scoreData?.[difficulty];
      const isHighScore =
        policy.scoring &&
        (!previousScore ||
          calculateAccuracy(score) > calculateAccuracy(previousScore));

      if (policy.scoring) {
        setScoreData(score);
      }

      if (id && persistEligible) {
        saveRunOffRef.current?.();
        saveRunOffRef.current = window.electron.ipcRenderer.once<
          { error: string } | { songId: string }
        >('save-practice-run', (result) => {
          saveRunOffRef.current = undefined;

          if ('error' in result) {
            setPracticePersistenceState('failed');
            notification.error({
              title: 'Practice history was not saved',
              description: `${result.error} Your existing history is unchanged.`,
              placement: 'bottomRight',
              duration: 0,
            });
          } else {
            setPracticePersistenceState('saved');

            // A saved all-wrong/Tutor run does not earn rewards, but it is
            // still fresh Coach evidence. Refresh the shared Home cache only
            // after persistence succeeds so its next recommendation is live.
            if (isHighScore && rewardEligible) {
              window.electron.ipcRenderer.sendMessage('update-song', {
                id,
                scoreData: { [difficulty]: score },
              });
            }

            // Practice history is the source evidence for every durable
            // reward. Only mint XP, streak days, stars, or a high score after
            // the main process confirms that evidence reached disk.
            if (rewardEligible) {
              gamification?.recordRun(
                {
                  totalHits: runSummary.totalHits,
                  overallAccuracy: runSummary.overallAccuracy,
                  difficulty,
                  starsEarned: policy.scoring ? getStarRating(score) : 0,
                  minutes: durationRef.current / 60 / runPlaybackSpeed,
                },
                setGamificationResult,
              );
            }

            gamification?.loadAchievements();
          }
        });
        window.electron.ipcRenderer.sendMessage('save-practice-run', {
          songId: id,
          summary: runSummary,
          records,
        });
      }

      const nextRunIdentity = createPracticeRunIdentity();

      runIdentityRef.current = nextRunIdentity;
      setRunIdentity(nextRunIdentity);
      guidedReadyRef.current = false;
      tutorEvidenceRef.current = undefined;
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
  const markRunStarted = useCallback(() => {
    const current = runIdentityRef.current;

    if (current.startedAt) {
      return;
    }

    const started = { ...current, startedAt: new Date().toISOString() };

    runIdentityRef.current = started;
    setRunIdentity(started);
  }, []);
  const playRun = useCallback(() => {
    markRunStarted();
    play();
  }, [markRunStarted, play]);
  const playRunFromTick = useCallback(
    (tick: number) => {
      markRunStarted();
      playFromTick(tick);
    },
    [markRunStarted, playFromTick],
  );
  const onNextSong = useCallback(() => {
    if (gameMode === 'practice' && practicePersistenceState === 'saving') {
      return;
    }

    setIsScoreModalOpen(false);

    if (
      gameMode === 'practice' &&
      outletContext &&
      'continuePractice' in outletContext
    ) {
      outletContext.continuePractice(
        id && practiceSummary
          ? { candidateId: id, summary: practiceSummary }
          : undefined,
      );

      return;
    }

    navigate('/');
  }, [
    gameMode,
    id,
    navigate,
    outletContext,
    practicePersistenceState,
    practiceSummary,
  ]);
  const onRetry = useCallback(() => {
    setIsScoreModalOpen(false);
    setPracticePersistenceState('no-evidence');
    playRunFromTick(0);
  }, [playRunFromTick]);
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
    initialPlaybackSpeed: requestedPracticeSpeed,
  });

  useEffect(() => {
    if (
      gameMode !== 'practice' ||
      searchParams.get('autoStart') !== '1' ||
      !isReady ||
      isStarted ||
      isPlaying ||
      isCounting
    ) {
      return;
    }

    if (Math.abs(playbackSpeed - requestedPracticeSpeed) > 0.001) {
      setPlaybackSpeed(requestedPracticeSpeed);
      engine?.setPlaybackSpeed(requestedPracticeSpeed);

      return;
    }

    guidedReadyRef.current = true;

    const next = new URLSearchParams(searchParams);

    next.delete('autoStart');
    next.delete('practiceSpeed');
    setSearchParams(next, { replace: true });
    playRun();
  }, [
    engine,
    gameMode,
    isCounting,
    isPlaying,
    isReady,
    isStarted,
    playbackSpeed,
    playRun,
    requestedPracticeSpeed,
    searchParams,
    setPlaybackSpeed,
    setSearchParams,
  ]);

  const onTutorTakeover = useCallback(() => {
    setIsLooping(false);
    onPracticeRangeChange(undefined);
    clearSelection();
  }, [clearSelection, onPracticeRangeChange, setIsLooping]);
  const onTutorStateChange = useCallback((state: TutorState) => {
    tutorEvidenceRef.current = {
      settings: { ...state.settings },
      interventions: [...state.interventions],
      recoveryAttempts: [...state.recoveryAttempts],
    };
  }, []);
  const tutorSession = useTutorSession({
    engine,
    runKey: runIdentity.sessionId,
    chart,
    measures,
    delaySeconds,
    enabled: gameMode === 'practice' && adaptiveTutorEnabled,
    targetSpeed: playbackSpeed,
    setPlaybackSpeed,
    onTutorTakeover,
    onStateChange: onTutorStateChange,
    settings: {
      autoRewind: tutorAutoRewind,
      livesEnabled: tutorLivesEnabled,
    },
  });
  const drumGestureSurface = useMemo<DrumGestureSurface>(() => {
    if (isScoreModalOpen) {
      return 'result';
    }

    if (isPlaying || isCounting) {
      return 'playing';
    }

    if (isStarted || playbackState === 'parked') {
      return 'paused';
    }

    return 'ready';
  }, [isCounting, isPlaying, isScoreModalOpen, isStarted, playbackState]);
  const onDrumGesture = useCallback(
    (action: DrumGestureAction) => {
      if (action === 'start') {
        guidedReadyRef.current = true;
        playRun();

        return;
      }

      if (action === 'resume') {
        playRun();

        return;
      }

      if (action === 'pause') {
        pause();
        // The four deliberate command strikes arrive through the same MIDI
        // bus as musical input. Rewind past the command signature so Judge
        // and the canonical run record cannot learn from control gestures.
        seekSeconds(Math.max(0, timeStore.get() - 1.1));

        return;
      }

      if (action === 'retry') {
        onRetry();

        return;
      }

      if (action === 'continue') {
        onNextSong();

        return;
      }

      setIsScoreModalOpen(false);
      cancel();
      pause();
      navigate('/');
    },
    [
      cancel,
      navigate,
      onNextSong,
      onRetry,
      pause,
      playRun,
      seekSeconds,
      timeStore,
    ],
  );

  useDrumGestures({
    enabled: handsFreeControlsEnabled && !isLoading,
    surface: drumGestureSurface,
    mapping: inputMapping,
    onAction: onDrumGesture,
  });

  const tutorHudMessage = useMemo(() => {
    if (handsFreeControlsEnabled && drumGestureSurface === 'ready') {
      return {
        title: 'Ready when you are',
        detail: 'After a short silence: kick, crash, kick, crash to start.',
        tone: 'steady' as const,
      };
    }

    if (handsFreeControlsEnabled && drumGestureSurface === 'paused') {
      return {
        title: 'Paused at the kit',
        detail: 'Kick, crash, kick, crash to continue.',
        tone: 'steady' as const,
      };
    }

    return tutorSession.message;
  }, [drumGestureSurface, handsFreeControlsEnabled, tutorSession.message]);
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

  // Home's compact Coach rail deep-links here with only coachOpen=1. Consume
  // that flag independently from coachStart/coachEnd so a targeted loop can
  // still restore normally, and wait for the parsed chart before opening the
  // drawer that explains its evidence.
  useEffect(() => {
    if (
      searchParams.get('coachOpen') !== '1' ||
      !songData ||
      !chart ||
      !parsedMidi
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsCoachOpen(true);
      loadStoredRuns(true);

      const next = new URLSearchParams(searchParams);

      next.delete('coachOpen');
      setSearchParams(next, { replace: true });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [
    chart,
    loadStoredRuns,
    parsedMidi,
    searchParams,
    setSearchParams,
    songData,
  ]);

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
              playRun();

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
    handsFreeControlsEnabled || isPlaying || isCounting
      ? kitControlIds
      : undefined,
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

  useEffect(() => () => saveRunOffRef.current?.(), []);

  useEffect(() => {
    engine?.setClickSettings(clickVolume / 100, clickTone / 100);
  }, [engine, clickVolume, clickTone]);

  useEffect(() => {
    if (isReady) {
      setEngineMasterVolume(masterVolume / 100);
    }
  }, [setEngineMasterVolume, masterVolume, isReady]);

  const tutorControls = (
    <section className="flex flex-col gap-3" aria-label="Adaptive tutor">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
        Adaptive tutor
      </div>
      <div className="flex items-center justify-between gap-3">
        <SettingLabel
          label="Tutor listens"
          tooltip="Watch authoritative note outcomes and step in only after a repeated material mistake."
        />
        <Switch
          size="small"
          data-testid="setting-adaptive-tutor"
          aria-label="Tutor listens"
          checked={adaptiveTutorEnabled}
          onChange={setAdaptiveTutorEnabled}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <SettingLabel
          label="Smart rewind"
          tooltip="Return to a musical checkpoint, shape the tempo, and continue after clean repetitions."
        />
        <Switch
          size="small"
          data-testid="setting-tutor-auto-rewind"
          aria-label="Smart rewind"
          checked={tutorAutoRewind}
          disabled={!adaptiveTutorEnabled}
          onChange={setTutorAutoRewind}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <SettingLabel
          label="Practice lives"
          tooltip="Show a three-life challenge while keeping every mistake as learning evidence."
        />
        <Switch
          size="small"
          data-testid="setting-tutor-lives"
          aria-label="Practice lives"
          checked={tutorLivesEnabled}
          disabled={!adaptiveTutorEnabled}
          onChange={setTutorLivesEnabled}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <SettingLabel
          label="Auto-continue"
          tooltip="After a completed Practice task, show a cancellable countdown and start the next useful task automatically."
        />
        <Switch
          size="small"
          data-testid="setting-auto-continue"
          aria-label="Auto-continue"
          checked={autoContinueEnabled}
          onChange={setAutoContinueEnabled}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <SettingLabel
          label="Kit controls"
          tooltip="Use deliberate four-strike commands to start, pause, resume, retry, continue, or leave without touching the Mac."
        />
        <Switch
          size="small"
          data-testid="setting-hands-free-controls"
          aria-label="Kit controls"
          checked={handsFreeControlsEnabled}
          onChange={setHandsFreeControlsEnabled}
        />
      </div>
      <p className="m-0 text-xs leading-5 text-text-faint">
        After silence: kick, crash, kick, crash starts, pauses, resumes, or
        continues. Snare, kick, snare, kick retries. Ride, kick, ride, crash
        ends. Any extra strike cancels the command.
      </p>
    </section>
  );

  return (
    <Layout className="h-full pointer-events-auto">
      <ScoreSummary
        isOpen={isScoreModalOpen}
        onNextSong={onNextSong}
        nextLabel={gameMode === 'practice' ? 'Next practice' : undefined}
        autoContinueEnabled={
          gameMode === 'practice' &&
          autoContinueEnabled &&
          practicePersistenceState === 'saved'
        }
        persistenceState={
          gameMode === 'practice' ? practicePersistenceState : undefined
        }
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
        destroyOnHidden
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
        destroyOnHidden
        size={620}
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
          summaryRuns={songRuns}
          fullRuns={fullRuns}
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

            playRun();
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
        <div
          className="flex shrink-0 items-center gap-1 rounded-xl border border-border-soft bg-surface-raised p-1"
          role="group"
          aria-label="Notation view"
        >
          <Button
            type={notationLayout === 'flow' ? 'primary' : 'text'}
            size="small"
            data-testid="notation-flow-toggle"
            aria-pressed={notationLayout === 'flow'}
            onClick={() => setNotationLayout('flow')}
          >
            Flow
          </Button>
          <Button
            type={notationLayout === 'classic' ? 'primary' : 'text'}
            size="small"
            data-testid="notation-classic-toggle"
            aria-pressed={notationLayout === 'classic'}
            onClick={() => setNotationLayout('classic')}
          >
            Classic
          </Button>
        </div>
        {(policy.speedControl || policy.looping) && (
          <div className="flex shrink-0 items-center gap-2 rounded-xl bg-fill px-3 py-2">
            {policy.speedControl && (
              <div className="flex gap-2 items-center">
                <div className="text-text-faint">Speed:</div>

                <InputNumber
                  mode="spinner"
                  size="medium"
                  aria-label="Playback speed"
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
                  aria-label="Loop section"
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
          tutorControls={tutorControls}
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
        <Content
          className={cn(
            'grow p-6 m-0 overflow-auto flex flex-col items-center font-display text-ink',
            notationLayout === 'flow' && 'drumroll-flow-viewport',
          )}
        >
          {notationLayout === 'flow' && songData && (
            <div className="drumroll-flow-hud-anchor">
              <section
                className="drumroll-flow-hud"
                data-testid="flow-viewport-hud"
                data-mode={gameMode === 'practice' ? 'practice' : 'perform'}
                aria-label={`${
                  gameMode === 'practice' ? 'Practice' : 'Perform'
                } flow: ${songData.name} by ${songData.artist}`}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <h2
                      className="drumroll-flow-hud__title truncate"
                      title={songData.name}
                    >
                      {songData.name}
                    </h2>
                    <span className="drumroll-flow-hud__mode shrink-0">
                      {gameMode === 'practice'
                        ? 'Practice flow'
                        : 'Perform flow'}
                    </span>
                  </div>
                  <p
                    className="drumroll-flow-hud__artist truncate"
                    title={songData.artist}
                  >
                    {songData.artist}
                  </p>
                </div>
                <span className="drumroll-flow-hud__status shrink-0">
                  Continuous score
                </span>
              </section>
            </div>
          )}
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
              layout={notationLayout}
              timeStore={timeStore}
              chart={chart}
              delaySeconds={delaySeconds}
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
                  playRunFromTick(measure.startTick);
                }
              }}
            />
          )}
        </Content>
        {gameMode === 'practice' && (
          <TutorHud state={tutorSession.state} message={tutorHudMessage} />
        )}
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
