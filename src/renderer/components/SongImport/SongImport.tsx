import { useEffect, useState } from 'react';
import { faFileImport } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { App, Button, Input, Modal, Tag, Tooltip } from 'antd';
import appIcon from '../../../../assets/icon.png';
import {
  IpcImportSongPreview,
  IpcImportSongResponse,
  IpcSelectImportSongResponse,
  Song,
} from '../../../types';

interface Props {
  disabled: boolean;
  onImported: (song: Song) => void;
}

interface SongImportReviewProps {
  preview?: IpcImportSongPreview;
  importing: boolean;
  artworkUrl: string;
  title?: string;
  allowArtworkUrl?: boolean;
  onArtworkUrlChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function autoChartToolName(value?: string): string | undefined {
  return value?.split('(')[0].trim() || undefined;
}

function coverMessage(
  preview: IpcImportSongPreview,
  allowArtworkUrl: boolean,
): string {
  if (preview.thumbnailUrl) {
    return 'The official YouTube thumbnail will be cached with this chart.';
  }

  switch (preview.coverSource) {
    case 'existing':
      return 'Existing album artwork will be preserved.';

    case 'embedded':
      return 'Embedded artwork found. It will be cached as album.jpg.';

    default:
      return allowArtworkUrl
        ? 'No local cover found. Add an allowed image URL below if you have one.'
        : 'No cover found. Start again with a YouTube URL to fetch its official thumbnail.';
  }
}

export function SongImportReview({
  preview,
  importing,
  artworkUrl,
  title = 'Review song import',
  allowArtworkUrl = true,
  onArtworkUrlChange,
  onConfirm,
  onCancel,
}: SongImportReviewProps) {
  const toolName = autoChartToolName(preview?.autoChartTool);

  return (
    <Modal
      open={Boolean(preview)}
      destroyOnHidden
      title={title}
      okText="Add to library"
      confirmLoading={importing}
      onOk={onConfirm}
      onCancel={onCancel}
    >
      {preview && (
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex gap-4">
            <img
              src={preview.albumCoverDataUrl ?? preview.thumbnailUrl ?? appIcon}
              alt={
                preview.albumCoverDataUrl || preview.thumbnailUrl
                  ? `${preview.name} cover`
                  : ''
              }
              className="h-24 w-24 rounded-lg object-cover shadow-frame"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <div className="text-xl font-bold text-text-body">
                {preview.name}
              </div>
              <div className="text-text-muted">{preview.artist}</div>
              {preview.album && (
                <div className="text-sm text-text-faint">{preview.album}</div>
              )}
              {preview.charter && (
                <div className="text-sm text-text-faint">
                  Chart by {preview.charter}
                </div>
              )}
              {toolName && (
                <Tag color="purple">Auto-charted with {toolName}</Tag>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border-soft bg-bg p-3 text-sm text-text-muted">
            {preview.chartFormat.toUpperCase()} chart · {preview.audioCount}{' '}
            audio file{preview.audioCount === 1 ? '' : 's'} ·{' '}
            {preview.drumDifficulties.join(', ')}
          </div>

          <div className="text-sm text-text-muted">
            {coverMessage(preview, allowArtworkUrl)}
          </div>

          {allowArtworkUrl && (
            <Input
              data-testid="import-artwork-url"
              value={artworkUrl}
              onChange={(event) => onArtworkUrlChange(event.target.value)}
              placeholder="Allowed direct cover image URL (optional fallback)"
            />
          )}

          <div className="text-xs text-text-faint">
            {allowArtworkUrl
              ? 'Only use artwork you own or are allowed to cache. This import accepts prepared local charts and does not bypass streaming, paywall or DRM restrictions.'
              : 'The optional YouTube thumbnail came from official oEmbed metadata. It is never used as audio or video input.'}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function SongImport({ disabled, onImported }: Props) {
  const { notification } = App.useApp();
  const [selecting, setSelecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<IpcImportSongPreview>();
  const [artworkUrl, setArtworkUrl] = useState('');

  useEffect(() => {
    const stopSelect =
      window.electron.ipcRenderer.on<IpcSelectImportSongResponse>(
        'select-import-song',
        (response) => {
          setSelecting(false);

          if (response.error) {
            notification.error({
              title: "Couldn't import this folder",
              description: response.error,
              placement: 'bottomRight',
            });

            return;
          }

          if (response.preview) {
            setArtworkUrl('');
            setPreview(response.preview);
          }
        },
      );
    const stopImport = window.electron.ipcRenderer.on<IpcImportSongResponse>(
      'import-song',
      (response) => {
        setImporting(false);

        if (!response.success || !response.song) {
          notification.error({
            title: 'Import failed',
            description: response.error,
            placement: 'bottomRight',
          });

          return;
        }

        setPreview(undefined);
        setArtworkUrl('');
        onImported(response.song);
        notification.success({
          title: `"${response.song.name}" added to your library`,
          placement: 'bottomRight',
        });
      },
    );

    return () => {
      stopSelect();
      stopImport();
    };
  }, [notification, onImported]);

  const selectSong = () => {
    setSelecting(true);
    window.electron.ipcRenderer.sendMessage('select-import-song');
  };
  const confirmImport = () => {
    if (!preview) {
      return;
    }

    setImporting(true);
    window.electron.ipcRenderer.sendMessage('import-song', {
      sourceDir: preview.sourceDir,
      ...(artworkUrl.trim() ? { artworkUrl: artworkUrl.trim() } : {}),
    });
  };

  return (
    <>
      <Tooltip
        title={
          disabled
            ? 'Select a library folder first'
            : 'Validate and add a prepared Clone Hero song folder'
        }
      >
        <Button
          icon={<FontAwesomeIcon icon={faFileImport} />}
          size="large"
          data-testid="import-song-trigger"
          disabled={disabled}
          loading={selecting}
          onClick={selectSong}
        >
          Import song
        </Button>
      </Tooltip>

      <SongImportReview
        preview={preview}
        importing={importing}
        artworkUrl={artworkUrl}
        onArtworkUrlChange={setArtworkUrl}
        onConfirm={confirmImport}
        onCancel={() => {
          if (!importing) {
            setPreview(undefined);
            setArtworkUrl('');
          }
        }}
      />
    </>
  );
}
