import { ReactNode } from 'react';
import { Button, Collapse, Divider, InputNumber, Switch } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDrum,
  faFilePdf,
  faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';
import { GameMode, PLAYHEAD_STYLES } from '../../types';
import { useSongViewSettings } from '../../context/SongViewSettingsContext';
import { SettingLabel } from './SettingLabel';
import { Tooltip } from '../Tooltip';
import { useApp } from '../../context/AppContext';
import themedark from '../../theme';

interface Props {
  onExportPdf?: () => void;
  isExporting?: boolean;
  gameMode?: GameMode;
  volumeSliders?: ReactNode[];
  clickControls?: ReactNode;
  masterVolumeControl?: ReactNode;
  tutorControls?: ReactNode;
  performanceControls?: ReactNode;
  onSetupInput?: () => void;
  currentInputName?: string;
}

export function SongViewSettings({
  onExportPdf,
  isExporting,
  volumeSliders,
  gameMode,
  clickControls,
  masterVolumeControl,
  tutorControls,
  performanceControls,
  onSetupInput,
  currentInputName,
}: Props) {
  const {
    playheadStyle,
    setPlayheadStyle,
    enableColors,
    setEnableColors,
    showBarNumbers,
    setShowBarNumbers,
    showTempo,
    setShowTempo,
    countIn,
    setCountIn,
    zoom,
    setZoom,
  } = useSongViewSettings();
  const { isDev } = useApp();

  return (
    <>
      {performanceControls ? (
        <>
          {performanceControls}
          {onSetupInput ? (
            <Button
              data-testid="setup-input"
              icon={<FontAwesomeIcon icon={faDrum} />}
              onClick={onSetupInput}
            >
              {currentInputName
                ? `Configure ${currentInputName}`
                : 'Configure input'}
            </Button>
          ) : null}
          <Divider />
        </>
      ) : null}

      {onExportPdf && (
        <Tooltip
          title="Save the sheet music as a PDF you can print or share"
          placement="bottom"
        >
          <Button
            data-testid="export-pdf"
            icon={<FontAwesomeIcon icon={faFilePdf} />}
            loading={isExporting}
            onClick={onExportPdf}
          >
            Export PDF
          </Button>
        </Tooltip>
      )}

      <Divider />

      {gameMode === 'practice' && tutorControls ? (
        <>
          {tutorControls}
          <Divider />
        </>
      ) : null}

      {gameMode !== 'practice' && (
        <>
          <div className="flex flex-col gap-3">
            <SettingLabel
              label="Playhead style"
              tooltip="How you follow along: a cursor that glides through the notes, or just the current bar lit up."
            />

            <div className="flex gap-2">
              {PLAYHEAD_STYLES.map((s) => (
                <Button
                  key={s}
                  data-testid={`playhead-${s}`}
                  className="grow"
                  type={playheadStyle === s ? 'primary' : 'default'}
                  onClick={() => setPlayheadStyle(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <Divider />
        </>
      )}

      <Collapse
        size="small"
        items={[
          {
            key: '1',
            label: <span data-testid="more-settings">More settings</span>,
            children: (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <SettingLabel
                    label="Enable colors"
                    tooltip="Color-code each drum so you can tell them apart at a glance."
                  />
                  <Switch
                    size="small"
                    data-testid="setting-colors"
                    checked={enableColors}
                    onChange={setEnableColors}
                  />
                </div>
                {isDev && (
                  <>
                    <Divider />
                    <div className="flex items-center justify-between gap-3">
                      <SettingLabel
                        label="Show bar numbers"
                        tooltip="Slap a number on every bar so you can find your spot fast."
                      />
                      <Switch
                        size="small"
                        data-testid="setting-bar-numbers"
                        checked={showBarNumbers}
                        onChange={setShowBarNumbers}
                      />
                    </div>
                  </>
                )}

                <Divider />

                <div className="flex items-center justify-between gap-3">
                  <SettingLabel
                    label="Show tempo"
                    tooltip="Write the BPM into the sheet wherever the tempo changes."
                  />
                  <Switch
                    size="small"
                    data-testid="setting-tempo"
                    checked={showTempo}
                    onChange={setShowTempo}
                  />
                </div>

                <Divider />

                <div className="flex items-center justify-between gap-3">
                  <SettingLabel
                    label="Count-in"
                    tooltip="A few clicks before the song starts so you're not caught off guard."
                  />
                  <Switch
                    size="small"
                    data-testid="setting-count-in"
                    checked={countIn}
                    onChange={setCountIn}
                  />
                </div>

                <Divider />

                <div className="flex items-center justify-between gap-3">
                  <SettingLabel label="Zoom" tooltip="Sheet music zoom" />
                  <InputNumber
                    mode="spinner"
                    size="small"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={zoom}
                    onChange={(newValue) => {
                      if (newValue === null) {
                        return;
                      }

                      setZoom(newValue);
                    }}
                    styles={{
                      input: {
                        width: '5ch',
                      },
                    }}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />

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

      {clickControls}
    </>
  );
}
