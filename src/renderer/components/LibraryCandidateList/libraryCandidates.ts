import type { YandexPlaylistCandidate } from '../../../types';

export function filterLibraryCandidates(
  tracks: readonly YandexPlaylistCandidate[],
  query: string,
): YandexPlaylistCandidate[] {
  const normalized = query.trim().toLocaleLowerCase();

  if (!normalized) {
    return [...tracks];
  }

  return tracks.filter((track) =>
    [track.title, ...track.artists].some((value) =>
      value.toLocaleLowerCase().includes(normalized),
    ),
  );
}

export function libraryCandidateState(
  track: YandexPlaylistCandidate,
  linked = false,
): string {
  if (linked) {
    return 'Linked · local chart ready';
  }

  if (
    track.sourceAvailability === 'unavailable' ||
    track.practiceStatus === 'unavailable'
  ) {
    return 'Unavailable · reference only';
  }

  if (track.sourceAvailability === 'private') {
    return 'Private · metadata only';
  }

  if (track.sourceReferenceStatus === 'not-visible') {
    return 'Metadata only · source link not visible';
  }

  return 'Metadata only · needs local audio + chart';
}
