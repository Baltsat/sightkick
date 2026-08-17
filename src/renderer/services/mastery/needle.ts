import { MasteryBreakdown } from './types';
import { worstMasteryTerm } from './mastery';

/**
 * One human-readable sentence naming the single highest-leverage thing to
 * practice next, for the Profile's "what moves the needle next" line —
 * just `worstMasteryTerm` translated out of term-key jargon into copy a
 * player would actually read.
 */
export function needleMoverLine(breakdown: MasteryBreakdown): string {
  if (breakdown.runsConsidered === 0) {
    return 'Play a run at this difficulty to start tracking mastery.';
  }

  if (breakdown.evidence.coverage === 'unknown') {
    return 'Finish 1 scored full pass after the chart loads. Saved note count: 0.';
  }

  const worst = worstMasteryTerm(breakdown);
  const percent = Math.round(worst.value * 100);
  const linesByTerm: Record<MasteryBreakdown['accuracy']['key'], string> = {
    accuracy: `Play 1 clean pass at 1.0×. Full-speed accuracy: ${percent}%.`,
    consistency: `Play 2 runs at your current speed. Consistency: ${percent}%.`,
    speedFactor: `Raise the speed by 0.1× after 1 clean run. Speed term: ${percent}%.`,
    coverage: `Play 1 full-song pass. Chart coverage: ${percent}%.`,
    subReadiness: `Practice the weakest linked lane. Related-skill readiness: ${percent}%.`,
  };

  return linesByTerm[worst.key];
}
