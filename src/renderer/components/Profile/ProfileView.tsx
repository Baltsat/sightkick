import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDay,
  faCalendarWeek,
  faClockRotateLeft,
  faFire,
  faPlus,
  faStar,
  faTrophy,
} from '@fortawesome/free-solid-svg-icons';
import { Button } from 'antd';
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
import type { PatternPlayerProfile } from '../../services/pattern-model';
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
import { SkillsRose } from './SkillsRose';
import { EvidencePracticeCards } from '../PracticeCards';
import { KitActionChip } from '../GamificationHeaderStrip/KitActionChip';

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
  patternProfile?: PatternPlayerProfile;
}

export interface ProfileViewProps {
  songList: Song[];
  goals: Goal[];
  isGoalsLoaded: boolean;
  onSaveGoal: (input: SaveGoalInput, onSaved?: (goals: Goal[]) => void) => void;
  onSetPrimaryGoal: (id: string) => void;
  gamification: UseGamificationResult;
  kitConnected?: boolean;
  insights?: ProfileInsights;
  onStartTargetedPractice?: () => void;
  onStartPracticeCard?: (option: PracticeCardOption) => void;
  onPracticeRhythmChange?: (rhythm: PracticeRhythm) => void;
  onRefreshPracticeSet?: () => void;
  onStartAudition?: () => void;
  onOpenLesson?: (lessonId: string) => void;
}

const STAGE_INDEX: Record<AtomicSkillState['stage'], number> = {
  unknown: 0,
  assessed: 1,
  provisional: 2,
  retained: 3,
  transferable: 4,
};
const STAGE_COPY: Record<AtomicSkillState['stage'], string> = {
  unknown: 'Awaiting evidence',
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
      <FontAwesomeIcon className="text-[var(--signal-ember)]" icon={icon} />
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
          <p className="text-base font-semibold tracking-[0.08em] text-[var(--signal-wine)]">
            What to work on
          </p>
          <h2
            id="insights-skill-spine-title"
            className="mt-1 font-display text-3xl font-semibold tracking-[-0.04em] text-text"
          >
            Build the skill that makes the next phrase easier.
          </h2>
        </div>
        <p className="max-w-90 text-base leading-relaxed text-text-muted">
          Bars use saved kit evidence; blank means there is not enough evidence
          yet.
        </p>
      </div>

      <div className="mt-5 divide-y divide-border-soft">
        {skills.map(({ node, state }) => {
          const stage = state?.stage ?? 'unknown';
          const activeIndex = STAGE_INDEX[stage];

          return (
            <article
              key={node.id}
              className="grid gap-4 py-5 md:grid-cols-[minmax(15rem,0.8fr)_minmax(20rem,1.2fr)] md:items-center"
            >
              <div>
                <h3 className="text-lg font-semibold text-text">
                  {node.label}
                </h3>
                <p className="mt-1 text-sm capitalize text-text-muted">
                  {node.family}
                </p>
              </div>
              <div>
                <div className="mb-2 text-base text-text-muted">
                  <strong className="font-semibold text-text">
                    {STAGE_COPY[stage]}
                  </strong>
                </div>
                <div
                  className="grid grid-cols-5 gap-1.5"
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
                        'h-4 rounded-full bg-fill',
                        index <= activeIndex &&
                          stage !== 'unknown' &&
                          (index >= 3
                            ? 'bg-[var(--signal-green)]'
                            : 'bg-[var(--signal-wine)]'),
                      )}
                    />
                  ))}
                </div>
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
      <p className="text-xs font-semibold tracking-[0.12em] text-[var(--signal-wine)]">
        Next review
      </p>
      {next ? (
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {next.overdue ? 'Due now: ' : 'Next up: '}
          <strong className="font-semibold text-text">
            {node?.label ?? next.skill_id}
          </strong>
          {' · '}
          {new Date(next.due_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
          . A spaced revisit keeps this skill fresh.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Nothing is due to revisit yet.
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
      <p className="text-xs font-semibold tracking-[0.12em] text-[var(--signal-wine)]">
        Target pace
      </p>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Target date: {targetDate}. Weekly pace comes from completed runs.
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
          Play a few more runs before Drumroll sets a weekly pace.
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
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--signal-wine)]">
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
                  ? 'bg-[var(--signal-ember)] text-[var(--surface-studio)]'
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
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--signal-wine)]">
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
                ? 'border-[var(--signal-green)]/40 bg-[var(--signal-green)]/10 text-text'
                : day.state === 'planned'
                ? 'border-[var(--signal-ember)]/35 bg-[var(--signal-ember)]/8 text-text-muted'
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
            className="text-xs font-semibold text-[var(--signal-wine)] hover:text-[var(--signal-ember)]"
            data-testid="refresh-weekly-practice-set"
            onClick={onRefresh}
          >
            Choose a new set
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-faint">
        This refreshes after a new run or when you choose a new set.
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
      <p className="text-xs font-semibold tracking-[0.12em] text-[var(--signal-wine)]">
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
          Play a few more runs to see a weekly trend.
        </p>
      )}
    </section>
  );
}

type TimeScale = 'today' | '30d' | 'history';

const SCALE_OPTIONS: Array<{
  id: TimeScale;
  label: string;
  icon: typeof faCalendarDay;
}> = [
  { id: 'today', label: 'Today', icon: faCalendarDay },
  { id: '30d', label: 'Last 30 days', icon: faCalendarWeek },
  { id: 'history', label: 'All history', icon: faClockRotateLeft },
];

/**
 * One time scale at a time, with one control to move between them — the
 * owner's direct ask ("не вот этим узким экраном со скроллом, а на весь
 * экран"): a profile route the player can actually read at a glance instead
 * of a single accordion mixing today's target, this week's rhythm, and the
 * all-time archive into one narrow scrolling column.
 */
function ScaleControl({
  scale,
  onChange,
}: {
  scale: TimeScale;
  onChange: (scale: TimeScale) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="tablist"
      aria-label="Time scale"
      data-testid="profile-scale-control"
    >
      {SCALE_OPTIONS.map((option) => {
        const isSelected = option.id === scale;

        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            data-testid={`profile-scale-${option.id}`}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
              isSelected
                ? 'border-[var(--signal-wine)] bg-[var(--signal-wine)] text-surface-raised'
                : 'border-border-soft text-text-muted hover:text-text',
            )}
            onClick={() => onChange(option.id)}
          >
            <FontAwesomeIcon icon={option.icon} aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A route-shaped skeleton (hero + scale control + content grid) instead of
 * a generic centred spinner (visual-system-v3's kill list) — the geometry
 * this route settles into holds while goals load in. */
function ProfileSkeleton() {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="profile-view-loading"
      aria-busy="true"
      aria-label="Loading your profile"
    >
      <div className="animate-pulse border-b border-border-soft px-6 py-5 sm:px-8">
        <div className="h-3 w-20 rounded bg-fill" />
        <div className="mt-3 h-9 w-2/3 max-w-100 rounded bg-fill" />
        <div className="mt-3 h-4 w-1/2 max-w-80 rounded bg-fill" />
      </div>
      <div className="flex animate-pulse gap-2 border-b border-border-soft px-6 py-3 sm:px-8">
        <div className="h-8 w-20 rounded-full bg-fill" />
        <div className="h-8 w-28 rounded-full bg-fill" />
        <div className="h-8 w-24 rounded-full bg-fill" />
      </div>
      <div className="grid flex-1 animate-pulse grid-cols-1 gap-6 overflow-hidden px-6 py-6 sm:px-8 lg:grid-cols-2">
        <div className="h-40 rounded-2xl bg-fill" />
        <div className="h-40 rounded-2xl bg-fill" />
      </div>
    </div>
  );
}

export function ProfileView({
  songList,
  goals,
  isGoalsLoaded,
  onSaveGoal,
  onSetPrimaryGoal,
  gamification,
  kitConnected = false,
  insights,
  onStartTargetedPractice,
  onStartPracticeCard,
  onPracticeRhythmChange,
  onRefreshPracticeSet,
  onStartAudition,
  onOpenLesson,
}: ProfileViewProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(
    undefined,
  );
  const [isSetGoalOpen, setIsSetGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const [scale, setScale] = useState<TimeScale>('today');
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
    'Your next practice';
  const targetReason =
    target?.reason ??
    (activeGoal
      ? 'Your goal stays here while Drumroll chooses the next practice.'
      : 'Finish one song section and Drumroll will suggest what to play next.');
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
    return <ProfileSkeleton />;
  }

  const goalSwitcher = goals.length > 1 && activeGoal && (
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
                ? 'border-[var(--signal-wine)] text-text'
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
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="profile-view"
    >
      <header
        className="border-b border-border-soft px-6 py-5 sm:px-8"
        data-testid="profile-insights-hero"
      >
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--signal-wine)]">
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
              className="min-h-14 text-base"
              data-testid="profile-target-action"
              onClick={onStartTargetedPractice}
            >
              <span>Start targeted loop</span>
              {kitConnected && <KitActionChip action="continue" compact />}
            </Button>
          )}
        </div>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-4">
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

      <div className="flex items-center justify-between gap-4 border-b border-border-soft px-6 py-3 sm:px-8">
        <ScaleControl scale={scale} onChange={setScale} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-360 flex-col gap-6">
          {scale === 'today' && (
            <div
              className="flex flex-col gap-6"
              role="tabpanel"
              data-testid="profile-scale-panel-today"
              aria-label="Today"
            >
              {insights?.practiceCards && (
                <section data-testid="evidence-practice-cards">
                  <div className="mb-4">
                    <p className="text-base font-semibold tracking-[0.08em] text-[var(--signal-wine)]">
                      Today’s practice
                    </p>
                    <p className="mt-1 text-base leading-relaxed text-text-muted">
                      Each option starts a real practice run.
                    </p>
                  </div>
                  <EvidencePracticeCards
                    cards={insights.practiceCards.cards}
                    onStart={onStartPracticeCard}
                    kitConnected={kitConnected}
                  />
                </section>
              )}

              <SkillSpine states={states} focusSkillIds={focusSkillIds} />
              <ReviewQueue reviews={insights?.dueReviews ?? []} />

              {!activeGoal && (
                <section
                  className="border-t border-border-soft pt-6"
                  data-testid="no-goals-empty-state"
                >
                  <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-text">
                    Give the work a musical destination.
                  </h2>
                  <p className="mt-2 max-w-130 text-sm leading-relaxed text-text-muted">
                    Save a song or lesson goal, then Drumroll can connect the
                    next phrase to something you want to play.
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
            </div>
          )}

          {scale === '30d' && (
            <div
              className="grid grid-cols-1 gap-x-8 gap-y-7 lg:grid-cols-2"
              role="tabpanel"
              data-testid="profile-scale-panel-30d"
              aria-label="Last 30 days"
            >
              <section className="lg:col-span-2">
                <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text">
                  Per-drum accuracy
                </h3>
                <p
                  className="mt-1 text-sm leading-relaxed text-text-muted"
                  data-testid="profile-lane-accuracy-definition"
                >
                  Accuracy from your scored notes in the last 30 days.
                </p>
                <div className="mt-4">
                  <SkillBars laneAccuracy={mastery.last30DaysLaneAccuracy} />
                </div>
              </section>

              <DeadlineTargets
                targetDate={activeGoal?.targetDate}
                pacing={insights?.deadlinePacing}
              />
              {activeGoal && (
                <div className="flex flex-col justify-end">
                  <XpSkillLine
                    weekXp={weekXp}
                    dominantLaneProgress={mastery.dominantLaneProgress}
                  />
                </div>
              )}

              <div className="lg:col-span-2">
                <WeeklyRhythmPanel
                  set={insights?.weeklySet}
                  rhythm={insights?.weeklySet?.rhythm}
                  calendar={insights?.weeklyRhythm}
                  onRhythmChange={onPracticeRhythmChange}
                  onRefresh={onRefreshPracticeSet}
                />
              </div>
              <div className="lg:col-span-2">
                <WeeklyMusicalRecapPanel recap={insights?.weeklyRecap} />
              </div>
            </div>
          )}

          {scale === 'history' && (
            <div
              className="flex flex-col gap-7"
              role="tabpanel"
              data-testid="profile-scale-panel-history"
              aria-label="All history"
            >
              {goalSwitcher}

              {activeGoal ? (
                <>
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
                      className="border-l-2 border-[var(--signal-ember)] pl-3 text-sm leading-relaxed text-text-muted"
                      data-testid="retired-goal-notice"
                    >
                      This goal belongs to a retired curriculum exercise. Its
                      score and practice history remain readable, but it does
                      not unlock the new Journey.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!activeGoal.isPrimary && (
                      <Button
                        data-testid="make-primary-button"
                        onClick={() => onSetPrimaryGoal(activeGoal.id)}
                      >
                        Make this my primary goal
                      </Button>
                    )}
                    <Button
                      data-testid="add-another-goal-button"
                      icon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={openNewGoalModal}
                    >
                      Add another goal
                    </Button>
                  </div>
                </>
              ) : null}

              <div className="grid grid-cols-1 gap-x-8 gap-y-7 border-t border-border-soft pt-7 lg:grid-cols-2">
                <LearningEvidenceReceipt
                  summary={latestRun}
                  heading="Latest saved run"
                />
                <div>
                  {insights?.rejectedAtomicEvidenceCount ? (
                    <p
                      className="mb-3 border-l-2 border-[var(--signal-ember)] pl-3 text-sm leading-relaxed text-text-muted"
                      data-testid="profile-rejected-atomic-evidence"
                    >
                      {insights.rejectedAtomicEvidenceCount} older run record
                      {insights.rejectedAtomicEvidenceCount === 1
                        ? ''
                        : 's'}{' '}
                      stay hidden because this chart has changed.
                    </p>
                  ) : null}
                  {!insights?.patternProfile && (
                    <details data-testid="atomic-radar-disclosure">
                      <summary className="cursor-pointer text-sm font-semibold text-text">
                        Open skill map
                      </summary>
                      <div className="mt-5">
                        <AtomicSkillRadar
                          states={states}
                          focusSkillIds={focusSkillIds}
                        />
                      </div>
                    </details>
                  )}
                </div>
              </div>

              {insights?.patternProfile && (
                <SkillsRose
                  profile={insights.patternProfile}
                  onOpenLesson={onOpenLesson}
                />
              )}

              <div className="border-t border-border-soft pt-7">
                <PracticeHistory
                  progress={gamification.longitudinalProgress}
                  weeklyRecap={insights?.weeklyRecap}
                />
              </div>

              {retiredLessons.length > 0 && (
                <section
                  className="border-t border-border-soft pt-7"
                  data-testid="retired-lessons-history"
                >
                  <h3 className="font-display text-2xl font-semibold tracking-[-0.03em] text-text">
                    Archived curriculum history
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">
                    Older exercises keep their past results.
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
                            {lesson.bestStars === 1 ? '' : 's'} · {totalRuns}{' '}
                            run
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
            </div>
          )}
        </div>
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
