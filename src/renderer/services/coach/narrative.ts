import { remediationForFinding } from './lessons';
import { CoachFinding, CoachFindingReason, CoachSongMetadata } from './types';

export interface CoachDigestInput {
  song: CoachSongMetadata;
  findings: CoachFinding[];
}

function fallbackReason(finding: CoachFinding): CoachFindingReason {
  return {
    code: 'reported-deterministic-evidence',
    counts: {
      samples: finding.evidence.sampleCount,
      hits: finding.evidence.hitCount,
      misses: finding.evidence.missCount,
      wrongHits: finding.evidence.wrongHitCount,
      matchedWrongPadPairs: finding.evidence.matchedWrongPadPairs,
    },
  };
}

export function buildCoachDigest(input: CoachDigestInput): string {
  return JSON.stringify({
    authority: {
      source: 'deterministic practice evidence',
      requirements: [
        'Treat supplied bars, counts, reason, and remediation as authoritative.',
        'Do not invent bars, note events, pad transitions, or any evidence not supplied here.',
        'Do not diagnose grip, rebound, posture, sticking, dynamics, or reading unless supplied evidence explicitly supports it.',
      ],
    },
    song: input.song,
    findings: input.findings.slice(0, 6).map((finding) => ({
      kind: finding.kind,
      severity: finding.severity,
      title: finding.title,
      skillTag: finding.skillTag,
      evidence: finding.evidence,
      reason: finding.reason ?? fallbackReason(finding),
      remediation: remediationForFinding(finding),
    })),
  });
}
