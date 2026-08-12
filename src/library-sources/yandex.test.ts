import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseYandexPlaylistCandidates } from './yandex';

function loadCapturedPlaylist(file: string): unknown {
  return JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'resources/library-sources', file),
      'utf-8',
    ),
  );
}

describe('Yandex playlist candidates', () => {
  it('keeps all Drums and Favorites rows as metadata-only source candidates', () => {
    const drums = parseYandexPlaylistCandidates(
      loadCapturedPlaylist('yandex-drums-2026-08-09.json'),
    );
    const favorites = parseYandexPlaylistCandidates(
      loadCapturedPlaylist('yandex-favorites-2026-08-10.json'),
    );

    expect(drums.tracks).toHaveLength(13);
    expect(favorites.tracks).toHaveLength(230);
    expect(drums.tracks.map((track) => track.ordinal)).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
    expect(favorites.tracks.map((track) => track.ordinal)).toEqual(
      Array.from({ length: 230 }, (_, index) => index + 1),
    );
    expect(drums.tracks[5]).toMatchObject({
      title: 'Heat Waves',
      sourceAvailability: 'unavailable',
      sourceTrackUrl: null,
      practiceStatus: 'unavailable',
    });
    expect(favorites.tracks[87]).toMatchObject({
      sourceAvailability: 'private',
      sourceReferenceStatus: 'private-only',
      sourceTrackUrl: null,
      localStatus: 'reference',
      practiceStatus: 'needs-local-chart',
    });
    expect(
      favorites.tracks.filter((track) => track.sourceTrackUrl !== null),
    ).toHaveLength(211);
    expect(
      [...drums.tracks, ...favorites.tracks].every(
        (track) => !('audio' in track) && !('downloadUrl' in track),
      ),
    ).toBe(true);
  });

  it('rejects a source row that is accidentally made actionable', () => {
    const payload = structuredClone(
      loadCapturedPlaylist('yandex-drums-2026-08-09.json'),
    ) as { tracks: { sourceTrackUrl: string | null }[] };

    payload.tracks[5].sourceTrackUrl =
      'https://music.yandex.ru/album/1/track/2';

    expect(() => parseYandexPlaylistCandidates(payload)).toThrow(
      'unsafe source reference state',
    );
  });
});
