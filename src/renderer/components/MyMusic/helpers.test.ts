import { describe, expect, it } from 'vitest';
import { isInLibrary, selectBulkAddable } from './helpers';
import { MyMusicSong } from './types';

function song(overrides: Partial<MyMusicSong> = {}): MyMusicSong {
  return {
    videoId: 'abcdefghijk',
    title: 'Some Song',
    artist: 'Some Artist',
    watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    ...overrides,
  };
}

describe('isInLibrary', () => {
  it('matches on exact (artist, title)', () => {
    expect(
      isInLibrary(song(), [{ artist: 'Some Artist', name: 'Some Song' }]),
    ).toBe(true);
  });

  it('matches case-insensitively and ignoring surrounding whitespace', () => {
    expect(
      isInLibrary(song({ title: '  some song  ', artist: '  SOME ARTIST  ' }), [
        { artist: 'Some Artist', name: 'Some Song' },
      ]),
    ).toBe(true);
  });

  it('does not match on title alone', () => {
    expect(
      isInLibrary(song({ artist: 'Different Artist' }), [
        { artist: 'Some Artist', name: 'Some Song' },
      ]),
    ).toBe(false);
  });

  it('does not match on artist alone', () => {
    expect(
      isInLibrary(song({ title: 'Different Song' }), [
        { artist: 'Some Artist', name: 'Some Song' },
      ]),
    ).toBe(false);
  });

  it('never matches when the liked song has no resolvable artist', () => {
    expect(
      isInLibrary(song({ artist: undefined }), [
        { artist: '', name: 'Some Song' },
      ]),
    ).toBe(false);
  });

  it('returns false against an empty library', () => {
    expect(isInLibrary(song(), [])).toBe(false);
  });

  it('matches titles/artists spelled with decomposed vs precomposed accents', () => {
    // "é" as one precomposed codepoint (U+00E9) vs "e" + a combining acute
    // accent (U+0065 U+0301) — visually identical, different byte sequence.
    expect(
      isInLibrary(song({ title: 'Café', artist: 'Café Tacvba' }), [
        { artist: 'Café Tacvba', name: 'Café' },
      ]),
    ).toBe(true);
  });

  it('matches a title carrying a "(feat. X)" tag against the bare title', () => {
    expect(
      isInLibrary(song({ title: 'Song (feat. Travis Scott)' }), [
        { artist: 'Some Artist', name: 'Song' },
      ]),
    ).toBe(true);
  });

  it('matches a title carrying an "ft." tag (no parens) against the bare title', () => {
    expect(
      isInLibrary(song({ title: 'Song ft. Travis Scott' }), [
        { artist: 'Some Artist', name: 'Song' },
      ]),
    ).toBe(true);
  });

  it('matches when the liked song credits multiple artists and the library credits one of them', () => {
    expect(
      isInLibrary(song({ artist: 'Drake, Travis Scott' }), [
        { artist: 'Drake', name: 'Some Song' },
      ]),
    ).toBe(true);
  });

  it('matches when the library credits multiple artists and the liked song credits one of them', () => {
    expect(
      isInLibrary(song({ artist: 'Travis Scott' }), [
        { artist: 'Drake & Travis Scott', name: 'Some Song' },
      ]),
    ).toBe(true);
  });

  it('does not match artist credits with no shared name at all', () => {
    expect(
      isInLibrary(song({ artist: 'Drake, Travis Scott' }), [
        { artist: 'Metro Boomin, 21 Savage', name: 'Some Song' },
      ]),
    ).toBe(false);
  });
});

describe('selectBulkAddable', () => {
  it('selects the first N songs in order when none are in the library', () => {
    const songs = Array.from({ length: 15 }, (_, index) =>
      song({
        videoId: `song${index}`.padEnd(11, '0'),
        title: `Song ${index}`,
      }),
    );
    const selected = selectBulkAddable(songs, [], 10);

    expect(selected).toHaveLength(10);
    expect(selected.map((s) => s.title)).toEqual(
      songs.slice(0, 10).map((s) => s.title),
    );
  });

  it('skips songs already in the library and keeps original order otherwise', () => {
    const songA = song({ videoId: 'aaaaaaaaaaa', title: 'A', artist: 'X' });
    const songB = song({ videoId: 'bbbbbbbbbbb', title: 'B', artist: 'X' });
    const songC = song({ videoId: 'ccccccccccc', title: 'C', artist: 'X' });
    const librarySongs = [{ artist: 'X', name: 'B' }];
    const selected = selectBulkAddable([songA, songB, songC], librarySongs, 10);

    expect(selected.map((s) => s.title)).toEqual(['A', 'C']);
  });

  it('stops once it has collected `count` addable songs, ignoring later ones', () => {
    const songs = Array.from({ length: 5 }, (_, index) =>
      song({
        videoId: `song${index}`.padEnd(11, '0'),
        title: `Song ${index}`,
      }),
    );
    const selected = selectBulkAddable(songs, [], 3);

    expect(selected.map((s) => s.title)).toEqual([
      'Song 0',
      'Song 1',
      'Song 2',
    ]);
  });

  it('returns an empty array when every song is already in the library', () => {
    const songs = [song({ title: 'A', artist: 'X' })];
    const librarySongs = [{ artist: 'X', name: 'A' }];

    expect(selectBulkAddable(songs, librarySongs, 10)).toEqual([]);
  });
});
