import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faPlus,
  faStar,
  faTrophy,
} from '@fortawesome/free-solid-svg-icons';
import { Button, Spin } from 'antd';
import { Song } from '../../../types';
import { UseGamificationResult } from '../../hooks/useGamification';
import { last7Dates } from '../../hooks/useGamification';
import { localDateKey } from '../../services/streaks';
import {
  ATOMIC_SKILL_GRAPH,
  PracticeCardOption,
  PracticeCardSet,
  PracticeRhythm,
  curriculumItemManifest,
  skillConfidence,
  skillNodeById,
  WeeklyPracticeSet,
} from '../../services/pedagogy';
import type { AtomicSkillState, SkillReview } from '../../services/pedagogy';
import type {
  SavedSongSectionAudition,
  WeeklyMusicalRecap,
  WeeklyRhythm,
} from '../../services/pedagogy';
import type {
  DeadlinePacingSummary,
  RankedPracticeCandidate,
} from '../../services/next-practice';
import type { RunSummary } from '../../services/practice-stats';
import { LearningEvidenceReceipt } from '../LearningEvidenceReceipt';
import { cn } from '../../cn';
import { Goal, SaveGoalInput, SetGoalModal } from '../Goals';
import { GoalCard } from './GoalCard';
import { PracticeHistory } from './PracticeHistory';
import { XpSkillLine } from './XpSkillLine';
import { SkillBars } from './SkillBars';
import { useMastery } from './useMastery';
import { useRetiredLessons } from './useRetiredLessons';
import { AtomicSkillRadar } from './AtomicSkillRadar';
import { EvidencePracticeCards } from '../PracticeCards';

export interface ProfileInsights {
  recommendation?: RankedPracticeCandidate;
  atomicStates?: readonly AtomicSkillState[];
  dueReviews?: readonly SkillReview[];
  deadlinePacing?: DeadlinePacingSummary;
  rejectedAtomicEvidenceCount?: number;
  latestRun?: RunSummary;
  practiceCards?: PracticeCardSet;
  weeklySet?: WeeklyPracticeSet;
  weeklyRhythm?: WeeklyRhythm;
  weeklyRecap?: WeeklyMusicalRecap;
  bestAudition?: SavedSongSectionAudition;
  auditionAvailable?: boolean;
}

export interface ProfileViewProps {
  songList: Song[];
  goals: Goal[];
  isGoalsLoaded: boolean;
  onSaveGoal: (input: SaveGoalInput, onSaved?: (goals: Goal[]) => void) => void;
  onSetPrimaryGoal: (id: string) => void;
  gamification: UseGamificationResult;
  insights?: ProfileInsights;
  onStartTargetedPractice?: () => void;
  onStartPracticeCard?: (option: PracticeCardOption) => void;
  onPracticeRhythmChange?: (rhythm: PracticeRhythm) => void;
  onRefreshPracticeSet?: () => void;
  onStartAudition?: () => void;
}

const STAGE_INDEX: Record<AtomicSkillState['stage'], number> = {
  unknown: 0,
  assessed: 1,
  provisional: 2,
  retained: 3,
  transferable: 4,
};
const STAGE_COPY: Record<AtomicSkillState['stage'], string> = {
  unknown: 'Not measured',
  assessed: 'Assessed',
  provisional: 'Building',
  retained: 'Retained',
  transferable: 'Transferable',
};
const EMPTY_ATOMIC_STATES: readonly AtomicSkillState[] = [];

function ProfileMetric({
  icon,
  label,
  value,
}: {
  icon: typeof faFire;
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 border-r border-border-soft pr-5 last:border-r-0 last:pr-0"
      data-testid="profile-stat-chip"
    >
      <FontAwesomeIcon className="text-signal-ember" icon={icon} />
      <div className="min-w-0">
        <div className="font-display text-xl font-semibold leading-none tabular-nums text-text">
          {value}
        </div>
        <div className="mt-1 text-xs text-text-muted">{label}</div>
      </div>
    </div>
  );
}

function atomicFocusIds(
  recommendation: RankedPracticeCandidate | undefined,
  states: readonly AtomicSkillState[],
): readonly string[] {
  const manifest =
    recommendation?.candidate.itemManifest ??
    (recommendation?.candidate.curriculumId
      ? curriculumItemManifest(recommendation.candidate.curriculumId)
      : undefined);

  return [
    ...(manifest?.demands
      .slice()
      .sort(
        (left, right) =>
          right.weight - left.weight ||
          left.skill_id.localeCompare(right.skill_id),
      )
      .map((demand) => demand.skill_id) ?? []),
    ...(recommendation?.decisionReceipt?.hard_prerequisites ?? []),
    ...states
      .filter((state) => state.stage !== 'unknown')
      .sort(
        (left, right) =>
          right.effective_trials - left.effective_trials ||
          left.skill_id.localeCompare(right.skill_id),
      )
      .map((state) => state.skill_id),
    ...ATOMIC_SKILL_GRAPH.map((skill) => skill.id),
  ].filter((id, index, all) => all.indexOf(id) === index);
}

function SkillSpine({
  states,
  focusSkillIds,
}: {
  states: readonly AtomicSkillState[];
  focusSkillIds: readonly string[];
}) {
  const nodes = skillNodeById();
  const statesById = new Map(states.map((state) => [state.skill_id, state]));
  const skills = focusSkillIds
    .map((id) => {
      const node = nodes.get(id);

      return node && node.evidence_boundary !== 'unsupported'
        ? { node, state: statesById.get(id) }
        : undefined;
    })
    .filter(
      (
        skill,
      ): skill is {
        node: (typeof ATOMIC_SKILL_GRAPH)[number];
        state: AtomicSkillState | undefined;
      } => skill !== undefined,
    )
    .slice(0, 4);

  return (
    <section
      className="border-t border-border-soft pt-6"
      aria-labelledby="insights-skill-spine-title"
      data-testid="insights-skill-spine"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-signal-wine">
            Current skill spine
          </p>
          <h2
            id="insights-skill-spine-title"
            className="mt-1 font-display text-3xl font-semibold tracking-[-0.04em] text-text"
          >
            Build the layer that makes the next phrase easier.
          </h2>
        </div>
        <p className="max-w-75 text-sm leading-relaxed text-text-muted">
          Each mark is an atomic MIDI claim. Unknown stays unknown until a
          scored chart gives it evidence.
        </p>
      </div>

      <div className="mt-5 divide-y divide-border-soft">
        {skills.map(({ node, state }) => {
          const stage = state?.stage ?? 'unknown';
          const activeIndex = STAGE_INDEX[stage];
          const confidence = Math.round(skillConfidence(state) * 100);

          return (
            <article
              key={node.id}
              className="grid gap-3 py-4 md:grid-cols-[minmax(13rem,0.9fr)_minmax(16rem,1.1fr)_minmax(8rem,0.45fr)] md:items-center"
            >
              <div>
                <h3 className="font-semibold text-text">{node.label}</h3>
                <p className="mt-1 text-xs capitalize text-text-muted">
                  {node.family} · {node.evidence_boundary.replace('_', ' ')}
                </p>
              </div>
              <div
                className="grid grid-cols-5 gap-1"
                aria-label={node.label + ': ' + STAGE_COPY[stage]}
              >
                {[
                  'Observed',
                  'Assessed',
                  'Building',
                  'Retained',
                  'Transfer',
                ].map((label, index) => (
                  <span
                    key={label}
                    className={cn(
                      'h-2 rounded-full bg-fill',
                      index <= activeIndex &&
                        stage !== 'unknown' &&
                        (index >= 3 ? 'bg-signal-green' : 'bg-signal-wine'),
                    )}
                  />
                ))}
              </div>
              <div className="text-sm text-text-muted">
                <strong className="font-semibold text-text">
                  {STAGE_COPY[stage]}
                </strong>
                <span className="ml-2 tabular-nums">
                  {confidence}% confidence
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReviewQueue({ reviews }: { reviews: readonly SkillReview[] }) {
  const next = reviews[0];
  const node = next ? skillNodeById().get(next.skill_id) : undefined;

  return (
    <section
      className="border-t border-border-soft pt-5"
      data-testid="profile-review-queue"
    >
      <p className="text-xs font-semibold tracking-[0.12em] text-signal-wine">
        Review queue
      </p>
      {next ? (
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {next.overdue ? 'Due now: ' : 'Next review: '}
          <strong className="font-semibold text-text">
            {node?.label ?? next.skill_id}
          </strong>
          {' · '}
          {new Date(next.due_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
          . Delayed retrieval is tracked separately from a fresh pass.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          No atomic review is due from the saved evidence yet.
        </p>
      )}
    </section>
  );
}

function DeadlineTargets({
  targetDate,
  pacing,
}: {
  targetDate: string | undefined;
  pacing: DeadlinePacingSummary | undefined;
}) {
  if (!targetDate) {
    return null;
  }

  return (
    <section
      className="border-t border-border-soft pt-5"
      data-testid="profile-deadline-targets"
    >
      <p className="text-xs font-semibold tracking-[0.12em] text-signal-wine">
        Goal runway
      </p>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Target date: {targetDate}. Weekly pace is based only on retained
        practice evidence.
      </p>
      {pacing?.targets.length ? (
        <div className="mt-3 divide-y divide-border-soft">
          {pacing.targets.slice(0, 3).map((target) => (
            <div
              key={target.axisId}
              className="grid gap-1 py-3 sm:grid-cols-[minmax(12rem,1fr)_auto]"
            >
              <div>
                <strong className="text-sm text-text">{target.label}</strong>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  {target.detail}
                </p>
              </div>
              <div className="text-sm tabular-nums text-text-muted">
                {Math.round(target.weeklyTarget)} this week
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Building evidence for a weekly pace. The date is saved, but there is
          not enough retained run evidence for a weekly target yet.
        </p>
      )}
    </section>
  );
}

function WeeklyRhythmPanel({
  set,
  rhythm,
  calendar,
  onRhythmChange,
  onRefresh,
}: {
  set: WeeklyPracticeSet | undefined;
  rhythm: PracticeRhythm | undefined;
  calendar: WeeklyRhythm | undefined;
  onRhythmChange?: (rhythm: PracticeRhythm) => void;
  onRefresh?: () => void;
}) {
  if (!set || !calendar || !rhythm) {
    return null;
  }

  return (
    <section
      className="border-t border-border-soft pt-5"
      data-testid="weekly-practice-rhythm"
      aria-labelledby="weekly-practice-rhythm-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-signal-wine">
            Weekly rhythm
          </p>
          <h2
            id="weekly-practice-rhythm-title"
            className="mt-1 font-display text-3xl font-semibold tracking-[-0.04em] text-text"
          >
            One review, one build, one musical application.
          </h2>
        </div>
        <div className="flex gap-1 rounded-md border border-border-soft p-1">
          {(['daily', 'weekly'] as const).map((option) => (
            <button
              key={option}
              type="button"
              data-testid={`practice-rhythm-${option}`}
              aria-pressed={rhythm === option}
              className={cn(
                'rounded px-2 py-1 text-xs font-semibold capitalize',
                rhythm === option
                  ? 'bg-signal-ember text-surface-studio'
                  : 'text-text-muted hover:text-text',
              )}
              onClick={() => onRhythmChange?.(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 divide-y divide-border-soft">
        {set.cards.map(({ kind, option }) => (
          <article
            key={kind}
            className="grid gap-1 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(13rem,0.85fr)] sm:items-baseline"
          >
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-signal-wine">
              {kind}
            </p>
            <strong className="truncate text-sm text-text">
              {option.title}
            </strong>
            <span className="text-xs leading-relaxed text-text-muted">
              {option.source_label}
            </span>
          </article>
        ))}
      </div>
      <div
        className="mt-4 grid grid-cols-7 gap-1"
        aria-label={`${rhythm} practice rhythm`}
        data-testid="weekly-rhythm-calendar"
      >
        {calendar.days.map((day) => (
          <div
            key={day.key}
            className={cn(
              'grid min-h-13 place-items-center rounded border px-1 text-center text-[10px] font-semibold',
              day.state === 'played'
                ? 'border-signal-green/40 bg-signal-green/10 text-text'
                : day.state === 'planned'
                ? 'border-signal-ember/35 bg-signal-ember/8 text-text-muted'
                : 'border-border-soft bg-fill text-text-faint',
            )}
            data-state={day.state}
          >
            <span>{day.label}</span>
            <span className="mt-0.5 text-[9px] font-normal capitalize">
              {day.state}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-150 text-xs leading-relaxed text-text-muted">
          Next available session: {calendar.next_available}. Planned rests stay
          unscored; they are part of the rhythm, not a failure.
        </p>
        {onRefresh && (
          <button
            type="button"
            className="text-xs font-semibold text-signal-wine hover:text-signal-ember"
            data-testid="refresh-weekly-practice-set"
            onClick={onRefresh}
          >
            Choose a new set
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-faint">
        This set changes only when its source evidence changes or you choose a
        new set.
      </p>
    </section>
  );
}

function WeeklyMusicalRecapPanel({
  recap,
}: {
  recap: WeeklyMusicalRecap | undefined;
}) {
  if (!recap) {
    return null;
  }

  return (
    <section
      className="border-t border-border-soft pt-5"
      data-testid="weekly-musical-recap"
      aria-labelledby="weekly-musical-recap-title"
    >
      <p className="text-xs font-semibold tracking-[0.12em] text-signal-wine">
        This week in your hands
      </p>
      <h2
        id="weekly-musical-recap-title"
        className="mt-1 font-display text-3xl font-semibold tracking-[-0.04em] text-text"
      >
        {recap.sessions} saved session{recap.sessions === 1 ? '' : 's'} across{' '}
        {recap.played_days} played day{recap.played_days === 1 ? '' : 's'}.
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="border-l border-border-soft pl-3">
          <p className="text-xs font-semibold text-text">{recap.skill.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {recap.skill.detail}
          </p>
        </article>
        <article className="border-l border-border-soft pl-3">
          <p className="text-xs font-semibold text-text">
            {recap.section?.label ?? 'No saved section audition'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {recap.section?.detail ??
              'A section result appears here only after a saved audition run.'}
          </p>
        </article>
        <article className="border-l border-border-soft pl-3">
          <p className="text-xs font-semibold text-text">Next route</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            {recap.next}
          </p>
        </article>
      </div>
      {recap.evidence_state === 'not_enough_saved_evidence' && (
        <p className="mt-3 text-xs text-text-faint">
          Not enough saved evidence for a musical progress claim yet.
        </p>
      )}
    </section>
  );
}

export function ProfileView({
  songList,
  goals,
  isGoalsLoaded,
  onSaveGoal,
  onSetPrimaryGoal,
  gamification,
  insights,
  onStartTargetedPractice,
  onStartPracticeCard,
  onPracticeRhythmChange,
  onRefreshPracticeSet,
  onStartAudition,
}: ProfileViewProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(
    undefined,
  );
  const [isSetGoalOpen, setIsSetGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const retiredLessons = useRetiredLessons();
  const activeGoal =
    goals.find((goal) => goal.id === selectedGoalId) ??
    goals.find((goal) => goal.isPrimary) ??
    goals[0];
  const activeSong = songList.find((song) => song.id === activeGoal?.songId);
  const activeRetiredLesson = retiredLessons.find((lesson) =>
    activeGoal ? lesson.legacySongIds.includes(activeGoal.songId) : false,
  );
  const mastery = useMastery(activeGoal, activeSong);
  const weekXp = last7Dates(new Date()).reduce(
    (sum, date) => sum + (gamification.days[localDateKey(date)]?.xp ?? 0),
    0,
  );
  const unlockedAchievements =
    gamification.achievements?.filter((achievement) => achievement.unlocked)
      .length ?? 0;
  const states = insights?.atomicStates ?? EMPTY_ATOMIC_STATES;
  const focusSkillIds = useMemo(
    () => atomicFocusIds(insights?.recommendation, states),
    [insights?.recommendation, states],
  );
  const latestRun = useMemo(
    () =>
      insights?.latestRun ??
      mastery.allRuns
        .slice()
        .sort((left, right) =>
          left.completedAt.localeCompare(right.completedAt),
        )
        .at(-1),
    [insights?.latestRun, mastery.allRuns],
  );
  const target = insights?.recommendation;
  const targetName =
    target?.candidate.title ??
    (activeSong
      ? 'Build toward ' + activeSong.name
      : activeRetiredLesson
      ? 'Build toward ' + activeRetiredLesson.name
      : undefined) ??
    'Your next scored phrase';
  const targetReason =
    target?.reason ??
    (activeGoal
      ? 'Your active goal stays visible while Drumroll waits for a concrete scored route.'
      : 'Finish one scored phrase so Drumroll can establish the first honest practice route.');
  const targetDetail = target
    ? 'Start at ' +
      Math.round(target.suggestedSpeed * 100) +
      '% speed' +
      (target.decisionReceipt?.scaffold.steps.length
        ? ' · ' +
          target.decisionReceipt.scaffold.steps
            .map((step) => step.replaceAll('_', ' '))
            .join(', ')
        : '')
    : undefined;
  const openNewGoalModal = () => {
    setEditingGoal(undefined);
    setIsSetGoalOpen(true);
  };
  const openEditGoalModal = () => {
    setEditingGoal(activeGoal);
    setIsSetGoalOpen(true);
  };

  if (!isGoalsLoaded) {
    return (
      <div
        className="flex min-h-64 items-center justify-center"
        data-testid="profile-view-loading"
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto" data-testid="profile-view">
      <div className="mx-auto flex w-full max-w-300 flex-col gap-8 px-5 py-7 sm:px-8">
        <header
          className="border-b border-border-soft pb-7"
          data-testid="profile-insights-hero"
        >
          <p className="text-xs font-semibold tracking-[0.16em] text-signal-wine">
            Insights
          </p>
          <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <h1 className="font-display text-4xl font-semibold leading-[0.95] tracking-[-0.055em] text-text sm:text-5xl">
                {targetName}
              </h1>
              <p
                className="mt-3 max-w-150 text-base leading-relaxed text-text-muted"
                data-testid="profile-target-reason"
              >
                {targetReason}
              </p>
              {targetDetail && (
                <p className="mt-2 text-sm text-text-muted">{targetDetail}</p>
              )}
            </div>
            {target && onStartTargetedPractice && (
              <Button
                type="primary"
                size="large"
                data-testid="profile-target-action"
                onClick={onStartTargetedPractice}
              >
                Start targeted loop
              </Button>
            )}
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-4">
            <ProfileMetric
              icon={faFire}
              label="day streak"
              value={gamification.streak.current}
            />
            <ProfileMetric
              icon={faStar}
              label="total stars"
              value={gamification.totalStars}
            />
            <ProfileMetric
              icon={faTrophy}
              label="achievements"
              value={unlockedAchievements}
            />
          </div>
        </header>

        {goals.length > 1 && activeGoal && (
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Goals"
            data-testid="goal-switcher"
          >
            {goals.map((goal) => {
              const goalSong = songList.find((song) => song.id === goal.songId);

              return (
                <button
                  key={goal.id}
                  type="button"
                  role="tab"
                  aria-selected={goal.id === activeGoal.id}
                  data-testid={'goal-tab-' + goal.id}
                  className={cn(
                    'border-b px-1 py-2 text-sm transition-colors',
                    goal.id === activeGoal.id
                      ? 'border-signal-wine text-text'
                      : 'border-transparent text-text-muted hover:text-text',
                  )}
                  onClick={() => setSelectedGoalId(goal.id)}
                >
                  {goalSong?.name ?? goal.songId}
                  {goal.isPrimary && ' ★'}
                </button>
              );
            })}
          </div>
        )}

        <SkillSpine states={states} focusSkillIds={focusSkillIds} />
        <ReviewQueue reviews={insights?.dueReviews ?? []} />
        <DeadlineTargets
          targetDate={activeGoal?.targetDate}
          pacing={insights?.deadlinePacing}
        />
        <WeeklyRhythmPanel
          set={insights?.weeklySet}
          rhythm={insights?.weeklySet?.rhythm}
          calendar={insights?.weeklyRhythm}
          onRhythmChange={onPracticeRhythmChange}
          onRefresh={onRefreshPracticeSet}
        />
        {insights?.practiceCards && (
          <section
            className="border-t border-border-soft pt-5"
            data-testid="evidence-practice-cards"
          >
            <div className="mb-4">
              <p className="text-xs font-semibold tracking-[0.12em] text-signal-wine">
                Today’s evidence-backed routes
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                Each option names its source and saves one real practice run.
              </p>
            </div>
            <EvidencePracticeCards
              cards={insights.practiceCards.cards}
              onStart={onStartPracticeCard}
            />
          </section>
        )}
        <WeeklyMusicalRecapPanel recap={insights?.weeklyRecap} />

        {!activeGoal && (
          <section
            className="border-t border-border-soft pt-6"
            data-testid="no-goals-empty-state"
          >
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-text">
              Give the work a musical destination.
            </h2>
            <p className="mt-2 max-w-130 text-sm leading-relaxed text-text-muted">
              Save a song or lesson goal, then Drumroll can connect the next
              phrase to something you want to play.
            </p>
            <Button
              className="mt-4"
              type="primary"
              icon={<FontAwesomeIcon icon={faPlus} />}
              onClick={openNewGoalModal}
            >
              Set your first goal
            </Button>
          </section>
        )}

        <details
          className="border-t border-border-soft pt-5"
          data-testid="profile-evidence-history"
        >
          <summary className="cursor-pointer font-display text-2xl font-semibold tracking-[-0.03em] text-text">
            Evidence, history, and goal detail
          </summary>
          <div className="mt-6 flex flex-col gap-8">
            <LearningEvidenceReceipt
              summary={latestRun}
              heading="Latest saved run"
            />
            {insights?.rejectedAtomicEvidenceCount ? (
              <p
                className="border-l-2 border-signal-ember pl-3 text-sm leading-relaxed text-text-muted"
                data-testid="profile-rejected-atomic-evidence"
              >
                {insights.rejectedAtomicEvidenceCount} stale atomic receipt
                {insights.rejectedAtomicEvidenceCount === 1 ? '' : 's'} stay
                excluded because the chart or manifest revision no longer
                matches.
              </p>
            ) : null}
            <details data-testid="atomic-radar-disclosure">
              <summary className="cursor-pointer text-sm font-semibold text-text">
                Open atomic skill radar and text table
              </summary>
              <div className="mt-5">
                <AtomicSkillRadar
                  states={states}
                  focusSkillIds={focusSkillIds}
                />
              </div>
            </details>

            {activeGoal ? (
              <>
                <XpSkillLine
                  weekXp={weekXp}
                  dominantLaneProgress={mastery.dominantLaneProgress}
                />
                <GoalCard
                  goal={activeGoal}
                  song={activeSong}
                  fallbackName={activeRetiredLesson?.name}
                  breakdown={mastery.breakdown}
                  timeline={mastery.timeline}
                  trend={mastery.trend}
                  needleLine={mastery.needleLine}
                  isLoaded={mastery.isLoaded}
                  onEdit={openEditGoalModal}
                  bestAudition={insights?.bestAudition}
                  auditionAvailable={insights?.auditionAvailable}
                  onStartAudition={onStartAudition}
                />
                {activeRetiredLesson && (
                  <p
                    className="border-l-2 border-signal-ember pl-3 text-sm leading-relaxed text-text-muted"
                    data-testid="retired-goal-notice"
                  >
                    This goal belongs to a retired curriculum exercise. Its
                    score and practice history remain readable, but it does not
                    unlock the new Journey.
                  </p>
                )}
                {!activeGoal.isPrimary && (
                  <Button
                    data-testid="make-primary-button"
                    onClick={() => onSetPrimaryGoal(activeGoal.id)}
                  >
                    Make this my primary goal
                  </Button>
                )}
              </>
            ) : null}

            <section className="border-t border-border-soft pt-5">
              <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text">
                Per-drum evidence
              </h3>
              <p
                className="mt-1 text-sm leading-relaxed text-text-muted"
                data-testid="profile-lane-accuracy-definition"
              >
                Unweighted hit / (hit + miss) across scored lane notes in the
                last 30 days. The next practice route uses its own stated
                evidence receipt.
              </p>
              <div className="mt-4">
                <SkillBars laneAccuracy={mastery.last30DaysLaneAccuracy} />
              </div>
            </section>

            <PracticeHistory
              progress={gamification.longitudinalProgress}
              weeklyRecap={insights?.weeklyRecap}
            />

            {retiredLessons.length > 0 && (
              <section
                className="border-t border-border-soft pt-5"
                data-testid="retired-lessons-history"
              >
                <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text">
                  Archived curriculum history
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  Replaced exercises keep their original evidence without being
                  assigned to new material.
                </p>
                <div className="mt-4 divide-y divide-border-soft">
                  {retiredLessons.map((lesson) => {
                    const totalRuns =
                      lesson.recentRunCount + lesson.archivedRunCount;

                    return (
                      <article
                        key={lesson.legacySongIds.join(':')}
                        className="py-3"
                        data-testid="retired-lesson-row"
                      >
                        <div className="text-sm font-semibold text-text">
                          {lesson.name}
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          Former lesson {lesson.lessonId ?? 'unlabelled'} ·{' '}
                          {lesson.bestStars} star
                          {lesson.bestStars === 1 ? '' : 's'} · {totalRuns} run
                          {totalRuns === 1 ? '' : 's'}
                          {lesson.goalCount > 0
                            ? ' · ' +
                              lesson.goalCount +
                              ' saved goal' +
                              (lesson.goalCount === 1 ? '' : 's')
                            : ''}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {activeGoal && (
              <Button
                data-testid="add-another-goal-button"
                icon={<FontAwesomeIcon icon={faPlus} />}
                onClick={openNewGoalModal}
              >
                Add another goal
              </Button>
            )}
          </div>
        </details>
      </div>

      <SetGoalModal
        open={isSetGoalOpen}
        onClose={() => setIsSetGoalOpen(false)}
        songList={songList}
        editingGoal={editingGoal}
        isFirstGoal={goals.length === 0}
        onSave={onSaveGoal}
      />
    </div>
  );
}
