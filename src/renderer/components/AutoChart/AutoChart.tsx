import { useEffect, useState } from 'react';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { App, Button, Input, Modal, Progress, Radio, Tag, Tooltip } from 'antd';
import {
  AutoChartBackend,
  IpcAutoChartBackendsResponse,
  IpcAutoChartJob,
  Song,
} from '../../../types';
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

function backendName(backend: AutoChartBackend): string {
  return backend === 'octave' ? 'OCTAVE' : 'SightKick';
}

export function AutoChart({ disabled, onImported }: Props) {
  const { notification } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [job, setJob] = useState<IpcAutoChartJob>();
  const [artworkUrl, setArtworkUrl] = useState('');
  const [backends, setBackends] = useState<IpcAutoChartBackendsResponse>();
  const [backend, setBackend] = useState<AutoChartBackend>();
  const active = Boolean(
    job && !['imported', 'failed', 'cancelled'].includes(job.stage),
  );
  const noBackendAvailable = Boolean(
    backends && !backends.sightkick && !backends.octave,
  );
  const canDownloadFromYoutube =
    Boolean(backends?.sightkick) && youtubeUrl.trim().length > 0;

  useEffect(() => {
    window.electron.ipcRenderer.sendMessage('check-auto-chart-backends');

    return window.electron.ipcRenderer.on<IpcAutoChartBackendsResponse>(
      'auto-chart-backends',
      (response) => {
        setBackends(response);
        setBackend((current) => current ?? response.default);
      },
    );
  }, []);

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

  const createFromYoutube = () => {
    setCreateOpen(false);
    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      youtubeUrl: youtubeUrl.trim(),
      backend,
    });
  };
  const createFromLocalFile = () => {
    setCreateOpen(false);
    window.electron.ipcRenderer.sendMessage('create-auto-chart', {
      ...(youtubeUrl.trim() ? { youtubeUrl: youtubeUrl.trim() } : {}),
      localFile: true,
      backend,
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
            : 'Turn a YouTube video into a playable drum chart'
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
        title="Create a drum chart from YouTube"
        onCancel={() => setCreateOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="local"
            data-testid="auto-chart-local-file"
            onClick={createFromLocalFile}
          >
            Choose a local audio file instead
          </Button>,
          <Button
            key="youtube"
            type="primary"
            data-testid="auto-chart-from-youtube"
            disabled={!canDownloadFromYoutube}
            onClick={createFromYoutube}
          >
            Download &amp; create chart
          </Button>,
        ]}
      >
        <div className="flex flex-col gap-3 pt-2 text-text-muted">
          <Input
            data-testid="auto-chart-youtube-url"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="Paste a YouTube video URL"
            autoFocus
          />
          <div className="text-sm">
            Paste a link and SightKick downloads the audio, separates the drums,
            transcribes the pattern, and builds a chart automatically. You
            review it before it is added to your library.
          </div>

          {backends && backends.sightkick && backends.octave && (
            <div data-testid="auto-chart-backend-select">
              <Radio.Group
                value={backend}
                onChange={(event) => setBackend(event.target.value)}
                optionType="button"
                options={[
                  { label: 'SightKick', value: 'sightkick' },
                  { label: 'OCTAVE', value: 'octave' },
                ]}
              />
            </div>
          )}

          {backends && !noBackendAvailable && (
            <div
              className="text-xs text-text-faint"
              data-testid="auto-chart-backend-label"
            >
              Using the {backendName(backend ?? backends.default)} auto-charter
              {!backends.sightkick &&
                ' (bundled SightKick transcriber not found)'}
              .
            </div>
          )}

          {noBackendAvailable && (
            <div
              className="text-sm text-red-400"
              data-testid="auto-chart-no-backend"
            >
              No auto-chart engine is available. Reinstall SightKick or install
              OCTAVE.app to enable chart creation.
            </div>
          )}

          <div className="text-xs text-text-faint">
            Only chart audio you own or are allowed to process. A local audio
            file never leaves this Mac.
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
            <div className="flex gap-2">
              <Tag color="blue">{backendName(job.backend)}</Tag>
              <Tag color={job.stage === 'failed' ? 'red' : 'purple'}>
                {job.stage}
              </Tag>
            </div>
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
