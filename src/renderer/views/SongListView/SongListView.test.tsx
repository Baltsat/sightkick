import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeEnchorChart,
  makeLessonSong,
  makeListSong,
  setupSongListView,
} from '../test-support';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 76,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 76,
        size: 76,
      })),
    measureElement: () => {},
    scrollToIndex: () => {},
    options: { scrollMargin: 0 },
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SongListView — loading the library', () => {
  it('requests the song list and stem-tool status on mount', () => {
    const view = setupSongListView();

    expect(view.sentChannels()).toContain('load-song-list');
    expect(view.sentChannels()).toContain('check-stem-tools');
  });

  it('shows the songs the backend returns', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a'), makeListSong('b')]);

    expect(screen.getByText('Name a')).toBeInTheDocument();
    expect(screen.getByText('Name b')).toBeInTheDocument();
    expect(screen.getByText('2 results')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your drum library' }),
    ).toBeInTheDocument();
  });

  it('keeps filters and add-music controls on a wrapping toolbar with width floors', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);

    expect(screen.getByTestId('library-toolbar')).toHaveClass('flex-col');
    expect(screen.getByTestId('library-song-controls')).toHaveClass(
      'flex-wrap',
    );
    expect(screen.getByTestId('library-filters')).toHaveClass('flex-wrap');
    expect(screen.getByTestId('library-name-filter')).toHaveClass('min-w-64');
    expect(screen.getByTestId('add-music-actions')).toHaveClass('flex-wrap');
  });

  it('surfaces existing progress as a continue-practicing moment', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('played', {
        name: 'Raging',
        artist: 'Kygo',
        scoreData: {
          expert: { hitNotes: 92, totalNotes: 100, falseHits: 0 },
        },
      }),
      makeListSong('unplayed'),
    ]);

    const hero = screen.getByTestId('continue-practicing');

    expect(within(hero).getByText('Continue practicing')).toBeInTheDocument();
    expect(within(hero).getByText('Raging')).toBeInTheDocument();
    expect(within(hero).getByText('92% best')).toBeInTheDocument();
    expect(
      within(hero).getByRole('button', { name: 'Play Raging' }),
    ).toBeEnabled();
  });

  it('guides to select a folder when none is chosen', () => {
    const view = setupSongListView();

    view.loadSongs([], null);

    expect(screen.getByText('Select folder')).toBeInTheDocument();
  });

  it('guides to download songs when the folder is empty', () => {
    const view = setupSongListView();

    view.loadSongs([], '/music');

    expect(screen.getByText('Build your practice library')).toBeInTheDocument();
    expect(screen.getByText('Browse online songs')).toBeInTheDocument();
    expect(screen.queryByText('Select folder')).not.toBeInTheDocument();
  });

  it('reports when nothing matches the active filter', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Master of Puppets' }),
      makeListSong('b', { name: 'Enter Sandman' }),
    ]);
    view.search('nonexistent song');

    expect(
      screen.getByText('No matches for “nonexistent song”'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeEnabled();
    expect(screen.queryByText('Select folder')).not.toBeInTheDocument();
  });

  it('repopulates the list when the backend rescans', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    expect(screen.getByText('Name a')).toBeInTheDocument();

    view.rescanDone([makeListSong('c')], '/other');

    expect(screen.queryByText('Name a')).not.toBeInTheDocument();
    expect(screen.getByText('Name c')).toBeInTheDocument();
  });

  it('validates, previews and imports a prepared local chart folder', async () => {
    const view = setupSongListView();

    view.loadSongs([], '/music');
    fireEvent.click(screen.getByTestId('import-song-trigger'));

    expect(view.sentChannels()).toContain('select-import-song');

    view.emit('select-import-song', {
      preview: {
        sourceDir: '/incoming/Raging',
        name: 'Raging',
        artist: 'Kygo feat. Kodaline',
        album: 'Cloud Nine',
        charter: '',
        autoChartTool: 'STRUM (OCTAVE AI auto-charter)',
        chartFormat: 'mid',
        audioCount: 7,
        drumDifficulties: ['easy', 'medium', 'hard', 'expert'],
        albumCoverDataUrl: 'data:image/jpeg;base64,cHJldmlldw==',
        coverSource: 'embedded',
      },
    });

    expect(screen.getByText('Review song import')).toBeInTheDocument();
    expect(screen.getByText('Raging')).toBeInTheDocument();
    expect(screen.getByText('Auto-charted with STRUM')).toBeInTheDocument();
    expect(screen.getByText(/Embedded artwork found/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('import-artwork-url'), {
      target: { value: 'https://example.com/permitted-cover.jpg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));

    expect(view.ipc.sent).toContainEqual({
      channel: 'import-song',
      args: [
        {
          sourceDir: '/incoming/Raging',
          artworkUrl: 'https://example.com/permitted-cover.jpg',
        },
      ],
    });

    view.emit('import-song', {
      success: true,
      song: makeListSong('raging', {
        name: 'Raging',
        charter: '',
        autoChartTool: 'STRUM (OCTAVE AI auto-charter)',
      }),
    });

    expect(screen.getByTestId('song-item-raging')).toBeInTheDocument();
  });

  it('disables local import until a library folder is selected', () => {
    const view = setupSongListView();

    view.loadSongs([], null);

    expect(screen.getByTestId('import-song-trigger')).toBeDisabled();
  });
});

describe('SongListView — filtering and sorting', () => {
  it('fuzzy-filters the list by name', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Master of Puppets' }),
      makeListSong('b', { name: 'Enter Sandman' }),
    ]);
    view.search('puppets');

    expect(screen.getByText('Master of Puppets')).toBeInTheDocument();
    expect(screen.queryByText('Enter Sandman')).not.toBeInTheDocument();
  });

  it('fuzzy-filters the list by artist', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'One', artist: 'Metallica' }),
      makeListSong('b', { name: 'Two', artist: 'Slayer' }),
    ]);
    view.search('metallica');

    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.queryByText('Two')).not.toBeInTheDocument();
  });

  it('searches local album, charter provenance and folded diacritics', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('raging', {
        name: 'Raging',
        artist: 'Kygo feat. Kodaliné',
        album: 'Cloud Nine',
        charter: '',
        autoChartTool: 'STRUM (OCTAVE AI auto-charter)',
      }),
      makeListSong('other', { name: 'Other' }),
    ]);

    for (const query of ['kodaline', 'cloud nine', 'strum']) {
      view.search(query);

      expect(screen.getByText('Raging')).toBeInTheDocument();
      expect(screen.queryByText('Other')).not.toBeInTheDocument();
    }
  });

  it('reorders the list when a sort option is chosen', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Charlie' }),
      makeListSong('b', { name: 'Alpha' }),
    ]);
    view.chooseSort('name');

    const rendered = screen
      .getAllByText(/Charlie|Alpha/)
      .map((el) => el.textContent);

    expect(rendered).toEqual(['Alpha', 'Charlie']);
  });
});

describe('SongListView — difficulty', () => {
  it('re-filters to songs charted at the chosen difficulty', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Expert Only', drumDifficulties: ['expert'] }),
      makeListSong('b', { name: 'Hard Only', drumDifficulties: ['hard'] }),
    ]);

    expect(screen.getByText('Expert Only')).toBeInTheDocument();
    expect(screen.queryByText('Hard Only')).not.toBeInTheDocument();

    view.selectDifficulty('hard');

    expect(screen.queryByText('Expert Only')).not.toBeInTheDocument();
    expect(screen.getByText('Hard Only')).toBeInTheDocument();
  });

  it('shows the high score for the selected difficulty', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', {
        scoreData: {
          expert: { hitNotes: 100, totalNotes: 100, falseHits: 0 },
          hard: { hitNotes: 45, totalNotes: 100, falseHits: 0 },
        },
      }),
    ]);

    expect(view.filledStars('a')).toBe(5);

    view.selectDifficulty('hard');

    expect(view.filledStars('a')).toBe(2);
  });

  it('explains unplayed and scored star states accessibly', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('unplayed'),
      makeListSong('played', {
        scoreData: {
          expert: { hitNotes: 92, totalNotes: 100, falseHits: 0 },
        },
      }),
    ]);

    expect(
      view.row('unplayed').getByLabelText(/play once to earn stars/i),
    ).toBeInTheDocument();
    expect(
      view.row('played').getByLabelText(/best score: 92% accuracy/i),
    ).toBeInTheDocument();
  });

  it('labels the auto-chart tool separately from a human charter, calmly', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('raging', {
        charter: '',
        autoChartTool: 'STRUM (OCTAVE AI auto-charter)',
      }),
    ]);

    // Provenance is available (accessibly labeled) but never a loud tag —
    // no "Auto-charted with STRUM" text sits in the row itself, and no
    // antd Tag renders for it.
    expect(
      screen.getByLabelText('Auto-charted with STRUM'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Auto-charted with STRUM'),
    ).not.toBeInTheDocument();
    expect(document.querySelector('.ant-tag')).not.toBeInTheDocument();
    expect(screen.queryByText('charter')).not.toBeInTheDocument();
  });
});

describe('SongListView — liking', () => {
  it('toggles a like and tells the backend', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a', { liked: false })]);
    view.like('a');

    expect(view.ipc.sent).toContainEqual({
      channel: 'like-song',
      args: ['a', true],
    });
  });
});

describe('SongListView — opening a song', () => {
  it('opens the perform mode selector and navigates', async () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.clickSong('a');
    view.chooseGameMode('perform');

    expect(await screen.findByTestId('song-view-stub')).toBeInTheDocument();
  });

  it('navigates into practice mode when chosen', async () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.clickSong('a');
    view.chooseGameMode('practice');

    expect(await screen.findByTestId('song-view-stub')).toBeInTheDocument();
  });

  it('shows Practice as the primary, default-focused game mode', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.clickSong('a');

    const modal = within(screen.getByTestId('game-mode-selector-modal'));

    expect(modal.getByTestId('game-mode-practice')).toHaveClass(
      'ant-btn-primary',
    );
    expect(modal.getByTestId('game-mode-perform')).not.toHaveClass(
      'ant-btn-primary',
    );
  });

  it('prefills the difficulty select from the current global difficulty tab', () => {
    const view = setupSongListView({ settings: { difficulty: 'hard' } });

    view.loadSongs([makeListSong('a')]);
    view.clickSong('a');

    const modal = within(screen.getByTestId('game-mode-selector-modal'));

    expect(modal.getByTestId('game-mode-difficulty-select')).toHaveTextContent(
      'hard',
    );
  });

  it('only offers difficulties the chart actually has', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { drumDifficulties: ['medium', 'expert'] }),
    ]);
    view.clickSong('a');

    const modal = within(screen.getByTestId('game-mode-selector-modal'));

    fireEvent.mouseDown(modal.getByRole('combobox', { name: 'Difficulty' }));

    expect(screen.getByRole('option', { name: 'medium' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'expert' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'easy' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'hard' }),
    ).not.toBeInTheDocument();
  });

  it('changing the difficulty in the modal opens the song at the chosen difficulty', async () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.clickSong('a');

    const modal = within(screen.getByTestId('game-mode-selector-modal'));

    fireEvent.mouseDown(modal.getByRole('combobox', { name: 'Difficulty' }));
    fireEvent.click(screen.getByRole('option', { name: 'hard' }));
    view.chooseGameMode('practice');

    expect(await screen.findByTestId('song-view-stub')).toBeInTheDocument();
    // The modal's difficulty picker writes the same app-global state the
    // library header tabs read — SongView loads whatever that holds, so
    // this is the observable proof the song opens at the chosen difficulty.
    expect(screen.getByTestId('difficulty-hard')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('SongListView — stem splitting', () => {
  it('queues a split, shows progress, then reports success', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.setStemTools('ready');

    view.openSongMenu('a');
    fireEvent.click(screen.getByText('Split stems'));

    expect(view.ipc.sent).toContainEqual({
      channel: 'split-song',
      args: ['a'],
    });
    expect(screen.getByText('Processing queue')).toBeInTheDocument();

    view.emit('split-song', { id: 'a', progress: 50 });
    view.emit('split-song', {
      id: 'a',
      success: true,
      song: makeListSong('a', { audio: [] }),
    });

    expect(screen.getByText(/split successfully/)).toBeInTheDocument();
    expect(screen.queryByText('Processing queue')).not.toBeInTheDocument();
  });

  it('reports a failed split', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.setStemTools('ready');

    view.openSongMenu('a');
    fireEvent.click(screen.getByText('Split stems'));

    view.emit('split-song', { id: 'a', success: false, error: 'boom' });

    expect(screen.getByText('Split failed')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('cancels a queued split', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.setStemTools('ready');

    view.openSongMenu('a');
    fireEvent.click(screen.getByText('Split stems'));

    const queueRoot = screen.getByText('Processing queue').parentElement!;

    fireEvent.click(within(queueRoot).getByRole('button'));

    expect(view.sentChannels()).toContain('cancel-split');

    view.emit('split-song', { id: 'a', cancelled: true });

    expect(screen.getByText('Split cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Processing queue')).not.toBeInTheDocument();
  });
});

describe('SongListView — online mode', () => {
  it('shows online results when switched', async () => {
    const view = setupSongListView({
      online: [makeEnchorChart('x'), makeEnchorChart('y')],
    });

    view.loadSongs([]);
    view.selectMode('online');

    expect(await screen.findByText('Name x')).toBeInTheDocument();
    expect(screen.getByText('Name y')).toBeInTheDocument();
  });

  it('ranks exact normalized metadata matches before fuzzy results', async () => {
    const view = setupSongListView({
      online: [
        makeEnchorChart('fuzzy', {
          name: 'Kyoukai',
          artist: 'Ho-kago Tea Time',
        }),
        makeEnchorChart('exact', {
          name: 'Stop and Stare',
          artist: 'OneRépublic',
        }),
      ],
    });

    view.loadSongs([]);
    view.selectMode('online');
    view.search('ONEREPUBLIC');

    await screen.findByText('Stop and Stare');

    const names = screen
      .getAllByText(/Stop and Stare|Kyoukai/)
      .map((element) => element.textContent);

    expect(names).toEqual(['Stop and Stare', 'Kyoukai']);
    expect(screen.queryByText(/No exact matches/)).not.toBeInTheDocument();
  });

  it('says when online results are fuzzy-only', async () => {
    const view = setupSongListView({
      online: [
        makeEnchorChart('fuzzy', {
          name: 'Kyoukai',
          artist: 'Ho-kago Tea Time',
        }),
      ],
    });

    view.loadSongs([]);
    view.selectMode('online');
    view.search('Kygo');

    expect(await screen.findByText('Kyoukai')).toBeInTheDocument();
    expect(screen.getByText(/No exact matches for “Kygo”/)).toBeInTheDocument();
  });

  it('downloads an online song and marks it downloaded', async () => {
    const view = setupSongListView({ online: [makeEnchorChart('x')] });

    view.loadSongs([], '/music');
    view.selectMode('online');

    await screen.findByText('Name x');
    fireEvent.click(
      within(screen.getByTestId('song-item-x')).getByTestId('download-button'),
    );

    expect(view.sentChannels()).toContain('download-song');

    view.emit('download-song', {
      success: true,
      md5: 'x',
      song: makeListSong('x'),
    });

    expect(
      within(screen.getByTestId('song-item-x')).getByTestId(
        'downloaded-indicator',
      ),
    ).toBeInTheDocument();
  });

  it('reports a failed download', async () => {
    const view = setupSongListView({ online: [makeEnchorChart('x')] });

    view.loadSongs([], '/music');
    view.selectMode('online');

    await screen.findByText('Name x');
    fireEvent.click(
      within(screen.getByTestId('song-item-x')).getByTestId('download-button'),
    );

    view.emit('download-song', { success: false, md5: 'x', error: 'no space' });

    expect(screen.getByText('Download failed')).toBeInTheDocument();
    expect(screen.getByText('no space')).toBeInTheDocument();
  });

  it('disables downloads until a folder is selected', async () => {
    const view = setupSongListView({ online: [makeEnchorChart('x')] });

    view.loadSongs([], null);
    view.selectMode('online');

    await screen.findByText('Name x');

    expect(
      within(screen.getByTestId('song-item-x')).getByTestId('download-button'),
    ).toBeDisabled();
  });
});

describe('SongListView — settings', () => {
  it('rescans the folder from settings', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')], '/music');
    view.openSettings();
    fireEvent.click(screen.getByTestId('rescan-folder'));

    expect(view.ipc.sent).toContainEqual({
      channel: 'rescan-songs',
      args: [false],
    });
  });

  it('shows live scan progress, then hides it', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')], '/music');
    view.openSettings();

    view.rescanProgress(3, 6);

    const progress = screen.getByTestId('scan-progress');

    expect(within(progress).getByText('50%')).toBeInTheDocument();

    view.rescanDone([makeListSong('a')], '/music');

    expect(screen.queryByTestId('scan-progress')).not.toBeInTheDocument();
  });

  it('offers the stem-splitter download when tools are missing but available', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.setStemTools('download');
    view.emit('check-stem-tools-update', {
      available: true,
      updateAvailable: false,
      downloadSize: 280_000_000,
      uncompressedSize: 700_000_000,
    });

    view.openSettings();
    fireEvent.click(screen.getByText(/Get stem splitter/));

    expect(view.sentChannels()).toContain('download-stem-tools');
  });

  it('shows stem-tool download progress and cancels it', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.setStemTools('download');
    view.emit('check-stem-tools-update', {
      available: true,
      updateAvailable: false,
      downloadSize: 280_000_000,
      uncompressedSize: 700_000_000,
    });

    view.openSettings();
    fireEvent.click(screen.getByText(/Get stem splitter/));
    view.emit('download-stem-tools', { progress: 40 });

    expect(screen.getByTestId('stem-tools-progress')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cancel-stem-tools'));

    expect(view.sentChannels()).toContain('cancel-stem-tools');
  });
});

describe('SongListView — keyboard navigation', () => {
  it('moves focus forward and backward through the list', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a'), makeListSong('b'), makeListSong('c')]);

    view.press('down');
    expect(view.isFocused('a')).toBe(true);

    view.press('down');
    expect(view.isFocused('b')).toBe(true);
    expect(view.isFocused('a')).toBe(false);

    view.press('up');
    expect(view.isFocused('a')).toBe(true);
  });

  it('opens the focused song with confirm', async () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);

    view.press('down');
    view.press('confirm');
    view.chooseGameMode('perform');

    expect(await screen.findByTestId('song-view-stub')).toBeInTheDocument();
  });

  it('does nothing when confirming with no focused song', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    view.press('confirm');

    expect(screen.queryByTestId('song-view-stub')).not.toBeInTheDocument();
    expect(screen.queryByText('perform')).not.toBeInTheDocument();
  });

  it('tolerates focus moves on an empty list', () => {
    const view = setupSongListView();

    view.loadSongs([]);

    expect(() => {
      view.press('up');
      view.press('down');
    }).not.toThrow();
  });

  it('clears focus when the filter changes', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Alpha' }),
      makeListSong('b', { name: 'Beta' }),
    ]);

    view.press('down');
    expect(view.isFocused('a')).toBe(true);

    view.search('Alpha');

    expect(view.isFocused('a')).toBe(false);
  });

  it('toggles online mode with the library control', async () => {
    const view = setupSongListView({ online: [makeEnchorChart('x')] });

    view.loadSongs([]);
    view.press('library');

    expect(await screen.findByText('Name x')).toBeInTheDocument();
  });

  it('cycles the difficulty filter with the difficulty control', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Easy Only', drumDifficulties: ['easy'] }),
      makeListSong('b', { name: 'Expert Only', drumDifficulties: ['expert'] }),
    ]);

    expect(screen.getByText('Expert Only')).toBeInTheDocument();
    expect(screen.queryByText('Easy Only')).not.toBeInTheDocument();

    view.press('difficulty');

    expect(screen.getByText('Easy Only')).toBeInTheDocument();
    expect(screen.queryByText('Expert Only')).not.toBeInTheDocument();
  });
});

describe('SongListView — sort menu navigation', () => {
  it('opens the sort menu with the sort control', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a'), makeListSong('b')]);

    expect(screen.queryByText('Last added')).not.toBeInTheDocument();

    view.press('sort');

    expect(screen.getByText('Last added')).toBeInTheDocument();
  });

  it('reorders the list by navigating the sort menu', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Charlie', liked: true }),
      makeListSong('b', { name: 'Alpha', liked: false }),
    ]);

    expect(
      screen.getAllByText(/Charlie|Alpha/).map((el) => el.textContent),
    ).toEqual(['Charlie', 'Alpha']);

    view.press('sort');
    view.press('up');

    expect(
      screen.getAllByText(/Charlie|Alpha/).map((el) => el.textContent),
    ).toEqual(['Alpha', 'Charlie']);
  });

  it('does not open the sort menu in online mode', () => {
    const view = setupSongListView();

    view.loadSongs([], '/music');
    view.selectMode('online');
    view.press('sort');

    expect(screen.queryByText('Last added')).not.toBeInTheDocument();
  });
});

describe('SongListView — waiting on results', () => {
  it('keeps the list stable across a rescan with no changes', async () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')], '/music');
    view.rescanDone([makeListSong('a')], '/music');

    await waitFor(() => {
      expect(screen.getByText('Name a')).toBeInTheDocument();
    });
  });
});

describe('SongListView — input configuration', () => {
  it('opens the input configuration from settings', () => {
    const view = setupSongListView();

    view.loadSongs([]);
    view.openInputConfig();

    expect(screen.getByText('Configure input')).toBeInTheDocument();
  });

  it('binds a keyboard control by listening for a key', () => {
    const view = setupSongListView();

    view.loadSongs([]);
    view.openInputConfig();
    view.learnControl('snare');

    expect(
      within(view.inputRow('snare')).getByText('Listening'),
    ).toBeInTheDocument();

    view.typeKey('KeyJ');

    expect(
      within(view.inputRow('snare')).getByText('KeyJ'),
    ).toBeInTheDocument();
  });

  it('moves a control to a new element, clearing the old binding', () => {
    const view = setupSongListView();

    view.loadSongs([]);
    view.openInputConfig();

    view.learnControl('snare');
    view.typeKey('KeyJ');
    expect(
      within(view.inputRow('snare')).getByText('KeyJ'),
    ).toBeInTheDocument();

    view.learnControl('kick');
    view.typeKey('KeyJ');

    expect(within(view.inputRow('kick')).getByText('KeyJ')).toBeInTheDocument();
    expect(
      within(view.inputRow('snare')).queryByText('KeyJ'),
    ).not.toBeInTheDocument();
  });
});

describe('SongListView — library folder', () => {
  it('shows the folder basename and requests a picker when clicked', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')], 'C:\\Music\\Rock\\Songs');
    view.openSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Songs' }));

    expect(view.ipc.sent).toContainEqual({
      channel: 'rescan-songs',
      args: [],
    });
  });
});

describe('SongListView — lessons filter split', () => {
  it('hides lesson songs from the default Songs view', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Master of Puppets' }),
      makeLessonSong('lesson-1', { id: '01.01', title: 'Warm-Up Groove' }),
    ]);

    expect(screen.getByText('Master of Puppets')).toBeInTheDocument();
    expect(screen.queryByText('Warm-Up Groove')).not.toBeInTheDocument();
  });

  it('still finds a lesson song when the user searches for it', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Master of Puppets' }),
      makeLessonSong('lesson-1', { id: '01.01', title: 'Warm-Up Groove' }),
    ]);
    view.search('Warm-Up Groove');

    expect(screen.getByText('Warm-Up Groove')).toBeInTheDocument();
  });
});

describe('SongListView — Lessons surface', () => {
  it('opens a coach-recommended Method lesson directly in Practice mode', async () => {
    const view = setupSongListView({ route: '/?coachLesson=13.03' });

    view.loadSongs([
      makeLessonSong('lesson-fill', {
        id: '13.03',
        title: 'One-Bar 16th Fill A',
        starsToUnlock: 75,
      }),
    ]);

    expect(await screen.findByTestId('song-view-stub')).toBeInTheDocument();
  });

  it('switches to a Lessons view showing only lessons, grouped and ordered by unit', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Master of Puppets' }),
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Warm-Up Groove',
        unit: 'Unit 1 — Foundations',
        starsToUnlock: 0,
      }),
      makeLessonSong('lesson-2', {
        id: '02.01',
        title: 'Second Unit Groove',
        unit: 'Unit 2 — Reading',
        starsToUnlock: 3,
      }),
    ]);

    view.selectView('lessons');

    expect(screen.getByTestId('lesson-item-01.01')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-item-02.01')).toBeInTheDocument();
    expect(
      screen.getByTestId('lesson-group-Unit 1 — Foundations'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('lesson-group-Unit 2 — Reading'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Master of Puppets')).not.toBeInTheDocument();
  });

  it('shows chain progress and a continue card for the furthest unmastered unlocked lesson', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeLessonSong(
        'lesson-1',
        { id: '01.01', title: 'Warm-Up Groove', starsToUnlock: 0 },
        {
          scoreData: {
            expert: { hitNotes: 50, totalNotes: 100, falseHits: 0 },
          },
        }, // 2 stars — unlocked, not mastered
      ),
    ]);

    view.selectView('lessons');

    expect(screen.getByTestId('lesson-progress-summary')).toHaveTextContent(
      '1 of 1 unlocked · 2⭐ earned',
    );

    const card = screen.getByTestId('lesson-continue-card');

    expect(within(card).getByText('Warm-Up Groove')).toBeInTheDocument();
  });

  it('greys out a locked lesson with an "Earn N more" hint', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Warm-Up Groove',
        starsToUnlock: 0,
      }),
      makeLessonSong('lesson-2', {
        id: '01.02',
        title: 'Locked Groove',
        starsToUnlock: 12,
      }),
    ]);

    view.selectView('lessons');

    const locked = screen.getByTestId('lesson-item-01.02');

    expect(locked).toHaveAttribute('data-locked', 'true');
    expect(within(locked).getByText('Earn 12 more ⭐')).toBeInTheDocument();
  });

  it('shows an honest message instead of a dead click on a locked lesson', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Warm-Up Groove',
        starsToUnlock: 0,
      }),
      makeLessonSong('lesson-2', {
        id: '01.02',
        title: 'Locked Groove',
        starsToUnlock: 12,
      }),
    ]);

    view.selectView('lessons');
    view.clickLesson('01.02');

    expect(screen.getByText('This lesson is locked')).toBeInTheDocument();
    expect(screen.queryByTestId('song-view-stub')).not.toBeInTheDocument();
  });

  it('keeps lessons visible in the Lessons tab regardless of the selected difficulty', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Warm-Up Groove',
        starsToUnlock: 0,
      }),
    ]);
    // Lesson charts only carry an Expert track — pick a difficulty the
    // lesson was never charted for while still in the Songs view.
    view.selectDifficulty('easy');

    view.selectView('lessons');

    expect(screen.getByTestId('lesson-item-01.01')).toBeInTheDocument();
  });

  it('opens an unlocked lesson at its charted difficulty, ignoring the selected difficulty tab', async () => {
    const view = setupSongListView({ settings: { difficulty: 'hard' } });

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Warm-Up Groove',
        starsToUnlock: 0,
      }),
    ]);

    view.selectView('lessons');
    view.clickLesson('01.01');
    view.chooseGameMode('perform');

    expect(await screen.findByTestId('song-view-stub')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem('settings.difficulty')).toBe(
        '"expert"',
      );
    });
  });
});

describe('SongListView — Lessons self-heal', () => {
  function rescanCallCount(view: ReturnType<typeof setupSongListView>) {
    return view.ipc.sent.filter((s) => s.channel === 'rescan-songs').length;
  }

  it('auto-rescans exactly once when the Lessons tab finds SightKick Method songs that failed to parse (stale schema)', () => {
    const view = setupSongListView();

    view.loadSongs(
      [
        makeListSong('stale-1', {
          name: 'Second-Ending Turnaround',
          dir: '/music/SightKick Method - Lesson 07.04 - Second-Ending Turnaround',
        }),
      ],
      '/music',
    );

    view.selectView('lessons');

    expect(rescanCallCount(view)).toBe(1);
    expect(view.ipc.sent).toContainEqual({
      channel: 'rescan-songs',
      args: [false],
    });

    // Leaving and re-entering the Lessons tab must never re-trigger it —
    // the app-session guard only allows one attempt, ever.
    view.selectView('songs');
    view.selectView('lessons');
    view.selectView('songs');
    view.selectView('lessons');

    expect(rescanCallCount(view)).toBe(1);
  });

  it('never auto-rescans once lessons parse correctly', () => {
    const view = setupSongListView();

    view.loadSongs(
      [makeLessonSong('lesson-1', { id: '01.01', title: 'Warm-Up Groove' })],
      '/music',
    );

    view.selectView('lessons');

    expect(screen.getByTestId('lesson-item-01.01')).toBeInTheDocument();
    expect(rescanCallCount(view)).toBe(0);
  });

  it('never auto-rescans when the library has no SightKick Method songs at all', () => {
    const view = setupSongListView();

    view.loadSongs(
      [makeListSong('a', { name: 'Master of Puppets' })],
      '/music',
    );

    view.selectView('lessons');

    expect(screen.getByTestId('lessons-rescan')).toBeInTheDocument();
    expect(rescanCallCount(view)).toBe(0);
  });

  it('shows scan progress instead of the dead-end message while a rescan is in flight', () => {
    const view = setupSongListView();

    view.loadSongs([], '/music');
    view.selectView('lessons');
    view.rescanProgress(3, 6);

    expect(screen.getByTestId('lessons-scan-progress')).toBeInTheDocument();
    expect(screen.queryByText('No lessons found')).not.toBeInTheDocument();

    view.rescanDone([], '/music');

    expect(screen.getByTestId('lessons-rescan')).toBeInTheDocument();
  });

  it('fires the rescan-songs IPC when the empty-state button is clicked', () => {
    const view = setupSongListView();

    view.loadSongs(
      [makeListSong('a', { name: 'Master of Puppets' })],
      '/music',
    );
    view.selectView('lessons');

    fireEvent.click(screen.getByTestId('lessons-rescan'));

    expect(view.ipc.sent).toContainEqual({
      channel: 'rescan-songs',
      args: [false],
    });
  });
});
