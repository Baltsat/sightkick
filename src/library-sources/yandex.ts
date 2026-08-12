import type {
  LibraryCandidateLocalStatus,
  LibraryCandidatePracticeStatus,
  LibrarySourceAvailability,
  LibrarySourceReferenceStatus,
  YandexPlaylistCandidateCollection,
  YandexPlaylistCompleteness,
  YandexPlaylistIntegrity,
  YandexPlaylistSource,
} from '../types';

export const YANDEX_DRUMS_SOURCE_FILE = 'yandex-drums-2026-08-09.json';

export const YANDEX_FAVORITES_SOURCE_FILE = 'yandex-favorites-2026-08-10.json';

type SourceTrack = Omit<
  YandexPlaylistCandidateCollection['tracks'][number],
  'id' | 'practiceStatus'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAvailability(value: unknown): value is LibrarySourceAvailability {
  return (
    value === 'available' || value === 'unavailable' || value === 'private'
  );
}

function isReferenceStatus(
  value: unknown,
): value is LibrarySourceReferenceStatus {
  return (
    value === 'stable-link' ||
    value === 'not-visible' ||
    value === 'private-only'
  );
}

function isLocalStatus(value: unknown): value is LibraryCandidateLocalStatus {
  return value === 'candidate' || value === 'reference';
}

function isPlaylist(value: unknown): value is YandexPlaylistSource {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.url === 'string' &&
    typeof value.capturedOn === 'string' &&
    typeof value.capturedAt === 'string' &&
    value.captureMethod === 'authenticated-visible-dom' &&
    value.captureSurface === 'Yandex Music playlist track rows' &&
    typeof value.metadataScope === 'string' &&
    value.rightsScope === 'metadata-only'
  );
}

function isCompleteness(value: unknown): value is YandexPlaylistCompleteness {
  if (!isRecord(value)) {
    return false;
  }

  const numberFields = [
    value.declaredTrackCount,
    value.renderedTrackCount,
    value.stableSourceTrackUrlCount,
  ];

  return (
    numberFields.every(
      (field) => Number.isInteger(field) && (field as number) >= 0,
    ) &&
    Array.isArray(value.noVisibleStableSourceTrackUrlOrdinals) &&
    value.noVisibleStableSourceTrackUrlOrdinals.every(Number.isInteger) &&
    Array.isArray(value.privateOnlyOrdinals) &&
    value.privateOnlyOrdinals.every(Number.isInteger)
  );
}

function isIntegrity(value: unknown): value is YandexPlaylistIntegrity {
  return (
    isRecord(value) &&
    typeof value.canonicalization === 'string' &&
    typeof value.canonicalSha256 === 'string'
  );
}

function parseTrack(value: unknown, playlistId: string): SourceTrack {
  if (!isRecord(value)) {
    throw new Error('Yandex source track must be an object.');
  }

  const {
    ordinal,
    title,
    artists,
    durationSeconds,
    sourceTrackUrl,
    sourceAvailability,
    sourceReferenceStatus,
    localStatus,
  } = value;

  if (
    !Number.isInteger(ordinal) ||
    (ordinal as number) < 1 ||
    typeof title !== 'string' ||
    !title.trim() ||
    !Array.isArray(artists) ||
    artists.some((artist) => typeof artist !== 'string' || !artist.trim()) ||
    !(
      durationSeconds === null ||
      (typeof durationSeconds === 'number' && durationSeconds > 0)
    ) ||
    !(sourceTrackUrl === null || typeof sourceTrackUrl === 'string') ||
    !isAvailability(sourceAvailability) ||
    !isReferenceStatus(sourceReferenceStatus) ||
    !isLocalStatus(localStatus)
  ) {
    throw new Error('Yandex source track has an invalid metadata shape.');
  }

  const parsedOrdinal = ordinal as number;
  const parsedArtists = artists as string[];
  const parsedDuration = durationSeconds as number | null;
  const parsedSourceUrl = sourceTrackUrl as string | null;
  const requiresReference =
    sourceAvailability !== 'available' ||
    sourceReferenceStatus !== 'stable-link';

  if (
    (requiresReference &&
      (parsedSourceUrl !== null || localStatus !== 'reference')) ||
    (!requiresReference &&
      (parsedSourceUrl === null || localStatus !== 'candidate'))
  ) {
    throw new Error(
      `Yandex track ${playlistId}:${parsedOrdinal} has an unsafe source reference state.`,
    );
  }

  if (
    sourceAvailability === 'private' &&
    sourceReferenceStatus !== 'private-only'
  ) {
    throw new Error(
      `Private Yandex track ${playlistId}:${parsedOrdinal} must remain private-only metadata.`,
    );
  }

  return {
    ordinal: parsedOrdinal,
    title,
    artists: [...parsedArtists],
    durationSeconds: parsedDuration,
    sourceTrackUrl: parsedSourceUrl,
    sourceAvailability,
    sourceReferenceStatus,
    localStatus,
  };
}

/**
 * Converts a captured playlist document into app-safe source rows. These rows
 * intentionally contain no audio, streaming, download, or playable-song data.
 */
export function parseYandexPlaylistCandidates(
  value: unknown,
): YandexPlaylistCandidateCollection {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.source !== 'yandex-music'
  ) {
    throw new Error('Unsupported Yandex source document.');
  }

  const playlist = value.playlist;
  const completeness = value.completeness;
  const integrity = value.integrity;
  const sourceTracks = value.tracks;

  if (
    !isPlaylist(playlist) ||
    !isCompleteness(completeness) ||
    !isIntegrity(integrity) ||
    !Array.isArray(sourceTracks)
  ) {
    throw new Error('Yandex source document has an invalid manifest shape.');
  }

  const tracks = sourceTracks.map((track) => parseTrack(track, playlist.id));
  const ordinals = tracks.map((track) => track.ordinal);
  const sourceUrls = tracks
    .map((track) => track.sourceTrackUrl)
    .filter((url): url is string => url !== null);

  if (
    tracks.length !== completeness.declaredTrackCount ||
    tracks.length !== completeness.renderedTrackCount ||
    sourceUrls.length !== completeness.stableSourceTrackUrlCount ||
    ordinals.some((ordinal, index) => ordinal !== index + 1) ||
    new Set(sourceUrls).size !== sourceUrls.length
  ) {
    throw new Error('Yandex source manifest completeness check failed.');
  }

  return {
    schemaVersion: 2,
    source: 'yandex-music',
    playlist: { ...playlist },
    completeness: {
      ...completeness,
      noVisibleStableSourceTrackUrlOrdinals: [
        ...completeness.noVisibleStableSourceTrackUrlOrdinals,
      ],
      privateOnlyOrdinals: [...completeness.privateOnlyOrdinals],
    },
    integrity: { ...integrity },
    tracks: tracks.map((track) => {
      const practiceStatus: LibraryCandidatePracticeStatus =
        track.sourceAvailability === 'unavailable'
          ? 'unavailable'
          : 'needs-local-chart';

      return {
        id: `yandex:${playlist.id}:${track.ordinal}`,
        ...track,
        practiceStatus,
      };
    }),
  };
}
