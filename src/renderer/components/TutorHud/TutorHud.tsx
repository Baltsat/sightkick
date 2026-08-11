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
  timingWindowMs?: number;
  timingWindowReason?: string;
  remediation?: {
    currentTask: number;
    totalTasks: number;
    cleanRepetitions: number;
    requiredCleanRepetitions: number;
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

export function TutorHud({
  state,
  message,
  displayState,
  controlPrompt,
  controlPromptCompact = false,
  timingWindowMs,
  timingWindowReason,
  remediation,
}: TutorHudProps) {
  const titleId = useId();
  const detailId = useId();

  if (
    state.phase === 'off' &&
    !remediation &&
    !displayState &&
    !controlPrompt
  ) {
    return null;
  }

  const recovery = state.recovery;
  const completedRecovery = recovery ? undefined : state.lastRecoveryOutcome;
  const checkpointLivesRefilled =
    completedRecovery?.status === 'deferred' &&
    state.settings.livesEnabled &&
    state.livesRemaining === state.settings.startingLives;
  const phaseLabel =
    displayState === 'inactivity-paused'
      ? 'Paused — no hits'
      : displayState === 'kit-ready'
      ? 'Kit ready'
      : displayState === 'kit-paused'
      ? 'Paused at the kit'
      : displayState === 'recovery-explain'
      ? 'Recovery preview'
      : displayState === 'remediation'
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
          icon={
            displayState === 'inactivity-paused'
              ? faPause
              : displayState === 'kit-ready'
              ? faDrum
              : recovery || remediation
              ? faRotateLeft
              : faEarListen
          }
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
