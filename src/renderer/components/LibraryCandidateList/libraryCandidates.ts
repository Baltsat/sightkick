import type {
  LibraryCandidateResolution,
  YandexPlaylistCandidate,
} from '../../../types';

export function libraryCandidateState(
  track: YandexPlaylistCandidate,
  linked = false,
  resolution?: LibraryCandidateResolution,
): string {
  if (linked) {
    return 'Playable · proof gates green';
  }

  if (resolution?.status === 'exact-reviewed-chart') {
    return 'Reviewed chart found · local audio still required';
  }

  if (resolution?.status === 'identity-incomplete') {
    return 'Blocked · source identity lacks duration';
  }

  if (resolution?.status === 'no-exact-reviewed-chart') {
    return 'No reviewed exact chart · local audio can be auto-charted';
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

  return 'Needs proof · local audio + reviewed chart';
}
