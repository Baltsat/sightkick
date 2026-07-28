import { useEffect, useState } from 'react';
import { faFileImport } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { App, Button, Modal, Tag, Tooltip } from 'antd';
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

function autoChartToolName(value?: string): string | undefined {
  return value?.split('(')[0].trim() || undefined;
}

function coverMessage(preview: IpcImportSongPreview): string {
  switch (preview.coverSource) {
    case 'existing':
      return 'Existing album artwork will be preserved.';

    case 'embedded':
      return 'Embedded artwork found. It will be cached as album.jpg.';

    default:
      return 'No local cover found. The app icon will be used.';
  }
}

export function SongImport({ disabled, onImported }: Props) {
  const { notification } = App.useApp();
  const [selecting, setSelecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<IpcImportSongPreview>();

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
    });
  };
  const toolName = autoChartToolName(preview?.autoChartTool);

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

      <Modal
        open={Boolean(preview)}
        destroyOnHidden
        title="Review song import"
        okText="Add to library"
        confirmLoading={importing}
        onOk={confirmImport}
        onCancel={() => {
          if (!importing) {
            setPreview(undefined);
          }
        }}
      >
        {preview && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex gap-4">
              <img
                src={preview.albumCoverDataUrl ?? appIcon}
                alt={preview.albumCoverDataUrl ? `${preview.name} cover` : ''}
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
              {coverMessage(preview)}
            </div>

            <div className="text-xs text-text-faint">
              This import accepts prepared local charts and does not bypass
              streaming, paywall or DRM restrictions.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
