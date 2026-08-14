import type {
  IpcYoutubeSearchResult,
  LibrarySourceTrackProvenance,
} from '../../../types';
import { normalizeSearchText } from '../../songSearch';

export const AUTO_IMPORT_DURATION_TOLERANCE_SECONDS = 8;

export type AutoImportCandidateRejectionReason =
  | 'title'
  | 'artist'
  | 'duration'
  | 'variant';

export interface AutoImportCandidate extends IpcYoutubeSearchResult {
  score: number;
}

export interface RejectedAutoImportCandidate {
  candidate: IpcYoutubeSearchResult;
  reason: AutoImportCandidateRejectionReason;
}

export interface AutoImportCandidateRanking {
  candidates: AutoImportCandidate[];
  rejected: RejectedAutoImportCandidate[];
}

const VARIANT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['live', /\blive\b/i],
  ['cover', /\bcover\b/i],
  ['karaoke', /\bkaraoke\b/i],
  ['tribute', /\btribute\b/i],
  ['instrumental', /\binstrumental\b/i],
  ['remix', /\bremix\b/i],
  ['acoustic', /\bacoustic\b/i],
  ['sped up', /\bsped\s+up\b/i],
  ['slowed', /\bslowed\b/i],
  ['nightcore', /\bnightcore\b/i],
];
const PRESENTATION_PATTERNS =
  /\b(?:official\s+(?:music\s+)?video|official\s+audio|lyric(?:s)?\s+video|music\s+video|official|lyrics?|audio|4k|hd)\b/gi;

function comparableTitle(value: string): string {
  return normalizeSearchText(value)
    .replace(PRESENTATION_PATTERNS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalizeSearchText(value)
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((word) => word.length > 0);
}

function artistKeys(artists: readonly string[]): string[] {
  return artists
    .flatMap((artist) => artist.split(/[,/&]|\b(?:feat|featuring|ft)\.?\b/i))
    .map(comparableTitle)
    .filter(Boolean);
}

function matchesArtist(
  source: LibrarySourceTrackProvenance,
  candidate: IpcYoutubeSearchResult,
): boolean {
  const candidateText = comparableTitle(
    `${candidate.title} ${candidate.uploader ?? ''}`,
  );

  return artistKeys(source.artists).every(
    (artist) =>
      candidateText === artist ||
      candidateText.includes(artist) ||
      artist.includes(candidateText),
  );
}

function titleMatches(sourceTitle: string, candidateTitle: string): boolean {
  const source = comparableTitle(sourceTitle);
  const candidate = comparableTitle(candidateTitle);

  if (!source || !candidate) {
    return false;
  }

  if (source === candidate) {
    return true;
  }

  const sourceWords = words(source);

  if (sourceWords.length < 2) {
    return false;
  }

  return candidate.endsWith(` ${source}`) || candidate.startsWith(`${source} `);
}

function requestedVariants(
  query: string,
  source?: LibrarySourceTrackProvenance,
): Set<string> {
  const requested = `${query} ${source?.title ?? ''}`;

  return new Set(
    VARIANT_PATTERNS.filter(([, pattern]) => pattern.test(requested)).map(
      ([variant]) => variant,
    ),
  );
}

function hasUnexpectedVariant(
  candidate: IpcYoutubeSearchResult,
  acceptedVariants: ReadonlySet<string>,
): boolean {
  return VARIANT_PATTERNS.some(
    ([variant, pattern]) =>
      pattern.test(candidate.title) && !acceptedVariants.has(variant),
  );
}

function queryCoverage(
  query: string,
  candidate: IpcYoutubeSearchResult,
): number {
  const queryWords = words(query);

  if (queryWords.length === 0) {
    return 0;
  }

  const haystack = new Set(
    words(`${candidate.title} ${candidate.uploader ?? ''}`),
  );
  const matches = queryWords.filter((word) => haystack.has(word)).length;

  return matches / queryWords.length;
}

function scoreCandidate(
  query: string,
  candidate: IpcYoutubeSearchResult,
): number {
  const queryTitle = comparableTitle(query);
  const candidateTitle = comparableTitle(candidate.title);
  const coverage = queryCoverage(query, candidate);
  const exactTitle = candidateTitle === queryTitle;
  const containedTitle =
    queryTitle.length > 1 &&
    (candidateTitle.includes(queryTitle) ||
      queryTitle.includes(candidateTitle));

  return (
    coverage * 100 +
    (exactTitle ? 100 : 0) +
    (containedTitle ? 40 : 0) +
    (candidate.durationSeconds ? 5 : 0)
  );
}

function sourceCandidateScore(
  source: LibrarySourceTrackProvenance,
  candidate: IpcYoutubeSearchResult,
): number {
  const durationDelta = Math.abs(
    (candidate.durationSeconds ?? Infinity) - (source.durationSeconds ?? 0),
  );

  return 1_000 - durationDelta;
}

function rankSourceCandidate(
  query: string,
  source: LibrarySourceTrackProvenance,
  candidate: IpcYoutubeSearchResult,
): AutoImportCandidate | RejectedAutoImportCandidate {
  if (hasUnexpectedVariant(candidate, requestedVariants(query, source))) {
    return { candidate, reason: 'variant' };
  }

  if (!titleMatches(source.title, candidate.title)) {
    return { candidate, reason: 'title' };
  }

  if (!matchesArtist(source, candidate)) {
    return { candidate, reason: 'artist' };
  }

  if (
    !candidate.durationSeconds ||
    !source.durationSeconds ||
    Math.abs(candidate.durationSeconds - source.durationSeconds) >
      AUTO_IMPORT_DURATION_TOLERANCE_SECONDS
  ) {
    return { candidate, reason: 'duration' };
  }

  return { ...candidate, score: sourceCandidateScore(source, candidate) };
}

function rankQueryCandidate(
  query: string,
  candidate: IpcYoutubeSearchResult,
): AutoImportCandidate | RejectedAutoImportCandidate {
  const coverage = queryCoverage(query, candidate);

  if (coverage < 0.5) {
    return { candidate, reason: 'title' };
  }

  if (hasUnexpectedVariant(candidate, requestedVariants(query))) {
    return { candidate, reason: 'variant' };
  }

  return { ...candidate, score: scoreCandidate(query, candidate) };
}

function isAccepted(
  result: AutoImportCandidate | RejectedAutoImportCandidate,
): result is AutoImportCandidate {
  return 'score' in result;
}

export function rankAutoImportCandidates(
  query: string,
  results: readonly IpcYoutubeSearchResult[],
  source?: LibrarySourceTrackProvenance,
): AutoImportCandidateRanking {
  const candidates: AutoImportCandidate[] = [];
  const rejected: RejectedAutoImportCandidate[] = [];

  for (const candidate of results) {
    const ranked = source
      ? rankSourceCandidate(query, source, candidate)
      : rankQueryCandidate(query, candidate);

    if (isAccepted(ranked)) {
      candidates.push(ranked);
    } else {
      rejected.push(ranked);
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score || left.videoId.localeCompare(right.videoId),
  );

  return { candidates: candidates.slice(0, 5), rejected };
}
