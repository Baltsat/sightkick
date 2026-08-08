import { Alert, Button, Empty, Spin } from 'antd';
import { useRef, useState } from 'react';
import { Measure } from '../../../chart-parser/types';
import { IpcCoachingNotesResponse } from '../../../types';
import { CoachFindings, CoachSongMetadata } from '../../services/coach';
import { StoredHitRecord } from '../../services/practice-stats';
import { CoachCard } from './CoachCard';

interface Props {
  result?: CoachFindings;
  song: CoachSongMetadata;
  measures: Measure[];
  records: StoredHitRecord[];
  loading?: boolean;
  onPracticeBars: (start: number, end: number, speed: number) => void;
  onTrainSkill: (lessonId: string) => void;
}

export function AICoach({
  result,
  song,
  measures,
  records,
  loading = false,
  onPracticeBars,
  onTrainSkill,
}: Props) {
  const [notes, setNotes] = useState<string>();
  const [notesError, setNotesError] = useState<string>();
  const [notesLoading, setNotesLoading] = useState(false);
  const notesOffRef = useRef<(() => void) | undefined>(undefined);
  const findings = result?.findings ?? [];
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
          Practice intelligence
        </div>
        <h2 className="font-display text-2xl font-semibold text-text">
          Your next useful reps
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {result?.analyzedRuns ?? 0} full-resolution runs analyzed.
        </p>
      </div>
      {findings.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Finish a scored run to give the coach enough evidence."
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
