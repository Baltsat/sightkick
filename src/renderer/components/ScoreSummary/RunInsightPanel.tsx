import type {
  FocusSectionInsight,
  LessonRecommendationInsight,
  RunInsights,
} from '../../services/run-insights';
import type {
  FragmentLoopProposal,
  PatternPlayerProfile,
} from '../../services/pattern-model';
import type { StoredHitRecord } from '../../services/practice-stats';
import type { RunSummary } from '../../services/practice-stats';
import { PatternNotationSnippet } from '../Profile/PatternNotationSnippet';
import { RunTrendChart } from './RunTrendChart';
import { timingQualityReceipt } from './timingQuality';

interface Props {
  insight: RunInsights;
  actionLabel: string;
  focusSection?: FocusSectionInsight;
  lessonRecommendations?: readonly LessonRecommendationInsight[];
  summary?: RunSummary;
  records?: readonly StoredHitRecord[];
  patternProfile?: PatternPlayerProfile;
  fragmentLoop?: FragmentLoopProposal;
  onFragmentLoop?: (loop: FragmentLoopProposal) => void;
  onOpenLesson?: (lessonId: string) => void;
}

function tempoLabel(speed: number | undefined): string | undefined {
  return speed === undefined ? undefined : `${Math.round(speed * 100)}% tempo`;
}

export function RunInsightPanel({
  insight,
  actionLabel,
  focusSection,
  lessonRecommendations = [],
  summary,
  records,
  patternProfile,
  fragmentLoop,
  onFragmentLoop,
  onOpenLesson,
}: Props) {
  const tempo = tempoLabel(insight.current.playbackSpeed);
  const timing = timingQualityReceipt(summary, records);
  const primaryLesson = lessonRecommendations[0];
  const patternBySkill = new Map(
    patternProfile?.families.flatMap((entry) =>
      entry.family.skill_weights.map(
        ({ skill_id }) => [skill_id, entry.family.exemplar] as const,
      ),
    ) ?? [],
  );

  return (
    <>
      <section
        className="drumroll-score-summary__run-grid"
        aria-label="This song"
      >
        <div
          className="drumroll-score-summary__metric-block"
          data-testid="run-current-metrics"
        >
          <div className="drumroll-score-summary__section-label">This song</div>
          <div
            className="drumroll-score-summary__metric-value"
            data-testid="score-cell-accuracy"
          >
            {insight.current.hitRatePercent}% hit rate
          </div>
          {timing ? (
            <div
              className="drumroll-score-summary__timing-quality"
              data-testid="timing-quality-receipt"
            >
              <strong>
                {Math.abs(timing.meanMs) <= 12
                  ? 'Centred timing'
                  : timing.meanMs < 0
                  ? 'Early timing'
                  : 'Late timing'}
              </strong>
              <span>
                Mean {timing.meanMs >= 0 ? '+' : ''}
                {timing.meanMs} ms. Median {timing.medianMs >= 0 ? '+' : ''}
                {timing.medianMs} ms. Spread {timing.spreadMs} ms.
              </span>
              <span>{timing.insideThirtyPercent}% inside ±30 ms.</span>
              <span>
                This run: {timing.scoredWindowPercent}% at ±
                {timing.scoredWindowMs} ms. Target: {timing.targetWindowPercent}
                % at ±{timing.targetWindowMs} ms.
              </span>
            </div>
          ) : null}
          <div className="drumroll-score-summary__metric-detail">
            {insight.current.hits} hit · {insight.current.misses} missed
            {insight.current.wrong > 0
              ? ` · ${insight.current.wrong} wrong-pad hits`
              : ''}
            {tempo ? ` · ${tempo}` : ''}
          </div>
          <div
            className="drumroll-score-summary__metric-next"
            data-testid="musical-receipt-action"
          >
            Next · {actionLabel}
          </div>
        </div>
        <div className="drumroll-score-summary__trend-block">
          <div className="drumroll-score-summary__section-label">
            Recent runs
          </div>
          <RunTrendChart points={insight.trend.points} />
          <div
            className="drumroll-score-summary__trend-summary"
            data-testid="run-trend-summary"
          >
            {insight.trend.summary}
          </div>
        </div>
      </section>

      {fragmentLoop || primaryLesson ? (
        <section
          className="drumroll-score-summary__next-actions"
          data-testid="run-next-actions"
          aria-label="Next practice"
        >
          <div className="drumroll-score-summary__section-label">
            Train next
          </div>
          <div className="drumroll-score-summary__next-action-grid">
            {fragmentLoop && onFragmentLoop ? (
              <button
                className="drumroll-score-summary__next-action"
                data-testid="fragment-loop-action"
                type="button"
                onClick={() => onFragmentLoop(fragmentLoop)}
              >
                <strong>
                  Drill {fragmentLoop.fragment.label} · bars{' '}
                  {fragmentLoop.bar_start}–{fragmentLoop.bar_end}
                </strong>
                <span>
                  {fragmentLoop.reason} Start at{' '}
                  {Math.round(fragmentLoop.opening_speed * 100)}% with a ±
                  {Math.round(fragmentLoop.opening_window_ms)} ms target.
                </span>
              </button>
            ) : null}
            {primaryLesson ? (
              <button
                className="drumroll-score-summary__next-action"
                data-testid="lesson-recommendation-action"
                type="button"
                disabled={!onOpenLesson}
                onClick={() => onOpenLesson?.(primaryLesson.lessonId)}
              >
                <strong>
                  Open{' '}
                  {primaryLesson.title ?? `lesson ${primaryLesson.lessonId}`}
                </strong>
                <span>Trains {primaryLesson.family}.</span>
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {insight.skills.length > 0 ||
      focusSection ||
      lessonRecommendations.length > 1 ? (
        <details
          className="drumroll-score-summary__details"
          data-testid="run-details"
        >
          <summary>Skills and detail</summary>
          {insight.skills.length > 0 ? (
            <section
              className="drumroll-score-summary__insight-section"
              data-testid="run-skill-movements"
              aria-labelledby="run-skill-movements-title"
            >
              <h3
                className="drumroll-score-summary__section-label"
                id="run-skill-movements-title"
              >
                Skills this pass
              </h3>
              <div className="drumroll-score-summary__skill-grid">
                {insight.skills.map((skill) => (
                  <article
                    className="drumroll-score-summary__skill"
                    key={skill.skillId}
                  >
                    {patternBySkill.get(skill.skillId) ? (
                      <PatternNotationSnippet
                        exemplar={patternBySkill.get(skill.skillId)!}
                        label={skill.label}
                        size="rose"
                      />
                    ) : (
                      <span
                        className="drumroll-score-summary__notation-fallback"
                        aria-label={`${skill.label} notation`}
                      >
                        ♩
                      </span>
                    )}
                    <strong>{skill.label}</strong>
                    <span>
                      {skill.movement} · {skill.qualityPercent}% quality ·{' '}
                      {skill.positiveEvidence < 0.2
                        ? 'thin evidence'
                        : `+${skill.positiveEvidence.toFixed(2)} evidence`}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {focusSection ? (
            <section
              className="drumroll-score-summary__insight-section"
              data-testid="run-focus-section"
            >
              <h3 className="drumroll-score-summary__section-label">
                Top focus
              </h3>
              <div className="drumroll-score-summary__focus-row">
                <strong>
                  {focusSection.label}
                  {focusSection.novel ? ' · new pattern' : ''}
                </strong>
                <span>
                  Replay at {Math.round(focusSection.tempoMultiplier * 100)}% ·{' '}
                  {focusSection.passCriteria}
                </span>
              </div>
            </section>
          ) : null}

          {lessonRecommendations.length > 1 ? (
            <section
              className="drumroll-score-summary__insight-section"
              data-testid="run-lesson-recommendations"
            >
              <h3 className="drumroll-score-summary__section-label">
                Recommended lesson
              </h3>
              <div className="drumroll-score-summary__lesson-grid">
                {lessonRecommendations.slice(1).map((lesson) => (
                  <div
                    className="drumroll-score-summary__lesson"
                    key={lesson.lessonId}
                  >
                    <strong>
                      {lesson.title ?? `Lesson ${lesson.lessonId}`}
                    </strong>
                    <span> · {lesson.family}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </details>
      ) : null}
    </>
  );
}
