import { describe, expect, it } from 'vitest';
import { normalizeLibrarySourceProvenance } from './provenance';

describe('library source provenance', () => {
  it('rejects partial or malformed source identities', () => {
    expect(() =>
      normalizeLibrarySourceProvenance({
        provider: 'yandex-music',
        collectionId: 'drums',
        collectionName: 'Drums',
        trackId: 'yandex:drums:1',
        title: 'Track',
        artists: 'not-an-array',
      }),
    ).toThrow('invalid metadata shape');
    expect(() =>
      normalizeLibrarySourceProvenance({
        provider: 'unknown',
        collectionId: 'drums',
        collectionName: 'Drums',
        trackId: 'track-1',
        title: 'Track',
        artists: ['Artist'],
      }),
    ).toThrow('invalid metadata shape');
  });

  it('rejects every blank or non-string artist instead of casting it through', () => {
    expect(() =>
      normalizeLibrarySourceProvenance({
        provider: 'yandex-music',
        collectionId: 'drums',
        collectionName: 'Drums',
        trackId: 'track-1',
        title: 'Track',
        artists: ['A real artist', '   ', 42],
      }),
    ).toThrow('invalid metadata shape');
  });
});
