import { ReactNode } from 'react';
import { Button, Divider } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilePdf, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { Tooltip } from '../Tooltip';
import themedark from '../../theme';

interface Props {
  onExportPdf?: () => void;
  isExporting?: boolean;
  volumeSliders?: ReactNode[];
  clickControls?: ReactNode;
  masterVolumeControl?: ReactNode;
}

export function SongViewSettings({
  onExportPdf,
  isExporting,
  volumeSliders,
  clickControls,
  masterVolumeControl,
}: Props) {
  return (
    <>
      {volumeSliders ? (
        <>
          <div className="flex items-center gap-3">
            <div
              className="grow h-px"
              style={{ background: 'var(--gradient-accent-fade-reverse)' }}
            />
            <div className="flex items-center gap-2">
              <div className="text-accent-text uppercase font-semibold text-[13px]">
                Mixer
              </div>

              <Tooltip
                title="Set how loud each track is. Mute the drums and play them yourself."
                placement="bottom"
              >
                <FontAwesomeIcon
                  icon={faInfoCircle}
                  color={themedark.color.accentText}
                />
              </Tooltip>
            </div>
            <div
              className="grow h-px"
              style={{ background: 'var(--gradient-accent-fade)' }}
            />
          </div>
          <div className="grid grid-cols-[max-content_1fr_max-content_max-content] items-center gap-x-2 gap-y-1">
            {masterVolumeControl}
            {volumeSliders}
          </div>
        </>
      ) : null}

      {clickControls ? (
        <>
          <Divider />
          {clickControls}
        </>
      ) : null}

      {onExportPdf ? (
        <>
          <Divider />
          <Tooltip
            title="Save the sheet music as a PDF you can print or share"
            placement="bottom"
          >
            <Button
              className="drumroll-performance-inspector__minor-action"
              data-testid="export-pdf"
              icon={<FontAwesomeIcon icon={faFilePdf} />}
              loading={isExporting}
              onClick={onExportPdf}
              type="text"
            >
              Export PDF
            </Button>
          </Tooltip>
        </>
      ) : null}
    </>
  );
}
