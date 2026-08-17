import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const songViewSource = readFileSync(
  'src/renderer/views/SongView/SongView.tsx',
  'utf8',
);

describe('SongView recursive tutor policy', () => {
  it('enables recursive recovery for every Practice run, including a song', () => {
    // Songs must reach the recursive trainer, not only lessons - the original
    // defect was a `Boolean(songData?.lesson)` gate. The Tutor toggle may also
    // gate it, since Tutor off means he is just playing.
    expect(songViewSource).toMatch(
      /recursiveChunkGrowthEnabled:\s*\n?\s*gameMode === 'practice'/,
    );
    expect(songViewSource).not.toMatch(
      /recursiveChunkGrowthEnabled:\s*Boolean\(songData\?\.lesson\)/,
    );
  });
});
