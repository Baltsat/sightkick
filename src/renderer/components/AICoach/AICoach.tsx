import { Alert, Button, Empty, Spin } from 'antd';
import { useRef, useState } from 'react';
import { Measure } from '../../../chart-parser/types';
import { IpcCoachingNotesResponse } from '../../../types';
import { CoachFindings, CoachSongMetadata } from '../../services/coach';
import {
  RunSummary,
  StoredHitRecord,
  StoredPracticeRun,
} from '../../services/practice-stats';
import { CoachCard } from './CoachCard';
import { latestSummaryOnlyRun, SummaryCoachCard } from './SummaryCoachCard';

interface Props {
  result?: CoachFindings;
  song: CoachSongMetadata;
  measures: Measure[];
  records: StoredHitRecord[];
  summaryRuns?: RunSummary[];
  fullRuns?: StoredPracticeRun[];
  loading?: boolean;
  onPracticeBars: (start: number, end: number, speed: number) => void;
  onTrainSkill: (lessonId: string) => void;
}

export function AICoach({
  result,
  song,
  measures,
  records,
  summaryRuns,
  fullRuns,
  loading = false,
  onPracticeBars,
  onTrainSkill,
}: Props) {
  const [notes, setNotes] = useState<string>();
  const [notesError, setNotesError] = useState<string>();
  const [notesLoading, setNotesLoading] = useState(false);
  const notesOffRef = useRef<(() => void) | undefined>(undefined);
  const findings = result?.findings ?? [];
  const summaryOnlyRun = latestSummaryOnlyRun(summaryRuns, fullRuns);
  // Full-resolution records are the only source allowed to name exact bars.
  // A summary-only run becomes a deliberate fallback only when no detail run
  // has been analyzed, so newer evidence always takes precedence.
  const showSummaryOnly =
    findings.length === 0 &&
    (result?.analyzedRuns ?? fullRuns?.length ?? 0) === 0 &&
    summaryOnlyRun !== undefined;
  const requestNotes = () => {
    setNotesLoading(true);
    setNotes(undefined);
    setNotesError(undefined);
    notesOffRef.current?.();
    notesOffRef.current =
      window.electron.ipcRenderer.once<IpcCoachingNotesResponse>(
        'coaching-notes',
        (response) => {
          notesOffRef.current = undefined;
          setNotesLoading(false);
          setNotes(response.notes);
          setNotesError(response.error);
        },
      );
    window.electron.ipcRenderer.sendMessage('get-coaching-notes', {
      song,
      findings,
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="ai-coach">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
          Coach
        </div>
        <h2 className="font-display text-2xl font-semibold text-text">
          Your next useful reps
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {result?.analyzedRuns ?? 0} detailed run
          {(result?.analyzedRuns ?? 0) === 1 ? '' : 's'} checked.
        </p>
      </div>
      {showSummaryOnly ? (
        <SummaryCoachCard summary={summaryOnlyRun} />
      ) : findings.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Finish a practice run so the coach can help."
        />
      ) : (
        findings.map((finding) => (
          <CoachCard
            key={finding.id}
            finding={finding}
            measures={measures}
            records={records}
            onPracticeBars={onPracticeBars}
            onTrainSkill={onTrainSkill}
          />
        ))
      )}
      {findings.length > 0 && (
        <div className="rounded-xl border border-accent-soft-border bg-accent-soft-bg p-4">
          <Button loading={notesLoading} onClick={requestNotes}>
            Get coaching notes
          </Button>
          {notes && (
            <p
              className="mt-3 text-sm leading-relaxed text-text"
              data-testid="coaching-notes"
            >
              {notes}
            </p>
          )}
          {notesError && (
            <Alert className="mt-3" type="info" showIcon message={notesError} />
          )}
        </div>
      )}
    </div>
  );
}
