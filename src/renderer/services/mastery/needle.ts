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
    return 'Chart coverage is unknown because this chart has no saved total-note count; finish a scored full pass after the chart is available.';
  }

  const worst = worstMasteryTerm(breakdown);
  const percent = Math.round(worst.value * 100);
  const linesByTerm: Record<MasteryBreakdown['accuracy']['key'], string> = {
    accuracy: `Accuracy at full speed is the ceiling right now (${percent}%) — a clean 1.0x pass moves the needle most.`,
    consistency: `Consistency is the gap (${percent}%) — repeat runs at your current speed until the good ones stop being lucky.`,
    speedFactor: `Speed is the gap (${percent}% of the way to 1.0x) — nudge the speed slider up on your next clean run.`,
    coverage: `Coverage is the gap (${percent}% of the chart attempted) — play the song through instead of looping a section.`,
    subReadiness: `Related-skill readiness is the gap (${percent}%) — this song leans on lanes your all-time accuracy hasn't caught up on yet.`,
  };

  return linesByTerm[worst.key];
}
