import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Drawer,
  InputNumber,
  Layout,
  Progress,
  Select,
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
import { secondsToTicks, ticksToSeconds } from '../../../chart-parser/timing';
import { calculateAccuracy, getStarRating } from '../../scoring';
import {
  RecordRunResult,
  UseGamificationResult,
} from '../../hooks/useGamification';
import { usePracticeSession } from '../../hooks/usePracticeSession';
import { useSheetMusic } from '../../hooks/useSheetMusic';
import { useInputControls } from '../../hooks/useInputControls';
import { useTransportShortcuts } from '../../hooks/useTransportShortcuts';
import {
  InactivityCheckpoint,
  useKitInactivityRecovery,
} from '../../hooks/useKitInactivityRecovery';
import { useRemediationSession } from '../../hooks/useRemediationSession';
import { ScoreSummary } from '../../components/ScoreSummary';
import { CountIn } from '../../components/CountIn';
import { StreakMeter, useStreakEngine } from '../../components/StreakMeter';
import {
  LoopEscapeRunwayModel,
  loopEscapePhase,
  NotationLocationReadout,
} from '../../components/ContinuousNotation';
import { InputMapping, ScoreData, Song } from '../../../types';
import {
  computeRunsTrend,
  decideRunEvidence,
  learningEvidenceForTutorRun,
  PracticeAttemptCheckpoint,
  PRACTICE_RUN_SCHEMA_VERSION,
  PracticeCardRunEvidence,
  RunSummary,
  SCORING_POLICY_VERSION,
  SongSectionAuditionEvidence,
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
import {
  PracticeReadinessCue,
  PracticeReadinessPhase,
} from '../../components/PracticeReadinessCue';
import {
  InactivityPauseVeil,
  useInactivityPauseVeil,
} from '../../components/InactivityPauseVeil';
import { useTutorSession } from '../../hooks/useTutorSession';
import { usePracticeAttemptCheckpoint } from '../../hooks/usePracticeAttemptCheckpoint';
import { useMidiInputTelemetry } from '../../hooks/useMidiInputTelemetry';
import { useDrumGestures } from '../../hooks/useDrumGestures';
import { DrumGestureAction, DrumGestureSurface } from '../../services/gestures';
import { CountInPolicy } from '../../services/engine';
import { HIT_TOLERANCE_SECONDS } from '../../services/engine/constants';
import { deriveAdaptiveTimingWindow } from '../../services/adaptive-practice';
import {
  buildTutorChartPlan,
  GUIDED_PRACTICE_TUTOR_SETTINGS,
  TutorState,
} from '../../services/tutor';
import {
  REQUIRED_CONSECUTIVE_CLEAN_PASSES,
  RemediationQueue,
  RemediationSource,
  createRemediationQueue,
  remediationQueueSlotKey,
} from '../../services/remediation';
import {
  decideLessonProgression,
  EMPTY_LESSON_TRAVERSAL,
  LessonProgressionDecision,
  LessonTraversalEvidence,
} from '../../services/lesson-progression';
import { SettingLabel } from '../../components/SettingsButton/SettingLabel';
import { PracticeOutletContext } from '../practice-context';
import { chartContentRevision } from '../../services/chart-revision';
import './SongView.css';

interface PracticeRunIdentity {
  sessionId: string;
  startedAt?: string;
}

export function canAutoContinuePractice(
  gameMode: GameMode | undefined,
  enabled: boolean,
  persistenceState: 'saving' | 'saved' | 'failed' | 'no-evidence',
  songData: Song | undefined,
): boolean {
  return (
    gameMode === 'practice' &&
    !songData?.lesson &&
    enabled &&
    persistenceState === 'saved'
  );
}

const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'development';
const EMPTY_ATTEMPT_EVIDENCE = { getAttemptRecords: () => [] };

function createPracticeRunIdentity(): PracticeRunIdentity {
  const randomId = globalThis.crypto?.randomUUID?.();

  return {
    sessionId:
      randomId ??
      `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  };
}

function boundedText(
  value: string | null,
  maximum: number,
): string | undefined {
  const trimmed = value?.trim();

  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

function parsePracticeCardEvidence(
  params: URLSearchParams,
  songId: string | undefined,
): PracticeCardRunEvidence | undefined {
  const kind = params.get('practiceCardKind');
  const candidate_id = params.get('practiceCardCandidate');
  const source_label = boundedText(params.get('practiceCardSource'), 220);

  if (
    !songId ||
    candidate_id !== songId ||
    !source_label ||
    !['review', 'build', 'apply'].includes(kind ?? '')
  ) {
    return undefined;
  }

  return {
    kind: kind as PracticeCardRunEvidence['kind'],
    candidate_id,
    source_label,
  };
}

function parseSongSectionAudition(
  params: URLSearchParams,
  songId: string | undefined,
  speed: number,
): SongSectionAuditionEvidence | undefined {
  const start_bar = Number(params.get('auditionStart'));
  const end_bar = Number(params.get('auditionEnd'));
  const section_label = boundedText(params.get('auditionLabel'), 100);
  const test_label = boundedText(params.get('auditionTest'), 180);
  const required_skill_id = boundedText(params.get('auditionSkill'), 120);

  if (
    params.get('audition') !== '1' ||
    !songId ||
    !Number.isInteger(start_bar) ||
    !Number.isInteger(end_bar) ||
    start_bar <= 0 ||
    end_bar < start_bar ||
    !section_label ||
    !test_label ||
    !required_skill_id
  ) {
    return undefined;
  }

  return {
    song_id: songId,
    start_bar,
    end_bar,
    speed,
    section_label,
    test_label,
    required_skill_id,
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

function remediationSourceForRun(
  songId: string,
  chartRevision: string,
  summary: RunSummary,
): RemediationSource {
  const sessionId =
    summary.context?.sessionId ?? `legacy:${songId}:${summary.completedAt}`;

  return {
    runId: sessionId,
    sessionId,
    songId,
    chartRevision,
    completedAt: summary.completedAt,
  };
}

export function SongView() {
  const { difficulty, setDifficulty, isDev } = useApp();
  const {
    inputMapping,
    controlMapping,
    kitControlIds,
    selectedDevice,
    inputReadiness,
    midiPortEpoch,
    inputLatencyMs,
    reconnectMidi,
  } = useInput();
  const {
    playheadStyle,
    enableColors,
    showBarNumbers,
    showTempo,
    countIn,
    zoom,
  } = useSongViewSettings();
  const { notification, message } = App.useApp();
  const [scoreData, setScoreData] = useState<ScoreData>();
  const [practiceSummary, setPracticeSummary] = useState<RunSummary>();
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [practicePersistenceState, setPracticePersistenceState] = useState<
    'saving' | 'saved' | 'failed' | 'no-evidence'
  >('no-evidence');
  const [noMusicalInput, setNoMusicalInput] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [songRuns, setSongRuns] = useState<RunSummary[]>();
  const [fullRuns, setFullRuns] = useState<StoredPracticeRun[]>();
  const [interruptedAttempts, setInterruptedAttempts] = useState<
    PracticeAttemptCheckpoint[]
  >([]);
  const [gamificationResult, setGamificationResult] =
    useState<RecordRunResult>();
  const previousPracticeSummary = useMemo(
    () =>
      practiceSummary
        ? fullRuns
            ?.map(({ summary }) => summary)
            .filter(
              ({ completedAt }) => completedAt < practiceSummary.completedAt,
            )
            .sort((left, right) =>
              left.completedAt.localeCompare(right.completedAt),
            )
            .at(-1)
        : undefined,
    [fullRuns, practiceSummary],
  );
  const [lessonProgressionResult, setLessonProgressionResult] =
    useState<LessonProgressionDecision>();
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
    'settings.challengeLivesEnabled',
    false,
  );
  const [autoContinueEnabled, setAutoContinueEnabled] = usePersisted<boolean>(
    'settings.autoContinueEnabled',
    true,
  );
  const [handsFreeControlsEnabled, setHandsFreeControlsEnabled] =
    usePersisted<boolean>('settings.handsFreeControlsEnabled', true);
  const exportPdfOffRef = useRef<(() => void) | undefined>(undefined);
  const loadRunsOffRef = useRef<(() => void) | undefined>(undefined);
  const loadAttemptsOffRef = useRef<(() => void) | undefined>(undefined);
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
  const outletRecommendationReason =
    outletContext && 'recommendationReason' in outletContext
      ? outletContext.recommendationReason
      : undefined;
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const gameMode = useMemo<GameMode | undefined>(() => {
    return (searchParams.get('gameMode') as GameMode) ?? undefined;
  }, [searchParams]);
  const practiceRecommendationReason =
    gameMode === 'practice' ? outletRecommendationReason : undefined;
  const requestedPracticeSpeed = useMemo(() => {
    const configured = searchParams.get('practiceSpeed');
    const value = configured === null ? Number.NaN : Number(configured);

    return gameMode === 'practice' && Number.isFinite(value)
      ? Math.min(2, Math.max(0.3, value))
      : 1;
  }, [gameMode, searchParams]);
  const practiceCardEvidence = useMemo(
    () => parsePracticeCardEvidence(searchParams, id),
    [id, searchParams],
  );
  const audition = useMemo(
    () => parseSongSectionAudition(searchParams, id, requestedPracticeSpeed),
    [id, requestedPracticeSpeed, searchParams],
  );
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
  const practiceCardRef = useRef<PracticeCardRunEvidence | undefined>(
    practiceCardEvidence,
  );
  const auditionRef = useRef<SongSectionAuditionEvidence | undefined>(audition);
  const [runIdentity, setRunIdentity] = useState<PracticeRunIdentity>(
    createPracticeRunIdentity,
  );
  const { telemetry: midiTelemetry, readTelemetry: readMidiTelemetry } =
    useMidiInputTelemetry({
      sessionId: runIdentity.sessionId,
      selectedDevice,
      inputMapping,
      selectedPortEpoch: midiPortEpoch,
    });
  const lastMidiTime = midiTelemetry?.lastMidiTimestamp
    ? new Date(midiTelemetry.lastMidiTimestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'none';
  const runIdentityRef = useRef<PracticeRunIdentity>(runIdentity);
  const attemptCheckpointControlRef = useRef<
    | {
        prepareForCompletion: () => boolean;
      }
    | undefined
  >(undefined);
  // A failed completed-run write intentionally leaves its recovery draft on
  // disk. Carry every such id into the next successful atomic save so a later
  // retry cannot strand a stale "interrupted" attempt.
  const pendingAttemptSessionIdsRef = useRef<Set<string>>(new Set());
  // A resumed run receives a fresh live identity so its new evidence is not
  // relabelled as the interrupted draft. Keep the source checkpoint id until
  // a completed run is durably acknowledged, then retire both drafts in the
  // same persistence operation.
  const resumedAttemptSessionIdRef = useRef<string | undefined>(undefined);
  // A ready-state kit command is explicit practice intent even though the
  // two command strikes happen while Judge is deliberately disabled. This
  // distinguishes a hands-free attempt from an untouched autoplay run.
  const guidedReadyRef = useRef(false);
  // Updated synchronously by useTutorSession before transport onEnded is
  // delivered, so failed evidence survives any recovery seek and is stored
  // with the canonical run.
  const tutorEvidenceRef = useRef<TutorRunEvidence | undefined>(undefined);
  const lessonTraversalRef = useRef<LessonTraversalEvidence>({
    ...EMPTY_LESSON_TRAVERSAL,
  });
  const navigate = useNavigate();
  const { fileData, format, songData, trackData } = useSongLoader(id);

  useEffect(() => {
    practiceCardRef.current = practiceCardEvidence;
  }, [practiceCardEvidence]);
  useEffect(() => {
    auditionRef.current = audition;
  }, [audition]);

  const adaptiveTiming = useMemo(
    () =>
      deriveAdaptiveTimingWindow({
        kind: songData?.lesson ? 'lesson' : 'song',
        runs: songRuns,
      }),
    [songData?.lesson, songRuns],
  );
  const hitToleranceSeconds =
    gameMode === 'practice'
      ? adaptiveTiming.timingWindowMs / 1000
      : HIT_TOLERANCE_SECONDS;
  const currentChartRevision = useMemo(
    () =>
      chartContentRevision({
        songId: id,
        difficulty,
        format,
        fileData,
      }),
    [difficulty, fileData, format, id],
  );

  useEffect(() => {
    if (!id || gameMode !== 'practice') {
      return undefined;
    }

    loadAttemptsOffRef.current?.();
    loadAttemptsOffRef.current = window.electron.ipcRenderer.once<
      | { songId: string; checkpoints: PracticeAttemptCheckpoint[] }
      | { error: string }
    >('load-practice-attempt-checkpoints', (result) => {
      loadAttemptsOffRef.current = undefined;

      if ('checkpoints' in result) {
        setInterruptedAttempts(result.checkpoints);
      }
    });
    window.electron.ipcRenderer.sendMessage(
      'load-practice-attempt-checkpoints',
      id,
    );

    return () => {
      loadAttemptsOffRef.current?.();
      loadAttemptsOffRef.current = undefined;
    };
  }, [gameMode, id]);

  // The difficulties this specific chart actually carries - auto-charted
  // songs usually have all four, lesson charts often only Expert. Falls
  // back to just the currently-loaded difficulty (rather than every
  // possible value) when a song predates drumDifficulties being recorded,
  // so the selector never lists an option the chart can't parse.
  const availableDifficulties: Difficulty[] = songData?.drumDifficulties?.length
    ? songData.drumDifficulties
    : [difficulty];
  const notationColorsEnabled = notationLayout === 'flow' || enableColors;
  const practiceInputStatus = useMemo(() => {
    if (selectedDevice?.sourceId === 'keyboard') {
      return {
        shortLabel: 'Keyboard',
        accessibleLabel: 'Keyboard input connected',
        state: 'connected' as const,
      };
    }

    if (inputReadiness === 'connected') {
      return {
        shortLabel: 'Kit ready',
        accessibleLabel: `MIDI connected${
          selectedDevice?.name ? ` to ${selectedDevice.name}` : ''
        }`,
        state: 'connected' as const,
      };
    }

    if (inputReadiness === 'reconnecting') {
      return {
        shortLabel: 'Kit retrying',
        accessibleLabel: `MIDI reconnecting${
          selectedDevice?.name ? ` to ${selectedDevice.name}` : ''
        }`,
        state: 'reconnecting' as const,
      };
    }

    return {
      shortLabel: 'Kit waiting',
      accessibleLabel: 'Waiting for a MIDI drum kit',
      state: 'waiting' as const,
    };
  }, [inputReadiness, selectedDevice]);
  const { chart, parsedMidi, renderData, vexflowContainerRef } = useSheetMusic({
    fileData,
    format,
    fiveLaneDrums: songData?.fiveLaneDrums ?? false,
    proDrums: songData?.proDrums ?? false,
    songId: songData?.id,
    difficulty,
    showBarNumbers: isDev && showBarNumbers,
    enableColors: notationColorsEnabled,
    showTempo,
    layout: notationLayout,
  });
  const measures = useMemo(
    () => renderData.map((rd) => rd.measure),
    [renderData],
  );
  const interruptedAttempt = useMemo(
    () =>
      interruptedAttempts
        .filter(
          (attempt) =>
            attempt.songId === id &&
            attempt.chartRevision === currentChartRevision,
        )
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
        .at(-1),
    [currentChartRevision, id, interruptedAttempts],
  );
  const interruptedResumeMeasure = useMemo(() => {
    if (!interruptedAttempt || measures.length === 0) {
      return undefined;
    }

    const containingIndex = measures.findIndex(
      (measure) =>
        interruptedAttempt.positionTick >= measure.startTick &&
        interruptedAttempt.positionTick < measure.endTick,
    );

    return containingIndex >= 0
      ? containingIndex
      : Math.max(0, measures.length - 1);
  }, [interruptedAttempt, measures]);
  const interruptedResumeTick =
    interruptedResumeMeasure === undefined
      ? undefined
      : measures[interruptedResumeMeasure]?.startTick;
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
  // Hands-free start uses the same transport policy as the on-screen play
  // button. Count-in is enabled by default, but an explicit user choice to
  // turn it off must still be respected at the kit.
  const countInEnabled = countIn;
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
    isStarted,
    isEnded,
    countInBeat,
    countInBeats,
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
    countInEnabled,
    player: policy.player,
    playheadStyle: policy.playheadOverride ?? playheadStyle,
    mapping: inputMapping,
    hitToleranceSeconds,
    preferUnhitNotes: gameMode === 'practice',
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
      const completedMidiTelemetry = readMidiTelemetry();
      const missingMusicalInput =
        selectedDevice?.sourceId === 'midi' &&
        completedMidiTelemetry?.rawMessageCount === 0;

      // Capture the final Judge journal synchronously before Transport's
      // ended-state render can tear down the checkpoint hook. This seals its
      // lifecycle listeners without deleting the draft; the atomic run save
      // below owns deletion only after it reaches durable storage.
      attemptCheckpointControlRef.current?.prepareForCompletion();

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
      const learningEvidence = learningEvidenceForTutorRun({
        chartRevision: currentChartRevision,
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
          chartRevision: currentChartRevision,
          deviceId: selectedDevice?.id,
          deviceName: selectedDevice?.name,
          inputLatencyMs,
          inputMapping: snapshotInputMapping(inputMapping),
        },
        ...(tutorEvidence ? { tutor: tutorEvidence } : {}),
        ...(learningEvidence ? { learningEvidence } : {}),
        timingWindowMs: Math.round(hitToleranceSeconds * 1000),
        ...(songData?.lesson?.skills
          ? { authoredSkills: [...songData.lesson.skills] }
          : {}),
        ...(practiceCardRef.current
          ? { practiceCard: { ...practiceCardRef.current } }
          : {}),
        ...(auditionRef.current
          ? {
              audition: {
                ...auditionRef.current,
                speed: runPlaybackSpeed,
              },
            }
          : {}),
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
      const runEvidence = decideRunEvidence({
        score,
        records,
        guidedReady: guidedReadyRef.current,
        tutor: tutorEvidence,
      });
      const persistEligible =
        runEvidence.persistEligible && !missingMusicalInput;
      const rewardEligible = runEvidence.rewardEligible && !missingMusicalInput;
      const lessonProgression = decideLessonProgression({
        isLesson: Boolean(songData?.lesson),
        gameMode,
        traversal: lessonTraversalRef.current,
        score,
      });
      const scoreSubmissionEligible =
        policy.scoring || lessonProgression.qualifies;

      setPracticeSummary(runSummary);
      setNoMusicalInput(missingMusicalInput);
      setPracticePersistenceState(
        gameMode === 'practice' && id && persistEligible
          ? 'saving'
          : 'no-evidence',
      );
      // Cleared synchronously so a still-open modal from a prior run never
      // shows last run's XP for a frame while this run's recordRun IPC
      // round trip (below) is in flight.
      setGamificationResult(undefined);
      setLessonProgressionResult(
        songData?.lesson ? lessonProgression : undefined,
      );
      setIsScoreModalOpen(true);

      const previousScore = songData?.scoreData?.[difficulty];
      const isHighScore =
        scoreSubmissionEligible &&
        (!previousScore ||
          calculateAccuracy(score) > calculateAccuracy(previousScore));

      if (policy.scoring) {
        setScoreData(score);
      }

      if (id && persistEligible) {
        const finalizeAttemptSessionIds = [
          identity.sessionId,
          ...(resumedAttemptSessionIdRef.current
            ? [resumedAttemptSessionIdRef.current]
            : []),
          ...pendingAttemptSessionIdsRef.current,
        ].filter(
          (sessionId, index, allSessionIds) =>
            allSessionIds.indexOf(sessionId) === index,
        );

        finalizeAttemptSessionIds.forEach((sessionId) =>
          pendingAttemptSessionIdsRef.current.add(sessionId),
        );
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
            finalizeAttemptSessionIds.forEach((sessionId) =>
              pendingAttemptSessionIdsRef.current.delete(sessionId),
            );
            resumedAttemptSessionIdRef.current = undefined;

            if (lessonProgression.qualifies) {
              setScoreData(score);
            }

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
                  starsEarned: scoreSubmissionEligible
                    ? getStarRating(score)
                    : 0,
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
          finalizeAttemptSessionIds,
        });
      } else if (id && identity.startedAt) {
        // The transport ended intentionally but produced no durable scored
        // evidence. Clear only this open draft so it is not mislabelled as an
        // interrupted session on the next launch.
        window.electron.ipcRenderer.sendMessage(
          'finalize-practice-attempt-checkpoint',
          { songId: id, sessionId: identity.sessionId },
        );
      }

      const nextRunIdentity = createPracticeRunIdentity();

      runIdentityRef.current = nextRunIdentity;
      setRunIdentity(nextRunIdentity);
      guidedReadyRef.current = false;
      tutorEvidenceRef.current = undefined;
      lessonTraversalRef.current = { ...EMPTY_LESSON_TRAVERSAL };
    },
  });
  const readAttemptCheckpointSeed = useCallback(() => {
    const identity = runIdentityRef.current;

    if (!engine || !id || !chart || !identity.startedAt) {
      return undefined;
    }

    return {
      songId: id,
      sessionId: identity.sessionId,
      startedAt: identity.startedAt,
      chartRevision: currentChartRevision,
      mode: gameMode ?? ('perform' as const),
      difficulty,
      playbackSpeed: policy.speedControl ? playbackSpeedRef.current : 1,
      positionTick: () =>
        Math.max(
          0,
          secondsToTicks(
            timeStore.get() - delaySeconds,
            chart.resolution,
            chart.tempos,
          ),
        ),
      midiTelemetry: readMidiTelemetry,
    };
  }, [
    chart,
    currentChartRevision,
    delaySeconds,
    difficulty,
    engine,
    gameMode,
    id,
    policy.speedControl,
    readMidiTelemetry,
    timeStore,
  ]);
  const attemptCheckpointOptions = useMemo(
    () => ({
      enabled: Boolean(
        engine && id && chart && runIdentity.startedAt && !isEnded,
      ),
      readSeed: readAttemptCheckpointSeed,
      evidence: engine ?? EMPTY_ATTEMPT_EVIDENCE,
    }),
    [
      chart,
      engine,
      id,
      isEnded,
      readAttemptCheckpointSeed,
      runIdentity.startedAt,
    ],
  );
  const { prepareForCompletion: prepareCheckpointForCompletion } =
    usePracticeAttemptCheckpoint(attemptCheckpointOptions);

  useEffect(() => {
    const control = {
      prepareForCompletion: prepareCheckpointForCompletion,
    };

    attemptCheckpointControlRef.current = control;

    return () => {
      if (attemptCheckpointControlRef.current === control) {
        attemptCheckpointControlRef.current = undefined;
      }
    };
  }, [prepareCheckpointForCompletion]);

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
  const chartLoading = Boolean(
    songData && (!chart || !parsedMidi || renderData.length === 0),
  );
  const isLoading = !songData || audioLoading || chartLoading;
  const markRunStarted = useCallback(() => {
    const current = runIdentityRef.current;

    if (current.startedAt) {
      return;
    }

    const started = { ...current, startedAt: new Date().toISOString() };

    runIdentityRef.current = started;
    setRunIdentity(started);
  }, []);
  const beginLessonTraversal = useCallback((startedAtBeginning: boolean) => {
    if (runIdentityRef.current.startedAt) {
      return;
    }

    lessonTraversalRef.current = {
      startedAtBeginning,
      uninterrupted: true,
      minimumPlaybackSpeed: playbackSpeedRef.current,
    };
  }, []);
  const playRun = useCallback(
    (countInPolicy: CountInPolicy = 'inherit') => {
      beginLessonTraversal(timeStore.get() <= Math.max(0, delaySeconds) + 0.05);
      markRunStarted();

      if (countInPolicy === 'inherit') {
        play();
      } else if (chart) {
        const currentTick = secondsToTicks(
          Math.max(0, timeStore.get() - delaySeconds),
          chart.resolution,
          chart.tempos,
        );
        const currentMeasure = measures.find(
          (measure) =>
            currentTick >= measure.startTick && currentTick < measure.endTick,
        );

        playFromTick(currentMeasure?.startTick ?? 0, countInPolicy);
      }
    },
    [
      beginLessonTraversal,
      chart,
      delaySeconds,
      markRunStarted,
      measures,
      play,
      playFromTick,
      timeStore,
    ],
  );
  const playRunFromTick = useCallback(
    (tick: number, countInPolicy: CountInPolicy = 'inherit') => {
      beginLessonTraversal(tick <= 0);
      markRunStarted();
      playFromTick(tick, countInPolicy);
    },
    [beginLessonTraversal, markRunStarted, playFromTick],
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
    if (gameMode === 'practice' && practicePersistenceState === 'saving') {
      return;
    }

    setIsScoreModalOpen(false);
    setPracticePersistenceState('no-evidence');
    setNoMusicalInput(false);
    playRunFromTick(0);
  }, [gameMode, playRunFromTick, practicePersistenceState]);
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
    onPlay: playRun,
    onPlayFromTick: playRunFromTick,
  });
  const selectPracticeLoop = useCallback(
    (range: PracticeRange) => {
      setIsLooping(true);
      onPracticeRangeChange(range);
    },
    [onPracticeRangeChange, setIsLooping],
  );
  const clearPracticeLoop = useCallback(() => {
    setIsLooping(false);
    onPracticeRangeChange(undefined);
    clearSelection();
  }, [clearSelection, onPracticeRangeChange, setIsLooping]);
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
  const appliedAuditionRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (gameMode !== 'practice' || !audition) {
      return;
    }

    const token = [
      audition.song_id,
      audition.start_bar,
      audition.end_bar,
      audition.speed,
    ].join(':');

    if (appliedAuditionRef.current === token) {
      return;
    }

    if (applyCoachLoop(audition.start_bar, audition.end_bar, audition.speed)) {
      appliedAuditionRef.current = token;
    }
  }, [applyCoachLoop, audition, gameMode]);

  const remediationStorageKey = id
    ? remediationQueueSlotKey(id, currentChartRevision)
    : undefined;
  const tutorChartPlan = useMemo(
    () => buildTutorChartPlan(measures),
    [measures],
  );
  const remediationSession = useRemediationSession({
    engine,
    chart,
    measures,
    isLooping,
    storageKey: remediationStorageKey,
  });
  const remediationProgress = useMemo(() => {
    const queue = remediationSession.queue;

    if (!queue) {
      return undefined;
    }

    const completedTasks = queue.tasks.filter(
      (task) => task.status === 'completed',
    ).length;
    const activeCleanPasses =
      remediationSession.activeTask?.consecutiveCleanPasses ?? 0;
    const completedUnits =
      completedTasks * REQUIRED_CONSECUTIVE_CLEAN_PASSES + activeCleanPasses;
    const totalUnits = queue.tasks.length * REQUIRED_CONSECUTIVE_CLEAN_PASSES;

    return {
      completedTasks,
      totalTasks: queue.tasks.length,
      percent: Math.round((completedUnits / totalUnits) * 100),
    };
  }, [remediationSession.activeTask, remediationSession.queue]);
  const appliedRemediationTaskRef = useRef<string | undefined>(undefined);
  const handledRemediationCompletionRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const queue = remediationSession.queue;
    const task = remediationSession.activeTask;

    if (gameMode !== 'practice' || !queue || !task) {
      return;
    }

    const token = `${queue.id}:${task.id}`;

    if (appliedRemediationTaskRef.current === token) {
      return;
    }

    if (applyCoachLoop(task.barStart, task.barEnd, task.playbackSpeed)) {
      appliedRemediationTaskRef.current = token;
    }
  }, [
    applyCoachLoop,
    gameMode,
    remediationSession.activeTask,
    remediationSession.queue,
  ]);

  useEffect(() => {
    const queue = remediationSession.queue;
    const reviewReceiptKey = remediationStorageKey
      ? `${remediationStorageKey}:reviewed:${encodeURIComponent(
          queue?.id ?? '',
        )}`
      : undefined;

    if (
      !queue ||
      queue.status !== 'completed' ||
      handledRemediationCompletionRef.current === queue.id ||
      (reviewReceiptKey &&
        localStorage.getItem(reviewReceiptKey) === queue.completedAt)
    ) {
      return;
    }

    handledRemediationCompletionRef.current = queue.id;

    if (reviewReceiptKey && queue.completedAt) {
      localStorage.setItem(reviewReceiptKey, queue.completedAt);
    }

    setIsLooping(false);
    onPracticeRangeChange(undefined);
    clearSelection();
    pause();
    setIsCoachOpen(true);
    loadStoredRuns(true);
  }, [
    clearSelection,
    loadStoredRuns,
    onPracticeRangeChange,
    pause,
    remediationSession.queue,
    remediationStorageKey,
    setIsLooping,
  ]);

  const parkForInactivity = useCallback(
    (checkpoint: InactivityCheckpoint) => {
      if (!chart) {
        return;
      }

      reconnectMidi();
      pause();
      seekSeconds(
        ticksToSeconds(
          checkpoint.checkpointTick,
          chart.resolution,
          chart.tempos,
        ) + delaySeconds,
      );
    },
    [chart, delaySeconds, pause, reconnectMidi, seekSeconds],
  );
  const resumeAfterInactivity = useCallback(
    (checkpoint: InactivityCheckpoint) => {
      guidedReadyRef.current = true;
      playRunFromTick(checkpoint.checkpointTick, 'force');
    },
    [playRunFromTick],
  );
  const inactivityRecovery = useKitInactivityRecovery({
    enabled:
      gameMode === 'practice' &&
      handsFreeControlsEnabled &&
      !isEnded &&
      !isScoreModalOpen,
    engine,
    isPlaying,
    chart,
    measures,
    delaySeconds,
    mapping: inputMapping,
    timeStore,
    onPark: parkForInactivity,
    onResume: resumeAfterInactivity,
  });
  const inactivityPauseVeil = useInactivityPauseVeil(
    gameMode === 'practice' && inactivityRecovery.phase === 'parked'
      ? inactivityRecovery.pauseEpoch
      : undefined,
  );

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
    suspended:
      inactivityRecovery.phase === 'parked' ||
      remediationSession.queue?.status === 'active',
    targetSpeed: playbackSpeed,
    setPlaybackSpeed,
    onTutorTakeover,
    onStateChange: onTutorStateChange,
    settings: {
      ...GUIDED_PRACTICE_TUTOR_SETTINGS,
      autoRewind: tutorAutoRewind,
      livesEnabled: tutorLivesEnabled,
    },
    hitToleranceSeconds,
  });
  const loopEscape = useMemo<LoopEscapeRunwayModel | undefined>(() => {
    if (gameMode !== 'practice' || notationLayout !== 'flow') {
      return undefined;
    }

    const remediationTask = remediationSession.activeTask;

    if (remediationTask) {
      const lastAttempt = remediationTask.attempts.at(-1);

      return {
        barStart: remediationTask.barStart,
        barEnd: remediationTask.barEnd,
        qualityProgress: remediationTask.consecutiveCleanPasses,
        requiredCleanPasses: REQUIRED_CONSECUTIVE_CLEAN_PASSES,
        currentSpeed: playbackSpeed,
        targetSpeed: remediationTask.playbackSpeed,
        retainedQuality:
          Boolean(lastAttempt) &&
          !lastAttempt!.qualifiesAsCleanPass &&
          lastAttempt!.consecutiveCleanPassesAfter > 0,
      };
    }

    if (remediationSession.queue?.status === 'completed') {
      const finalTask = remediationSession.queue.tasks.at(-1);

      if (finalTask) {
        return {
          barStart: finalTask.barStart,
          barEnd: finalTask.barEnd,
          qualityProgress: REQUIRED_CONSECUTIVE_CLEAN_PASSES,
          requiredCleanPasses: REQUIRED_CONSECUTIVE_CLEAN_PASSES,
          currentSpeed: playbackSpeed,
          targetSpeed: playbackSpeed,
          phase: 'release',
        };
      }
    }

    const recovery = tutorSession.state.recovery;

    if (recovery) {
      const lastAttempt = tutorSession.state.recoveryAttempts.at(-1);

      return {
        barStart: recovery.region.startMeasure + 1,
        barEnd: recovery.region.endMeasure + 1,
        qualityProgress: recovery.qualityProgress,
        requiredCleanPasses:
          tutorSession.state.settings.requiredCleanRepetitions,
        currentSpeed: tutorSession.state.currentSpeed,
        targetSpeed: tutorSession.state.targetSpeed,
        retainedQuality:
          lastAttempt?.result === 'retry' && recovery.qualityProgress > 0,
      };
    }

    const outcome = tutorSession.state.lastRecoveryOutcome;

    if (outcome?.status === 'mastered') {
      return {
        barStart: outcome.startMeasure + 1,
        barEnd: outcome.endMeasure + 1,
        qualityProgress: outcome.qualityProgress,
        requiredCleanPasses:
          tutorSession.state.settings.requiredCleanRepetitions,
        currentSpeed: outcome.resumeSpeed,
        targetSpeed: tutorSession.state.targetSpeed,
        phase: 'release',
      };
    }

    return undefined;
  }, [
    gameMode,
    notationLayout,
    playbackSpeed,
    remediationSession.activeTask,
    remediationSession.queue,
    tutorSession.state,
  ]);
  const recoveryCaption = useMemo(() => {
    if (!loopEscape) {
      return undefined;
    }

    if (loopEscapePhase(loopEscape) === 'release') {
      return {
        title: 'Loop released',
        detail: `Two verified passes earned this exit at ${loopEscape.currentSpeed.toFixed(
          1,
        )}×.`,
      };
    }

    if (loopEscape.retainedQuality) {
      return {
        title: 'Near-clean quality retained',
        detail: `${loopEscape.qualityProgress.toFixed(1)} of ${
          loopEscape.requiredCleanPasses
        } passes remains banked.`,
      };
    }

    return {
      title:
        loopEscape.qualityProgress >= 1
          ? 'First anchor acquired'
          : 'Coach loop armed',
      detail: `${loopEscape.qualityProgress.toFixed(1)} of ${
        loopEscape.requiredCleanPasses
      } verified passes at ${loopEscape.currentSpeed.toFixed(1)}×.`,
    };
  }, [loopEscape]);
  const drumGestureSurface = useMemo<DrumGestureSurface>(() => {
    if (isScoreModalOpen) {
      return 'result';
    }

    if (isPlaying || isCounting) {
      return 'playing';
    }

    if (isStarted) {
      return 'paused';
    }

    return 'ready';
  }, [isCounting, isPlaying, isScoreModalOpen, isStarted]);
  const onDrumGesture = useCallback(
    (action: DrumGestureAction) => {
      // Multi-hit gestures are observed before Judge and resolved after the
      // final physical strike. Close that evidence transaction first: a
      // deliberate command must never become Coach/Tutor error evidence.
      const commandRewindSeconds = engine?.completeControlGestureCapture();

      if (action === 'start') {
        guidedReadyRef.current = true;

        if (interruptedAttempt && interruptedResumeTick !== undefined) {
          resumedAttemptSessionIdRef.current = interruptedAttempt.sessionId;
          setInterruptedAttempts((attempts) =>
            attempts.filter(
              (attempt) => attempt.sessionId !== interruptedAttempt.sessionId,
            ),
          );
          playRunFromTick(interruptedResumeTick, 'force');

          return;
        }

        playRun();

        return;
      }

      if (action === 'resume') {
        playRun('force');

        return;
      }

      if (action === 'pause') {
        pause();
        // The four deliberate command strikes arrive through the same MIDI
        // bus as musical input. Rewind to the transaction's exact first
        // affected chart boundary so neither Judge nor canonical analytics
        // can learn from control gestures, including at 2x playback.
        seekSeconds(commandRewindSeconds ?? timeStore.get());

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
      engine,
      navigate,
      onNextSong,
      onRetry,
      pause,
      playRun,
      playRunFromTick,
      seekSeconds,
      timeStore,
      interruptedAttempt,
      interruptedResumeTick,
    ],
  );

  useDrumGestures({
    enabled:
      handsFreeControlsEnabled &&
      !isLoading &&
      !(
        tutorSession.state.phase === 'recovering' &&
        !isPlaying &&
        !isCounting
      ) &&
      !(
        drumGestureSurface === 'result' &&
        gameMode === 'practice' &&
        practicePersistenceState === 'saving'
      ),
    surface: drumGestureSurface,
    mapping: inputMapping,
    onAction: onDrumGesture,
    onCandidateStart: () => engine?.beginControlGestureCapture(),
    onCandidateCancel: () => engine?.cancelControlGestureCapture(),
  });

  const tutorHudMessage = useMemo(() => {
    if (inactivityRecovery.phase === 'parked') {
      const kitName =
        selectedDevice?.sourceId === 'midi' ? selectedDevice.name : undefined;

      return {
        title: kitName
          ? 'Paused — checking kit input'
          : 'Paused — no hits detected',
        detail: `Rewound to bar ${inactivityRecovery.checkpointMeasure + 1}.${
          kitName
            ? ` Reopening ${kitName}; hit any pad to count in and resume.`
            : ' Hit any pad to count in and resume.'
        }`,
        tone: 'warning' as const,
      };
    }

    const remediationTask = remediationSession.activeTask;

    if (remediationTask) {
      const lastAttempt = remediationTask.attempts.at(-1);
      const bars =
        remediationTask.barStart === remediationTask.barEnd
          ? `bar ${remediationTask.barStart}`
          : `bars ${remediationTask.barStart}–${remediationTask.barEnd}`;
      const coverageDetail =
        lastAttempt && !lastAttempt.hasSufficientCoverage
          ? 'Finish every authored note in the loop.'
          : lastAttempt && !lastAttempt.qualifiesAsCleanPass
          ? 'That attempt was saved. Settle the pattern and try once more.'
          : 'A good-enough pass can include one developing hit; useful progress is retained.';

      return {
        title: `Coach loop · ${bars}`,
        detail: `${remediationTask.consecutiveCleanPasses}/${REQUIRED_CONSECUTIVE_CLEAN_PASSES} pattern passes. ${coverageDetail}`,
        tone:
          remediationTask.consecutiveCleanPasses > 0
            ? ('success' as const)
            : ('recovery' as const),
      };
    }

    if (handsFreeControlsEnabled && drumGestureSurface === 'ready') {
      if (interruptedAttempt && interruptedResumeMeasure !== undefined) {
        return {
          title: 'Interrupted run saved',
          detail: `${
            interruptedAttempt.records.length
          } scored notes were saved. Kick once to resume from bar ${
            interruptedResumeMeasure + 1
          } with a new count-in.`,
          tone: 'steady' as const,
        };
      }

      const lessonDetail = songData?.lesson
        ? playbackSpeed < 0.999
          ? `Kick once to start. Finish at ${playbackSpeed.toFixed(
              1,
            )}× with 82%+ to open the next lesson; the full-tempo mark is 90%+ at 1.0×.`
          : 'Kick once to start. Finish from the beginning at 82%+; Tutor rewinds are okay, and the full-tempo mark is still there.'
        : countIn
        ? 'Kick once to start the count-in.'
        : 'Kick once to start.';

      return {
        title: songData?.lesson ? 'Lesson ready' : 'Ready when you are',
        detail: lessonDetail,
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
  }, [
    drumGestureSurface,
    countIn,
    handsFreeControlsEnabled,
    inactivityRecovery,
    interruptedAttempt,
    interruptedResumeMeasure,
    remediationSession.activeTask,
    playbackSpeed,
    selectedDevice,
    songData?.lesson,
    tutorSession.message,
  ]);
  const onPracticeBars = useCallback(
    (barStart: number, barEnd: number, speed: number) => {
      if (!id) {
        return;
      }

      const sourceSummary = [
        ...(fullRuns?.map((run) => run.summary) ?? []),
        ...(practiceSummary ? [practiceSummary] : []),
      ]
        .sort((left, right) =>
          left.completedAt.localeCompare(right.completedAt),
        )
        .at(-1);
      const findings =
        coachResult?.findings.filter(
          (finding) =>
            finding.evidence.barStart !== undefined &&
            finding.evidence.barEnd !== undefined,
        ) ?? [];
      const queue: RemediationQueue | null = sourceSummary
        ? createRemediationQueue({
            source: remediationSourceForRun(
              id,
              currentChartRevision,
              sourceSummary,
            ),
            findings,
            createdAt: new Date().toISOString(),
            minimumResolvedNotesForRange: (start, end) =>
              tutorChartPlan.measures
                .slice(start - 1, end)
                .reduce((sum, measure) => sum + measure.expectedKeys, 0),
            playbackSpeedForRange: (start, end, rangeFindings) =>
              rangeFindings.find(
                (finding) => finding.evidence.slowSpeed !== undefined,
              )?.evidence.slowSpeed ??
              (start === barStart && end === barEnd ? speed : 0.7),
          })
        : null;

      if (queue) {
        appliedRemediationTaskRef.current = undefined;
        handledRemediationCompletionRef.current = undefined;
        remediationSession.begin(queue);
        setIsCoachOpen(false);

        if (gameMode !== 'practice') {
          navigate(`/${id}?gameMode=practice`);
        }

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
    [
      applyCoachLoop,
      coachResult,
      currentChartRevision,
      fullRuns,
      gameMode,
      id,
      navigate,
      practiceSummary,
      remediationSession,
      tutorChartPlan.measures,
    ],
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

    const traversal = lessonTraversalRef.current;

    if (traversal.uninterrupted) {
      traversal.minimumPlaybackSpeed = Math.min(
        traversal.minimumPlaybackSpeed,
        playbackSpeed,
      );
    }
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
        range: undefined,
        renderData,
      };
      clearSelection();
      onPracticeRangeChange(undefined);
      // App-global, same setter the library header tabs use - the choice
      // sticks, and it's also what keys scoreData on song end (below), so
      // a mid-run switch can never misattribute the run's score.
      setDifficulty(next);
    },
    [
      clearSelection,
      difficulty,
      onPracticeRangeChange,
      pause,
      timeStore,
      renderData,
      setDifficulty,
    ],
  );

  useEffect(() => {
    const pending = pendingDifficultySwitchRef.current;

    if (!pending || !engine || pending.renderData === renderData) {
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

  useEffect(() => () => loadAttemptsOffRef.current?.(), []);

  useEffect(() => () => saveRunOffRef.current?.(), []);

  useEffect(() => {
    engine?.setClickSettings(clickVolume / 100, clickTone / 100);
  }, [engine, clickVolume, clickTone]);

  useEffect(() => {
    if (isReady) {
      setEngineMasterVolume(masterVolume / 100);
    }
  }, [setEngineMasterVolume, masterVolume, isReady]);

  const performanceControls = (
    <section className="flex flex-col gap-3" aria-label="Performance controls">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
        Performance controls
      </div>
      {policy.speedControl && (
        <div className="flex items-center justify-between gap-3">
          <SettingLabel
            label="Speed"
            tooltip="Set a musical tempo without changing the chart."
          />
          <InputNumber
            mode="spinner"
            size="small"
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
      {policy.looping && (
        <div className="flex items-center justify-between gap-3">
          <SettingLabel
            label="Loop section"
            tooltip="Repeat the selected bars until you clear the phrase."
          />
          <Switch
            size="small"
            data-testid="loop-toggle"
            aria-label="Loop section"
            checked={isLooping}
            onChange={(checked) => {
              if (checked) {
                setIsLooping(true);

                return;
              }

              clearPracticeLoop();
            }}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <SettingLabel
          label="Score view"
          tooltip="Choose the continuous Flow score or the full classic page."
        />
        <div className="flex gap-1" role="group" aria-label="Notation view">
          <Button
            type={notationLayout === 'flow' ? 'primary' : 'default'}
            size="small"
            data-testid="notation-flow-toggle"
            aria-pressed={notationLayout === 'flow'}
            onClick={() => setNotationLayout('flow')}
          >
            Flow
          </Button>
          <Button
            type={notationLayout === 'classic' ? 'primary' : 'default'}
            size="small"
            data-testid="notation-classic-toggle"
            aria-pressed={notationLayout === 'classic'}
            onClick={() => setNotationLayout('classic')}
          >
            Classic
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <SettingLabel
          label="Difficulty"
          tooltip="Choose the chart difficulty for this run."
        />
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
      {midiTelemetry && (
        <p
          className="drumroll-practice-input-telemetry"
          data-testid="practice-midi-telemetry"
        >
          MIDI {midiTelemetry.rawMessageCount} · last {lastMidiTime} · port E
          {midiTelemetry.selectedPortEpoch} ·{' '}
          {midiTelemetry.lastMappedLane ?? 'unmapped'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          icon={<FontAwesomeIcon icon={faWandMagicSparkles} />}
          data-testid="ai-coach-button"
          onClick={onOpenCoach}
        >
          Coach
        </Button>
        <Button
          icon={<FontAwesomeIcon icon={faChartLine} />}
          data-testid="practice-stats-button"
          onClick={onOpenStats}
        >
          Stats
        </Button>
      </div>
    </section>
  );
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
          tooltip="Return to a musical checkpoint, shape the tempo, and continue after confident repetitions."
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
          label="Challenge lives"
          tooltip="Optional challenge score only. It never changes practice credit, XP, streaks, stars, goals, or achievements."
        />
        <Switch
          size="small"
          data-testid="setting-tutor-lives"
          aria-label="Challenge lives"
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
          tooltip="Kick once to start. During play, deliberate command patterns pause, retry, continue, or leave without touching the Mac."
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
        At Ready, kick once to count in. If the kit goes quiet, Drumroll pauses,
        rewinds one lead-in bar, and any pad resumes. During play, kick, crash,
        kick, crash pauses; snare, kick, snare, kick retries; ride, kick, ride,
        crash ends.
      </p>
    </section>
  );
  const practicePresentationPhase = useMemo(() => {
    if (isScoreModalOpen) {
      return 'result';
    }

    if (inactivityRecovery.phase === 'parked') {
      return 'inactivity-paused';
    }

    if (isCounting) {
      return 'counting-in';
    }

    if (isPlaying) {
      return 'playing';
    }

    if (
      tutorSession.state.phase === 'recovering' ||
      remediationSession.activeTask
    ) {
      return 'recovery-explain';
    }

    return isStarted ? 'paused' : 'ready';
  }, [
    inactivityRecovery.phase,
    isCounting,
    isPlaying,
    isScoreModalOpen,
    isStarted,
    remediationSession.activeTask,
    tutorSession.state.phase,
  ]);
  const kitControlPrompt = useMemo(() => {
    if (!handsFreeControlsEnabled) {
      return undefined;
    }

    if (practicePresentationPhase === 'ready') {
      if (interruptedAttempt && interruptedResumeMeasure !== undefined) {
        return {
          label: `Resume saved bar ${interruptedResumeMeasure + 1}`,
          steps: ['kick'] as const,
        };
      }

      return {
        label: countIn ? 'Kick to start the count-in' : 'Kick to start',
        steps: ['kick'] as const,
      };
    }

    if (practicePresentationPhase === 'paused') {
      return {
        label: 'Resume from the kit',
        steps: ['kick', 'crash', 'kick', 'crash'] as const,
      };
    }

    if (practicePresentationPhase === 'inactivity-paused') {
      return {
        label: 'Return with a fresh count-in',
        steps: ['any'] as const,
      };
    }

    if (practicePresentationPhase === 'playing') {
      return {
        label: 'Pause from the kit',
        steps: ['kick', 'crash', 'kick', 'crash'] as const,
      };
    }

    return undefined;
  }, [
    countIn,
    handsFreeControlsEnabled,
    interruptedAttempt,
    interruptedResumeMeasure,
    practicePresentationPhase,
  ]);
  const tutorDisplayState =
    practicePresentationPhase === 'inactivity-paused'
      ? 'inactivity-paused'
      : remediationSession.activeTask
      ? 'remediation'
      : practicePresentationPhase === 'ready'
      ? 'kit-ready'
      : practicePresentationPhase === 'paused'
      ? 'kit-paused'
      : practicePresentationPhase === 'recovery-explain'
      ? 'recovery-explain'
      : undefined;
  const practiceReadinessPhase: PracticeReadinessPhase = isLoading
    ? 'idle'
    : practicePresentationPhase === 'ready'
    ? 'ready'
    : 'playing';
  const showInactivityCaption =
    gameMode === 'practice' && inactivityPauseVeil.visible;
  const showCountInCaption = !showInactivityCaption && isCounting;
  const showTransportCaption =
    Boolean(transportIndicator) &&
    !isScoreModalOpen &&
    !showInactivityCaption &&
    !showCountInCaption &&
    practicePresentationPhase !== 'result';
  const showTutorCaption =
    !isLoading &&
    !showInactivityCaption &&
    !showCountInCaption &&
    !showTransportCaption &&
    (practicePresentationPhase === 'paused' ||
      (gameMode === 'practice' &&
        (practicePresentationPhase === 'recovery-explain' ||
          Boolean(remediationSession.activeTask) ||
          Boolean(loopEscape))));
  const showLoopCaption =
    gameMode === 'practice' &&
    isLooping &&
    Boolean(practiceRange) &&
    !loopEscape &&
    !showInactivityCaption &&
    !showCountInCaption &&
    !showTransportCaption &&
    !showTutorCaption;
  const showReadinessCaption =
    gameMode === 'practice' &&
    !showInactivityCaption &&
    !showCountInCaption &&
    !showTransportCaption &&
    !showTutorCaption &&
    !showLoopCaption &&
    practicePresentationPhase !== 'result' &&
    practiceReadinessPhase !== 'playing';
  const showPerformCaption =
    gameMode !== 'practice' &&
    Boolean(kitControlPrompt) &&
    practicePresentationPhase !== 'playing' &&
    !showCountInCaption &&
    !showTransportCaption &&
    !showTutorCaption;

  return (
    <Layout
      className="drumroll-practice-shell h-full pointer-events-auto"
      data-session-phase={practicePresentationPhase}
      data-loop-escape={loopEscape ? 'active' : undefined}
      onPointerDownCapture={inactivityPauseVeil.release}
      onPointerMoveCapture={inactivityPauseVeil.release}
      onWheelCapture={inactivityPauseVeil.release}
    >
      <ScoreSummary
        isOpen={isScoreModalOpen}
        onNextSong={onNextSong}
        nextLabel={gameMode === 'practice' ? 'Continue My Wave' : undefined}
        continuationLabelLocked={gameMode === 'practice'}
        autoContinueEnabled={canAutoContinuePractice(
          gameMode,
          autoContinueEnabled,
          practicePersistenceState,
          songData,
        )}
        persistenceState={
          gameMode === 'practice' ? practicePersistenceState : undefined
        }
        onRetry={onRetry}
        onCoach={onOpenCoach}
        songData={songData}
        difficulty={difficulty}
        scoreData={scoreData}
        practiceSummary={practiceSummary}
        noMusicalInput={noMusicalInput}
        previousPracticeSummary={previousPracticeSummary}
        gamification={gamification}
        runResult={gamificationResult}
        lessonProgression={lessonProgressionResult}
        handsFreeControlsEnabled={handsFreeControlsEnabled}
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
        {remediationSession.queue && remediationProgress && (
          <section
            className="mb-5 rounded-2xl border border-accent-soft-border bg-accent-soft-bg p-4"
            data-testid="remediation-review"
            role="status"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
              {remediationSession.queue.status === 'completed'
                ? 'Remediation complete'
                : 'Remediation in progress'}
            </div>
            <h2 className="mt-1 font-display text-2xl font-semibold text-text">
              {remediationSession.queue.status === 'completed'
                ? 'Every weak phrase is cleared'
                : `Phrase ${remediationSession.queue.activeTaskIndex + 1} of ${
                    remediationProgress.totalTasks
                  }`}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              Two consecutive good-enough passes clear each phrase: full
              coverage, at least 82% accuracy, and only a small phrase-length
              allowance. Near-misses keep your progress. The original full-song
              review remains linked to session{' '}
              {remediationSession.queue.source.sessionId}.
            </p>
            <Progress
              className="mt-3"
              percent={remediationProgress.percent}
              status={
                remediationSession.queue.status === 'completed'
                  ? 'success'
                  : 'active'
              }
              strokeColor="var(--color-red)"
            />
          </section>
        )}
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
      <header className="drumroll-practice-toolbar flex h-12 min-h-12 items-center gap-3 px-4 py-1">
        <Button
          icon={<FontAwesomeIcon icon={faArrowLeft} />}
          data-testid="back-button"
          aria-label="Back to library"
          onClick={() => {
            cancel();
            pause();
            navigate('/');
          }}
          size="middle"
          className="min-h-9 min-w-9 shrink-0"
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
          size="middle"
          className="shrink-0"
        />

        <div className="drumroll-practice-toolbar__identity min-w-0">
          <h1
            className="truncate font-display text-base font-semibold leading-tight text-text-body"
            title={songData?.name}
          >
            {songData?.name}
          </h1>
          <p
            className="m-0 truncate text-xs leading-tight text-text-faint"
            data-testid={
              practiceRecommendationReason ? 'practice-wave-reason' : undefined
            }
            title={
              practiceRecommendationReason
                ? `My Wave: ${practiceRecommendationReason}`
                : songData?.artist
            }
          >
            {practiceRecommendationReason
              ? `My Wave · ${practiceRecommendationReason}`
              : songData?.artist}
          </p>
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

            // Only a deliberate timeline scrub invalidates complete lesson
            // coverage. Tutor rewinds, kit pause/resume, and inactivity
            // checkpoints are teaching/navigation mechanics and remain valid
            // evidence when the learner ultimately reaches every note.
            lessonTraversalRef.current.uninterrupted = false;
            seekSeconds((value / 100) * duration);
          }}
        />
        <div
          className="drumroll-practice-toolbar__session-state shrink-0"
          data-testid="practice-mode-indicator"
          data-notation-layout={notationLayout}
          data-looping={isLooping || undefined}
          data-speed={
            policy.speedControl ? playbackSpeed.toFixed(1) : undefined
          }
          aria-label={`${
            gameMode === 'practice' ? 'Practice' : 'Perform'
          } ${notationLayout} ${difficulty}${
            policy.speedControl ? ` at ${playbackSpeed.toFixed(1)} times` : ''
          }${isLooping ? ', loop active' : ''}; ${
            practiceInputStatus.accessibleLabel
          }`}
        >
          <span>{gameMode === 'practice' ? 'Practice' : 'Perform'}</span>
          <span>{notationLayout}</span>
          {policy.speedControl && <span>{playbackSpeed.toFixed(1)}×</span>}
          {isLooping && <span>Loop</span>}
          <span
            className="drumroll-practice-input-readiness"
            data-state={practiceInputStatus.state}
            data-testid="practice-input-readiness"
            aria-label={practiceInputStatus.accessibleLabel}
            title={practiceInputStatus.accessibleLabel}
          >
            <span aria-hidden="true" />
            {practiceInputStatus.shortLabel}
          </span>
        </div>
        <SettingsButton
          page="song-view"
          label="Inspector"
          performanceControls={performanceControls}
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
      </header>

      <div className="relative grow flex min-h-0">
        <Content
          className={cn(
            'drumroll-notation-stage grow m-0 flex min-h-0 flex-col font-display text-ink',
            notationLayout === 'flow'
              ? 'drumroll-flow-viewport overflow-hidden'
              : 'drumroll-classic-viewport items-center overflow-auto',
          )}
        >
          {notationLayout === 'classic' && chart && (
            <NotationLocationReadout
              timeStore={timeStore}
              chart={chart}
              renderData={renderData}
              delaySeconds={delaySeconds}
            />
          )}
          {songData && chart && parsedMidi && (
            <SheetMusic
              engine={engine}
              isLooping={isLooping}
              renderData={renderData}
              practiceRange={practiceRange}
              focusIndex={focusIndex}
              onPracticeRangeChange={onPracticeRangeChange}
              onLoopRangeSelect={selectPracticeLoop}
              gameMode={gameMode}
              songData={songData}
              isDev={isDev}
              zoom={zoom}
              layout={notationLayout}
              timeStore={timeStore}
              chart={chart}
              delaySeconds={delaySeconds}
              loopEscape={loopEscape}
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
        {showInactivityCaption && (
          <InactivityPauseVeil
            visible={inactivityPauseVeil.visible}
            checkpointMeasure={
              inactivityRecovery.phase === 'parked'
                ? inactivityRecovery.checkpointMeasure
                : 0
            }
          />
        )}
        {showReadinessCaption && (
          <PracticeReadinessCue
            phase={practiceReadinessPhase}
            resumeMeasure={
              practicePresentationPhase === 'ready'
                ? interruptedResumeMeasure
                : undefined
            }
            audition={
              practicePresentationPhase === 'ready' ? audition : undefined
            }
          />
        )}
        {showTutorCaption && (
          <TutorHud
            state={tutorSession.state}
            message={tutorHudMessage}
            recoveryCaption={recoveryCaption}
            displayState={tutorDisplayState}
            controlPrompt={kitControlPrompt}
          />
        )}
        {showLoopCaption && practiceRange && (
          <aside
            className="drumroll-practice-edge-caption drumroll-loop-caption"
            data-edge-caption="loop"
            data-testid="practice-loop-caption"
            data-tone="recovery"
            role="status"
            aria-live="polite"
          >
            <span className="drumroll-practice-edge-caption__kicker">Loop</span>
            <strong className="drumroll-practice-edge-caption__title">
              Bars {practiceRange.start + 1}–{practiceRange.end + 1}
            </strong>
            <p className="drumroll-practice-edge-caption__detail">
              Kick to count in · clear it to return to the full song.
            </p>
            <Button data-testid="clear-loop" onClick={clearPracticeLoop}>
              Clear loop
            </Button>
          </aside>
        )}
        {showPerformCaption && kitControlPrompt && (
          <aside
            className="drumroll-practice-edge-caption drumroll-perform-caption"
            data-edge-caption="perform-command"
            data-testid="perform-kit-control-prompt"
            data-tone="recovery"
            role="status"
            aria-live="polite"
          >
            <span className="drumroll-practice-edge-caption__kicker">
              Kit control
            </span>
            <strong className="drumroll-practice-edge-caption__title">
              {kitControlPrompt.label}
            </strong>
            <p className="drumroll-practice-edge-caption__detail">
              {kitControlPrompt.steps
                .map((step) =>
                  step === 'any'
                    ? 'Any pad'
                    : `${step.charAt(0).toUpperCase()}${step.slice(1)}`,
                )
                .join(' → ')}
            </p>
          </aside>
        )}
        {showCountInCaption && (
          <CountIn
            count={countInBeat}
            total={countInBeats}
            beatMs={countInBeatMs}
          />
        )}
        <StreakMeter ui={streakUi} className="drumroll-practice-streak" />
        {showTransportCaption && transportIndicator && (
          <aside
            data-testid="transport-indicator"
            className="drumroll-practice-edge-caption drumroll-transport-caption"
            data-edge-caption="transport"
            data-tone="neutral"
            role="status"
            aria-live="polite"
          >
            <span className="drumroll-practice-edge-caption__kicker">
              Transport
            </span>
            <strong className="drumroll-practice-edge-caption__title">
              {transportIndicator.label}
            </strong>
          </aside>
        )}
      </div>
    </Layout>
  );
}
