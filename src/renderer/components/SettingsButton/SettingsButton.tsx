import { ReactNode, memo, useEffect, useState } from 'react';
import { Button, Collapse, Popover } from 'antd';
import { useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog } from '@fortawesome/free-solid-svg-icons';
import { popoverOpenChange, popoverStyles } from '../../overlayStyles';
import { InputConfig, useInputConfig } from '../InputConfig';
import { SongListSettings } from './SongListSettings';
import { SongViewSettings } from './SongViewSettings';
import { GameMode } from '../../types';
import { CoachSettings } from '../AICoach/CoachSettings';
import { PracticePresenceSettings } from '../PracticePresence';

interface Props {
  performanceControls?: ReactNode;
  /** The tutor only listens in Practice, so its controls hide in Perform. */
  gameMode?: GameMode;
  tutorControls?: ReactNode;
  volumeSliders?: ReactNode[];
  clickControls?: ReactNode;
  masterVolumeControl?: ReactNode;
  page: 'song-list' | 'song-view';
  scanPercent?: number;
  onExportPdf?: () => void;
  isExporting?: boolean;
  label?: string;
  hoverPreviewEnabled?: boolean;
  onHoverPreviewEnabledChange?: (enabled: boolean) => void;
  onBeforeInputConfigOpen?: () => void;
}

export const SettingsButton = memo(function Settings({
  performanceControls,
  gameMode,
  tutorControls,
  volumeSliders,
  clickControls,
  masterVolumeControl,
  page,
  scanPercent,
  onExportPdf,
  isExporting,
  label,
  hoverPreviewEnabled,
  onHoverPreviewEnabledChange,
  onBeforeInputConfigOpen,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputConfigOpen, setInputConfigOpen] = useState(false);
  const inputConfig = useInputConfig(inputConfigOpen);
  const currentInputName = inputConfig.selectedDeviceName;
  const { pathname } = useLocation();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const openInput = () => {
    onBeforeInputConfigOpen?.();
    setInputConfigOpen(true);
  };

  return (
    <>
      <InputConfig
        isOpen={inputConfigOpen}
        onClose={() => setInputConfigOpen(false)}
        {...inputConfig}
      />

      <Popover
        open={isOpen}
        onOpenChange={popoverOpenChange(setIsOpen)}
        trigger="click"
        // The library trigger sits at the bottom of the shell rail; a
        // bottom-anchored popover there lands past the window edge on a
        // small screen, where a portal cannot be scrolled into view. Open
        // rightward into the window instead; the run view keeps its
        // toolbar anchor.
        placement={page === 'song-list' ? 'rightBottom' : 'bottomRight'}
        rootClassName={label ? 'drumroll-performance-inspector' : undefined}
        destroyOnHidden={Boolean(label)}
        styles={popoverStyles}
        content={
          <div
            className={
              label
                ? 'drumroll-performance-inspector__body'
                : 'min-w-90 flex flex-col gap-3'
            }
          >
            {page === 'song-list' ? (
              <SongListSettings
                scanPercent={scanPercent}
                onSetupInput={openInput}
                currentInputName={currentInputName}
                hoverPreviewEnabled={hoverPreviewEnabled}
                onHoverPreviewEnabledChange={onHoverPreviewEnabledChange}
              />
            ) : (
              <>
                {performanceControls}
                {gameMode === 'practice' ? tutorControls : null}
                <Button
                  type="text"
                  data-testid="setup-input"
                  onClick={openInput}
                >
                  Configure {currentInputName}
                </Button>
                <SongViewSettings
                  onExportPdf={onExportPdf}
                  isExporting={isExporting}
                  masterVolumeControl={masterVolumeControl}
                  volumeSliders={volumeSliders}
                  clickControls={clickControls}
                />
              </>
            )}
            {page === 'song-list' && (
              <>
                <PracticePresenceSettings />
                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'coach-provider',
                      label: 'Advanced AI coach provider',
                      children: <CoachSettings />,
                    },
                  ]}
                />
              </>
            )}
          </div>
        }
      >
        <Button
          icon={<FontAwesomeIcon icon={faCog} />}
          size={label ? 'middle' : 'large'}
          className={label ? 'min-h-9 px-3' : 'min-h-11 min-w-11'}
          aria-label={label ? `Open ${label.toLowerCase()}` : 'Open settings'}
          data-testid="settings-trigger"
        >
          {label}
        </Button>
      </Popover>
    </>
  );
});
