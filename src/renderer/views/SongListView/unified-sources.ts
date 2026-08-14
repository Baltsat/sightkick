import type {
  YandexLibraryCandidateSources,
  YandexPlaylistCandidateCollection,
} from '../../../types';
import { curriculumItemManifest } from '../../services/pedagogy';
import type { ItemSkillManifest } from '../../services/pedagogy/types';
import type { LessonEntry } from '../../hooks/useLessons';

function emptyYandexCollection(
  name: string,
): YandexPlaylistCandidateCollection {
  return {
    schemaVersion: 2,
    source: 'yandex-music',
    playlist: {
      id: name,
      name,
      url: '',
      capturedOn: '',
      capturedAt: '',
      captureMethod: 'authenticated-visible-dom',
      captureSurface: 'Yandex Music playlist track rows',
      metadataScope: 'metadata only',
      rightsScope: 'metadata-only',
    },
    completeness: {
      declaredTrackCount: 0,
      renderedTrackCount: 0,
      stableSourceTrackUrlCount: 0,
      noVisibleStableSourceTrackUrlOrdinals: [],
      privateOnlyOrdinals: [],
    },
    integrity: { canonicalization: 'none', canonicalSha256: '' },
    tracks: [],
  };
}

/**
 * The unified shelf must never block on the Drums/Favorites IPC round trip
 * — a player's own songs render immediately. This stands in for the real
 * sources until `load-library-candidates` resolves.
 */
export const EMPTY_YANDEX_SOURCES: YandexLibraryCandidateSources = {
  drums: emptyYandexCollection('Drums'),
  favorites: emptyYandexCollection('Favorites'),
};

/**
 * Lesson songs carry a curriculum id (e.g. "04.02"), not a chart — so the
 * unified library's My Wave scoring needs their skill manifest looked up
 * and re-keyed by the song id it actually merges on.
 */
export function buildLessonManifests(
  entries: readonly LessonEntry[],
): ReadonlyMap<string, ItemSkillManifest> {
  const manifests = new Map<string, ItemSkillManifest>();

  for (const entry of entries) {
    const manifest = curriculumItemManifest(entry.lesson.id);

    if (manifest) {
      manifests.set(entry.song.id, manifest);
    }
  }

  return manifests;
}
