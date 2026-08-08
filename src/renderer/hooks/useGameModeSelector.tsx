import { Button, Modal, Select } from 'antd';
import { useCallback, useRef, useState } from 'react';
import { Difficulty } from 'scan-chart';
import { useApp } from '../context/AppContext';
import { useInput } from '../context/InputContext';
import { modalStyles, MODAL_ABOVE_POPOVER_Z_INDEX } from '../overlayStyles';
import { GameMode } from '../types';
import { useInputControls } from './useInputControls';

// Practice comes first — it's the primary action (both visually and as the
// default focus/highlight below), matching the owner's push towards
// practice-first framing over Perform.
const GAME_MODES: GameMode[] = ['practice', 'perform'];

export function useGameModeSelector() {
  const { difficulty, setDifficulty } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GameMode>('practice');
  // Difficulties the chart being opened actually carries. Falls back to
  // just the current global difficulty (mirrors SongView's own
  // availableDifficulties fallback) so the selector never offers a
  // difficulty the chart can't parse.
  const [availableDifficulties, setAvailableDifficulties] = useState<
    Difficulty[]
  >([difficulty]);
  const resolveRef = useRef<(gameMode?: GameMode) => void>(undefined);
  const { controlMapping } = useInput();
  const open = useCallback(
    (chartDifficulties?: Difficulty[]) => {
      resolveRef.current?.(undefined);
      setSelectedMode('practice');
      setAvailableDifficulties(
        chartDifficulties?.length ? chartDifficulties : [difficulty],
      );
      setIsOpen(true);

      return new Promise<GameMode | undefined>((resolve) => {
        resolveRef.current = resolve;
      });
    },
    [difficulty],
  );
  const close = useCallback((gameMode?: GameMode) => {
    setIsOpen(false);
    resolveRef.current?.(gameMode);
    resolveRef.current = undefined;
  }, []);
  const moveFocus = (delta: number) => {
    setSelectedMode(
      (current) =>
        GAME_MODES[
          (GAME_MODES.indexOf(current) + delta + GAME_MODES.length) %
            GAME_MODES.length
        ],
    );
  };

  useInputControls(
    controlMapping,
    {
      up: () => moveFocus(-1),
      down: () => moveFocus(1),
      confirm: () => close(selectedMode),
      back: () => close(),
    },
    isOpen,
  );

  const element = (
    <Modal
      open={isOpen}
      onCancel={() => close()}
      title={<div className="font-semibold text-xl">Select Game Mode</div>}
      footer={null}
      width={560}
      destroyOnHidden
      centered
      styles={modalStyles}
      wrapProps={{ 'data-testid': 'game-mode-selector-modal' }}
      zIndex={MODAL_ABOVE_POPOVER_Z_INDEX}
    >
      <div className="flex flex-col gap-3 items-center">
        {GAME_MODES.map((name) => (
          <Button
            key={name}
            data-testid={`game-mode-${name}`}
            size="large"
            className="w-full"
            type={name === selectedMode ? 'primary' : 'default'}
            onClick={() => close(name)}
          >
            <div className="capitalize">{name}</div>
          </Button>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <div className="text-text-faint">Difficulty:</div>

          <Select
            size="middle"
            className="capitalize"
            popupMatchSelectWidth={false}
            value={difficulty}
            data-testid="game-mode-difficulty-select"
            aria-label="Difficulty"
            disabled={availableDifficulties.length <= 1}
            // App-global, same setter the library header tabs and the
            // in-song difficulty Select use — picking a difficulty here
            // sticks everywhere else too.
            onChange={(value) => setDifficulty(value as Difficulty)}
            options={availableDifficulties.map((d) => ({
              value: d,
              label: d,
            }))}
          />
        </div>
      </div>
    </Modal>
  );

  return { open, isOpen, element };
}
