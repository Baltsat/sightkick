import { useState } from 'react';
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
import { cn } from '../../cn';
import { Goal, SaveGoalInput, SetGoalModal } from '../Goals';
import { GoalCard } from './GoalCard';
import { XpSkillLine } from './XpSkillLine';
import { SkillBars } from './SkillBars';
import { useMastery } from './useMastery';
import { useRetiredLessons } from './useRetiredLessons';

export interface ProfileViewProps {
  songList: Song[];
  goals: Goal[];
  isGoalsLoaded: boolean;
  onSaveGoal: (input: SaveGoalInput, onSaved?: (goals: Goal[]) => void) => void;
  onSetPrimaryGoal: (id: string) => void;
  gamification: UseGamificationResult;
}

function StatChip({
  icon,
  label,
  value,
  iconColor,
}: {
  icon: typeof faFire;
  label: string;
  value: string | number;
  iconColor: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-fill p-3"
      data-testid="profile-stat-chip"
    >
      <FontAwesomeIcon icon={icon} style={{ color: iconColor }} />
      <div className="font-display text-lg font-semibold tabular-nums text-text">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-text-faint">
        {label}
      </div>
    </div>
  );
}

/**
 * The Profile surface: the primary goal's mastery ring + convergence
 * graph, a goal switcher when more than one goal exists, the XP↔skill
 * link line, a streak/XP/achievements summary (read from the
 * already-mounted `gamification` hook — never a second instance of it),
 * and 30-day per-drum skill bars.
 */
export function ProfileView({
  songList,
  goals,
  isGoalsLoaded,
  onSaveGoal,
  onSetPrimaryGoal,
  gamification,
}: ProfileViewProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(
    undefined,
  );
  const [isSetGoalOpen, setIsSetGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | undefined>(undefined);
  const retiredLessons = useRetiredLessons();
  const activeGoal =
    goals.find((g) => g.id === selectedGoalId) ??
    goals.find((g) => g.isPrimary) ??
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
    gamification.achievements?.filter((a) => a.unlocked).length ?? 0;
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
    <div className="flex flex-col gap-6" data-testid="profile-view">
      <section className="flex gap-2">
        <StatChip
          icon={faFire}
          label="Day streak"
          value={gamification.streak.current}
          iconColor="var(--color-orange)"
        />
        <StatChip
          icon={faStar}
          label="Total stars"
          value={gamification.totalStars}
          iconColor="var(--color-yellow)"
        />
        <StatChip
          icon={faTrophy}
          label="Achievements"
          value={unlockedAchievements}
          iconColor="var(--color-accent)"
        />
      </section>

      {activeGoal ? (
        <>
          <XpSkillLine
            weekXp={weekXp}
            dominantLaneProgress={mastery.dominantLaneProgress}
          />

          {goals.length > 1 && (
            <div
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label="Goals"
              data-testid="goal-switcher"
            >
              {goals.map((g) => {
                const goalSong = songList.find((song) => song.id === g.songId);

                return (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={g.id === activeGoal.id}
                    data-testid={`goal-tab-${g.id}`}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      g.id === activeGoal.id
                        ? 'border-accent-soft-border bg-accent-soft-bg text-accent-text'
                        : 'border-border-soft bg-surface text-text-muted hover:text-text',
                    )}
                    onClick={() => setSelectedGoalId(g.id)}
                  >
                    {goalSong?.name ?? g.songId}
                    {g.isPrimary && ' ★'}
                  </button>
                );
              })}
            </div>
          )}

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
          />

          {activeRetiredLesson && (
            <div
              className="rounded-xl border border-accent-soft-border bg-accent-soft-bg px-4 py-3 text-sm leading-relaxed text-text-body"
              data-testid="retired-goal-notice"
            >
              This goal belongs to a retired curriculum exercise. Its score and
              practice history are preserved below, but it does not unlock the
              new Journey. Edit the goal to point it at a current lesson or
              song.
            </div>
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
      ) : (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-soft bg-fill p-8 text-center"
          data-testid="no-goals-empty-state"
        >
          <p className="text-text-muted">
            Set an ambitious goal — a song, at full difficulty, at 100% — and
            watch the path to it build itself.
          </p>
          <Button
            type="primary"
            icon={<FontAwesomeIcon icon={faPlus} />}
            onClick={openNewGoalModal}
          >
            Set your first goal
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
          Per-drum accuracy — raw 30-day window
        </h3>
        <p
          className="text-xs leading-relaxed text-text-faint"
          data-testid="profile-lane-accuracy-definition"
        >
          Unweighted hit / (hit + miss) across scored lane notes in the last 30
          days. Home uses a separate 28-day time-decayed signal to guide the
          next practice.
        </p>
        <SkillBars laneAccuracy={mastery.last30DaysLaneAccuracy} />
      </section>

      {retiredLessons.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface p-5"
          data-testid="retired-lessons-history"
        >
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-text-faint">
              Archived curriculum history
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              These exercises were replaced, so Drumroll keeps their evidence
              readable without assigning it to different new material.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {retiredLessons.map((lesson) => {
              const totalRuns = lesson.recentRunCount + lesson.archivedRunCount;

              return (
                <article
                  key={lesson.legacySongIds.join(':')}
                  className="rounded-xl bg-fill px-3 py-3"
                  data-testid="retired-lesson-row"
                >
                  <div className="text-sm font-semibold text-text-body">
                    {lesson.name}
                  </div>
                  <div className="mt-1 text-xs text-text-faint">
                    Former lesson {lesson.lessonId ?? 'unlabelled'} ·{' '}
                    {lesson.bestStars} star
                    {lesson.bestStars === 1 ? '' : 's'} · {totalRuns} run
                    {totalRuns === 1 ? '' : 's'}
                    {lesson.goalCount > 0
                      ? ` · ${lesson.goalCount} saved goal${
                          lesson.goalCount === 1 ? '' : 's'
                        }`
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
