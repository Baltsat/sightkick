import { Button, Tag } from 'antd';
import { CoachFinding, lessonForSkill } from '../../services/coach';
import { Measure } from '../../../chart-parser/types';
import { StoredHitRecord } from '../../services/practice-stats';
import { MiniNotation } from './MiniNotation';

interface Props {
  finding: CoachFinding;
  measures: Measure[];
  records: StoredHitRecord[];
  onPracticeBars: (start: number, end: number, speed: number) => void;
  onTrainSkill: (lessonId: string) => void;
}

const severityColor = {
  high: 'error',
  medium: 'warning',
  low: 'default',
} as const;

export function CoachCard({
  finding,
  measures,
  records,
  onPracticeBars,
  onTrainSkill,
}: Props) {
  const { barStart, barEnd, slowSpeed } = finding.evidence;
  const lesson = lessonForSkill(finding.skillTag);
  const rampStart = slowSpeed ?? 0.7;

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border-soft bg-surface p-4 shadow-frame"
      data-testid={`coach-finding-${finding.kind}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold leading-tight text-text">
            {finding.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {finding.summary}
          </p>
        </div>
        <Tag color={severityColor[finding.severity]}>{finding.severity}</Tag>
      </div>
      {barStart !== undefined && barEnd !== undefined && (
        <MiniNotation
          measures={measures}
          barStart={barStart}
          barEnd={barEnd}
          records={records}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {barStart !== undefined && barEnd !== undefined && (
          <Button
            type="primary"
            data-testid="coach-practice-bars"
            onClick={() => onPracticeBars(barStart, barEnd, rampStart)}
          >
            Practice bars{' '}
            {barStart === barEnd ? barStart : `${barStart}–${barEnd}`} at{' '}
            {rampStart}x
          </Button>
        )}
        <Button
          data-testid="coach-train-skill"
          onClick={() => onTrainSkill(lesson.id)}
        >
          Train the skill · {lesson.id}
        </Button>
      </div>
      <div className="text-xs text-text-faint">Method: {lesson.title}</div>
    </article>
  );
}
