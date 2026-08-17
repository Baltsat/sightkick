import type { Meta, StoryObj } from '@storybook/react';
import type { Song } from '../../../types';
import type {
  ActionableLibraryShelf,
  LocalLibraryEntry,
} from './actionable-shelves';
import { ActionableSongShelves } from './ActionableSongShelves';

const songs: Song[] = [
  {
    id: 'raging',
    dir: '/library/raging',
    name: 'Raging',
    artist: 'Kygo feat. Kodaline',
    album: 'Cloud Nine',
    charter: 'Drumroll',
    genre: 'Rock',
    year: '2026',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 4,
    drumDifficulties: ['expert'],
    format: 'chart',
    audio: [{ src: 'song.ogg', name: 'song' }],
    liked: true,
    scoreData: {
      expert: { hitNotes: 88, totalNotes: 100, falseHits: 2 },
    },
  },
  {
    id: 'night-drive',
    dir: '/library/night-drive',
    name: 'Night Drive',
    artist: 'The Midnight',
    album: 'Endless Summer',
    charter: 'Drumroll',
    genre: 'Synthwave',
    year: '2026',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 3,
    drumDifficulties: ['expert'],
    format: 'chart',
    audio: [{ src: 'song.ogg', name: 'song' }],
    liked: true,
  },
  {
    id: 'paper-lanterns',
    dir: '/library/paper-lanterns',
    name: 'Paper Lanterns',
    artist: 'Local practice edit',
    album: 'Imports',
    charter: 'Drumroll',
    genre: 'Practice',
    year: '2026',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 2,
    drumDifficulties: ['expert'],
    format: 'chart',
    audio: [{ src: 'song.ogg', name: 'song' }],
    liked: false,
  },
];

function entry(song: Song, updatedAt: string): LocalLibraryEntry {
  return {
    key: `song:${song.id}`,
    kind: 'song',
    title: song.name,
    artists: [song.artist],
    updatedAt,
    ready: true,
    state: 'ready',
    stateLabel: 'Ready to play',
    sourceLabels: song.liked ? ['Favourites'] : ['Local'],
    song,
  };
}

const entries = songs.map((song, index) =>
  entry(song, `2026-08-${String(16 - index).padStart(2, '0')}T12:00:00.000Z`),
);
const shelves: ActionableLibraryShelf[] = [
  {
    id: 'ready-now',
    title: 'Ready now',
    detail: 'Playable choices inside your current practice range.',
    empty: '',
    entries: entries.slice(0, 2),
  },
  {
    id: 'favourites',
    title: 'Favourites',
    detail: 'Music you marked here or already saved on Yandex Music.',
    empty: '',
    entries: entries.slice(1, 2),
  },
  {
    id: 'recently-imported',
    title: 'Recently imported',
    detail: 'The newest playable charts in your library.',
    empty: '',
    entries: entries.slice(2),
  },
];
const meta: Meta<typeof ActionableSongShelves> = {
  title: 'Song List/Actionable shelves',
  component: ActionableSongShelves,
  parameters: { layout: 'fullscreen' },
  args: {
    shelves,
    sourceSeededSongIds: new Set(['raging']),
    allEntries: entries,
    restCount: 2,
    difficulty: 'expert',
    splittingIds: new Set(),
    onPlaySong: () => {},
    onLikeChange: () => {},
    onSplit: () => {},
    onBrowseAll: () => {},
  },
  render: (args) => (
    <div className="h-screen overflow-hidden bg-transparent">
      <ActionableSongShelves {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof ActionableSongShelves>;

export const Library: Story = {};
