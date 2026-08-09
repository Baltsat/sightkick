import { PersistedCoachFindingEvidence } from '../practice-stats';
import { remediationForFinding } from './lessons';
import { CoachFinding } from './types';

/**
 * Keeps the decision-ready portion of a finding with the run that produced
 * it. The full Coach card stays live-only because its notation depends on
 * full-resolution records; this projection never fabricates that detail for
 * historic summaries.
 */
export function summarizeCoachFindings(
  findings: readonly CoachFinding[],
): PersistedCoachFindingEvidence[] {
  return findings
    .map((finding) => {
      const remediation = remediationForFinding(finding);

      return {
        id: finding.id,
        kind: finding.kind,
        severity: finding.severity,
        skillTag: finding.skillTag,
        sampleCount: finding.evidence.sampleCount,
        ...(finding.evidence.barStart === undefined
          ? {}
          : { barStart: finding.evidence.barStart }),
        ...(finding.evidence.barEnd === undefined
          ? {}
          : { barEnd: finding.evidence.barEnd }),
        ...(finding.evidence.lane === undefined
          ? {}
          : { lane: finding.evidence.lane }),
        ...(finding.evidence.slowSpeed === undefined
          ? {}
          : { slowSpeed: finding.evidence.slowSpeed }),
        ...(finding.evidence.actualElement === undefined
          ? {}
          : { actualElement: finding.evidence.actualElement }),
        ...(finding.evidence.expectedElement === undefined
          ? {}
          : { expectedElement: finding.evidence.expectedElement }),
        ...(remediation.status === 'available'
          ? { remediationLessonId: remediation.lessonId }
          : {}),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}
