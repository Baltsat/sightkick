import { useMemo, useState } from 'react';
import {
  COACH_LESSONS,
  PATTERN_SKILL_LESSONS,
} from '../../services/coach/lessons';
import type {
  PatternFamilyProfile,
  PatternPlayerProfile,
  PatternTrend,
} from '../../services/pattern-model';
import { PatternNotationSnippet } from './PatternNotationSnippet';

const CENTER_X = 300;
const CENTER_Y = 238;
const ROSE_RADIUS = 118;
const LABEL_RADIUS = 195;
const LABEL_WIDTH = 128;
const LABEL_HEIGHT = 68;
const FAMILY_PAGE_SIZE = 6;

export interface PatternFamilyGroup {
  key: string;
  label: string;
  families: readonly PatternFamilyProfile[];
}

function point(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;

  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function polygon(points: readonly { x: number; y: number }[]): string {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}

function trendLabel(trend: PatternTrend, delta: number): string {
  if (trend === 'improving') {
    return `↑ ${delta > 0 ? '+' : ''}${delta} points`;
  }

  if (trend === 'declining') {
    return `↓ ${delta} points`;
  }

  return trend === 'stable' ? '→ steady' : '— first read';
}

function lessonTitle(id: string): string {
  return (
    [
      ...Object.values(COACH_LESSONS),
      ...Object.values(PATTERN_SKILL_LESSONS),
    ].find((lesson) => lesson.id === id)?.title ?? `Lesson ${id}`
  );
}

function sortedFamilies(
  families: readonly PatternFamilyProfile[],
): readonly PatternFamilyProfile[] {
  return [...families].sort(
    (left, right) =>
      Number(right.coverage === 'played') -
        Number(left.coverage === 'played') ||
      right.strength - left.strength ||
      left.family.family_id.localeCompare(right.family.family_id),
  );
}

export function groupPatternFamilies(
  profile: PatternPlayerProfile,
): readonly PatternFamilyGroup[] {
  const order = ['quarter', 'eighth', 'sixteenth', 'triplet', 'mixed'];
  const labels: Record<string, string> = {
    quarter: 'Quarter notes',
    eighth: 'Eighth notes',
    sixteenth: 'Sixteenth notes',
    triplet: 'Triplets',
    mixed: 'Mixed grid',
  };
  const sorted = sortedFamilies(profile.families);
  const groups = order.flatMap((key) => {
    const families = sorted.filter(({ family }) => family.subdivision === key);

    return families.length > 0 ? [{ key, label: labels[key], families }] : [];
  });

  return [{ key: 'all', label: 'All patterns', families: sorted }, ...groups];
}

export function patternFamilyPage(
  families: readonly PatternFamilyProfile[],
  page: number,
): readonly PatternFamilyProfile[] {
  const start = Math.max(0, page) * FAMILY_PAGE_SIZE;

  return families.slice(start, start + FAMILY_PAGE_SIZE);
}

export function SkillsRose({
  profile,
  onOpenLesson,
}: {
  profile: PatternPlayerProfile;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const groups = useMemo(() => groupPatternFamilies(profile), [profile]);
  const [groupKey, setGroupKey] = useState('all');
  const [page, setPage] = useState(0);
  const group = groups.find(({ key }) => key === groupKey) ?? groups[0];
  const pageCount = Math.max(
    1,
    Math.ceil((group?.families.length ?? 0) / FAMILY_PAGE_SIZE),
  );
  const resolvedPage = Math.min(page, pageCount - 1);
  const families = patternFamilyPage(group?.families ?? [], resolvedPage);

  if (families.length === 0) {
    return (
      <section
        className="border-t border-border-soft pt-7"
        data-testid="skills-rose-empty"
      >
        <h3 className="font-display text-3xl font-semibold tracking-[-0.04em] text-text">
          Skills rose
        </h3>
        <p className="mt-2 text-base text-text-muted">
          Play one scored chart to draw your first pattern.
        </p>
      </section>
    );
  }

  const rosePoints = families.map((entry, index) =>
    point(
      index,
      families.length,
      ROSE_RADIUS * (entry.coverage === 'played' ? entry.strength / 100 : 0),
    ),
  );

  return (
    <section
      className="border-t border-border-soft pt-7"
      data-testid="skills-rose"
      aria-labelledby="skills-rose-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            id="skills-rose-title"
            className="font-display text-3xl font-semibold tracking-[-0.04em] text-text"
          >
            Skills rose
          </h3>
          <p className="mt-2 max-w-[64ch] text-base leading-relaxed text-text-muted">
            Each spoke is a bar you have met in saved practice. A longer spoke
            means a stronger clean pattern.
          </p>
        </div>
        <p className="font-display text-2xl font-semibold tabular-nums text-text">
          {profile.played_family_count} / {profile.total_family_count} played
        </p>
      </div>

      <div
        className="mt-5 flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Pattern family groups"
        data-testid="skills-rose-groups"
      >
        {groups.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            className="min-h-11 rounded-full border border-border-soft px-4 text-sm font-semibold text-text data-[active=true]:border-[var(--signal-wine)] data-[active=true]:bg-[color-mix(in_srgb,var(--signal-wine)_12%,var(--surface))]"
            data-active={candidate.key === group?.key}
            onClick={() => {
              setGroupKey(candidate.key);
              setPage(0);
            }}
          >
            {candidate.label} · {candidate.families.length}
          </button>
        ))}
      </div>

      <div className="mt-4 flex min-h-11 items-center justify-between gap-4">
        <p className="text-sm font-semibold text-text-muted" aria-live="polite">
          Showing {resolvedPage * FAMILY_PAGE_SIZE + 1}–
          {Math.min(
            (resolvedPage + 1) * FAMILY_PAGE_SIZE,
            group.families.length,
          )}{' '}
          of {group.families.length}
        </p>
        {pageCount > 1 && (
          <div className="flex gap-2" aria-label="Pattern family pages">
            <button
              type="button"
              className="min-h-11 rounded-full border border-border-soft px-4 text-sm font-semibold text-text disabled:opacity-40"
              disabled={resolvedPage === 0}
              onClick={() => setPage(Math.max(0, resolvedPage - 1))}
            >
              Previous
            </button>
            <span className="self-center text-sm font-semibold tabular-nums text-text-muted">
              {resolvedPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="min-h-11 rounded-full border border-border-soft px-4 text-sm font-semibold text-text disabled:opacity-40"
              disabled={resolvedPage + 1 >= pageCount}
              onClick={() => setPage(Math.min(pageCount - 1, resolvedPage + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-8 xl:grid-cols-[minmax(34rem,1.15fr)_minmax(25rem,0.85fr)]">
        <figure
          className="mx-auto w-full max-w-160"
          data-testid="skills-rose-chart"
        >
          <svg
            className="h-auto w-full overflow-visible"
            viewBox="0 0 600 476"
            role="img"
            aria-labelledby="skills-rose-title skills-rose-caption"
          >
            {[0.25, 0.5, 0.75, 1].map((scale) => (
              <polygon
                key={scale}
                points={polygon(
                  families.map((_, index) =>
                    point(index, families.length, ROSE_RADIUS * scale),
                  ),
                )}
                fill="none"
                stroke="var(--line-soft)"
                strokeWidth="1"
              />
            ))}
            {families.map((entry, index) => {
              const end = point(index, families.length, ROSE_RADIUS);

              return (
                <line
                  key={entry.family.family_id}
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  x2={end.x}
                  y2={end.y}
                  stroke="var(--line-soft)"
                  strokeWidth="1"
                />
              );
            })}
            <polygon
              points={polygon(rosePoints)}
              fill="color-mix(in srgb, var(--signal-wine) 24%, transparent)"
              stroke="var(--signal-wine)"
              strokeWidth="3"
            />
            {rosePoints.map((vertex, index) => (
              <circle
                key={families[index].family.family_id}
                cx={vertex.x}
                cy={vertex.y}
                r="4"
                fill="var(--signal-wine)"
              />
            ))}
            {families.map((entry, index) => {
              const label = point(index, families.length, LABEL_RADIUS);

              return (
                <foreignObject
                  key={entry.family.family_id}
                  x={label.x - LABEL_WIDTH / 2}
                  y={label.y - LABEL_HEIGHT / 2}
                  width={LABEL_WIDTH}
                  height={LABEL_HEIGHT}
                >
                  <div className="flex h-full flex-col items-center justify-center gap-1">
                    <PatternNotationSnippet
                      exemplar={entry.family.exemplar}
                      label={entry.family.label}
                      size="rose"
                    />
                    <span className="text-sm font-semibold tabular-nums text-text">
                      {entry.coverage === 'played'
                        ? `${Math.round(entry.strength)}%`
                        : 'unplayed'}
                    </span>
                  </div>
                </foreignObject>
              );
            })}
          </svg>
          <figcaption id="skills-rose-caption" className="sr-only">
            Pattern strength from every saved atomic-skill evidence event.
          </figcaption>
        </figure>

        <div
          className="divide-y divide-border-soft rounded-2xl border border-border-soft bg-surface px-5"
          data-testid="skills-rose-list"
        >
          {families.map((entry) => (
            <article
              key={entry.family.family_id}
              className="grid gap-4 py-5 sm:grid-cols-[14rem_1fr] xl:grid-cols-1 2xl:grid-cols-[14rem_1fr]"
            >
              <PatternNotationSnippet
                exemplar={entry.family.exemplar}
                label={entry.family.label}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-display text-xl font-semibold tracking-[-0.025em] text-text">
                    {entry.family.label}
                  </h4>
                  <span className="font-display text-xl font-semibold tabular-nums text-text">
                    {entry.coverage === 'played'
                      ? `${Math.round(entry.strength)}%`
                      : 'Not played'}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-text-muted">
                  {trendLabel(entry.trend, entry.trend_delta)} ·{' '}
                  {entry.played_run_count} saved run
                  {entry.played_run_count === 1 ? '' : 's'}
                </p>
                {entry.family.lesson_ids.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.family.lesson_ids.map((lessonId) => (
                      <button
                        key={lessonId}
                        type="button"
                        className="min-h-11 rounded-full border border-border-soft bg-fill px-4 text-left text-sm font-semibold text-text transition-colors hover:border-[var(--signal-wine)] hover:bg-surface-raised disabled:cursor-default disabled:opacity-60"
                        onClick={() => onOpenLesson?.(lessonId)}
                        disabled={!onOpenLesson}
                      >
                        {lessonId} · {lessonTitle(lessonId)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
