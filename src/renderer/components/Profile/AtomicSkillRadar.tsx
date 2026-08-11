import { useMemo } from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { buildDrumLearningProfile } from '../../services/learning-profile';
import { RunSummary } from '../../services/practice-stats';

const SPRINT_END = new Date('2026-09-10T23:59:59+08:00').getTime();

export function AtomicSkillRadar({ runs }: { runs: RunSummary[] }) {
  const profile = useMemo(() => buildDrumLearningProfile(runs), [runs]);
  const focus = profile.axes.find((axis) => axis.id === profile.focusAxis)!;
  const remainingDays = Math.max(
    0,
    Math.ceil((SPRINT_END - new Date().getTime()) / (24 * 60 * 60 * 1000)),
  );
  const chartData = profile.axes.map((axis) => ({
    axis: axis.label.replace(' & ', ' / '),
    score: axis.score,
    confidence: axis.confidence.label,
    evidence: axis.confidence.evidenceCount,
  }));

  return (
    <section
      className="rounded-2xl bg-fill p-5"
      data-testid="atomic-skill-profile"
      aria-labelledby="atomic-skill-profile-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            id="atomic-skill-profile-title"
            className="font-display text-2xl font-semibold tracking-[-0.03em] text-text"
          >
            Your playing profile
          </h3>
          <p className="mt-1 max-w-[65ch] text-xs leading-relaxed text-text-muted">
            Eight atomic drum skills, estimated from scored hits, timing, tempo,
            Tutor recovery, and Coach evidence. Sparse evidence stays explicitly
            low-confidence.
          </p>
        </div>
        <div className="text-right text-xs text-text-muted">
          <strong className="block font-display text-xl text-accent-text">
            {remainingDays} days
          </strong>
          to the 10 Sep learning sprint
        </div>
      </div>

      <div className="mt-4 grid items-center gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(12rem,0.75fr)]">
        <div className="h-72 min-w-0" aria-label="Atomic drum skill radar">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} outerRadius="72%">
              <PolarGrid stroke="rgb(17 23 34 / 16%)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: '#4d5360', fontSize: 10 }}
              />
              <Radar
                name="Demonstrated skill"
                dataKey="score"
                stroke="#f73586"
                fill="#f73586"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Tooltip
                formatter={(value, _name, item) => [
                  `${Math.round(Number(value))}/100 · ${String(
                    item.payload.confidence,
                  )} · ${String(item.payload.evidence)} runs`,
                  'Evidence-adjusted score',
                ]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent-text">
            Best next focus
          </p>
          <h4 className="mt-1 font-display text-3xl font-semibold leading-none tracking-[-0.04em] text-text">
            {focus.label}
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {focus.limitingFactor.detail}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-text-faint">Estimate</dt>
              <dd className="font-semibold text-text">{focus.score}/100</dd>
            </div>
            <div>
              <dt className="text-text-faint">Confidence</dt>
              <dd className="font-semibold text-text">
                {focus.confidence.label}
              </dd>
            </div>
            <div>
              <dt className="text-text-faint">Evidence</dt>
              <dd className="font-semibold text-text">
                {focus.confidence.evidenceCount} completed runs
              </dd>
            </div>
            <div>
              <dt className="text-text-faint">Trend</dt>
              <dd className="font-semibold capitalize text-text">
                {focus.trend.direction}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
