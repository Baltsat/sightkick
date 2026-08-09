import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBolt,
  faEarListen,
  faHeart,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { TutorHudMessage } from '../../hooks/useTutorSession';
import { TutorState } from '../../services/tutor';
import './TutorHud.css';

interface TutorHudProps {
  state: TutorState;
  message: TutorHudMessage;
}

export function TutorHud({ state, message }: TutorHudProps) {
  if (state.phase === 'off') {
    return null;
  }

  const recovery = state.recovery;

  return (
    <aside
      className="drumroll-tutor-hud"
      data-tone={message.tone}
      data-testid="tutor-hud"
      aria-live="polite"
      aria-label={`${message.title}. ${message.detail}`}
    >
      <div className="drumroll-tutor-hud__signal" aria-hidden="true">
        <FontAwesomeIcon
          icon={recovery ? faRotateLeft : faEarListen}
          fixedWidth
        />
      </div>
      <div className="drumroll-tutor-hud__copy">
        <strong>{message.title}</strong>
        <span>{message.detail}</span>
      </div>
      <div className="drumroll-tutor-hud__telemetry">
        <span className="drumroll-tutor-hud__speed">
          <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
          {Math.round(state.currentSpeed * 100)}%
        </span>
        {recovery && (
          <span data-testid="tutor-repetition">pass {recovery.repetition}</span>
        )}
        {state.settings.livesEnabled && (
          <span
            className="drumroll-tutor-hud__lives"
            aria-label={`${state.livesRemaining} lives remaining`}
            data-testid="tutor-lives"
          >
            {Array.from(
              { length: state.settings.startingLives },
              (_, index) => (
                <FontAwesomeIcon
                  key={index}
                  icon={faHeart}
                  data-active={index < state.livesRemaining}
                  aria-hidden="true"
                />
              ),
            )}
          </span>
        )}
      </div>
    </aside>
  );
}
