import type { SongSectionAuditionEvidence } from '../../services/practice-stats';
import { KitCommandVeil } from '../KitCommandPrompt';

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

  if (!isReady) {
    return (
      <KitCommandVeil
        kicker="Preparing"
        title={instruction}
        detail="The first playable beat will appear before the kit is armed."
        tone="neutral"
        testId="practice-readiness-cue"
        state={phase}
      />
    );
  }

  return (
    <KitCommandVeil
      kicker="Ready"
      title={instruction}
      titleAriaLabel="Hit the kick pad once to start the count-in"
      model={{ label: instruction, steps: ['kick'] }}
      detail={
        audition
          ? `Tests ${audition.test_label} at ${audition.speed.toFixed(1)}×.`
          : 'The first beat is armed.'
      }
      tone="ready"
      testId="practice-readiness-cue"
      state={phase}
    />
  );
}
