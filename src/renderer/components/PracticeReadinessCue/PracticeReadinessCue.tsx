import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faDrum,
  faShoePrints,
} from '@fortawesome/free-solid-svg-icons';
import './PracticeReadinessCue.css';

export type PracticeReadinessPhase = 'idle' | 'ready' | 'playing';

interface PracticeReadinessCueProps {
  phase: PracticeReadinessPhase;
}

export function PracticeReadinessCue({ phase }: PracticeReadinessCueProps) {
  if (phase === 'playing') {
    return null;
  }

  const isReady = phase === 'ready';

  return (
    <section
      className="drumroll-practice-readiness"
      data-phase={phase}
      data-testid="practice-readiness-cue"
      aria-live="polite"
      aria-label={isReady ? 'Ready to play' : 'Setting the stage'}
    >
      <div className="drumroll-practice-readiness__card">
        <div className="drumroll-practice-readiness__brand" aria-hidden="true">
          <span className="drumroll-practice-readiness__mark">
            <FontAwesomeIcon icon={faDrum} fixedWidth />
          </span>
          <span>Drumroll</span>
        </div>
        <div className="drumroll-practice-readiness__copy">
          <p>{isReady ? 'ready to play' : 'setting the stage'}</p>
          <h2>
            {isReady
              ? 'One kick starts the groove.'
              : 'Your score is getting ready.'}
          </h2>
        </div>
        {isReady ? (
          <div
            className="drumroll-practice-readiness__instruction"
            aria-label="Hit the kick pad once to start the count-in"
          >
            <span
              className="drumroll-practice-readiness__kick"
              aria-hidden="true"
            >
              <FontAwesomeIcon icon={faShoePrints} fixedWidth />
              <strong>Kick</strong>
            </span>
            <FontAwesomeIcon
              className="drumroll-practice-readiness__arrow"
              icon={faArrowRight}
              aria-hidden="true"
            />
            <span>start the count-in</span>
          </div>
        ) : (
          <p className="drumroll-practice-readiness__idle-copy">
            The notes stay soft until the kit is ready.
          </p>
        )}
      </div>
    </section>
  );
}
