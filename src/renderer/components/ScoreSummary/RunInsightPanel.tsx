import type {
  FocusSectionInsight,
  LessonRecommendationInsight,
  RunInsights,
} from '../../services/run-insights';
import { RunTrendChart } from './RunTrendChart';

interface Props {
  insight: RunInsights;
  actionLabel: string;
  focusSection?: FocusSectionInsight;
  lessonRecommendations?: readonly LessonRecommendationInsight[];
}

function tempoLabel(speed: number | undefined): string | undefined {
  return speed === undefined ? undefined : `${Math.round(speed * 100)}% tempo`;
}

export function RunInsightPanel({
  insight,
  actionLabel,
  focusSection,
  lessonRecommendations = [],
}: Props) {
  const tempo = tempoLabel(insight.current.playbackSpeed);

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
                <strong>{skill.label}</strong>
                <span>
                  {skill.movement} · {skill.qualityPercent}% quality · +
                  {skill.positiveEvidence.toFixed(2)} evidence
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
          <h3 className="drumroll-score-summary__section-label">Top focus</h3>
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

      {lessonRecommendations.length > 0 ? (
        <section
          className="drumroll-score-summary__insight-section"
          data-testid="run-lesson-recommendations"
        >
          <h3 className="drumroll-score-summary__section-label">
            Recommended lesson
          </h3>
          <div className="drumroll-score-summary__lesson-grid">
            {lessonRecommendations.map((lesson) => (
              <div
                className="drumroll-score-summary__lesson"
                key={lesson.lessonId}
              >
                <strong>{lesson.title ?? `Lesson ${lesson.lessonId}`}</strong>
                <span> · {lesson.family}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
