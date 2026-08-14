import { describe, expect, it } from 'vitest';
import type { IpcYoutubeSearchResult } from '../../types';
import { mapSongs } from './useOnlineSearch';

describe('YouTube search mapping', () => {
  it('keeps a YouTube recording identity intact for the automatic chart job', () => {
    const songs = mapSongs([
      {
        videoId: 'abcdefghijk',
        title: 'Studio recording',
        uploader: 'Artist',
        durationSeconds: 210,
        thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
        watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      },
    ] satisfies IpcYoutubeSearchResult[]);

    expect(songs).toEqual([
      {
        source: 'online',
        id: 'abcdefghijk',
        downloadUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        albumCover: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
        name: 'Studio recording',
        artist: 'Artist',
        charter: 'YouTube',
        drumDifficulty: 0,
        durationSeconds: 210,
      },
    ]);
  });
});
