import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faEarListen,
  faHeart,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { useId } from 'react';
import { TutorHudMessage } from '../../hooks/useTutorSession';
import { TutorState } from '../../services/tutor';
import './TutorHud.css';

interface TutorHudProps {
  state: TutorState;
  message: TutorHudMessage;
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

export function TutorHud({ state, message }: TutorHudProps) {
  const titleId = useId();
  const detailId = useId();

  if (state.phase === 'off') {
    return null;
  }

  const recovery = state.recovery;
  const phaseLabel = labelForPhase(state.phase);
  const speedLabel = `${state.currentSpeed.toFixed(1)}×`;

  return (
    <aside
      className="drumroll-tutor-hud"
      data-tone={message.tone}
      data-phase={state.phase}
      data-testid="tutor-hud"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby={titleId}
      aria-describedby={detailId}
    >
      <div className="drumroll-tutor-hud__signal" aria-hidden="true">
        <FontAwesomeIcon
          icon={recovery ? faRotateLeft : faEarListen}
          fixedWidth
        />
      </div>
      <div className="drumroll-tutor-hud__copy">
        <span className="drumroll-tutor-hud__eyebrow">{phaseLabel}</span>
        <strong id={titleId}>{message.title}</strong>
        <span id={detailId}>{message.detail}</span>
      </div>
      <dl className="drumroll-tutor-hud__telemetry" aria-label="Tutor status">
        <div className="drumroll-tutor-hud__metric drumroll-tutor-hud__speed">
          <dt>Speed</dt>
          <dd data-testid="tutor-speed">
            <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
            {speedLabel}
          </dd>
        </div>
        {recovery && (
          <div className="drumroll-tutor-hud__metric">
            <dt>Clean reps</dt>
            <dd data-testid="tutor-repetition">
              {recovery.cleanRepetitions} /{' '}
              {state.settings.requiredCleanRepetitions}
            </dd>
          </div>
        )}
        {state.settings.livesEnabled && (
          <div className="drumroll-tutor-hud__metric">
            <dt>Lives</dt>
            <dd>
              <span
                className="drumroll-tutor-hud__lives"
                aria-label={`${state.livesRemaining} of ${state.settings.startingLives} lives remaining`}
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
