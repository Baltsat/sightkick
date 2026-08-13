import type {
  LibraryCandidateResolution,
  YandexPlaylistCandidate,
} from '../../../types';

// Plain human copy only — this is the one line a not-yet-added suggestion
// row is allowed to say about itself. No "proof", "metadata", "identity",
// or other pipeline words a drummer never asked about (see
// docs/design-qa/2026-08-13-finish/critique.md, Songs finding 1, and
// docs/design-acceptance-notes.md's "plain human copy" rule). The exact
// technical reason still reaches him — through a tooltip on the row's
// action, one intentional hover away, never as the row's resting state.
export function libraryCandidateState(
  track: YandexPlaylistCandidate,
  linked = false,
  resolution?: LibraryCandidateResolution,
): string {
  if (linked) {
    return 'Ready to play';
  }

  if (resolution?.status === 'exact-reviewed-chart') {
    return 'Chart found · search to add';
  }

  if (resolution?.status === 'identity-incomplete') {
    return "Can't check this one yet";
  }

  if (resolution?.status === 'no-exact-reviewed-chart') {
    return 'Search to add this song';
  }

  if (
    track.sourceAvailability === 'unavailable' ||
    track.practiceStatus === 'unavailable'
  ) {
    return 'No longer available';
  }

  if (track.sourceAvailability === 'private') {
    return 'Private on Yandex';
  }

  if (track.sourceReferenceStatus === 'not-visible') {
    return "Can't verify this one yet";
  }

  return 'Not in your library yet';
}
