import { Difficulty } from 'scan-chart';
import { ChangeEvent, CSSProperties } from 'react';
import './PracticeToolbarControls.css';

const SPEED_STOPS = Array.from({ length: 18 }, (_, index) =>
  Number((0.3 + index * 0.1).toFixed(1)),
);
const DIFFICULTY_STOPS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export interface TutorRunSettings {
  adaptiveTimingEnabled: boolean;
  autoRewind: boolean;
  recursiveDrillingEnabled: boolean;
}

export function tutorRunSettings(
  enabled: boolean,
  autoRewind: boolean,
): TutorRunSettings {
  return {
    adaptiveTimingEnabled: enabled,
    autoRewind: enabled && autoRewind,
    recursiveDrillingEnabled: enabled,
  };
}

function sliderStyle(value: number, min: number, max: number): CSSProperties {
  return {
    '--practice-slider-position': `${((value - min) / (max - min)) * 100}%`,
  } as CSSProperties;
}

function speedFor(value: number) {
  return SPEED_STOPS[value] ?? SPEED_STOPS[0];
}

interface Props {
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  speedDisabled?: boolean;
  notationLayout: 'flow' | 'classic';
  onNotationLayoutChange: (layout: 'flow' | 'classic') => void;
  difficulty: Difficulty;
  availableDifficulties: readonly Difficulty[];
  onDifficultyChange: (difficulty: Difficulty) => void;
  tutorEnabled: boolean;
  onTutorEnabledChange: (enabled: boolean) => void;
  testIdPrefix?: string;
}

export function PracticeToolbarControls({
  playbackSpeed,
  onPlaybackSpeedChange,
  speedDisabled = false,
  notationLayout,
  onNotationLayoutChange,
  difficulty,
  availableDifficulties,
  onDifficultyChange,
  tutorEnabled,
  onTutorEnabledChange,
  testIdPrefix = '',
}: Props) {
  const speedIndex = Math.max(
    0,
    SPEED_STOPS.findIndex(
      (speed) => speed === Number(playbackSpeed.toFixed(1)),
    ),
  );
  const enabledDifficulties = DIFFICULTY_STOPS.filter((item) =>
    availableDifficulties.includes(item),
  );
  const difficultyIndex = Math.max(0, enabledDifficulties.indexOf(difficulty));
  const onSpeedChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPlaybackSpeedChange(speedFor(Number(event.target.value)));
  };
  const onDifficultySliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = enabledDifficulties[Number(event.target.value)];

    if (next) {
      onDifficultyChange(next);
    }
  };

  return (
    <div className="drumroll-practice-toolbar-controls">
      <section className="drumroll-stop-slider" aria-label="Playback speed">
        <div className="drumroll-stop-slider__heading">
          <span>Speed</span>
          <output aria-live="polite">{playbackSpeed.toFixed(1)}×</output>
        </div>
        <div
          className="drumroll-stop-slider__rail"
          style={sliderStyle(speedIndex, 0, SPEED_STOPS.length - 1)}
        >
          <input
            type="range"
            min="0"
            max={SPEED_STOPS.length - 1}
            step="1"
            value={speedIndex}
            aria-label="Playback speed"
            data-testid="practice-speed-slider"
            disabled={speedDisabled}
            onChange={onSpeedChange}
          />
          <span className="drumroll-stop-slider__dots" aria-hidden="true">
            {SPEED_STOPS.map((speed) => (
              <i key={speed} />
            ))}
          </span>
        </div>
        <div className="drumroll-stop-slider__ends" aria-hidden="true">
          <span>0.3×</span>
          <span>2.0×</span>
        </div>
      </section>

      <section className="drumroll-layout-toggle" aria-label="Notation layout">
        <span className="drumroll-layout-toggle__label">Layout</span>
        <div role="group" aria-label="Notation layout">
          {(['flow', 'classic'] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              data-testid={`${testIdPrefix}notation-${layout}-toggle`}
              aria-pressed={notationLayout === layout}
              onClick={() => onNotationLayoutChange(layout)}
            >
              {layout}
            </button>
          ))}
        </div>
      </section>

      <section
        className="drumroll-stop-slider drumroll-stop-slider--difficulty"
        data-tier={difficulty}
        aria-label="Difficulty"
      >
        <div className="drumroll-stop-slider__heading">
          <span>Difficulty</span>
          <output aria-live="polite">{difficulty}</output>
        </div>
        <div
          className="drumroll-stop-slider__rail"
          style={sliderStyle(
            difficultyIndex,
            0,
            Math.max(1, enabledDifficulties.length - 1),
          )}
        >
          <input
            type="range"
            min="0"
            max={Math.max(0, enabledDifficulties.length - 1)}
            step="1"
            value={difficultyIndex}
            aria-label="Difficulty"
            data-testid="practice-difficulty-slider"
            disabled={enabledDifficulties.length <= 1}
            onChange={onDifficultySliderChange}
          />
          <span className="drumroll-stop-slider__dots" aria-hidden="true">
            {enabledDifficulties.map((item) => (
              <i key={item} />
            ))}
          </span>
        </div>
        <div className="drumroll-stop-slider__ends" aria-hidden="true">
          <span>{enabledDifficulties[0] ?? difficulty}</span>
          <span>{enabledDifficulties.at(-1) ?? difficulty}</span>
        </div>
      </section>

      <button
        type="button"
        className="drumroll-tutor-toggle"
        data-testid="practice-tutor-toggle"
        aria-pressed={tutorEnabled}
        onClick={() => onTutorEnabledChange(!tutorEnabled)}
      >
        <span>Tutor</span>
        <strong>{tutorEnabled ? 'On' : 'Off'}</strong>
      </button>
    </div>
  );
}
