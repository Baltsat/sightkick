import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faDrum,
  faEarListen,
  faHeart,
  faPause,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { CSSProperties, useId } from 'react';
import { TutorHudMessage } from '../../hooks/useTutorSession';
import { TutorState } from '../../services/tutor';
import type { MidiInputTelemetry } from '../../services/practice-stats';
import { KitCommandPrompt, KitCommandPromptModel } from '../KitCommandPrompt';
import './TutorHud.css';

interface TutorHudProps {
  state: TutorState;
  message: TutorHudMessage;
  displayState?:
    | 'inactivity-paused'
    | 'kit-paused'
    | 'kit-ready'
    | 'recovery-explain'
    | 'remediation';
  controlPrompt?: KitCommandPromptModel;
  controlPromptCompact?: boolean;
  midiTelemetry?: MidiInputTelemetry;
  timingWindowMs?: number;
  timingWindowReason?: string;
  remediation?: {
    currentTask: number;
    totalTasks: number;
    cleanRepetitions: number;
    requiredCleanRepetitions: number;
  };
  recoveryCaption?: {
    title: string;
    detail: string;
  };
}

function labelForPhase(phase: TutorState['phase']) {
  if (phase === 'recovering') {
    return 'Focused recovery';
  }

  if (phase === 'complete') {
    return 'Session complete';
  }

  return 'Adaptive tutor';
}

function isCompactDisplayState(displayState: TutorHudProps['displayState']) {
  return (
    displayState === 'inactivity-paused' ||
    displayState === 'kit-paused' ||
    displayState === 'kit-ready' ||
    displayState === 'recovery-explain'
  );
}

export function TutorHud({
  state,
  message,
  displayState,
  controlPrompt,
  controlPromptCompact = false,
  midiTelemetry,
  timingWindowMs,
  timingWindowReason,
  remediation,
  recoveryCaption,
}: TutorHudProps) {
  const titleId = useId();
  const detailId = useId();
  const lastMidiTime = midiTelemetry?.lastMidiTimestamp
    ? new Date(midiTelemetry.lastMidiTimestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'none';

  if (recoveryCaption) {
    return (
      <aside
        className="drumroll-tutor-hud drumroll-tutor-hud--caption"
        data-testid="tutor-recovery-caption"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-labelledby={titleId}
        aria-describedby={detailId}
      >
        <span className="drumroll-tutor-hud__caption-kicker">Coach</span>
        <strong id={titleId}>{recoveryCaption.title}</strong>
        <span id={detailId}>{recoveryCaption.detail}</span>
      </aside>
    );
  }

  if (
    state.phase === 'off' &&
    !remediation &&
    !displayState &&
    !controlPrompt
  ) {
    return null;
  }

  if (isCompactDisplayState(displayState)) {
    return (
      <aside
        className="drumroll-tutor-hud drumroll-tutor-hud--compact"
        data-tone={message.tone}
        data-phase={state.phase}
        data-display-state={displayState}
        data-testid="tutor-hud"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-labelledby={titleId}
        aria-describedby={detailId}
      >
        <div className="drumroll-tutor-hud__signal" aria-hidden="true">
          <FontAwesomeIcon
            icon={
              displayState === 'inactivity-paused' ||
              displayState === 'kit-paused'
                ? faPause
                : displayState === 'kit-ready'
                ? faDrum
                : faRotateLeft
            }
            fixedWidth
          />
        </div>
        <div className="drumroll-tutor-hud__compact-copy">
          <strong id={titleId}>{message.title}</strong>
          <span id={detailId}>{message.detail}</span>
          {midiTelemetry && (
            <span
              className="drumroll-tutor-hud__input-telemetry"
              data-testid="tutor-midi-telemetry"
              title={`MIDI ${
                midiTelemetry.rawMessageCount
              }; last message: ${lastMidiTime}; selected port epoch ${
                midiTelemetry.selectedPortEpoch
              }; last mapped lane: ${midiTelemetry.lastMappedLane ?? 'none'}`}
            >
              MIDI {midiTelemetry.rawMessageCount} · last {lastMidiTime} · E
              {midiTelemetry.selectedPortEpoch} ·{' '}
              {midiTelemetry.lastMappedLane ?? 'unmapped'}
            </span>
          )}
        </div>
        {controlPrompt && <KitCommandPrompt model={controlPrompt} compact />}
      </aside>
    );
  }

  const recovery = state.recovery;
  const completedRecovery = recovery ? undefined : state.lastRecoveryOutcome;
  const checkpointLivesRefilled =
    completedRecovery?.status === 'deferred' &&
    state.settings.livesEnabled &&
    state.livesRemaining === state.settings.startingLives;
  const phaseLabel =
    displayState === 'remediation'
      ? 'Coach remediation'
      : labelForPhase(state.phase);
  const speedLabel = `${state.currentSpeed.toFixed(1)}×`;
  const qualityProgress =
    recovery?.qualityProgress ?? completedRecovery?.qualityProgress;
  const bestQuality = recovery?.bestQuality ?? completedRecovery?.bestQuality;
  const progressRatio =
    qualityProgress === undefined
      ? 0
      : Math.min(1, qualityProgress / state.settings.requiredCleanRepetitions);
  const formLabel = recovery
    ? 'Finding shape'
    : completedRecovery?.status === 'mastered'
    ? 'Locked in'
    : completedRecovery?.status === 'deferred'
    ? 'Reset'
    : 'Open';

  return (
    <aside
      className="drumroll-tutor-hud"
      data-tone={message.tone}
      data-phase={state.phase}
      data-display-state={displayState}
      data-testid="tutor-hud"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby={titleId}
      aria-describedby={detailId}
    >
      <div className="drumroll-tutor-hud__signal" aria-hidden="true">
        <FontAwesomeIcon
          icon={recovery || remediation ? faRotateLeft : faEarListen}
          fixedWidth
        />
      </div>
      <div className="drumroll-tutor-hud__copy">
        <span className="drumroll-tutor-hud__phase">{phaseLabel}</span>
        <strong id={titleId}>{message.title}</strong>
        <span id={detailId}>{message.detail}</span>
        {!remediation && qualityProgress !== undefined && (
          <div
            className="drumroll-tutor-hud__runway"
            style={
              {
                '--runway-progress': `${progressRatio * 100}%`,
              } as CSSProperties
            }
            role="progressbar"
            aria-label="Retained pattern progress"
            aria-valuemin={0}
            aria-valuemax={state.settings.requiredCleanRepetitions}
            aria-valuenow={Number(qualityProgress.toFixed(2))}
          >
            <span aria-hidden="true" />
          </div>
        )}
        {controlPrompt && (
          <KitCommandPrompt
            model={controlPrompt}
            compact={controlPromptCompact}
          />
        )}
      </div>
      <dl className="drumroll-tutor-hud__telemetry" aria-label="Tutor status">
        <div className="drumroll-tutor-hud__metric drumroll-tutor-hud__speed">
          <dt>Speed</dt>
          <dd data-testid="tutor-speed">
            <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
            {speedLabel}
          </dd>
        </div>
        {timingWindowMs !== undefined && (
          <div
            className="drumroll-tutor-hud__metric"
            title={timingWindowReason}
          >
            <dt>Timing window</dt>
            <dd data-testid="tutor-timing-window">±{timingWindowMs} ms</dd>
          </div>
        )}
        {remediation && (
          <div className="drumroll-tutor-hud__metric">
            <dt>Phrase</dt>
            <dd data-testid="remediation-task">
              {remediation.currentTask} / {remediation.totalTasks}
            </dd>
          </div>
        )}
        {remediation && (
          <div className="drumroll-tutor-hud__metric">
            <dt>Pattern</dt>
            <dd data-testid="remediation-repetition">
              {remediation.cleanRepetitions} /{' '}
              {remediation.requiredCleanRepetitions}
            </dd>
          </div>
        )}
        {!remediation && (recovery || completedRecovery) && (
          <div className="drumroll-tutor-hud__metric">
            <dt>
              {completedRecovery?.status === 'mastered' ? 'Ready' : 'Pattern'}
            </dt>
            <dd data-testid="tutor-repetition">
              {(qualityProgress ?? 0).toFixed(1)} /{' '}
              {state.settings.requiredCleanRepetitions}
            </dd>
            {bestQuality !== undefined && (
              <span className="drumroll-tutor-hud__quality">
                Best {Math.round(bestQuality * 100)}%
              </span>
            )}
          </div>
        )}
        {!remediation && !state.settings.livesEnabled && (
          <div className="drumroll-tutor-hud__metric">
            <dt>Form</dt>
            <dd data-testid="tutor-form">
              <FontAwesomeIcon icon={faDrum} aria-hidden="true" />
              {formLabel}
            </dd>
          </div>
        )}
        {!remediation && state.settings.livesEnabled && (
          <div className="drumroll-tutor-hud__metric">
            <dt>{checkpointLivesRefilled ? 'Lives reset' : 'Lives'}</dt>
            <dd>
              <span
                className="drumroll-tutor-hud__lives"
                aria-label={`${state.livesRemaining} of ${
                  state.settings.startingLives
                } lives ${
                  checkpointLivesRefilled
                    ? 'available after checkpoint reset'
                    : 'remaining'
                }`}
                data-testid="tutor-lives"
              >
                <strong>{state.livesRemaining}</strong>
                <span aria-hidden="true">/ {state.settings.startingLives}</span>
                <span
                  className="drumroll-tutor-hud__life-icons"
                  aria-hidden="true"
                >
                  {Array.from(
                    { length: state.settings.startingLives },
                    (_, index) => (
                      <FontAwesomeIcon
                        key={index}
                        icon={faHeart}
                        data-active={index < state.livesRemaining}
                      />
                    ),
                  )}
                </span>
              </span>
            </dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
