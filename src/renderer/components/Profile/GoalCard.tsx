import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBullseye, faPen } from '@fortawesome/free-solid-svg-icons';
import { Button, Spin } from 'antd';
import appIcon from '../../../../assets/icon.png';
import { Song } from '../../../types';
import {
  MasteryBreakdown,
  MasteryTimelinePoint,
  MasteryTrendProjection,
} from '../../services/mastery';
import { Goal } from '../Goals';
import { MasteryRing } from './MasteryRing';
import { MasteryGraph } from './MasteryGraph';
import type { SavedSongSectionAudition } from '../../services/pedagogy';

export interface GoalCardProps {
  goal: Goal;
  song: Song | undefined;
  fallbackName?: string;
  breakdown: MasteryBreakdown | undefined;
  timeline: MasteryTimelinePoint[];
  trend: MasteryTrendProjection | undefined;
  needleLine: string | undefined;
  isLoaded: boolean;
  onEdit: () => void;
  bestAudition?: SavedSongSectionAudition;
  auditionAvailable?: boolean;
  onStartAudition?: () => void;
}

function TermBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100);

  return (
    <div className="flex items-center gap-2 text-xs" data-testid="mastery-term">
      <div className="w-40 shrink-0 text-text-muted">{label}</div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="w-9 shrink-0 text-right tabular-nums text-text-faint">
        {percent}%
      </div>
    </div>
  );
}

/**
 * The Profile's centerpiece: the primary goal's mastery ring, the term
 * breakdown that explains the ring, the convergence graph, and the
 * "what moves the needle next" callout — everything the owner's vision
 * asked to "see myself converging on the goal over time" in one card.
 */
export function GoalCard({
  goal,
  song,
  fallbackName,
  breakdown,
  timeline,
  trend,
  needleLine,
  isLoaded,
  onEdit,
  bestAudition,
  auditionAvailable = false,
  onStartAudition,
}: GoalCardProps) {
  if (!isLoaded || !breakdown) {
    return (
      <div
        className="flex min-h-64 items-center justify-center rounded-2xl border border-border-soft bg-surface p-8"
        data-testid="goal-card-loading"
      >
        <Spin />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl border border-border-soft bg-surface p-5"
      data-testid="goal-card"
    >
      <div className="flex items-start gap-4">
        <img
          src={song?.albumCover ?? appIcon}
          alt=""
          className="size-16 shrink-0 rounded-xl object-cover outline outline-1 -outline-offset-1 outline-white/10"
          onError={(event) => {
            event.currentTarget.src = appIcon;
          }}
        />
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
            <FontAwesomeIcon icon={faBullseye} />
            Primary goal
          </div>
          <h3 className="truncate font-display text-xl font-semibold text-text-body">
            {song?.name ?? fallbackName ?? 'Unknown song'}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="rounded-full bg-fill px-2 py-0.5 capitalize">
              {goal.difficulty}
            </span>
            <span>100% accuracy at 1.0x</span>
            {goal.targetDate && (
              <span data-testid="goal-target-date-label">
                Target {goal.targetDate}
              </span>
            )}
          </div>
        </div>
        <Button
          icon={<FontAwesomeIcon icon={faPen} />}
          aria-label="Edit goal"
          data-testid="edit-goal-button"
          onClick={onEdit}
        />
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <MasteryRing mastery={breakdown.mastery} />
        <div className="flex w-full flex-col gap-2">
          <TermBar
            label={breakdown.accuracy.label}
            value={breakdown.accuracy.value}
          />
          <TermBar
            label={breakdown.consistency.label}
            value={breakdown.consistency.value}
          />
          <TermBar
            label={breakdown.speedFactor.label}
            value={breakdown.speedFactor.value}
          />
          <TermBar
            label={breakdown.coverage.label}
            value={breakdown.coverage.value}
          />
          <TermBar
            label={breakdown.subReadiness.label}
            value={breakdown.subReadiness.value}
          />
        </div>
      </div>

      <div
        className="rounded-xl bg-fill px-3 py-2 text-xs leading-relaxed text-text-muted"
        data-testid="mastery-evidence-window"
      >
        <div>
          <strong className="text-text">Recent readiness:</strong>{' '}
          {breakdown.recentReadiness}% from{' '}
          {breakdown.evidence.recent.sampleCount} run
          {breakdown.evidence.recent.sampleCount === 1 ? '' : 's'} in the last{' '}
          {breakdown.evidence.recent.windowDays} days
          {breakdown.evidence.recent.oldestSampleAgeDays !== undefined
            ? ` (oldest ${Math.round(
                breakdown.evidence.recent.oldestSampleAgeDays,
              )}d ago)`
            : ''}
          .
        </div>
        <div>
          <strong className="text-text">Long-term mastery:</strong>{' '}
          {breakdown.longTermMastery}% from{' '}
          {breakdown.evidence.retention.sampleCount} retained run
          {breakdown.evidence.retention.sampleCount === 1 ? '' : 's'} in the
          last {breakdown.evidence.retention.windowDays} days.
        </div>
        {breakdown.evidence.coverage !== 'measured' && (
          <div data-testid="mastery-coverage-unknown">
            Chart coverage is {breakdown.evidence.coverage}: the chart total is
            not available, so no full-coverage claim is made.
          </div>
        )}
      </div>

      {(bestAudition || (auditionAvailable && onStartAudition)) && (
        <section
          className="flex flex-wrap items-end justify-between gap-3 border-y border-border-soft py-3"
          data-testid="goal-section-audition"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-text">
              Section audition
            </p>
            {bestAudition ? (
              <>
                <p className="mt-1 text-sm font-semibold text-text">
                  Best saved: {bestAudition.section_label} ·{' '}
                  {Math.round(bestAudition.overall_accuracy * 100)}% at{' '}
                  {bestAudition.speed.toFixed(1)}×
                </p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  Tests {bestAudition.test_label}. This is a section result, not
                  a full-song readiness claim.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                A retained prerequisite makes a short, scaffolded section
                audition available.
              </p>
            )}
          </div>
          {auditionAvailable && onStartAudition && (
            <Button
              size="small"
              data-testid="goal-start-audition"
              onClick={onStartAudition}
            >
              Start section audition
            </Button>
          )}
        </section>
      )}

      {needleLine && (
        <div
          className="rounded-xl border border-accent-soft-border bg-accent-soft-bg px-4 py-2.5 text-sm text-text-body"
          data-testid="needle-mover-line"
        >
          {needleLine}
        </div>
      )}

      <MasteryGraph timeline={timeline} trend={trend} />
    </div>
  );
}
