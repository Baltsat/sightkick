import type { SongSectionAuditionEvidence } from '../../services/practice-stats';
import '../PracticeEdgeCaption/PracticeEdgeCaption.css';
import './PracticeReadinessCue.css';

export type PracticeReadinessPhase = 'idle' | 'ready' | 'playing';

interface PracticeReadinessCueProps {
  phase: PracticeReadinessPhase;
  resumeMeasure?: number;
  audition?: SongSectionAuditionEvidence;
}

export function PracticeReadinessCue({
  phase,
  resumeMeasure,
  audition,
}: PracticeReadinessCueProps) {
  if (phase === 'playing') {
    return null;
  }

  const isReady = phase === 'ready';
  const instruction = audition
    ? `${audition.section_label} audition · kick to count in`
    : isReady
    ? resumeMeasure === undefined
      ? 'Kick to count in'
      : `Resume bar ${resumeMeasure + 1} · kick to count in`
    : 'Score preparing';

  return (
    <section
      className="drumroll-practice-edge-caption drumroll-practice-readiness"
      data-phase={phase}
      data-tone={isReady ? 'recovery' : 'neutral'}
      data-testid="practice-readiness-cue"
      data-edge-caption="ready"
      aria-live="polite"
      aria-label={isReady ? 'Ready to play' : 'Preparing score'}
    >
      <span className="drumroll-practice-edge-caption__kicker drumroll-practice-readiness__eyebrow">
        {isReady ? 'Ready' : 'Preparing'}
      </span>
      <strong
        className="drumroll-practice-edge-caption__title drumroll-practice-readiness__instruction"
        aria-label={
          isReady ? 'Hit the kick pad once to start the count-in' : undefined
        }
      >
        {instruction}
      </strong>
      <span className="drumroll-practice-edge-caption__detail drumroll-practice-readiness__detail">
        {isReady
          ? audition
            ? `Tests ${audition.test_label} at ${audition.speed.toFixed(1)}×.`
            : 'The first beat is armed.'
          : 'Notes stay neutral until the kit is ready.'}
      </span>
    </section>
  );
}
