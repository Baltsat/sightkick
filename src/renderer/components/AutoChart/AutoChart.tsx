import { useEffect, useState } from 'react';
import { faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  App,
  Button,
  Input,
  Modal,
  Progress,
  Radio,
  Steps,
  Tag,
  Tooltip,
} from 'antd';
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

const chartSteps = [
  { title: 'Download audio' },
  { title: 'Separate drums' },
  { title: 'Transcribe notes' },
  { title: 'Build chart' },
];

function activeStep(job: IpcAutoChartJob): number {
  if (['queued', 'resolving', 'downloading'].includes(job.stage)) {
    return 0;
  }

  if (job.stage !== 'processing') {
    return 3;
  }

  const message = job.message.toLowerCase();

  if (message.includes('transcrib') || message.includes('note')) {
    return 2;
  }

  if (message.includes('writ') || message.includes('build')) {
    return 3;
  }

  return 1;
}

function stageLabel(job: IpcAutoChartJob): string {
  switch (job.stage) {
    case 'queued':
      return 'Preparing';

    case 'resolving':
      return 'Finding video';

    case 'downloading':
      return 'Downloading audio';

    case 'processing':
      return job.message;

    case 'importing':
      return 'Adding to library';

    case 'failed':
      return 'Needs attention';

    case 'cancelled':
      return 'Cancelled';

    default:
      return job.message;
  }
}

export function AutoChart({ disabled, onImported }: Props) {
  const { notification } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [job, setJob] = useState<IpcAutoChartJob>();
  const [jobStep, setJobStep] = useState(0);
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

        if (!['failed', 'cancelled'].includes(nextJob.stage)) {
          setJobStep(activeStep(nextJob));
        }

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
    setJobStep(0);
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
        title="Create a drum chart"
        onCancel={() => setCreateOpen(false)}
        footer={null}
      >
        <div className="flex flex-col gap-4 pt-2 text-text-muted">
          <div>
            <h2 className="text-balance font-display text-2xl font-semibold leading-tight text-text-body">
              Paste a song. Get a playable drum chart.
            </h2>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-text-muted">
              SightKick downloads the audio, separates the drums, transcribes
              the notes, and lets you review the chart before it joins your
              library.
            </p>
          </div>

          <label
            htmlFor="auto-chart-youtube-url"
            className="text-sm font-semibold text-text-body"
          >
            YouTube video URL
          </label>
          <Input
            id="auto-chart-youtube-url"
            data-testid="auto-chart-youtube-url"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            size="large"
            autoFocus
          />

          <Button
            type="primary"
            size="large"
            block
            className="min-h-11"
            data-testid="auto-chart-from-youtube"
            disabled={!canDownloadFromYoutube}
            onClick={createFromYoutube}
          >
            Create my drum chart
          </Button>

          <Button
            type="text"
            size="large"
            block
            className="min-h-11"
            data-testid="auto-chart-local-file"
            onClick={createFromLocalFile}
          >
            Choose a local audio file instead
          </Button>

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
              className="rounded-xl border border-red/40 bg-red/10 p-3 text-sm leading-relaxed text-text-body"
              data-testid="auto-chart-no-backend"
              role="alert"
            >
              No auto-chart engine is available. Reinstall SightKick, or install
              OCTAVE.app, then try again.
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
          className="fixed bottom-5 right-5 z-50 w-112 rounded-2xl border border-border-soft bg-surface-raised p-5 shadow-frame"
          data-testid="auto-chart-progress"
          role={job.stage === 'failed' ? 'alert' : 'status'}
          aria-live={job.stage === 'failed' ? 'assertive' : 'polite'}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-text-body">Create chart</div>
            <div className="flex gap-2">
              <Tag color="blue">{backendName(job.backend)}</Tag>
              <Tag color={job.stage === 'failed' ? 'red' : 'purple'}>
                {stageLabel(job)}
              </Tag>
            </div>
          </div>
          <div className="mb-3 text-sm text-text-muted">
            {job.error ?? job.message}
          </div>
          {job.sourceName && (
            <div
              className="mb-4 truncate text-xs text-text-faint"
              title={job.sourceName}
            >
              {job.sourceName}
            </div>
          )}
          <Steps
            className="mb-4"
            data-testid="auto-chart-steps"
            size="small"
            current={jobStep}
            status={job.stage === 'failed' ? 'error' : 'process'}
            items={chartSteps}
            responsive={false}
          />
          {typeof job.percent === 'number' && (
            <Progress
              percent={job.percent}
              status={progressStatus(job.stage)}
              className="tabular-nums"
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
        title="Add this song to your library"
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
