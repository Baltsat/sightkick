import { describe, expect, it } from 'vitest';
import { CURRICULUM_ITEM_MANIFESTS } from '../../services/pedagogy';
import type { LessonEntry } from '../../hooks/useLessons';
import { makeLessonSong } from '../test-support';
import { EMPTY_YANDEX_SOURCES, buildLessonManifests } from './unified-sources';

function lessonEntry(songId: string, lessonId: string): LessonEntry {
  const song = makeLessonSong(songId, { id: lessonId });

  return {
    song,
    lesson: song.lesson!,
    bestStars: 0,
    cleared: false,
    unlocked: true,
    clearsNeeded: 0,
  };
}

describe('EMPTY_YANDEX_SOURCES', () => {
  it('has an empty Drums and Favorites collection so the shelf never blocks on the candidate IPC', () => {
    expect(EMPTY_YANDEX_SOURCES.drums.tracks).toEqual([]);
    expect(EMPTY_YANDEX_SOURCES.drums.playlist.name).toBe('Drums');
    expect(EMPTY_YANDEX_SOURCES.favorites.tracks).toEqual([]);
    expect(EMPTY_YANDEX_SOURCES.favorites.playlist.name).toBe('Favorites');
  });
});

describe('buildLessonManifests', () => {
  it('re-keys a found curriculum manifest by the song id it merges on', () => {
    const known = CURRICULUM_ITEM_MANIFESTS[0];
    const entry = lessonEntry('song-1', known.item_id);
    const manifests = buildLessonManifests([entry]);

    expect(manifests.get('song-1')).toBe(known);
  });

  it('omits an entry whose lesson id has no curriculum manifest', () => {
    const entry = lessonEntry('song-2', 'not-a-real-curriculum-id');
    const manifests = buildLessonManifests([entry]);

    expect(manifests.has('song-2')).toBe(false);
    expect(manifests.size).toBe(0);
  });
});
