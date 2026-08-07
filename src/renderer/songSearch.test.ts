import { describe, expect, it } from 'vitest';
import { OnlineSong } from './types';
import { makeListSong } from './views/test-support';
import {
  normalizeSearchText,
  rankOnlineSongs,
  searchLocalSongs,
} from './songSearch';

describe('normalizeSearchText', () => {
  it('folds case, diacritics and whitespace', () => {
    expect(normalizeSearchText('  BEYONCÉ   Knowles  ')).toBe(
      'beyonce knowles',
    );
  });
});

describe('searchLocalSongs', () => {
  const songs = [
    makeListSong('raging', {
      name: 'Raging',
      artist: 'Kygo feat. Kodaline',
      album: 'Cloud Nine',
      charter: '',
      autoChartTool: 'STRUM (OCTAVE AI auto-charter)',
    }),
    makeListSong('lose', {
      name: 'Lose Somebody',
      artist: 'Kygo & OneRepublic',
      album: 'Golden Hour',
      charter: 'Human Charter',
    }),
  ];

  it.each([
    ['Kodaline', 'raging'],
    ['Cloud Nine', 'raging'],
    ['STRUM', 'raging'],
    ['onerepublic', 'lose'],
  ])('matches %s across local metadata', (query, expectedId) => {
    expect(searchLocalSongs(songs, query).map((song) => song.id)).toEqual([
      expectedId,
    ]);
  });
});

describe('rankOnlineSongs', () => {
  const fuzzy: OnlineSong = {
    source: 'online',
    id: 'fuzzy',
    downloadUrl: 'https://files.enchor.us/fuzzy.sng',
    name: 'Kyoukai',
    artist: 'Ho-kago Tea Time',
    charter: 'Someone',
    drumDifficulty: 2,
  };
  const exact: OnlineSong = {
    source: 'online',
    id: 'exact',
    downloadUrl: 'https://files.enchor.us/exact.sng',
    name: 'Stop and Stare',
    artist: 'OneRépublic',
    charter: 'Harmonix',
    drumDifficulty: 3,
  };

  it('puts normalized exact field matches first', () => {
    const result = rankOnlineSongs([fuzzy, exact], 'ONEREPUBLIC');

    expect(result.songs.map((song) => song.id)).toEqual(['exact', 'fuzzy']);
    expect(result.hasExactMatch).toBe(true);
  });

  it('reports when the backend returned only fuzzy matches', () => {
    const result = rankOnlineSongs([fuzzy], 'Kygo');

    expect(result.hasExactMatch).toBe(false);
  });
});
