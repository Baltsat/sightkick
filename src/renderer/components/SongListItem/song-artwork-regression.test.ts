import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const list_component_sources = [
  'src/renderer/components/SongListItem/SongListItem.tsx',
  'src/renderer/components/LibraryCandidateList/LibraryCandidateList.tsx',
  'src/renderer/views/SongListView/SongListView.tsx',
];

describe('song artwork fallbacks', () => {
  it('never imports the app icon into a song-list component', () => {
    for (const source of list_component_sources) {
      expect(readFileSync(resolve(source), 'utf8')).not.toContain(
        'assets/icon.png',
      );
    }
  });
});
