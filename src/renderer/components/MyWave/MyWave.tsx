import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBookOpen,
  faMusic,
  faPlay,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import type { OneKickHomeSession } from '../../services/next-practice';
import './MyWave.css';

interface MyWaveProps {
  session?: OneKickHomeSession;
  onStart: (session: OneKickHomeSession) => void;
  onOpenJourney: () => void;
  onOpenSongs: () => void;
}

const SESSION_STEPS = [
  ['Focus', 'focus'],
  ['Build', 'build'],
  ['Play', 'payoff'],
] as const;

function formatSpeed(speed: number) {
  return `${speed.toFixed(1)}× speed`;
}

export function MyWave({
  session,
  onStart,
  onOpenJourney,
  onOpenSongs,
}: MyWaveProps) {
  if (!session) {
    return (
      <section
        className="my-wave"
        data-testid="my-wave"
        data-state="empty"
        aria-labelledby="my-wave-title"
      >
        <div className="my-wave__empty">
          <p className="my-wave__eyebrow">
            <FontAwesomeIcon icon={faWandMagicSparkles} aria-hidden="true" />
            My Wave
          </p>
          <h1 id="my-wave-title">Choose your next starting point.</h1>
          <p>
            Add a playable song or lesson, then Drumroll can give you one useful
            next move.
          </p>
          <div className="my-wave__actions">
            <button type="button" onClick={onOpenSongs}>
              <FontAwesomeIcon icon={faMusic} aria-hidden="true" />
              Browse songs
            </button>
            <button type="button" onClick={onOpenJourney}>
              <FontAwesomeIcon icon={faBookOpen} aria-hidden="true" />
              Open Journey
            </button>
          </div>
        </div>
      </section>
    );
  }

  const launchKind =
    session.launch.candidate.kind === 'lesson' ? 'Lesson' : 'Song';

  return (
    <section
      className="my-wave"
      data-testid="my-wave"
      data-state="ready"
      aria-labelledby="my-wave-title"
    >
      <header className="my-wave__header">
        <p className="my-wave__eyebrow">
          <FontAwesomeIcon icon={faWandMagicSparkles} aria-hidden="true" />
          My Wave
        </p>
        <h1 id="my-wave-title">{session.launch.candidate.title}</h1>
        <p className="my-wave__meta">
          {launchKind} · {formatSpeed(session.launchSpeed)}
        </p>
      </header>

      <section className="my-wave__reason" aria-label="Why this is next">
        <p>Why this now</p>
        <strong data-testid="my-wave-reason">{session.reason}</strong>
      </section>

      <ol className="my-wave__path" aria-label="This session">
        {SESSION_STEPS.map(([label, key], index) => {
          const receipt = session[key];

          return (
            <li key={key}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <small>{label}</small>
                <strong>{receipt.title}</strong>
                <p>{receipt.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="my-wave__footer">
        <div className="my-wave__browse">
          <button type="button" onClick={onOpenSongs}>
            Browse songs <FontAwesomeIcon icon={faMusic} aria-hidden="true" />
          </button>
          <button type="button" onClick={onOpenJourney}>
            Open Journey{' '}
            <FontAwesomeIcon icon={faBookOpen} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className="my-wave__start"
          data-testid="my-wave-start"
          onClick={() => onStart(session)}
        >
          Start this wave
          <FontAwesomeIcon icon={faPlay} aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}
