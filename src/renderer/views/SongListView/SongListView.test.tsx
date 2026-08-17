import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import yandexFavoritesSource from '../../../../resources/library-sources/yandex-favorites-2026-08-10.json';
import yandexSource from '../../../../resources/library-sources/yandex-drums-2026-08-09.json';
import { parseYandexPlaylistCandidates } from '../../../library-sources/yandex';
import { MidiMessageType } from '../../../types';
import {
  makeLessonSong,
  makeListSong,
  setupSongListView as mountSongListView,
} from '../test-support';
import { candidateDifficulty } from './SongListView';

const { playKitPreviewMock } = vi.hoisted(() => ({
  playKitPreviewMock: vi.fn(),
}));

vi.mock('../../services/kit-preview-audio', () => ({
  playKitPreview: playKitPreviewMock,
}));

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
  playKitPreviewMock.mockClear();
});

// The product now opens at the kit cockpit. These library-focused regression
// tests intentionally enter Songs first, so their assertions continue to
// describe the detailed surface rather than a background default screen.
function setupSongListView(...args: Parameters<typeof mountSongListView>) {
  const view = mountSongListView(...args);

  fireEvent.click(screen.getByTestId('view-songs'));

  return view;
}

function browseAllLibrary(): void {
  const button = screen.queryByTestId('browse-all-library');

  if (button) {
    fireEvent.click(button);
  }
}

describe('SongListView — loading the library', () => {
  it('opens on the playfield-first Home cockpit', () => {
    mountSongListView();

    expect(screen.getByTestId('home-cockpit')).toBeInTheDocument();
    expect(screen.getByTestId('kit-hotspot-kick')).toBeInTheDocument();
    expect(
      Object.fromEntries(
        ['kick', 'snare', 'hihat', 'tom1', 'ride', 'tom2', 'crash', 'tom3'].map(
          (element) => [
            element,
            screen
              .getByTestId(`kit-hotspot-${element}`)
              .getAttribute('data-color-lane'),
          ],
        ),
      ),
    ).toEqual({
      kick: 'orange',
      snare: 'red',
      hihat: 'yellow',
      tom1: 'yellow',
      ride: 'blue',
      tom2: 'blue',
      crash: 'green',
      tom3: 'green',
    });
    expect(screen.getByTestId('home-hit-feedback')).not.toHaveAttribute(
      'aria-live',
    );
    expect(screen.getByTestId('home-hit-feedback')).toBeEmptyDOMElement();
    expect(screen.getByTestId('home-session-status')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.getByTestId('open-profile-button')).toHaveTextContent(
      'Profile',
    );
    expect(screen.queryByTestId('home-choose-song')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kit-hotspot-hihat'));

    expect(playKitPreviewMock).toHaveBeenCalledOnce();
    expect(playKitPreviewMock).toHaveBeenCalledWith('hihat');
  });

  it('wires the kit doors to Journey, songs, discovery, and a top song', async () => {
    const view = mountSongListView({ freshProfile: true });
    const lesson = makeLessonSong('lesson-next', {
      id: '01.02',
      title: 'Eighth-note pulse',
      starsToUnlock: 0,
    });
    const topSong = makeListSong('top-song', { liked: true });
    const run = {
      completedAt: '2026-08-13T12:00:00.000Z',
      totalHits: 10,
      totalMisses: 0,
      totalWrong: 0,
      overallAccuracy: 0.9,
      laneAccuracy: [],
      laneBias: [],
      wrongHitCounts: [],
      timingBias: {
        meanMs: 0,
        medianMs: 0,
        spreadMs: 0,
        earlyCount: 0,
        lateCount: 0,
        onTimeCount: 0,
        sampleCount: 0,
      },
      mode: 'practice' as const,
    };

    view.loadSongs([lesson, topSong], '/music');
    await waitFor(() =>
      expect(view.sentChannels()).toContain('load-all-practice-runs'),
    );
    view.emit('load-all-practice-runs', {
      runs: [run],
      runsBySong: { [topSong.id]: [run] },
      archiveBySong: {},
    });
    await waitFor(() =>
      expect(screen.getByTestId('kit-hotspot-tom1')).toHaveTextContent(
        topSong.name,
      ),
    );

    fireEvent.click(screen.getByTestId('kit-hotspot-hihat'));
    expect(
      await screen.findByTestId('lesson-season-stage'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('view-home'));
    expect(await screen.findByTestId('home-cockpit')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kit-hotspot-ride'));
    expect(await screen.findByTestId('library-toolbar')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('view-home'));
    expect(await screen.findByTestId('home-cockpit')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kit-hotspot-crash'));
    expect(await screen.findByTestId('library-toolbar')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('song-search')).toHaveFocus(),
    );

    fireEvent.click(screen.getByTestId('view-home'));
    expect(await screen.findByTestId('home-cockpit')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kit-hotspot-tom1'));
    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-song-id',
      topSong.id,
    );
  });

  it('keeps physical MIDI feedback silent and separate from the pointer stick', async () => {
    const view = mountSongListView({ freshProfile: true });

    view.emit('midi-device-list', [{ name: 'Yamaha DTX402', port: 2 }]);
    await waitFor(() =>
      expect(view.ipc.sent).toContainEqual({
        channel: 'listen-midi',
        args: [2],
      }),
    );
    view.emit('midi-ready', { port: 2 });
    playKitPreviewMock.mockClear();
    // Below the deliberate-command velocity, so this stays what the test is
    // about — feedback — instead of opening the door it landed on.
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 45,
      velocity: 40,
    });

    const tom2 = screen.getByTestId('kit-hotspot-tom2');

    expect(tom2).toHaveAttribute('data-active', 'true');
    expect(tom2.querySelector('.kit-home__pad-stick')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(playKitPreviewMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-cockpit')).toBeInTheDocument();
  });

  it('starts the armed target from a physical pad instead of navigating the home', async () => {
    // Home only accepts a strike as a command after a real pause, so this
    // test owns the clock the gate reads instead of racing the real one.
    let clock = 10_000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

    try {
      const view = mountSongListView({ freshProfile: true });

      view.loadSongs([makeListSong('song-a', { liked: true })]);

      view.emit('midi-device-list', [{ name: 'Yamaha DTX402', port: 2 }]);
      await waitFor(() =>
        expect(view.ipc.sent).toContainEqual({
          channel: 'listen-midi',
          args: [2],
        }),
      );
      view.emit('midi-ready', { port: 2 });

      clock += 1_000;
      view.emit('listen-midi', {
        type: MidiMessageType.NoteOn,
        note: 38,
        velocity: 100,
      });

      const opened = await screen.findByTestId('song-view-stub');

      expect(opened).toHaveAttribute('data-song-id', 'song-a');
      expect(opened.getAttribute('data-search')).toContain('gameMode=practice');
      expect(opened.getAttribute('data-search')).toContain('autoStart=1');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('states honest kit availability when no kit is selected', () => {
    mountSongListView({ settings: { selectedDevice: null } });

    expect(screen.getByTestId('home-input-readiness')).toHaveAttribute(
      'data-state',
      'waiting',
    );
    expect(screen.getByTestId('home-input-readiness')).toHaveTextContent(
      'No MIDI kit found',
    );
    expect(screen.getByTestId('kit-hotspot-kick')).not.toHaveTextContent(
      'Waiting',
    );
  });

  it('opens the shell profile control as a full insights view and starts its current target', async () => {
    const view = mountSongListView();

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Pulse and posture',
        starsToUnlock: 0,
      }),
    ]);
    view.emit('load-goals', { goals: [] });
    fireEvent.click(screen.getByTestId('open-profile-button'));

    expect(await screen.findByTestId('profile-view')).toBeInTheDocument();
    expect(screen.getByTestId('profile-insights-hero')).toBeInTheDocument();
    expect(document.querySelector('.ant-drawer')).toBeNull();

    fireEvent.click(screen.getByTestId('profile-target-action'));

    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-song-id',
      'lesson-1',
    );
  });

  it('runs Insights and stats from their printed kit pads', async () => {
    const deviceId = 'midi:Yamaha DTX402';
    const view = mountSongListView({
      settings: {
        selectedDevice: {
          id: deviceId,
          name: 'Yamaha DTX402',
          sourceId: 'midi',
          port: 2,
        },
        inputMappings: {
          [deviceId]: {
            crash: ['midi:49'],
            hihat: ['midi:42'],
            ride: ['midi:51'],
          },
        },
      },
    });

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Pulse and posture',
        starsToUnlock: 0,
      }),
    ]);
    view.emit('load-goals', { goals: [] });
    view.emit('midi-device-list', [{ name: 'Yamaha DTX402', port: 2 }]);
    await waitFor(() =>
      expect(view.ipc.sent).toContainEqual({
        channel: 'listen-midi',
        args: [2],
      }),
    );
    view.emit('midi-ready', { port: 2 });
    fireEvent.click(screen.getByTestId('open-profile-button'));

    const continueChips = await screen.findAllByTestId(
      'kit-action-chip-continue',
    );

    expect(continueChips.length).toBeGreaterThan(0);
    continueChips.forEach((chip) =>
      expect(chip).toHaveAttribute('data-pad', 'crash'),
    );
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 42,
      velocity: 100,
    });

    expect(await screen.findByTestId('stats-panel')).toBeInTheDocument();
    expect(screen.getByTestId('kit-action-chip-end')).toHaveAttribute(
      'data-pad',
      'ride',
    );

    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 51,
      velocity: 100,
    });

    await waitFor(() =>
      expect(screen.queryByTestId('stats-panel')).not.toBeInTheDocument(),
    );

    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 49,
      velocity: 100,
    });

    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-song-id',
      'lesson-1',
    );
  });

  it('keeps the selected target armed while a remembered kit reconnects', async () => {
    const view = mountSongListView({
      settings: {
        selectedDevice: {
          id: 'midi:Yamaha DTX402',
          name: 'Yamaha DTX402',
          sourceId: 'midi',
          port: 2,
        },
      },
    });

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Pulse and posture',
        starsToUnlock: 0,
      }),
    ]);

    expect(screen.getByTestId('home-input-readiness')).toHaveTextContent(
      'Reconnecting · Yamaha DTX402',
    );
    expect(screen.getByTestId('home-session-status')).toHaveTextContent(
      'Pulse and posture is armed',
    );
    expect(screen.getByTestId('kit-hotspot-kick')).toBeEnabled();

    view.emit('midi-device-list', [
      {
        id: 'midi:Yamaha DTX402',
        name: 'Yamaha DTX402',
        sourceId: 'midi',
        port: 7,
      },
    ]);
    await waitFor(() => expect(view.sentChannels()).toContain('listen-midi'));
    view.emit('midi-ready', { port: 7 });

    await waitFor(() =>
      expect(screen.getByTestId('home-input-readiness')).toHaveTextContent(
        'Connected · Yamaha DTX402',
      ),
    );
    expect(screen.getByTestId('kit-hotspot-kick')).toBeEnabled();
  });

  it('does not expose desktop-only music actions in the browser library', () => {
    vi.stubGlobal('drumrollPlatform', {
      kind: 'web',
      capabilities: {
        lessonLibrary: true,
        indexedDbImports: true,
        webMidi: true,
        youtubeImport: false,
        onlineSongDownloads: false,
        localFolderImport: false,
        localAudioImport: false,
        stemSplit: false,
        octave: false,
        myMusic: false,
        appUpdates: false,
        openSongDirectory: false,
      },
    });

    const view = setupSongListView();

    expect(screen.queryByTestId('add-music-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-song-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('my-music-trigger')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('create-chart-trigger'),
    ).not.toBeInTheDocument();

    // The single search field still browses the player's own library on a
    // YouTube-import-free platform — only the YouTube fallback is gone.
    expect(screen.getByTestId('song-search')).toBeInTheDocument();
    view.search('nonexistent song');
    expect(view.sentChannels()).not.toContain('search-youtube');
  });

  it('keeps the shelves while one-search imports open the new song directly', async () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'First shelf song' }),
      makeListSong('b', { name: 'Second shelf song', liked: true }),
      makeListSong('c', { name: 'Third shelf song' }),
      makeListSong('d', { name: 'Fourth shelf song' }),
    ]);

    expect(screen.getByTestId('library-shelf-ready-now')).toBeInTheDocument();
    expect(screen.getByTestId('library-shelf-favourites')).toBeInTheDocument();
    expect(
      screen.getByTestId('library-shelf-recently-imported'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('library-full-scroll')).toBeInTheDocument();
    expect(screen.queryByTestId('add-music-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('import-song-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('my-music-trigger')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('create-chart-trigger'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('auto-chart-progress')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Choose a local audio file instead'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Remote transcriber endpoint'),
    ).not.toBeInTheDocument();

    view.search('Some Great Drum Song');
    await waitFor(() =>
      expect(view.sentChannels()).toContain('search-youtube'),
    );
    view.emit('search-youtube', {
      results: [
        {
          videoId: 'abcdefghijk',
          title: 'Some Great Drum Song',
          uploader: 'Some Channel',
          durationSeconds: 125,
          watchUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        },
      ],
    });

    fireEvent.click(screen.getByTestId('song-search-result-abcdefghijk'));
    expect(screen.getByTestId('song-search-import-row')).toHaveTextContent(
      'Queued "Some Great Drum Song"',
    );

    const importedSong = makeListSong('imported-song', {
      name: 'Some Great Drum Song',
    });

    view.emit('auto-chart-update', {
      id: 'job-1',
      attempt: 1,
      stage: 'imported',
      message: 'Added Some Great Drum Song to your library',
      backend: 'sightkick',
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      autoImport: true,
      jobs: [],
      song: importedSong,
    });

    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-song-id',
      importedSong.id,
    );
  });

  it('launches the deterministic next lesson directly in Practice at its recommended speed', async () => {
    const view = mountSongListView();

    view.loadSongs([
      makeListSong('song-a', { liked: true }),
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Pulse and posture',
        starsToUnlock: 0,
      }),
    ]);

    expect(screen.getAllByText('Pulse and posture')).not.toHaveLength(0);
    fireEvent.click(screen.getByTestId('kit-hotspot-kick'));

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'lesson-1');
    expect(opened.getAttribute('data-search')).toContain('gameMode=practice');
    expect(opened.getAttribute('data-search')).toContain('autoStart=1');
    expect(opened.getAttribute('data-search')).toContain('practiceSpeed=0.7');
    expect(screen.queryByTestId('home-cockpit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kit-hotspot-kick')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('game-mode-selector-modal'),
    ).not.toBeInTheDocument();
  });

  it('ranks persisted supported Coach evidence into Home without bypassing lesson prerequisites', async () => {
    const view = mountSongListView();
    const savedWeakRun = {
      completedAt: '2026-08-09T12:00:00.000Z',
      totalHits: 20,
      totalMisses: 80,
      totalWrong: 0,
      overallAccuracy: 0.2,
      laneAccuracy: [{ element: 'tom2', hits: 2, misses: 8, accuracy: 0.2 }],
      laneBias: [],
      wrongHitCounts: [],
      timingBias: {
        meanMs: 0,
        medianMs: 0,
        spreadMs: 0,
        earlyCount: 0,
        lateCount: 0,
        onTimeCount: 0,
        sampleCount: 0,
      },
      mode: 'practice' as const,
      playbackSpeed: 0.7,
      difficulty: 'expert' as const,
      coachEvidence: [
        {
          id: 'pad-tom2-tom3',
          kind: 'pad-confusion',
          severity: 'high' as const,
          skillTag: 'pad-accuracy',
          sampleCount: 3,
          barStart: 4,
          barEnd: 4,
          remediationLessonId: '07.03',
        },
      ],
    };

    view.loadSongs([
      makeLessonSong(
        'foundation',
        {
          id: '07.01',
          title: 'Tom foundations',
          skills: ['timing'],
          starsToUnlock: 0,
        },
        {
          scoreData: {
            expert: { hitNotes: 100, totalNotes: 100, falseHits: 0 },
          },
        },
      ),
      makeLessonSong('supported-route', {
        id: '07.03',
        title: 'Mid and Floor Tom Signals',
        skills: ['pad-accuracy'],
        prerequisiteIds: ['07.01'],
        starsToUnlock: 0,
      }),
      makeLessonSong('locked-skip', {
        id: '07.04',
        title: 'Unsafe later tom route',
        skills: ['pad-accuracy'],
        prerequisiteIds: ['07.03'],
        starsToUnlock: 0,
      }),
    ]);
    // Re-enter Home after the library response so this test controls the
    // exact live IPC request that hydrates its recommendation evidence.
    fireEvent.click(screen.getByTestId('view-songs'));
    fireEvent.click(screen.getByTestId('view-home'));
    await waitFor(() =>
      expect(
        view
          .sentChannels()
          .filter((channel) => channel === 'load-all-practice-runs').length,
      ).toBeGreaterThan(0),
    );
    view.emit('load-all-practice-runs', {
      runs: [savedWeakRun],
      runsBySong: { 'weak-song': [savedWeakRun] },
      archiveBySong: {},
    });

    await waitFor(() =>
      expect(screen.getAllByText('Mid and Floor Tom Signals')).not.toHaveLength(
        0,
      ),
    );
    expect(screen.queryByTestId('home-recent-songs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-lane-evidence')).not.toBeInTheDocument();
    // The armed target moved from the title band (now the skill-of-the-day
    // story) into the action band's offer/session summary; the protected
    // invariant is unchanged — coach evidence must not bypass lesson
    // prerequisites, so the supported lesson is what the home offers.
    expect(screen.getByTestId('home-session-summary')).toHaveTextContent(
      'Mid and Floor Tom Signals',
    );
    // The kit is the launcher (docs/kit-launcher-design.md): kick continues
    // the armed target. Tom 2 now starts the second top-played song, not a
    // coach remediation route, so the armed-target/prerequisite assertion
    // above is what this test protects; kick is how a player reaches it.
    fireEvent.click(screen.getByTestId('kit-hotspot-kick'));

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'supported-route');
    expect(opened.getAttribute('data-search')).toContain('gameMode=practice');
  });

  it('keeps raw lane telemetry off the Home kit', async () => {
    const view = mountSongListView();
    const nowMs = Date.now();
    const run = (ageDays: number, hits: number, misses: number) => ({
      completedAt: new Date(nowMs - ageDays * 86_400_000).toISOString(),
      totalHits: hits,
      totalMisses: misses,
      totalWrong: 0,
      overallAccuracy: hits / (hits + misses),
      laneAccuracy: [
        {
          element: 'tom2' as const,
          hits,
          misses,
          accuracy: hits / (hits + misses),
        },
      ],
      laneBias: [],
      wrongHitCounts: [],
      timingBias: {
        meanMs: 0,
        medianMs: 0,
        spreadMs: 0,
        earlyCount: 0,
        lateCount: 0,
        onTimeCount: 0,
        sampleCount: 0,
      },
      mode: 'practice' as const,
    });
    const earlier = run(18, 8, 2);
    const latest = run(3, 10, 0);

    await waitFor(() =>
      expect(view.sentChannels()).toContain('load-all-practice-runs'),
    );
    view.emit('load-all-practice-runs', {
      runs: [earlier, latest],
      runsBySong: { 'signal-song': [earlier, latest] },
      archiveBySong: {},
    });

    await waitFor(() =>
      expect(screen.getByTestId('home-cockpit')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('kit-hotspot-tom2')).not.toHaveTextContent(
      /96%|20|pp/,
    );
    expect(screen.queryByTestId('home-lane-evidence')).not.toBeInTheDocument();
  });

  it('keeps completed-run history off the quiet Home cockpit', async () => {
    const view = mountSongListView();
    const run = (
      completedAt: string,
      overallAccuracy: number,
      mode: 'practice' | 'perform' = 'practice',
    ) => ({
      completedAt,
      totalHits: 10,
      totalMisses: 0,
      totalWrong: 0,
      overallAccuracy,
      laneAccuracy: [],
      laneBias: [],
      wrongHitCounts: [],
      timingBias: {
        meanMs: 0,
        medianMs: 0,
        spreadMs: 0,
        earlyCount: 0,
        lateCount: 0,
        onTimeCount: 0,
        sampleCount: 0,
      },
      mode,
    });
    const songAOlder = run('2026-08-03T10:00:00.000Z', 0.21);
    const songANewer = run('2026-08-09T10:00:00.000Z', 0.91);
    const songB = run('2026-08-11T10:00:00.000Z', 0.82, 'perform');
    const songC = run('2026-08-10T10:00:00.000Z', 0.75);
    const songD = run('2026-08-08T10:00:00.000Z', 0.99);

    view.loadSongs(
      ['song-a', 'song-b', 'song-c', 'song-d'].map((id) => makeListSong(id)),
    );
    await waitFor(() =>
      expect(view.sentChannels()).toContain('load-all-practice-runs'),
    );
    view.emit('load-all-practice-runs', {
      runs: [songAOlder, songANewer, songB, songC, songD],
      runsBySong: {
        'song-a': [songAOlder, songANewer],
        'song-b': [songB],
        'song-c': [songC],
        'song-d': [songD],
      },
      archiveBySong: {},
    });

    await waitFor(() =>
      expect(screen.queryByTestId('home-recent-songs')).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId(/home-recent-song-/)).not.toBeInTheDocument();
  });

  it('launches the composed default target from a pad hit', async () => {
    const view = mountSongListView();

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Pulse and posture',
        starsToUnlock: 0,
      }),
      makeListSong('song-a', { liked: true }),
    ]);
    fireEvent.click(screen.getByTestId('kit-hotspot-kick'));

    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-song-id',
      'lesson-1',
    );
  });

  it('starts the recommendation from one deliberate Home snare and unmounts the background cockpit', async () => {
    let clock = 10_000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);

    try {
      const view = mountSongListView({
        settings: {
          inputMappings: {
            keyboard: {
              snare: ['keyboard:KeyK'],
            },
          },
        },
      });

      view.loadSongs([makeListSong('song-a', { liked: true })]);

      clock += 1_000;
      view.typeKey('KeyK');

      const opened = await screen.findByTestId('song-view-stub');

      expect(opened).toHaveAttribute('data-song-id', 'song-a');
      expect(opened.getAttribute('data-search')).toContain('autoStart=1');
      expect(screen.queryByTestId('home-cockpit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('kit-hotspot-kick')).not.toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('requests the song list and stem-tool status on mount', () => {
    const view = setupSongListView();

    expect(view.sentChannels()).toContain('load-song-list');
    expect(view.sentChannels()).toContain('check-stem-tools');
  });

  it('shows the songs the backend returns on one continuous shelf', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a'), makeListSong('b')]);

    expect(screen.getByText('Name a')).toBeInTheDocument();
    expect(screen.getByText('Name b')).toBeInTheDocument();
    expect(
      screen.getByText('2 in your library · 2 ready to play'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your drum library' }),
    ).toBeInTheDocument();
  });

  it('never counts lesson songs in the header — they never appear on this shelf', () => {
    // Regression for docs/design-qa/2026-08-13-finish/critique.md, Songs
    // finding 2: the default shelf hides every lesson song (Journey owns
    // the curriculum), so counting them into "N in your library · M ready
    // to play" makes a claim this screen can never back up. A library
    // whose only songs are lessons must read as empty here, not "170
    // ready to play" over a shelf that shows none of them.
    const view = setupSongListView();

    view.loadSongs([
      makeLessonSong('lesson-1', { id: '01.01', title: 'Warm-Up Groove' }),
      makeLessonSong('lesson-2', { id: '01.02', title: 'Second Lesson' }),
    ]);

    expect(
      screen.getByText('0 in your library · 0 ready to play'),
    ).toBeInTheDocument();
    expect(screen.getByText('Build your practice library')).toBeInTheDocument();
    expect(screen.queryByText('Warm-Up Groove')).not.toBeInTheDocument();

    view.search('Warm-Up Groove');
    expect(screen.getByText('Warm-Up Groove')).toBeInTheDocument();
  });

  it('merges Drums and Favorites into the same shelf as local songs, labelled by source', () => {
    const view = setupSongListView();
    const drums = parseYandexPlaylistCandidates(yandexSource);
    const favorites = parseYandexPlaylistCandidates(yandexFavoritesSource);

    view.loadSongs([makeListSong('a', { name: 'Master of Puppets' })]);
    view.loadLibraryCandidates({ yandex: { drums, favorites } });

    expect(view.sentChannels()).toContain('load-library-candidates');
    // One shelf, one search — no mode tabs to switch between local, Drums,
    // Favorites, or an online browser.
    expect(screen.queryByTestId('mode-local')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-drums')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-favorites')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mode-online')).not.toBeInTheDocument();

    browseAllLibrary();

    expect(screen.getByText('Master of Puppets')).toBeInTheDocument();
    expect(
      screen.getByTestId('library-candidate-state-Drums-1'),
    ).toHaveTextContent('Not in your library yet');
    expect(screen.getByTestId('library-candidate-Drums-1')).toHaveTextContent(
      'From Drums',
    );
    expect(
      screen.getByTestId('library-candidate-Favorites-1'),
    ).toHaveTextContent('From Favorites');
  });

  it("never counts an unresolved suggestion as 'in your library' — the header must not argue with its own rows", () => {
    // Regression: naming every row "Not in your library yet" while the
    // header folded those same rows into "N in your library" was a second,
    // freshly introduced version of critique finding 2 (docs/design-qa/
    // 2026-08-13-finish/critique.md) — fixing the row order/copy must not
    // trade one header/row contradiction for another.
    const view = setupSongListView();
    const drums = parseYandexPlaylistCandidates(yandexSource);
    const favorites = parseYandexPlaylistCandidates(yandexFavoritesSource);

    view.loadSongs([makeListSong('a', { name: 'Master of Puppets' })]);
    view.loadLibraryCandidates({ yandex: { drums, favorites } });

    const suggestionCount = drums.tracks.length + favorites.tracks.length;

    expect(
      screen.getByText(
        `1 in your library · 1 ready to play · ${suggestionCount} to add from your playlists`,
      ),
    ).toBeInTheDocument();
  });

  it('persists a favourite from one press on an actionable row', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('favourite', {
        updatedAt: '2026-08-14T09:00:00.000Z',
      }),
    ]);

    const row = screen.getByTestId('song-item-favourite');
    const likeButton = within(row).getByTestId('like-toggle');

    fireEvent.click(likeButton);

    expect(view.ipc.sent).toContainEqual({
      channel: 'like-song',
      args: ['favourite', true],
    });
    expect(
      within(screen.getByTestId('song-item-favourite')).getByTestId(
        'like-toggle',
      ),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects all 13 Drums candidates with honest metadata-only states', () => {
    const view = setupSongListView();
    const drums = parseYandexPlaylistCandidates(yandexSource);
    const favorites = parseYandexPlaylistCandidates(yandexFavoritesSource);

    view.loadSongs([], 'Browser library');
    view.loadLibraryCandidates({
      yandex: {
        drums,
        favorites,
      },
    });

    browseAllLibrary();

    const drumsRows = drums.tracks.map((track) =>
      screen.getByTestId(`library-candidate-Drums-${track.ordinal}`),
    );

    expect(drumsRows).toHaveLength(13);

    const expectedTitles = [
      'Pendant que les champs brûlent',
      'Natural Villain',
      'Loyal',
      'Made To Love',
      'Help Is On The Way (Maybe Midnight)',
      'Heat Waves',
      'What I Like About You',
      'Sanctuary',
      'Wantchya',
      'Can’t Use Me',
      'UNSTOPPABLE Cover',
      'Niten Doraku',
      'Low',
    ];

    expect([...drums.tracks.map((track) => track.title)].sort()).toEqual(
      [...expectedTitles].sort(),
    );
    // Favorites overlaps some Drums titles for real (e.g. "Loyal"), so check
    // each Drums row against its own exact ordinal rather than a page-wide
    // text search that would match either copy.
    drums.tracks.forEach((track, index) => {
      expect(
        within(drumsRows[index]).getByText(track.title),
      ).toBeInTheDocument();
    });
    expect(
      drumsRows.filter((row) =>
        within(row).queryByText('Not in your library yet'),
      ),
    ).toHaveLength(11);
    expect(
      within(screen.getByTestId('library-candidate-Drums-6')).getByText(
        'No longer available',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('library-candidate-Drums-6')).toHaveAttribute(
      'data-practice-status',
      'unavailable',
    );
    expect(
      within(screen.getByTestId('library-candidate-Drums-1')).getByRole(
        'button',
        { name: /check reviewed public drum charts/i },
      ),
    ).toBeEnabled();
    fireEvent.click(
      within(screen.getByTestId('library-candidate-Drums-1')).getByRole(
        'button',
        { name: /check reviewed public drum charts/i },
      ),
    );
    expect(view.ipc.sent).toContainEqual({
      channel: 'resolve-library-candidates',
      args: [
        {
          sources: [
            {
              provider: 'yandex-music',
              collectionId: drums.playlist.id,
              collectionName: drums.playlist.name,
              trackId: drums.tracks[0].id,
              title: drums.tracks[0].title,
              artists: drums.tracks[0].artists,
              durationSeconds: drums.tracks[0].durationSeconds,
              ...(drums.tracks[0].sourceTrackUrl
                ? { sourceUrl: drums.tracks[0].sourceTrackUrl }
                : {}),
            },
          ],
        },
      ],
    });

    view.search('living in fiction');

    expect(screen.getByText('Heat Waves')).toBeInTheDocument();
    expect(screen.queryByText('Natural Villain')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(/^library-candidate-Favorites-/),
    ).not.toBeInTheDocument();
  });

  it('marks only an exactly linked source row as resolved by a local chart', () => {
    const view = setupSongListView();
    const drums = parseYandexPlaylistCandidates(yandexSource);
    const linkedTrack = drums.tracks[0];

    view.loadSongs(
      [
        makeListSong('linked-chart', {
          sourceProvenance: {
            provider: 'yandex-music',
            collectionId: drums.playlist.id,
            collectionName: drums.playlist.name,
            trackId: linkedTrack.id,
            title: linkedTrack.title,
            artists: [...linkedTrack.artists],
            ...(linkedTrack.durationSeconds !== null
              ? { durationSeconds: linkedTrack.durationSeconds }
              : {}),
            ...(linkedTrack.sourceTrackUrl
              ? { sourceUrl: linkedTrack.sourceTrackUrl }
              : {}),
          },
          playability: {
            identity: {
              title: linkedTrack.title,
              artists: [...linkedTrack.artists],
              durationSeconds: linkedTrack.durationSeconds!,
            },
            audio: {
              source: 'local-user-attested',
              sha256: 'a'.repeat(64),
            },
            chart: {
              source: 'local-auto-chart',
              id: 'job-1',
              sha256: 'b'.repeat(64),
              reviewed: true,
            },
            scan: {
              passed: true,
              format: 'mid',
              drumDifficulties: ['expert'],
            },
            launch: {
              passed: true,
              mode: 'headless-load',
              verifiedAt: '2026-08-11T00:00:00.000Z',
            },
          },
        }),
      ],
      'Browser library',
    );
    view.loadLibraryCandidates({
      yandex: {
        drums,
        favorites: parseYandexPlaylistCandidates(yandexFavoritesSource),
      },
    });

    browseAllLibrary();

    // A linked track never appears as a source row at all — it is the
    // playable song row, merged and deduplicated by the unified model.
    expect(screen.getByTestId('song-item-linked-chart')).toBeInTheDocument();
    expect(
      screen.queryByTestId(`library-candidate-Drums-${linkedTrack.ordinal}`),
    ).not.toBeInTheDocument();

    const unresolvedTrack = drums.tracks[1];
    const unresolvedRow = within(
      screen.getByTestId(`library-candidate-Drums-${unresolvedTrack.ordinal}`),
    );

    expect(unresolvedRow.getByText('Not in your library yet')).toBeVisible();
    expect(
      screen.getByTestId(`library-candidate-Drums-${unresolvedTrack.ordinal}`),
    ).toHaveAttribute('data-practice-status', 'needs-local-chart');
    expect(
      unresolvedRow.getByRole('button', {
        name: /check reviewed public drum charts/i,
      }),
    ).toBeEnabled();
  });

  it('does not expose local-audio auto-charting from a source row', () => {
    const view = setupSongListView();
    const drums = parseYandexPlaylistCandidates(yandexSource);
    const track = drums.tracks[0];

    view.loadSongs([], 'Browser library');
    view.loadLibraryCandidates({
      yandex: {
        drums,
        favorites: parseYandexPlaylistCandidates(yandexFavoritesSource),
      },
    });

    browseAllLibrary();

    expect(
      within(
        screen.getByTestId(`library-candidate-Drums-${track.ordinal}`),
      ).queryByRole('button', { name: /local audio/i }),
    ).not.toBeInTheDocument();
    expect(
      view.ipc.sent.some((message) => message.channel === 'create-auto-chart'),
    ).toBe(false);
  });

  it('keeps a private Favorites row eligible for an exact chart check', () => {
    const view = setupSongListView();
    const favorites = parseYandexPlaylistCandidates(yandexFavoritesSource);
    const privateTrack = favorites.tracks[87];

    view.loadSongs([], 'Browser library');
    view.loadLibraryCandidates({
      yandex: {
        drums: parseYandexPlaylistCandidates(yandexSource),
        favorites,
      },
    });
    view.search(privateTrack.title);

    const row = within(
      screen.getByTestId(`library-candidate-Favorites-${privateTrack.ordinal}`),
    );

    expect(row.getByText(privateTrack.title)).toBeInTheDocument();
    expect(row.getByText('Private on Yandex')).toBeInTheDocument();

    const checkButton = row.getByRole('button', {
      name: /check reviewed public drum charts/i,
    });

    expect(checkButton).toBeEnabled();
    fireEvent.click(checkButton);
    expect(view.ipc.sent).toContainEqual({
      channel: 'resolve-library-candidates',
      args: [
        {
          sources: [
            {
              provider: 'yandex-music',
              collectionId: favorites.playlist.id,
              collectionName: favorites.playlist.name,
              trackId: privateTrack.id,
              title: privateTrack.title,
              artists: privateTrack.artists,
              ...(privateTrack.durationSeconds !== null
                ? { durationSeconds: privateTrack.durationSeconds }
                : {}),
            },
          ],
        },
      ],
    });
  });

  it('keeps the toolbar wrapping with sane width floors', () => {
    setupSongListView();

    expect(screen.getByTestId('library-toolbar')).toHaveClass('flex-col');
    expect(screen.getByTestId('library-song-controls')).toHaveClass(
      'flex-wrap',
    );
    expect(screen.getByTestId('library-name-filter')).toHaveClass('min-w-64');
    expect(screen.queryByTestId('add-music-actions')).not.toBeInTheDocument();
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

  it('never features a scored song that is no longer playable as continue-practicing', () => {
    // Regression: a song can carry a real past score yet lose its audio or
    // chart afterwards (a bad download/rescan — see
    // docs/bug-hunt-20260812.md). Every row on the shelf already hides its
    // Play action once `ready` is false; the featured continue-practicing
    // strip must honor the same rule instead of handing the most prominent
    // Play button in the view to a song that cannot actually play.
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('broken', {
        name: 'Broken Audio',
        audio: [],
        scoreData: {
          expert: { hitNotes: 92, totalNotes: 100, falseHits: 0 },
        },
      }),
    ]);

    expect(screen.queryByTestId('continue-practicing')).not.toBeInTheDocument();
  });

  it('guides to select a folder when none is chosen', () => {
    const view = setupSongListView();

    view.loadSongs([], null);

    expect(screen.getByText('Select folder')).toBeInTheDocument();
  });

  it('guides to search for music when the folder is empty', () => {
    const view = setupSongListView();

    view.loadSongs([], '/music');

    expect(screen.getByText('Build your practice library')).toBeInTheDocument();
    expect(screen.queryByText('Select folder')).not.toBeInTheDocument();
  });

  it('offers YouTube candidates the moment nothing in the library matches', async () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Master of Puppets' }),
      makeListSong('b', { name: 'Enter Sandman' }),
    ]);
    view.search('boulevard of broken dreams');

    await waitFor(() =>
      expect(view.sentChannels()).toContain('search-youtube'),
    );
    expect(view.ipc.sent).toContainEqual({
      channel: 'search-youtube',
      args: [{ query: 'boulevard of broken dreams' }],
    });
    expect(
      screen.getByText(
        'No matches in your library for “boulevard of broken dreams”',
      ),
    ).toBeInTheDocument();
  });

  it('reports an honest dead end when nothing matches and YouTube import is unavailable', () => {
    vi.stubGlobal('drumrollPlatform', {
      kind: 'web',
      capabilities: { youtubeImport: false },
    });

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

  it('finds a Drums/Favorites source row by its source label', () => {
    const view = setupSongListView();
    const drums = parseYandexPlaylistCandidates(yandexSource);

    view.loadSongs([makeListSong('a', { name: 'Local Only Song' })]);
    view.loadLibraryCandidates({
      yandex: {
        drums,
        favorites: parseYandexPlaylistCandidates(yandexFavoritesSource),
      },
    });
    view.search('drums');

    expect(screen.queryByText('Local Only Song')).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`library-candidate-Drums-${drums.tracks[0].ordinal}`),
    ).toBeInTheDocument();
  });

  it('reorders the list to the most recently touched song first', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', {
        name: 'Older Add',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }),
      makeListSong('b', {
        name: 'Newer Add',
        updatedAt: '2026-08-10T00:00:00.000Z',
      }),
    ]);
    fireEvent.click(screen.getByTestId('sort-option-recent'));

    const rendered = screen
      .getAllByText(/Older Add|Newer Add/)
      .map((el) => el.textContent);

    expect(rendered).toEqual(['Newer Add', 'Older Add']);
  });

  it('puts every playable song ahead of not-ready rows under the default Difficulty sort, not alphabetical order', () => {
    // Regression for docs/design-qa/2026-08-13-finish/critique.md, Songs
    // finding 2: with no per-song chart fed into the shelf, every entry's
    // computed difficulty ties, so the 'Difficulty' sort used to fall back
    // to pure alphabetical order regardless of whether a row could play —
    // a header that says "N ready to play" while the very first rows are
    // all unplayable. Pick titles where honest readiness and alphabetical
    // order disagree, so this only passes if readiness actually wins.
    const view = setupSongListView();
    const drums = parseYandexPlaylistCandidates(yandexSource);

    view.loadSongs([
      makeListSong('unready', {
        name: 'Aardvark Waits',
        audio: [],
        drumDifficulties: undefined,
      }),
      makeListSong('ready', { name: 'Zzyzx Road' }),
    ]);
    view.loadLibraryCandidates({
      yandex: {
        drums,
        favorites: parseYandexPlaylistCandidates(yandexFavoritesSource),
      },
    });

    browseAllLibrary();

    const readyRow = screen.getByTestId('song-item-ready');
    const unreadyRow = screen.getByTestId('song-item-unready');
    const firstCandidateRow = screen.getByTestId(
      `library-candidate-Drums-${drums.tracks[0].ordinal}`,
    );

    expect(readyRow).toHaveAttribute('aria-label', 'Play Zzyzx Road');
    // Node.compareDocumentPosition: bit 4 (0x04, DOCUMENT_POSITION_FOLLOWING)
    // set on the argument means `readyRow` precedes it in the DOM.
    expect(
      readyRow.compareDocumentPosition(unreadyRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      readyRow.compareDocumentPosition(firstCandidateRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('SongListView — difficulty', () => {
  it('keeps every song on the shelf regardless of which difficulties it is charted at', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', { name: 'Expert Only', drumDifficulties: ['expert'] }),
      makeListSong('b', { name: 'Hard Only', drumDifficulties: ['hard'] }),
    ]);

    // The shelf is one continuous list now — a chart's difficulty no longer
    // hides it. Practice launch still picks the right chart via the game
    // mode selector's own difficulty control.
    expect(screen.getByText('Expert Only')).toBeInTheDocument();
    expect(screen.getByText('Hard Only')).toBeInTheDocument();

    view.press('difficulty');

    expect(screen.getByText('Expert Only')).toBeInTheDocument();
    expect(screen.getByText('Hard Only')).toBeInTheDocument();
  });

  it('shows the high score for the selected difficulty', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', {
        scoreData: {
          expert: { hitNotes: 100, totalNotes: 100, falseHits: 0 },
          easy: { hitNotes: 45, totalNotes: 100, falseHits: 0 },
        },
      }),
    ]);

    expect(view.filledStars('a')).toBe(5);

    // The default global difficulty is Expert; one hi-hat press cycles to
    // Easy (see helpers.test.ts's nextDifficulty coverage).
    view.press('difficulty');

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

  it('never fabricates a practice-candidate difficulty for a song with no charted drum part', () => {
    // Regression for docs/bug-hunt-20260812.md's "Song grid and My Wave
    // fabricate a playable difficulty for songs with zero charted
    // difficulties": an uncharted/broken song used to pass through with the
    // globally selected difficulty, letting it reach My Wave with
    // `available: true` and auto-launch into a chart-parse failure. It must
    // resolve to `undefined` instead, so the recommender's own
    // `if (!targetDifficulty) return []` guard drops it before it is ever
    // offered as playable.
    const uncharted = makeListSong('broken', { drumDifficulties: [] });

    expect(candidateDifficulty(uncharted, 'expert')).toBeUndefined();

    const untypedDifficulties = makeListSong('legacy', {
      drumDifficulties: undefined,
    });

    expect(candidateDifficulty(untypedDifficulties, 'expert')).toBeUndefined();

    // A charted song keeps its honest fallback behaviour: the selected
    // difficulty when charted, otherwise the closest lower charted one.
    const charted = makeListSong('charted', { drumDifficulties: ['hard'] });

    expect(candidateDifficulty(charted, 'expert')).toBe('hard');
    expect(candidateDifficulty(charted, 'hard')).toBe('hard');
  });
});

describe('SongListView — opening a song', () => {
  const failedHardPractice = {
    completedAt: '2026-08-08T12:00:00.000Z',
    totalHits: 55,
    totalMisses: 45,
    totalWrong: 0,
    overallAccuracy: 0.55,
    laneAccuracy: [],
    laneBias: [],
    wrongHitCounts: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 0,
      sampleCount: 0,
    },
    mode: 'practice' as const,
    playbackSpeed: 1,
    difficulty: 'hard' as const,
  };

  async function loadFailedHardPractice(
    view: ReturnType<typeof setupSongListView>,
  ) {
    await waitFor(() =>
      expect(view.sentChannels()).toContain('load-all-practice-runs'),
    );
    view.emit('load-all-practice-runs', {
      runs: [failedHardPractice],
      runsBySong: { 'hard-song': [failedHardPractice] },
      archiveBySong: {},
    });
  }

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

  it('routes a manual Practice launch through the adaptive start-speed recommendation', async () => {
    const view = setupSongListView({ settings: { difficulty: 'hard' } });

    view.loadSongs([makeListSong('hard-song')]);
    await loadFailedHardPractice(view);
    browseAllLibrary();
    view.clickSong('hard-song');
    view.chooseGameMode('practice');

    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-search',
      '?gameMode=practice&practiceSpeed=0.8',
    );
  });

  it('keeps a manual Perform launch at its strict default speed', async () => {
    const view = setupSongListView({ settings: { difficulty: 'hard' } });

    view.loadSongs([makeListSong('hard-song')]);
    await loadFailedHardPractice(view);
    browseAllLibrary();
    view.clickSong('hard-song');
    view.chooseGameMode('perform');

    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-search',
      '?gameMode=perform',
    );
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
    expect(screen.getByTestId('song-view-stub')).toHaveAttribute(
      'data-difficulty',
      'hard',
    );
  });
});

// Splitting stems and the per-row three-dot menu that triggered it are
// dropped from the Songs shelf for the same reason liking is (see the note
// above "SongListView — opening a song"): the row grammar allows exactly
// one right-side evidence mark, and split/goal-setting fought that. The
// split engine itself (useSongList's handleSplit, SplittingQueue) is
// untouched — only this view's trigger is gone. Left for a follow-up lane.

// The separate Online-songs browser (Enchor search, download-to-library)
// is gone with the mode split it lived in: "search what he already has,
// and when nothing matches offer YouTube candidates" replaces it outright
// rather than keeping a fifth source alongside the merged shelf. Picking a
// YouTube result already runs the real auto-import queue — see
// SongSearch.test.tsx and the "offers YouTube candidates" test above.

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

  it('cycles the global difficulty with the difficulty control', async () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a')]);
    // Default global difficulty is Expert; one hi-hat press cycles to Easy.
    view.press('difficulty');
    view.clickSong('a');
    view.chooseGameMode('practice');

    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-difficulty',
      'easy',
    );
  });
});

describe('SongListView — fresh-profile kit navigation', () => {
  it('says nothing about unmapped navigation, instead of the raw config string, before any control is mapped', () => {
    // Regression for docs/design-qa/2026-08-13-finish/critique.md, Songs
    // finding 3: "Navigation unavailable · Set library controls in
    // Configure input" is a debug string about missing settings, not
    // something he would ever say, and it must never reach the primary
    // library view. The real fact belongs in Settings, one intentional
    // action away — the library route says nothing at all instead.
    const view = setupSongListView({
      freshProfile: true,
      settings: { controlMappings: {} },
    });

    view.loadSongs([makeListSong('a')]);
    view.selectView('songs');

    expect(
      screen.queryByTestId('library-control-legend'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Navigation unavailable/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Configure input/i)).not.toBeInTheDocument();
  });

  it('auto-connects a DTX, moves focus, filters, and launches the chosen song directly in Practice', async () => {
    const view = setupSongListView({
      freshProfile: true,
      settings: { controlMappings: {} },
    });

    view.loadSongs([
      makeListSong('a', {
        name: 'Alpha',
        drumDifficulties: ['easy', 'expert'],
      }),
      makeListSong('b', {
        name: 'Beta',
        drumDifficulties: ['easy', 'expert'],
      }),
    ]);
    view.selectView('songs');
    view.emit('midi-device-list', [{ name: 'Yamaha DTX402', port: 2 }]);

    await waitFor(() =>
      expect(view.ipc.sent).toContainEqual({
        channel: 'listen-midi',
        args: [2],
      }),
    );
    view.emit('midi-ready', { port: 2 });

    const legend = screen.getByTestId('library-control-legend');

    expect(legend).toHaveAttribute('data-control-source', 'kit-lanes');
    expect(legend).toHaveTextContent(
      'Tom 1 / Tom 2 move · Snare chooses · Hi-hat filters difficulty · Tom 3 opens sort · Crash backs',
    );
    expect(
      screen.getByTestId('library-kit-control-commands'),
    ).toHaveTextContent('Move');
    expect(
      screen.getByTestId('library-kit-control-commands'),
    ).toHaveTextContent('Sort');
    expect(legend).toHaveTextContent('Local choices open directly in Practice');

    // Tom 3 arms sort-focus mode; Tom 1/Tom 2 then move the highlighted
    // sort option and apply it live instead of moving song focus.
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 43,
      velocity: 100,
    });
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 47,
      velocity: 100,
    });
    expect(screen.getByTestId('sort-option-recent')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Crash backs out of sort-focus mode; Tom 1/Tom 2 return to moving
    // song focus.
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 49,
      velocity: 100,
    });

    // Hi-hat cycles the global difficulty (Expert -> Easy) — no visible
    // chip anymore, so the opened song's own difficulty is the proof.
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 42,
      velocity: 100,
    });

    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 47,
      velocity: 100,
    });
    expect(view.isFocused('a')).toBe(true);
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 47,
      velocity: 100,
    });
    expect(view.isFocused('b')).toBe(true);
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 48,
      velocity: 100,
    });
    expect(view.isFocused('a')).toBe(true);

    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 100,
    });

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'a');
    expect(opened).toHaveAttribute(
      'data-search',
      '?gameMode=practice&practiceSpeed=0.7',
    );
    expect(opened).toHaveAttribute('data-difficulty', 'easy');
    expect(
      screen.queryByTestId('game-mode-selector-modal'),
    ).not.toBeInTheDocument();

    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 42,
      velocity: 100,
    });
    expect(opened).toHaveAttribute('data-difficulty', 'easy');
  });

  it('launches a kit-confirmed song on its own charted difficulty, not the stale global tab', async () => {
    // Regression: a row is `ready` once it has any charted difficulty, but
    // the kit-confirm path used to skip straight to Practice on whatever
    // difficulty tab was globally selected. A song charted only at 'hard'
    // while the global tab sits at the default 'expert' must still open on
    // 'hard' — the honest chart it actually has — never a track it was
    // never charted at.
    const view = setupSongListView({
      freshProfile: true,
      settings: { controlMappings: {} },
    });

    view.loadSongs([
      makeListSong('hard-only', {
        name: 'Hard Only Song',
        drumDifficulties: ['hard'],
      }),
    ]);
    view.selectView('songs');
    view.emit('midi-device-list', [{ name: 'Yamaha DTX402', port: 2 }]);

    await waitFor(() =>
      expect(view.ipc.sent).toContainEqual({
        channel: 'listen-midi',
        args: [2],
      }),
    );
    view.emit('midi-ready', { port: 2 });

    // Tom 1 focuses the one song on the shelf.
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 47,
      velocity: 100,
    });
    expect(view.isFocused('hard-only')).toBe(true);

    // Snare confirms — the kit-only path straight into Practice.
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 100,
    });

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'hard-only');
    expect(opened).toHaveAttribute('data-difficulty', 'hard');
  });

  it('uses crash to return from Songs to Home', () => {
    const deviceId = 'midi:Yamaha DTX402';
    const view = setupSongListView({
      settings: {
        selectedDevice: {
          id: deviceId,
          name: 'Yamaha DTX402',
          sourceId: 'midi',
          port: 2,
        },
        controlMappings: { [deviceId]: {} },
      },
    });

    view.loadSongs([makeListSong('a')]);
    view.selectView('songs');
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 49,
      velocity: 100,
    });

    expect(screen.getByTestId('home-cockpit')).toBeInTheDocument();
  });

  it('preserves an explicit action while every action still works from kit lanes', async () => {
    const deviceId = 'midi:Yamaha DTX402';
    const view = setupSongListView({
      settings: {
        selectedDevice: {
          id: deviceId,
          name: 'Yamaha DTX402',
          sourceId: 'midi',
          port: 2,
        },
        controlMappings: { [deviceId]: { down: ['midi:91'] } },
      },
    });

    view.loadSongs([makeListSong('a')]);
    view.selectView('songs');

    expect(screen.getByTestId('library-control-legend')).toHaveAttribute(
      'data-control-source',
      'mixed',
    );
    expect(screen.getByTestId('library-control-legend')).toHaveTextContent(
      'Explicit: 91 move',
    );
    expect(screen.getByTestId('library-control-legend')).toHaveTextContent(
      'Kit fallback: Tom 1 / Tom 2 move · Snare chooses · Hi-hat filters difficulty · Tom 3 opens sort · Crash backs',
    );
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 47,
      velocity: 100,
    });
    expect(view.isFocused('a')).toBe(true);
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 91,
      velocity: 100,
    });
    expect(view.isFocused('a')).toBe(true);

    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 38,
      velocity: 100,
    });

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'a');
    expect(opened).toHaveAttribute(
      'data-search',
      '?gameMode=practice&practiceSpeed=0.7',
    );
    expect(
      screen.queryByTestId('game-mode-selector-modal'),
    ).not.toBeInTheDocument();
  });
});

describe('SongListView — sort menu navigation', () => {
  it('arms sort-focus mode so up/down changes the applied sort instead of song focus', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a'), makeListSong('b')]);
    expect(screen.getByTestId('sort-option-difficulty')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    view.press('sort');
    view.press('down');

    expect(screen.getByTestId('sort-option-recent')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(view.isFocused('a')).toBe(false);
  });

  it('reorders the list by navigating the sort menu', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeListSong('a', {
        name: 'Alpha',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }),
      makeListSong('b', {
        name: 'Zulu',
        updatedAt: '2026-08-10T00:00:00.000Z',
      }),
    ]);

    // Default sort is difficulty; neither song has a chart or manifest, so
    // both tie and fall back to alphabetical order.
    expect(
      screen.getAllByText(/Alpha|Zulu/).map((el) => el.textContent),
    ).toEqual(['Alpha', 'Zulu']);

    view.press('sort');
    view.press('down');

    expect(
      screen.getAllByText(/Alpha|Zulu/).map((el) => el.textContent),
    ).toEqual(['Zulu', 'Alpha']);
  });

  it('leaves sort-focus mode on back, returning up/down to song focus', () => {
    const view = setupSongListView();

    view.loadSongs([makeListSong('a'), makeListSong('b')]);

    view.press('sort');
    view.press('back');
    view.press('down');

    expect(view.isFocused('a')).toBe(true);
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

    browseAllLibrary();

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
    const view = setupSongListView({ route: '/?coachLesson=18.03' });

    view.loadSongs([
      makeLessonSong('lesson-fill', {
        id: '18.03',
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

  it('shows chain progress and a continue card for the furthest uncleared unlocked lesson', () => {
    const view = setupSongListView();

    view.loadSongs([
      makeLessonSong(
        'lesson-1',
        { id: '01.01', title: 'Warm-Up Groove', starsToUnlock: 0 },
        {
          scoreData: {
            expert: { hitNotes: 50, totalNotes: 100, falseHits: 0 },
          },
        }, // 2 stars — unlocked, not cleared
      ),
    ]);

    view.selectView('lessons');

    expect(screen.getByTestId('lesson-progress-summary')).toHaveTextContent(
      '1 of 1 unlocked · 2 earned',
    );

    const card = screen.getByTestId('lesson-continue-card');

    expect(within(card).getByText('Warm-Up Groove')).toBeInTheDocument();
  });

  it('keeps a formerly gated lesson open with no clear-count gate', () => {
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

    const formerlyGated = screen.getByTestId('lesson-item-01.02');

    expect(formerlyGated).not.toHaveAttribute('data-locked');
    expect(
      within(formerlyGated).queryByText(/Clear \d+ more lesson/),
    ).not.toBeInTheDocument();
  });

  it('opens a formerly gated lesson straight into practice', async () => {
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

    expect(screen.queryByText('This lesson is locked')).not.toBeInTheDocument();
    expect(await screen.findByTestId('song-view-stub')).toHaveAttribute(
      'data-song-id',
      'lesson-2',
    );
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
    view.press('difficulty');

    view.selectView('lessons');

    expect(screen.getByTestId('lesson-item-01.01')).toBeInTheDocument();
  });

  it('arms an unlocked lesson directly in Practice at its highest charted difficulty', async () => {
    const view = setupSongListView({ settings: { difficulty: 'easy' } });

    view.loadSongs([
      makeLessonSong(
        'lesson-1',
        {
          id: '01.01',
          title: 'Warm-Up Groove',
          starsToUnlock: 0,
        },
        { drumDifficulties: ['medium', 'hard'] },
      ),
    ]);

    view.selectView('lessons');
    view.clickLesson('01.01');

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'lesson-1');
    expect(opened).toHaveAttribute(
      'data-search',
      '?gameMode=practice&practiceSpeed=0.8',
    );
    expect(
      screen.queryByTestId('game-mode-selector-modal'),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem('settings.difficulty')).toBe('"hard"');
    });
  });

  it('moves deterministic Journey focus with configured keyboard controls and confirms the selected unlocked lesson', async () => {
    const view = setupSongListView();

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Pulse',
        starsToUnlock: 0,
      }),
      makeLessonSong('lesson-2', {
        id: '01.02',
        title: 'Quarter notes',
        starsToUnlock: 0,
      }),
    ]);

    view.selectView('lessons');

    expect(screen.getByTestId('lesson-item-01.02')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );

    view.press('down');

    expect(screen.getByTestId('lesson-item-01.01')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );

    view.press('confirm');

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'lesson-1');
    expect(opened).toHaveAttribute(
      'data-search',
      '?gameMode=practice&practiceSpeed=0.8',
    );
  });

  it('launches a Journey lesson from fresh DTX lane mappings when control mappings are empty', async () => {
    const deviceId = 'midi:Yamaha DTX402';
    const view = setupSongListView({
      settings: {
        selectedDevice: {
          id: deviceId,
          name: 'Yamaha DTX402',
          sourceId: 'midi',
          port: 2,
        },
        inputMappings: {
          [deviceId]: {
            tom1: ['midi:71'],
            tom2: ['midi:72'],
            snare: ['midi:73'],
            crash: ['midi:74'],
          },
        },
        controlMappings: { [deviceId]: {} },
      },
    });

    view.loadSongs([
      makeLessonSong('lesson-1', {
        id: '01.01',
        title: 'Pulse',
        starsToUnlock: 0,
      }),
      makeLessonSong('lesson-2', {
        id: '01.02',
        title: 'Quarter notes',
        starsToUnlock: 0,
      }),
    ]);
    view.selectView('lessons');

    expect(screen.getByTestId('lesson-item-01.02')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );
    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 71,
      velocity: 100,
    });
    expect(screen.getByTestId('lesson-item-01.01')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );

    view.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note: 74,
      velocity: 100,
    });

    const opened = await screen.findByTestId('song-view-stub');

    expect(opened).toHaveAttribute('data-song-id', 'lesson-1');
    expect(opened).toHaveAttribute(
      'data-search',
      '?gameMode=practice&practiceSpeed=0.8',
    );
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
