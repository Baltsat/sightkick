import { describe, expect, it } from 'vitest';
import { mapSongs } from './useOnlineSearch';

describe('Chorus Encore search mapping', () => {
  it('marks only response rows explicitly marked drumsReviewed as reviewed', () => {
    const songs = mapSongs([
      {
        md5: 'reviewed',
        name: 'Reviewed Drums',
        artist: 'Charter',
        charter: 'Charter',
        diff_drums: 4,
        drumsReviewed: true,
      },
      {
        md5: 'unreviewed',
        name: 'Unreviewed Drums',
        artist: 'Charter',
        charter: 'Charter',
        diff_drums: 4,
        drumsReviewed: false,
      },
    ]);

    expect(songs).toEqual([
      expect.objectContaining({ id: 'reviewed', reviewed: true }),
      expect.objectContaining({ id: 'unreviewed', reviewed: false }),
    ]);
  });
});
