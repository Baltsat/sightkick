import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
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

function formatSpeed(speed: number, slowerOnPurpose: boolean) {
  return slowerOnPurpose
    ? `${speed.toFixed(1)}× speed — starts slower on purpose`
    : `${speed.toFixed(1)}× speed`;
}

/**
 * A receipt without a `candidateId` is next-practice's own honest fallback
 * copy (see `home-session.ts`'s `payoffReceipt`/`focusReceipt`/`buildReceipt`
 * — the literal strings live there, out of this component's scope), not a
 * ranked recommendation. It must never share the numbered, achievement-style
 * treatment of a real step — see the acceptance rule against a dead-end
 * claim ("no musical payoff yet") dressed up as a payoff.
 */
function isPlaceholderReceipt(receipt: { candidateId?: string }): boolean {
  return receipt.candidateId === undefined;
}

/**
 * True when the launch's own evidence says this recommendation is thin —
 * either the ranker's own confidence is low, or every scoring factor
 * contributed nothing (the exact shape of `recommend.ts`'s generic
 * fallback reason, "the highest-scoring available option"). Both are
 * read straight off `RankedPracticeCandidate`; nothing here is guessed.
 */
function thinEvidenceDetail(
  launch: OneKickHomeSession['launch'],
): string | undefined {
  const confidence = launch.confidence;

  if (!confidence) {
    return undefined;
  }

  const noPositiveFactor =
    launch.factors !== undefined &&
    !launch.factors.some((factor) => factor.contribution > 0);

  return confidence.level === 'low' || noPositiveFactor
    ? confidence.detail
    : undefined;
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
  const slowerOnPurpose = Boolean(
    session.launch.decisionReceipt?.scaffold.steps.includes('slower_tempo'),
  );
  const honestyDetail = thinEvidenceDetail(session.launch);

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
          {launchKind} · {formatSpeed(session.launchSpeed, slowerOnPurpose)}
        </p>
      </header>

      <section className="my-wave__reason" aria-label="Why this is next">
        <p>Why this now</p>
        <strong data-testid="my-wave-reason">{session.reason}</strong>
        {honestyDetail && (
          <small
            className="my-wave__honesty"
            data-testid="my-wave-thin-evidence"
          >
            {honestyDetail}
          </small>
        )}
      </section>

      <ol className="my-wave__path" aria-label="This session">
        {SESSION_STEPS.map(([label, key], index) => {
          const receipt = session[key];
          const placeholder = isPlaceholderReceipt(receipt);

          return (
            <li key={key} data-placeholder={placeholder || undefined}>
              <span>
                {placeholder ? '—' : String(index + 1).padStart(2, '0')}
              </span>
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
