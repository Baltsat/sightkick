import { Button } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScoreData, Song } from '../../../types';
import { Difficulty } from 'scan-chart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faRepeat,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { MODAL_ABOVE_POPOVER_Z_INDEX } from '../../overlayStyles';
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
import './ScoreSummary.css';

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

/** "expert" is a scan-chart note-density tier, not a player skill label -
 * capitalising it is the least it needs to read as intentional rather than
 * a stray enum value. Lesson runs replace it entirely (see the header
 * below): the chart-density tier means nothing on a curriculum warm-up. */
function capitalize(value: string): string {
  return value.length > 0
    ? `${value[0].toUpperCase()}${value.slice(1)}`
    : value;
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
      className="drumroll-score-summary__status flex items-center justify-between gap-3"
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

    // calculateAccuracy rounds to 2 decimal places for display, so a run
    // with a real miss (e.g. 249/250, falseHits 0 -> 0.996 -> "1.00") can
    // round up to a perfect-looking ratio. "Perfect" and "Every note
    // landed" are absolute claims shown on the same screen as the
    // hit/missed/false-hit grid — they must agree with the unrounded
    // counts that grid is built from, not the rounded display accuracy.
    const hitNotes = scoreData.hitNotes ?? 0;

    return (
      scoreData.totalNotes > 0 &&
      hitNotes === scoreData.totalNotes &&
      (scoreData.falseHits ?? 0) === 0
    );
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
  // A lesson song's chart is always authored at one scan-chart density
  // tier ("expert") - that is a notation-parsing detail, not a claim about
  // the player's level, and reads as a wrong/scary label on a first-week
  // warm-up. The curriculum unit ("Foundations") is the truthful,
  // legible fact in that same slot; only a real (non-lesson) song shows
  // the chart difficulty the player actually picked.
  const isLesson = Boolean(songData?.lesson);
  const contextDetail = isLesson
    ? songData?.lesson?.unit
    : capitalize(difficulty);
  const attempted = practiceSummary
    ? practiceSummary.totalHits + practiceSummary.totalMisses
    : 0;
  // Practice speed is a fact the player needs to keep reading their own
  // result correctly (an honest 0% at half speed reads differently than
  // 0% at full tempo) - fold it in rather than letting it disappear behind
  // the evidence expand the way it vanished from the transport line.
  const practiceSpeedSuffix =
    practiceSummary?.playbackSpeed !== undefined &&
    practiceSummary.playbackSpeed !== 1
      ? ` at ${practiceSummary.playbackSpeed}×`
      : '';
  const practiceAccuracyValue =
    practiceSummary && attempted > 0
      ? `${Math.round(
          practiceSummary.overallAccuracy * 100,
        )}%${practiceSpeedSuffix} · ${practiceSummary.totalHits} hit, ${
          practiceSummary.totalMisses
        } missed`
      : 'No notes played';

  if (!isOpen) {
    return null;
  }

  const overlay = (
    <div
      className="drumroll-score-summary"
      style={{ zIndex: MODAL_ABOVE_POPOVER_Z_INDEX }}
      role="dialog"
      aria-modal="true"
      aria-label={
        noMusicalInput
          ? 'No musical input received'
          : `Run complete — ${songData?.name ?? 'practice run'}`
      }
      data-testid="score-modal"
    >
      <header className="drumroll-score-summary__header">
        <div
          className="drumroll-score-summary__eyebrow"
          data-tone={noMusicalInput ? 'warning' : undefined}
        >
          {noMusicalInput ? 'No musical input received' : 'Run complete'}
        </div>
        <h2 className="drumroll-score-summary__title">{songData?.name}</h2>
        <div className="drumroll-score-summary__subtitle">
          {songData?.artist}
          {contextDetail ? ` · ${contextDetail}` : ''}
        </div>
      </header>

      <div className="drumroll-score-summary__body">
        {noMusicalInput ? (
          <div
            className="drumroll-score-summary__statement"
            data-testid="score-no-musical-input"
            role="status"
          >
            <h3 className="drumroll-score-summary__statement-headline">
              Nothing from the kit reached the app
            </h3>
            <p className="drumroll-score-summary__statement-meaning">
              This is not a scored performance. Check the selected kit and its
              mapping, then try the lesson again.
            </p>
          </div>
        ) : (
          <>
            {scoreData ? (
              // Star rating, accuracy headline and the hit/missed/false-hit
              // grid are all derived from `scoreData` — Perform-only (see
              // ModePolicy.scoring's doc comment). Ordinary Practice does
              // not set scoreData; a saved full target-speed lesson pass
              // may set it so the curriculum can award its honest stars.
              // The accuracy line IS this mode's one musical statement -
              // it already agrees with the grid below it by construction.
              <div className="drumroll-score-summary__statement drumroll-score-summary__stars">
                <Stars
                  rating={starRating}
                  perfect={isPerfect}
                  glow
                  size="3x"
                  className="gap-3"
                />
                {isPerfect ? (
                  <h3 className="drumroll-score-summary__statement-headline">
                    Perfect
                  </h3>
                ) : (
                  <h3 className="drumroll-score-summary__statement-headline tabular-nums">
                    {Math.round(accuracy * 100)}% accuracy
                  </h3>
                )}
                <p className="drumroll-score-summary__statement-meaning">
                  {isPerfect
                    ? 'Every note landed.'
                    : `${starRating} of 5 stars on this run`}
                </p>
              </div>
            ) : (
              receipt && (
                // The one honest musical statement for a Practice run
                // (no scoreData): derived entirely from musicalReceipt,
                // which is required to reflect the boundary cases - no
                // attempts, a run that fell apart, a genuine improvement -
                // truthfully. There is deliberately no separate
                // congratulatory headline layered on top of this.
                <section
                  className="drumroll-score-summary__statement"
                  data-testid="musical-receipt"
                  data-changed={receipt.changed}
                >
                  <h3 className="drumroll-score-summary__statement-headline">
                    {receipt.headline}
                  </h3>
                  <p
                    className="drumroll-score-summary__statement-meaning"
                    data-testid="musical-receipt-meaning"
                  >
                    {receipt.meaning}
                  </p>
                </section>
              )
            )}

            {scoreData ? (
              <div className="drumroll-score-summary__cells">
                <div className="drumroll-score-summary__cell">
                  <div className="drumroll-score-summary__cell-value">
                    {noteCountLabel(hitNotes, 'hit')}
                  </div>
                </div>
                <div className="drumroll-score-summary__cell">
                  <div className="drumroll-score-summary__cell-value">
                    {noteCountLabel(missedNotes, 'missed')}
                  </div>
                </div>
                <div className="drumroll-score-summary__cell">
                  <div className="drumroll-score-summary__cell-value">
                    {`${scoreData?.falseHits ?? 0} false hits`}
                  </div>
                </div>
              </div>
            ) : (
              receipt &&
              practiceSummary && (
                <div className="drumroll-score-summary__cells">
                  <div className="drumroll-score-summary__cell">
                    <div className="drumroll-score-summary__cell-label">
                      This pass
                    </div>
                    <div
                      className="drumroll-score-summary__cell-value"
                      data-testid="score-cell-accuracy"
                    >
                      {practiceAccuracyValue}
                    </div>
                  </div>
                  <div className="drumroll-score-summary__cell">
                    <div className="drumroll-score-summary__cell-label">
                      Next
                    </div>
                    <div
                      className="drumroll-score-summary__cell-value"
                      data-testid="musical-receipt-action"
                    >
                      {receipt.actionLabel}
                    </div>
                  </div>
                </div>
              )
            )}

            {lessonProgression && (
              <div
                className="drumroll-score-summary__status"
                data-testid="lesson-progression-result"
                role="status"
              >
                <span className="font-semibold text-[var(--dr-ink)]">
                  {lessonProgression.qualifies
                    ? 'Learning pass complete'
                    : 'One more learning pass'}
                </span>
                {' — '}
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
            )}

            {practiceSummary?.practiceCard && (
              <div
                className="drumroll-score-summary__status"
                data-testid="practice-card-run-receipt"
              >
                <span className="font-semibold text-[var(--dr-ink)]">
                  {practiceSummary.practiceCard.kind} saved
                </span>
                {' — '}
                {practiceSummary.practiceCard.source_label}. This counts toward
                the practice you chose.
              </div>
            )}

            {practiceSummary?.audition && (
              <div
                className="drumroll-score-summary__status"
                data-testid="song-section-audition-receipt"
              >
                <span className="font-semibold text-[var(--dr-ink)]">
                  Section saved — {practiceSummary.audition.section_label} ·{' '}
                  {Math.round(practiceSummary.overallAccuracy * 100)}% at{' '}
                  {practiceSummary.audition.speed.toFixed(1)}×
                </span>
                {' — '}
                This checks {practiceSummary.audition.test_label}. It measures
                this section, not the full song.
              </div>
            )}

            {postcardStatus ? (
              <p
                className="drumroll-score-summary__status"
                role="status"
                data-testid="performance-postcard-status"
              >
                {postcardStatus}
              </p>
            ) : null}

            <details className="drumroll-score-summary__evidence">
              <summary
                className="drumroll-score-summary__evidence-summary"
                data-testid="score-evidence-expand"
              >
                See the evidence
              </summary>
              <div className="drumroll-score-summary__evidence-body">
                <PracticeStats
                  summary={practiceSummary}
                  variant="inline"
                  className="w-full"
                />
                <LearningEvidenceReceipt
                  summary={practiceSummary}
                  heading="What this run recorded"
                />
              </div>
            </details>

            {runResult && (
              <div
                className={cn(
                  'drumroll-score-summary__status flex flex-col gap-2',
                  runResult.goalCrossed &&
                    receipt?.changed &&
                    'sk-goal-celebrate',
                )}
                data-testid="gamification-summary"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="flex items-center gap-2 text-sm font-semibold text-[var(--dr-ink)]"
                    data-testid="run-streak-status"
                  >
                    <FontAwesomeIcon
                      icon={faFire}
                      style={{
                        color:
                          streakCurrent > 0
                            ? 'var(--dr-ember)'
                            : 'var(--dr-ink-muted)',
                      }}
                    />
                    {streakCurrent > 0
                      ? `${streakCurrent}-day practice streak`
                      : 'New set, same progress'}
                  </div>
                  <div
                    className="font-display text-lg font-semibold text-[var(--dr-wine)] tabular-nums"
                    data-testid="run-xp-earned"
                  >
                    +{runResult.xpEarned} XP
                  </div>
                </div>
                <div data-testid="run-goal-status">
                  {xpToGoal === 0
                    ? "Today's set reached"
                    : `${xpToGoal} XP left in today's set`}
                </div>
                {runResult.nudge && (
                  <div
                    className="text-[var(--dr-wine)]"
                    data-testid="run-nudge"
                  >
                    {runResult.nudge.message}
                  </div>
                )}
              </div>
            )}

            <AchievementToastQueue
              queue={runResult?.newlyUnlocked ?? []}
              className="w-full"
            />
          </>
        )}
      </div>

      <footer className="drumroll-score-summary__footer">
        {persistenceState === 'saving' && (
          <div
            className="drumroll-score-summary__status"
            role="status"
            data-testid="score-persistence-status"
          >
            Saving this run before the next practice starts…
          </div>
        )}
        {persistenceState === 'failed' && (
          <div
            className="drumroll-score-summary__status"
            data-tone="error"
            role="alert"
            data-testid="score-persistence-status"
          >
            Practice history was not saved. Automatic continuation is paused so
            this run is not silently lost.
          </div>
        )}
        {persistenceState === 'no-evidence' && !noMusicalInput && (
          <div
            className="drumroll-score-summary__status"
            role="status"
            data-testid="score-persistence-status"
          >
            No scored notes were captured. Choose what to play next when you are
            ready.
          </div>
        )}
        {autoContinueEnabled && !noMusicalInput && !continuationBlocked && (
          <AutoContinueCountdown
            label={nextLabel}
            seconds={autoContinueSeconds}
            onComplete={onNextSong}
          />
        )}
        {handsFreeControlsEnabled && !continuationBlocked && (
          <section
            className="drumroll-score-summary__status grid gap-1"
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
            onClick={() => setPostcardOpen(true)}
          >
            Export private performance postcard
          </Button>
        )}
        <div className="drumroll-score-summary__actions">
          {primaryIsReplay ? (
            <Button
              data-testid="score-retry"
              type="primary"
              disabled={continuationBlocked}
              onClick={() => onRetry()}
              icon={<FontAwesomeIcon icon={faRepeat} />}
              size="large"
              block
              autoFocus
            >
              Replay this loop
            </Button>
          ) : (
            <Button
              data-testid="score-next"
              type="primary"
              disabled={continuationBlocked}
              onClick={() => onNextSong()}
              size="large"
              block
              autoFocus
            >
              {continuationLabelLocked || receipt?.action !== 'continue'
                ? nextLabel
                : receipt.actionLabel}
            </Button>
          )}
          <div className="drumroll-score-summary__actions-secondary">
            {primaryIsReplay ? (
              <Button
                data-testid="score-next"
                type="text"
                disabled={continuationBlocked}
                onClick={() => onNextSong()}
              >
                {continuationLabelLocked || receipt?.action !== 'continue'
                  ? nextLabel
                  : receipt.actionLabel}
              </Button>
            ) : (
              <Button
                data-testid="score-retry"
                type="text"
                disabled={continuationBlocked}
                onClick={() => onRetry()}
                icon={<FontAwesomeIcon icon={faRepeat} />}
              >
                Play again
              </Button>
            )}
            {practiceSummary && onCoach && !noMusicalInput && (
              <Button
                data-testid="score-coach"
                type="text"
                onClick={onCoach}
                icon={<FontAwesomeIcon icon={faWandMagicSparkles} />}
              >
                Coach
              </Button>
            )}
          </div>
        </div>
      </footer>

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
    </div>
  );

  return createPortal(overlay, document.body);
}
