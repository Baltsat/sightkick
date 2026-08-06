import { Button, Modal } from 'antd';
import { useMemo } from 'react';
import { ScoreData, Song } from '../../../types';
import { Difficulty } from 'scan-chart';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRepeat } from '@fortawesome/free-solid-svg-icons';
import { calculateAccuracy, getStarRating } from '../../scoring';
import { MODAL_ABOVE_POPOVER_Z_INDEX, modalStyles } from '../../overlayStyles';
import { Stars } from '../Stars';
import { RunSummary } from '../../services/practice-stats';
import { PracticeStats } from '../PracticeStats';

interface Props {
  isOpen: boolean;
  onRetry: () => void;
  onNextSong: () => void;
  songData: Song | undefined;
  difficulty: Difficulty;
  scoreData?: ScoreData;
  practiceSummary?: RunSummary;
}

function noteCountLabel(count: number, verb: string): string {
  return `${count} note${count === 1 ? '' : 's'} ${verb}`;
}

export function ScoreSummary({
  isOpen,
  onRetry,
  onNextSong,
  songData,
  difficulty,
  scoreData,
  practiceSummary,
}: Props) {
  const starRating = useMemo(() => {
    if (!scoreData) {
      return 0;
    }

    return getStarRating(scoreData);
  }, [scoreData]);
  const isPerfect = useMemo(() => {
    if (!scoreData) {
      return false;
    }

    return calculateAccuracy(scoreData) === 1;
  }, [scoreData]);
  const accuracy = scoreData ? calculateAccuracy(scoreData) : 0;
  const hitNotes = scoreData?.hitNotes ?? 0;
  const missedNotes = Math.max(0, (scoreData?.totalNotes ?? 0) - hitNotes);
  const header = (
    <>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-text">
        Run complete
      </div>
      <div>
        <h2 className="text-balance font-display text-3xl font-semibold leading-tight text-text-body">
          {songData?.name}
        </h2>
        <div className="text-text-faint flex items-center gap-1 text-sm">
          <div>{songData?.artist}</div>
          <div>·</div>
          <div>{difficulty}</div>
        </div>
      </div>
    </>
  );
  const footer = (
    <div className="flex gap-3 w-full">
      <Button
        data-testid="score-retry"
        className="grow"
        onClick={() => onRetry()}
        icon={<FontAwesomeIcon icon={faRepeat} />}
        size="large"
      >
        Play again
      </Button>
      <Button
        data-testid="score-next"
        className="grow"
        type="primary"
        onClick={() => onNextSong()}
        size="large"
      >
        Back to library
      </Button>
    </div>
  );

  return (
    <Modal
      open={isOpen}
      title={header}
      footer={footer}
      closable={false}
      keyboard={false}
      mask={{ closable: false }}
      width={560}
      destroyOnHidden
      centered
      styles={modalStyles}
      wrapProps={{ 'data-testid': 'score-modal' }}
      zIndex={MODAL_ABOVE_POPOVER_Z_INDEX}
    >
      <div className="flex flex-col items-center gap-6 py-2">
        <Stars
          rating={starRating}
          perfect={isPerfect}
          glow
          size="3x"
          className="gap-3"
        />
        <div className="text-center">
          {isPerfect ? (
            <div className="font-display text-5xl font-semibold leading-none text-text">
              Perfect
            </div>
          ) : (
            <div className="font-display text-5xl font-semibold leading-none text-text tabular-nums">
              {Math.round(accuracy * 100)}% accuracy
            </div>
          )}
          <div className="mt-2 text-sm text-text-muted">
            {isPerfect
              ? 'Every note landed.'
              : `${starRating} of 5 stars on this run`}
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 text-center tabular-nums">
          <div className="rounded-xl bg-fill p-3 text-sm text-text-muted">
            {noteCountLabel(hitNotes, 'hit')}
          </div>
          <div className="rounded-xl bg-fill p-3 text-sm text-text-muted">
            {noteCountLabel(missedNotes, 'missed')}
          </div>
          <div className="rounded-xl bg-fill p-3 text-sm text-text-muted">
            {`${scoreData?.falseHits ?? 0} false hits`}
          </div>
        </div>
        <PracticeStats
          summary={practiceSummary}
          variant="inline"
          className="w-full"
        />
      </div>
    </Modal>
  );
}
