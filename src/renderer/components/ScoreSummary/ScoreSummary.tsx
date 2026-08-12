import { Button, Modal } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScoreData, Song } from '../../../types';
import { Difficulty } from 'scan-chart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faRepeat,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { MODAL_ABOVE_POPOVER_Z_INDEX, modalStyles } from '../../overlayStyles';
import { cn } from '../../cn';
import { Stars } from '../Stars';
import { RunSummary } from '../../services/practice-stats';
import { PracticeStats } from '../PracticeStats';
import {
  RecordRunResult,
  UseGamificationResult,
} from '../../hooks/useGamification';
import { AchievementToastQueue } from '../AchievementToastQueue';
import type { LessonProgressionDecision } from '../../services/lesson-progression';
import { KitCommandPrompt } from '../KitCommandPrompt';
import { LearningEvidenceReceipt } from '../LearningEvidenceReceipt';
import { musicalReceipt } from './musicalReceipt';
import {
  buildPerformancePostcard,
  PerformancePostcard,
  type PerformancePostcardField,
} from '../PerformancePostcard';

interface Props {
  isOpen: boolean;
  onRetry: () => void;
  onNextSong: () => void;
  nextLabel?: string;
  continuationLabelLocked?: boolean;
  autoContinueEnabled?: boolean;
  autoContinueSeconds?: number;
  persistenceState?: 'saving' | 'saved' | 'failed' | 'no-evidence';
  onCoach?: () => void;
  songData: Song | undefined;
  difficulty: Difficulty;
  scoreData?: ScoreData;
  practiceSummary?: RunSummary;
  noMusicalInput?: boolean;
  previousPracticeSummary?: RunSummary;
  /** Live streak/XP-vs-goal state, shared with the library header (see
   * SongListView's <Outlet context>). Only used to phrase "N XP to
   * today's goal" — everything specific to *this* run comes from
   * `runResult`. */
  gamification?: UseGamificationResult;
  /** This run's outcome from `gamification.recordRun` - undefined until
   * its IPC round trip resolves, or permanently if gamification isn't
   * available at all (e.g. no attempt was made, so recordRun was never
   * called). The whole XP/streak/nudge block simply doesn't render
   * without it, same as `practiceSummary` already does. */
  runResult?: RecordRunResult;
  lessonProgression?: LessonProgressionDecision;
  handsFreeControlsEnabled?: boolean;
}

function noteCountLabel(count: number, verb: string): string {
  return `${count} note${count === 1 ? '' : 's'} ${verb}`;
}

interface AutoContinueCountdownProps {
  label: string;
  seconds: number;
  onComplete: () => void;
}

function AutoContinueCountdown({
  label,
  seconds,
  onComplete,
}: AutoContinueCountdownProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(1, Math.round(seconds)),
  );
  const [cancelled, setCancelled] = useState(false);
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (remaining <= 0 || cancelled) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cancelled, remaining]);

  useEffect(() => {
    if (remaining !== 0 || cancelled || triggeredRef.current) {
      return;
    }

    triggeredRef.current = true;
    onComplete();
  }, [cancelled, onComplete, remaining]);

  if (cancelled) {
    return null;
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border border-accent-soft-border bg-accent-soft-bg px-3 py-2 text-sm text-text-muted"
      role="status"
      data-testid="score-auto-continue"
    >
      <span>
        {label} starts in {remaining}s
      </span>
      <Button
        type="text"
        size="small"
        data-testid="score-auto-continue-cancel"
        onClick={() => setCancelled(true)}
      >
        Cancel
      </Button>
    </div>
  );
}

export function ScoreSummary({
  isOpen,
  onRetry,
  onNextSong,
  nextLabel = 'Back to library',
  continuationLabelLocked = false,
  autoContinueEnabled = false,
  autoContinueSeconds = 8,
  persistenceState,
  onCoach,
  songData,
  difficulty,
  scoreData,
  practiceSummary,
  noMusicalInput = false,
  previousPracticeSummary,
  gamification,
  runResult,
  lessonProgression,
  handsFreeControlsEnabled = false,
}: Props) {
  const starRating = useMemo(() => {
    if (!scoreData) {
      return 0;
    }

    return getStarRating(scoreData);
  }, [scoreData]);
  const isPerfect = useMemo(() => {
    if (!scoreData) {
      return false;
    }

    return calculateAccuracy(scoreData) === 1;
  }, [scoreData]);
  const accuracy = scoreData ? calculateAccuracy(scoreData) : 0;
  const hitNotes = scoreData?.hitNotes ?? 0;
  const missedNotes = Math.max(0, (scoreData?.totalNotes ?? 0) - hitNotes);
  // gamification.todayXp is live (reactive off the shared hook instance),
  // so by the time runResult lands it already reflects this run's XP -
  // no need to add xpEarned on top of it here.
  const xpToGoal = gamification
    ? Math.max(0, gamification.goalXp - gamification.todayXp)
    : 0;
  const streakCurrent =
    gamification?.streak.current ?? runResult?.streakCurrent ?? 0;
  const receipt = useMemo(
    () =>
      noMusicalInput
        ? undefined
        : musicalReceipt(practiceSummary, previousPracticeSummary),
    [noMusicalInput, practiceSummary, previousPracticeSummary],
  );
  const [postcardOpen, setPostcardOpen] = useState(false);
  const [postcardExporting, setPostcardExporting] = useState(false);
  const [postcardStatus, setPostcardStatus] = useState<string>();
  const primaryIsReplay = receipt?.action === 'replay';
  // A player may explicitly continue after an honest failure/no-evidence
  // warning, but never while the main-process write is still unresolved:
  // leaving then would tear down the only acknowledgement listener.
  const continuationBlocked = persistenceState === 'saving';
  const canExportPostcard = Boolean(
    songData &&
      practiceSummary &&
      persistenceState === 'saved' &&
      !noMusicalInput,
  );
  const exportPostcard = (fields: PerformancePostcardField[]) => {
    if (!songData || !practiceSummary) {
      return;
    }

    const postcard = buildPerformancePostcard({
      song: songData,
      summary: practiceSummary,
      previous: previousPracticeSummary,
      fields,
    });

    setPostcardExporting(true);
    setPostcardStatus(undefined);
    window.electron.ipcRenderer.once<{
      ok?: boolean;
      canceled?: boolean;
      error?: string;
    }>('export-pdf', (reply) => {
      setPostcardExporting(false);

      if (reply.ok) {
        setPostcardOpen(false);
        setPostcardStatus('Private postcard saved locally.');
      } else if (reply.error) {
        setPostcardStatus(`Postcard was not saved: ${reply.error}`);
      }
    });
    window.electron.ipcRenderer.sendMessage('export-pdf', postcard);
  };
  const header = (
    <>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
        {noMusicalInput ? 'No musical input received' : 'Run complete'}
      </div>
      <div>
        <h2 className="text-balance font-display text-3xl font-semibold leading-tight text-text-body">
          {songData?.name}
        </h2>
        <div className="text-text-faint flex items-center gap-1 text-sm">
          <div>{songData?.artist}</div>
          <div>·</div>
          <div>{difficulty}</div>
        </div>
      </div>
    </>
  );
  const footer = (
    <div className="flex w-full flex-col gap-3">
      {isOpen && persistenceState === 'saving' && (
        <div
          className="rounded-xl border border-accent-soft-border bg-accent-soft-bg px-3 py-2 text-sm text-text-muted"
          role="status"
          data-testid="score-persistence-status"
        >
          Saving this run before the next practice starts…
        </div>
      )}
      {isOpen && persistenceState === 'failed' && (
        <div
          className="rounded-xl border border-red/30 bg-red/8 px-3 py-2 text-sm text-red"
          role="alert"
          data-testid="score-persistence-status"
        >
          Practice history was not saved. Automatic continuation is paused so
          this run is not silently lost.
        </div>
      )}
      {isOpen && persistenceState === 'no-evidence' && (
        <div
          className="rounded-xl border border-border-soft bg-fill px-3 py-2 text-sm text-text-muted"
          role="status"
          data-testid="score-persistence-status"
        >
          {noMusicalInput
            ? 'No musical input reached Drumroll. The misses came from playback, not a played attempt. Check the kit connection or mapping, then play again.'
            : 'No scored notes were captured. Choose what to play next when you are ready.'}
        </div>
      )}
      {isOpen &&
        autoContinueEnabled &&
        !noMusicalInput &&
        !continuationBlocked && (
          <AutoContinueCountdown
            label={nextLabel}
            seconds={autoContinueSeconds}
            onComplete={onNextSong}
          />
        )}
      {isOpen && handsFreeControlsEnabled && !continuationBlocked && (
        <section
          className="grid gap-1 rounded-2xl bg-fill/70 px-3 py-2"
          aria-label="Result controls from the drum kit"
          data-testid="score-kit-controls"
        >
          <KitCommandPrompt
            model={{
              label: nextLabel,
              steps: ['kick', 'crash', 'kick', 'crash'],
            }}
          />
          <KitCommandPrompt
            model={{
              label: 'Play again',
              steps: ['snare', 'kick', 'snare', 'kick'],
            }}
          />
          <KitCommandPrompt
            model={{
              label: 'Leave session',
              steps: ['ride', 'kick', 'ride', 'crash'],
            }}
          />
        </section>
      )}
      {canExportPostcard && (
        <Button
          data-testid="score-performance-postcard"
          type="text"
          className="w-full"
          onClick={() => setPostcardOpen(true)}
        >
          Export private performance postcard
        </Button>
      )}
      <div className="flex w-full gap-3">
        <Button
          data-testid="score-retry"
          className="grow"
          type={primaryIsReplay ? 'primary' : 'default'}
          disabled={continuationBlocked}
          onClick={() => onRetry()}
          icon={<FontAwesomeIcon icon={faRepeat} />}
          size="large"
        >
          {primaryIsReplay ? 'Replay this loop' : 'Play again'}
        </Button>
        {practiceSummary && onCoach && !noMusicalInput && (
          <Button
            data-testid="score-coach"
            className="grow"
            onClick={onCoach}
            icon={<FontAwesomeIcon icon={faWandMagicSparkles} />}
            size="large"
          >
            Coach
          </Button>
        )}
        <Button
          data-testid="score-next"
          className="grow"
          type={primaryIsReplay ? 'default' : 'primary'}
          disabled={continuationBlocked}
          onClick={() => onNextSong()}
          size="large"
        >
          {continuationLabelLocked || receipt?.action !== 'continue'
            ? nextLabel
            : receipt.actionLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      open={isOpen}
      title={header}
      footer={footer}
      closable={false}
      keyboard={false}
      mask={{ closable: false }}
      width={560}
      destroyOnHidden
      centered
      styles={modalStyles}
      wrapProps={{ 'data-testid': 'score-modal' }}
      zIndex={MODAL_ABOVE_POPOVER_Z_INDEX}
    >
      <div className="flex flex-col items-center gap-6 py-2">
        {receipt && (
          <section
            className="w-full rounded-2xl border border-accent-soft-border bg-accent-soft-bg p-4 text-left"
            data-testid="musical-receipt"
            data-changed={receipt.changed}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-text">
              What changed
            </p>
            <h3 className="mt-1 font-display text-2xl font-semibold tracking-[-0.035em] text-text">
              {receipt.headline}
            </h3>
            <p
              className="mt-1 text-sm leading-relaxed text-text-muted"
              data-testid="musical-receipt-meaning"
            >
              {receipt.meaning}
            </p>
            <p
              className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-accent-text"
              data-testid="musical-receipt-action"
            >
              Next: {receipt.actionLabel}
            </p>
          </section>
        )}
        {postcardStatus ? (
          <p
            className="w-full rounded-xl border border-accent-soft-border bg-accent-soft-bg px-3 py-2 text-sm text-text-muted"
            role="status"
            data-testid="performance-postcard-status"
          >
            {postcardStatus}
          </p>
        ) : null}
        {!noMusicalInput && practiceSummary?.practiceCard && (
          <section
            className="w-full border-l-2 border-signal-ember pl-3 text-left"
            data-testid="practice-card-run-receipt"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
              {practiceSummary.practiceCard.kind} saved
            </p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              {practiceSummary.practiceCard.source_label}. This counts toward
              the practice you chose.
            </p>
          </section>
        )}
        {!noMusicalInput && practiceSummary?.audition && (
          <section
            className="w-full rounded-2xl border border-accent-soft-border bg-accent-soft-bg p-4 text-left"
            data-testid="song-section-audition-receipt"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-text">
              Section saved
            </p>
            <h3 className="mt-1 font-display text-2xl font-semibold tracking-[-0.035em] text-text">
              {practiceSummary.audition.section_label} ·{' '}
              {Math.round(practiceSummary.overallAccuracy * 100)}% at{' '}
              {practiceSummary.audition.speed.toFixed(1)}×
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              This checks {practiceSummary.audition.test_label}. It measures
              this section, not the full song.
            </p>
          </section>
        )}
        {noMusicalInput ? (
          <section
            className="w-full rounded-2xl border border-accent-soft-border bg-accent-soft-bg p-4 text-left"
            data-testid="score-no-musical-input"
            role="status"
          >
            <h3 className="font-display text-2xl font-semibold text-text">
              Nothing from the kit reached the app
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              This is not a scored performance. Check the selected kit and its
              mapping, then try the lesson again.
            </p>
          </section>
        ) : scoreData ? (
          // Star rating, accuracy headline and the hit/missed/false-hit grid
          // are all derived from `scoreData` — Perform-only (see
          // ModePolicy.scoring's doc comment). Ordinary Practice does not set
          // scoreData; a saved full target-speed lesson pass may set it so
          // the curriculum can award its honest stars. PracticeStats below
          // remains the evidence view in either case.
          <>
            <Stars
              rating={starRating}
              perfect={isPerfect}
              glow
              size="3x"
              className="gap-3"
            />
            <div className="text-center">
              {isPerfect ? (
                <div className="font-display text-5xl font-semibold leading-none text-text">
                  Perfect
                </div>
              ) : (
                <div className="font-display text-5xl font-semibold leading-none text-text tabular-nums">
                  {Math.round(accuracy * 100)}% accuracy
                </div>
              )}
              <div className="mt-2 text-sm text-text-muted">
                {isPerfect
                  ? 'Every note landed.'
                  : `${starRating} of 5 stars on this run`}
              </div>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 text-center tabular-nums">
              <div className="rounded-xl bg-fill p-3 text-sm text-text-muted">
                {noteCountLabel(hitNotes, 'hit')}
              </div>
              <div className="rounded-xl bg-fill p-3 text-sm text-text-muted">
                {noteCountLabel(missedNotes, 'missed')}
              </div>
              <div className="rounded-xl bg-fill p-3 text-sm text-text-muted">
                {`${scoreData?.falseHits ?? 0} false hits`}
              </div>
            </div>
          </>
        ) : (
          practiceSummary && (
            <div className="text-center">
              <div className="font-display text-3xl font-semibold leading-tight text-text">
                Nice reps
              </div>
              <div className="mt-2 text-sm text-text-muted">
                Here&apos;s how this practice run went.
              </div>
            </div>
          )
        )}
        {!noMusicalInput && lessonProgression && (
          <div
            className="w-full rounded-xl border border-accent-soft-border bg-accent-soft-bg px-4 py-3 text-left"
            data-testid="lesson-progression-result"
            role="status"
          >
            <div className="text-sm font-semibold text-text">
              {lessonProgression.qualifies
                ? 'Learning pass complete'
                : 'One more learning pass'}
            </div>
            <div className="mt-1 text-xs leading-5 text-text-muted">
              {lessonProgression.qualifies
                ? `You finished every note at 82%+. The next lesson can open${
                    lessonProgression.atTargetSpeed
                      ? '; you also earned the full-tempo mark.'
                      : ', and full tempo is still there when you want it.'
                  }`
                : !lessonProgression.fullCoverage
                ? 'Start from bar 1 and reach the end. Tutor rewinds are okay.'
                : !lessonProgression.meetsLearningTempo
                ? 'Finish at 0.7× or faster.'
                : 'Reach 82% accuracy on the full pass. The full-tempo mark is 90%+ at 1.0×.'}
            </div>
          </div>
        )}
        {!noMusicalInput && (
          <>
            <PracticeStats
              summary={practiceSummary}
              variant="inline"
              className="w-full"
            />
            <LearningEvidenceReceipt
              summary={practiceSummary}
              heading="What this run recorded"
            />
          </>
        )}
        {!noMusicalInput && runResult && (
          <div
            className={cn(
              'flex w-full flex-col gap-2 rounded-xl border border-accent-soft-border bg-accent-soft-bg p-3',
              runResult.goalCrossed && receipt?.changed && 'sk-goal-celebrate',
            )}
            data-testid="gamification-summary"
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-2 text-sm font-semibold text-text"
                data-testid="run-streak-status"
              >
                <FontAwesomeIcon
                  icon={faFire}
                  style={{
                    color:
                      streakCurrent > 0
                        ? 'var(--color-orange)'
                        : 'var(--color-text-faint)',
                  }}
                />
                {streakCurrent > 0
                  ? `${streakCurrent}-day practice streak`
                  : 'New set, same progress'}
              </div>
              <div
                className="font-display text-lg font-semibold text-accent-text tabular-nums"
                data-testid="run-xp-earned"
              >
                +{runResult.xpEarned} XP
              </div>
            </div>
            <div
              className="text-xs text-text-muted"
              data-testid="run-goal-status"
            >
              {xpToGoal === 0
                ? "Today's set reached"
                : `${xpToGoal} XP left in today's set`}
            </div>
            {runResult.nudge && (
              <div className="text-xs text-accent-text" data-testid="run-nudge">
                {runResult.nudge.message}
              </div>
            )}
          </div>
        )}
        {!noMusicalInput && (
          <AchievementToastQueue
            queue={runResult?.newlyUnlocked ?? []}
            className="w-full"
          />
        )}
      </div>
      {postcardOpen && songData && practiceSummary ? (
        <PerformancePostcard
          open={postcardOpen}
          onClose={() => setPostcardOpen(false)}
          onExport={exportPostcard}
          exporting={postcardExporting}
          song={songData}
          summary={practiceSummary}
          previous={previousPracticeSummary}
        />
      ) : null}
    </Modal>
  );
}
