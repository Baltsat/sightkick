import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  LibrarySourceTrackProvenance,
  PublicDrumChartCandidate,
} from '../../types';
import {
  resolvePublicLibraryCandidates,
  searchChorusEncore,
} from './resolveLibraryCandidates';

const source: LibrarySourceTrackProvenance = {
  provider: 'yandex-music',
  collectionId: 'drums',
  collectionName: 'Drums',
  trackId: 'yandex:drums:7',
  title: 'What I Like About You',
  artists: ['Jonas Blue', 'Theresa Rex'],
  durationSeconds: 220,
};

function chart(
  patch: Partial<PublicDrumChartCandidate> = {},
): PublicDrumChartCandidate {
  return {
    source: 'chorus-encore',
    id: 'exact',
    title: source.title,
    artists: source.artists,
    durationSeconds: 220,
    hasDrums: true,
    reviewed: true,
    sourceUrl: 'https://enchor.us/',
    ...patch,
  };
}

describe('public library resolver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a same-title public result out of the accepted match', async () => {
    const [result] = await resolvePublicLibraryCandidates(
      [source],
      [async () => [chart({ artists: ['The Romantics'], id: 'romantics' })]],
    );

    expect(result).toMatchObject({
      status: 'no-exact-reviewed-chart',
      rejected: [expect.objectContaining({ reason: 'artist' })],
    });
  });

  it('accepts a reviewed exact drum chart from the catalog', async () => {
    const [result] = await resolvePublicLibraryCandidates(
      [source],
      [async () => [chart()]],
    );

    expect(result).toMatchObject({
      status: 'exact-reviewed-chart',
      match: { id: 'exact', source: 'chorus-encore' },
    });
  });

  it('returns an honest blocker when a catalog cannot be reached', async () => {
    const [result] = await resolvePublicLibraryCandidates(
      [source],
      [
        async () => {
          throw new Error('Chorus Encore search failed: 503');
        },
      ],
    );

    expect(result.blockers).toContain(
      'Catalog checks incomplete: Chorus Encore search failed: 503',
    );
  });

  it('does not treat a returned unreviewed Chorus chart as reviewed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              md5: 'unreviewed',
              name: source.title,
              artist: source.artists.join(', '),
              song_length: 220_000,
              diff_drums: 4,
              drumsReviewed: false,
            },
          ],
        }),
      })),
    );

    const candidates = await searchChorusEncore(source);
    const [result] = await resolvePublicLibraryCandidates(
      [source],
      [async () => candidates],
    );

    expect(candidates[0]?.reviewed).toBe(false);
    expect(result.status).toBe('no-exact-reviewed-chart');
  });
});
