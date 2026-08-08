import { CoachFinding, CoachSongMetadata } from './types';

export interface CoachDigestInput {
  song: CoachSongMetadata;
  findings: CoachFinding[];
}

export function buildCoachDigest(input: CoachDigestInput): string {
  return JSON.stringify({
    song: input.song,
    findings: input.findings.slice(0, 6).map((finding) => ({
      kind: finding.kind,
      severity: finding.severity,
      title: finding.title,
      skillTag: finding.skillTag,
      evidence: finding.evidence,
    })),
  });
}
