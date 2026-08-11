import type {
  ChartMatchRejection,
  LibraryCandidateResolution,
  LibrarySourceTrackProvenance,
  PlayabilityBlocker,
  PlayabilityEvidence,
  PublicDrumChartCandidate,
} from '../types';

const DURATION_TOLERANCE_SECONDS = 8;

function presentString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function normalized(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function artistKeys(artists: readonly string[]): string[] {
  return artists
    .flatMap((artist) => artist.split(/[,/&]|\b(?:feat|featuring|ft)\.?\b/i))
    .map(normalized)
    .filter(Boolean);
}

function sameArtists(
  target: readonly string[],
  candidate: readonly string[],
): boolean {
  const candidateKeys = artistKeys(candidate);

  return artistKeys(target).every((artist) =>
    candidateKeys.some(
      (candidateArtist) =>
        candidateArtist === artist ||
        candidateArtist.includes(artist) ||
        artist.includes(candidateArtist),
    ),
  );
}

export function playabilityBlockers(
  evidence: PlayabilityEvidence | undefined,
): PlayabilityBlocker[] {
  const blockers: PlayabilityBlocker[] = [];
  const identity = evidence?.identity;

  if (
    !identity ||
    !presentString(identity.title) ||
    !Array.isArray(identity.artists) ||
    identity.artists.length === 0 ||
    identity.artists.some((artist) => !presentString(artist)) ||
    !Number.isFinite(identity.durationSeconds) ||
    identity.durationSeconds <= 0
  ) {
    blockers.push('identity');
  }

  if (
    !evidence?.audio ||
    (evidence.audio.source !== 'local-user-attested' &&
      evidence.audio.source !== 'public-chart-package') ||
    !isSha256(evidence.audio.sha256)
  ) {
    blockers.push('lawful-audio');
  }

  if (
    !evidence?.chart ||
    !['local-auto-chart', 'chorus-encore', 'rhythmverse'].includes(
      evidence.chart.source,
    ) ||
    !presentString(evidence.chart.id) ||
    !isSha256(evidence.chart.sha256) ||
    evidence.chart.reviewed !== true
  ) {
    blockers.push('chart-provenance');
  }

  if (
    !evidence?.scan ||
    evidence.scan.passed !== true ||
    (evidence.scan.format !== 'mid' && evidence.scan.format !== 'chart') ||
    !Array.isArray(evidence.scan.drumDifficulties) ||
    evidence.scan.drumDifficulties.length === 0
  ) {
    blockers.push('scan-chart');
  }

  if (
    !evidence?.launch ||
    evidence.launch.passed !== true ||
    evidence.launch.mode !== 'headless-load' ||
    !presentString(evidence.launch.verifiedAt) ||
    Number.isNaN(Date.parse(evidence.launch.verifiedAt))
  ) {
    blockers.push('launch-proof');
  }

  return blockers;
}

export function isPlayableEvidence(
  evidence: PlayabilityEvidence | undefined,
): evidence is PlayabilityEvidence {
  return playabilityBlockers(evidence).length === 0;
}

export function resolvePublicDrumCharts(
  source: LibrarySourceTrackProvenance,
  candidates: readonly PublicDrumChartCandidate[],
): LibraryCandidateResolution {
  if (!source.durationSeconds) {
    return {
      trackId: source.trackId,
      status: 'identity-incomplete',
      rejected: [],
      blockers: [
        'Source row has no duration, so exact public matching is unsafe.',
      ],
    };
  }

  const rejected: ChartMatchRejection[] = [];
  const ordered = [...candidates].sort((left, right) =>
    `${left.source}:${left.id}`.localeCompare(`${right.source}:${right.id}`),
  );

  for (const candidate of ordered) {
    if (normalized(candidate.title) !== normalized(source.title)) {
      rejected.push({ candidate, reason: 'title' });

      continue;
    }

    if (!sameArtists(source.artists, candidate.artists)) {
      rejected.push({ candidate, reason: 'artist' });

      continue;
    }

    if (
      !candidate.durationSeconds ||
      Math.abs(candidate.durationSeconds - source.durationSeconds) >
        DURATION_TOLERANCE_SECONDS
    ) {
      rejected.push({ candidate, reason: 'duration' });

      continue;
    }

    if (!candidate.hasDrums) {
      rejected.push({ candidate, reason: 'no-drums' });

      continue;
    }

    if (!candidate.reviewed) {
      rejected.push({ candidate, reason: 'unreviewed' });

      continue;
    }

    return {
      trackId: source.trackId,
      status: 'exact-reviewed-chart',
      match: candidate,
      rejected,
      blockers: [],
    };
  }

  return {
    trackId: source.trackId,
    status: 'no-exact-reviewed-chart',
    rejected,
    blockers: [
      'No quality-reviewed drum chart matched the exact title, artist, and duration.',
    ],
  };
}
