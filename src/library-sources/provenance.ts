import type { LibrarySourceTrackProvenance } from '../types';

function normalizedRequiredString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Validates metadata crossing the renderer/main or browser/import boundary.
 * The result is a detached snapshot and carries no audio or download grant.
 */
export function normalizeLibrarySourceProvenance(
  value: unknown,
): LibrarySourceTrackProvenance | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Source provenance must be a metadata object');
  }

  const source = value as Record<string, unknown>;
  const collectionId = normalizedRequiredString(source.collectionId);
  const collectionName = normalizedRequiredString(source.collectionName);
  const trackId = normalizedRequiredString(source.trackId);
  const title = normalizedRequiredString(source.title);
  const sourceUrl = normalizedRequiredString(source.sourceUrl);
  const rawArtists = source.artists;
  const artists = Array.isArray(rawArtists)
    ? rawArtists.map(normalizedRequiredString)
    : [];

  if (
    source.provider !== 'yandex-music' ||
    !collectionId ||
    !collectionName ||
    !trackId ||
    !title ||
    !Array.isArray(rawArtists) ||
    artists.length !== rawArtists.length ||
    (source.sourceUrl !== undefined && !sourceUrl)
  ) {
    throw new Error('Source provenance has an invalid metadata shape');
  }

  return {
    provider: 'yandex-music',
    collectionId,
    collectionName,
    trackId,
    title,
    artists: artists as string[],
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}
