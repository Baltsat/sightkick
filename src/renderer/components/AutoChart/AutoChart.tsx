import { useEffect, useState } from 'react';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { App, Button, Input, Modal, Progress, Tag, Tooltip } from 'antd';
import { IpcAutoChartJob, Song } from '../../../types';
import { SongImportReview } from '../SongImport/SongImport';

interface Props {
  disabled: boolean;
  onImported: (song: Song) => void;
}

function progressStatus(
  stage: IpcAutoChartJob['stage'],
): 'active' | 'exception' | 'success' {
  if (stage === 'failed' || stage === 'cancelled') {
    return 'exception';
  }

  return stage === 'imported' ? 'success' : 'active';
}

export function AutoChart({ disabled, onImported }: Props) {
  const { notification } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [job, setJob] = useState<IpcAutoChartJob>();
  const [artworkUrl, setArtworkUrl] = useState('');
  const active = Boolean(
    job && !['imported', 'failed', 'cancelled'].includes(job.stage),
  );

  useEffect(() => {
    return window.electron.ipcRenderer.on<IpcAutoChartJob>(
      'auto-chart-update',
      (nextJob) => {
        setJob(nextJob);

        if (nextJob.stage === 'preview-ready') {
          setArtworkUrl('');
        }

        if (nextJob.stage === 'imported') {
          if (nextJob.song) {
            onImported(nextJob.song);
          }

          notification.success({
            title: nextJob.message,
            placement: 'bottomRight',
          });
        }
      },
    );
  }, [notification, onImported]);

  const createChart = () => {
    setCreateOpen(false);
    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      ...(youtubeUrl.trim() ? { youtubeUrl: youtubeUrl.trim() } : {}),
    });
  };
  const dismiss = () => {
    if (job?.stage === 'preview-ready') {
      window.electron.ipcRenderer.sendMessage(
        'discard-auto-chart-preview',
        job.id,
      );
    }

    setJob(undefined);
    setArtworkUrl('');
  };

  return (
    <>
      <Tooltip
        title={
          disabled
            ? 'Select a library folder first'
            : active
            ? 'Finish or cancel the current chart first'
            : 'Create a prepared drum chart from local audio'
        }
      >
        <Button
          icon={<FontAwesomeIcon icon={faWandMagicSparkles} />}
          size="large"
          data-testid="create-chart-trigger"
          disabled={disabled || active}
          onClick={() => setCreateOpen(true)}
        >
          Create chart
        </Button>
      </Tooltip>

      <Modal
        open={createOpen}
        title="Create local drum chart"
        okText="Choose local audio"
        onOk={createChart}
        onCancel={() => setCreateOpen(false)}
      >
        <div className="flex flex-col gap-3 pt-2 text-text-muted">
          <Input
            data-testid="auto-chart-youtube-url"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="YouTube video URL for official metadata and thumbnail (optional)"
          />
          <div className="text-sm">
            YouTube is discovery only. SightKick never downloads audiovisual
            media from it.
          </div>
          <div className="text-sm">
            You will choose a local audio file you own or are allowed to
            process. OCTAVE runs on this Mac, and the result stays out of your
            library until you review and add it.
          </div>
        </div>
      </Modal>

      {job && job.stage !== 'preview-ready' && job.stage !== 'imported' && (
        <div
          className="fixed bottom-5 right-5 z-50 w-96 rounded-lg border border-border-soft bg-bg p-4 shadow-frame"
          data-testid="auto-chart-progress"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-text-body">Create chart</div>
            <Tag color={job.stage === 'failed' ? 'red' : 'purple'}>
              {job.stage}
            </Tag>
          </div>
          <div className="mb-3 text-sm text-text-muted">
            {job.error ?? job.message}
          </div>
          {job.sourceName && (
            <div className="mb-3 text-xs text-text-faint">{job.sourceName}</div>
          )}
          {typeof job.percent === 'number' && (
            <Progress
              percent={job.percent}
              status={progressStatus(job.stage)}
            />
          )}
          <div className="mt-3 flex justify-end gap-2">
            {['failed', 'cancelled'].includes(job.stage) && job.sourceName && (
              <Button
                data-testid="auto-chart-retry"
                onClick={() =>
                  window.electron.ipcRenderer.sendMessage(
                    'retry-auto-chart',
                    job.id,
                  )
                }
              >
                Retry
              </Button>
            )}
            {['failed', 'cancelled'].includes(job.stage) && (
              <Button data-testid="auto-chart-dismiss" onClick={dismiss}>
                Dismiss
              </Button>
            )}
            {!['failed', 'cancelled', 'importing'].includes(job.stage) && (
              <Button
                danger
                data-testid="auto-chart-cancel"
                onClick={() =>
                  window.electron.ipcRenderer.sendMessage(
                    'cancel-auto-chart',
                    job.id,
                  )
                }
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      <SongImportReview
        preview={job?.stage === 'preview-ready' ? job.preview : undefined}
        importing={job?.stage === 'importing'}
        artworkUrl={artworkUrl}
        title="Review generated drum chart"
        allowArtworkUrl={false}
        onArtworkUrlChange={setArtworkUrl}
        onConfirm={() => {
          if (job) {
            window.electron.ipcRenderer.sendMessage(
              'import-auto-chart',
              job.id,
            );
          }
        }}
        onCancel={dismiss}
      />
    </>
  );
}
