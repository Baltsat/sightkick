import { Button, Divider, Progress, Switch } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowsRotate,
  faDrum,
  faFolder,
} from '@fortawesome/free-solid-svg-icons';
import { StemToolsPanel } from '../../context/StemToolsContext';
import { useApp } from '../../context/AppContext';
import { Tooltip } from '../Tooltip';
import { KitSignalCheck } from './KitSignalCheck';

interface Props {
  scanPercent?: number;
  onSetupInput: () => void;
  currentInputName?: string;
  hoverPreviewEnabled?: boolean;
  onHoverPreviewEnabledChange?: (enabled: boolean) => void;
}

export function SongListSettings({
  scanPercent,
  onSetupInput,
  currentInputName,
  hoverPreviewEnabled,
  onHoverPreviewEnabledChange,
}: Props) {
  const { currentPath } = useApp();
  const isScanning = scanPercent !== undefined;
  const currentFolderName = currentPath?.split(/[\\/]/).pop();
  const currentFolderLabel =
    currentFolderName?.toLocaleLowerCase() === 'sightkick'
      ? 'Drumroll'
      : currentFolderName;
  const selectFolder = () =>
    window.electron.ipcRenderer.sendMessage('rescan-songs');
  const rescan = () =>
    window.electron.ipcRenderer.sendMessage('rescan-songs', false);

  return (
    <>
      <div className="flex gap-2 grow">
        <Tooltip
          title={
            currentPath
              ? 'Drumroll library folder'
              : 'Point this at the folder where your songs will live'
          }
          placement="bottom"
        >
          <Button
            icon={<FontAwesomeIcon icon={faFolder} />}
            onClick={selectFolder}
            disabled={isScanning}
            className="grow"
          >
            {currentFolderLabel ?? 'Select folder'}
          </Button>
        </Tooltip>
        {currentPath ? (
          <Tooltip
            title="Picks up any songs you've added since last time"
            placement="bottomLeft"
          >
            <Button
              icon={<FontAwesomeIcon icon={faArrowsRotate} />}
              data-testid="rescan-folder"
              onClick={rescan}
            />
          </Tooltip>
        ) : null}
      </div>
      {isScanning && (
        <div className="flex flex-col gap-1" data-testid="scan-progress">
          <div className="text-sm text-text-muted">Scanning songs</div>
          <Progress percent={scanPercent} />
        </div>
      )}

      <Tooltip
        title="Hook up your e-kit (or keyboard if you fancy) so we can score your hits"
        placement="bottom"
      >
        <Button
          data-testid="setup-input"
          icon={<FontAwesomeIcon icon={faDrum} />}
          onClick={onSetupInput}
        >
          {currentInputName ?? 'Setup input'}
        </Button>
      </Tooltip>

      <KitSignalCheck onSetupInput={onSetupInput} />

      {onHoverPreviewEnabledChange && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border-soft bg-surface-muted px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-body">
              Hover previews
            </div>
            <div className="text-xs text-text-muted">
              Play the busiest drum passage after a short hover
            </div>
          </div>
          <Switch
            checked={hoverPreviewEnabled ?? true}
            onChange={onHoverPreviewEnabledChange}
            aria-label="Enable hover previews"
            data-testid="hover-preview-toggle"
          />
        </div>
      )}

      <Divider />

      <StemToolsPanel />
    </>
  );
}
