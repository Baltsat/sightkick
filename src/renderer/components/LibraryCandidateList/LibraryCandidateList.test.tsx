import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Difficulty } from 'scan-chart';
import songArtPlaceholder from '../../../../assets/song-art-placeholder.svg';
import {
  YandexLibraryCandidateSources,
  YandexPlaylistCandidate,
} from '../../../types';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { HOVER_PREVIEW_INTENT_MS } from '../../services/song-hover-preview';
import { build_unified_library } from '../../services/library/unified-library';
import { makeListSong } from '../../views/test-support';
import { LibraryCandidateList } from './LibraryCandidateList';

// jsdom reports a zero-size scroll container, so the real virtualizer would
// render nothing to query against. Mirrors the mock SongListView.test.tsx
// uses for the same reason.
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

const DIFFICULTY: Difficulty = 'expert';

function sourceTrack(
  id: string,
  title: string,
  extra: Partial<YandexPlaylistCandidate> = {},
): YandexPlaylistCandidate {
  return {
    id,
    ordinal: 1,
    title,
    artists: ['Artist'],
    durationSeconds: 180,
    sourceTrackUrl: 'https://music.yandex.ru/track/1',
    sourceAvailability: 'available',
    sourceReferenceStatus: 'stable-link',
    localStatus: 'candidate',
    practiceStatus: 'needs-local-chart',
    ...extra,
  };
}

function sources(
  drums: readonly YandexPlaylistCandidate[],
): YandexLibraryCandidateSources {
  const collection = (
    name: string,
    tracks: readonly YandexPlaylistCandidate[],
  ) => ({
    schemaVersion: 2 as const,
    source: 'yandex-music' as const,
    playlist: {
      id: name,
      name,
      url: '',
      capturedOn: '',
      capturedAt: '',
      captureMethod: 'authenticated-visible-dom' as const,
      captureSurface: 'Yandex Music playlist track rows' as const,
      metadataScope: 'metadata only',
      rightsScope: 'metadata-only' as const,
    },
    completeness: {
      declaredTrackCount: tracks.length,
      renderedTrackCount: tracks.length,
      stableSourceTrackUrlCount: tracks.length,
      noVisibleStableSourceTrackUrlOrdinals: [],
      privateOnlyOrdinals: [],
    },
    integrity: { canonicalization: 'test', canonicalSha256: 'a'.repeat(64) },
    tracks: [...tracks],
  });

  return {
    drums: collection('Drums', drums),
    favorites: collection('Favorites', []),
  };
}

let ipc: IpcMock;

beforeEach(() => {
  ipc = installIpcMock();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LibraryCandidateList — song rows', () => {
  it('uses neutral song art when a library song has no album cover', () => {
    const entries = build_unified_library({
      songs: [makeListSong('artless-song', { name: 'Artless Song' })],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    const artwork = screen
      .getByTestId('song-item-artless-song')
      .querySelector('img');

    expect(artwork).toHaveAttribute('src', songArtPlaceholder);

    fireEvent.error(artwork!);

    expect(artwork).toHaveAttribute('src', songArtPlaceholder);
  });

  it('plays a ready song row on click and never acts playable when not ready', () => {
    const onPlaySong = vi.fn();
    const ready = makeListSong('ready-song', { name: 'Ready Song' });
    const notReady = makeListSong('unready-song', {
      name: 'Unready Song',
      audio: [],
      drumDifficulties: undefined,
    });
    const entries = build_unified_library({
      songs: [ready, notReady],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={onPlaySong}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('song-item-ready-song'));
    expect(onPlaySong).toHaveBeenCalledWith('ready-song');

    const unreadyRow = screen.getByTestId('song-item-unready-song');

    expect(unreadyRow).toHaveAttribute('aria-disabled', 'true');
    expect(unreadyRow).not.toHaveAttribute('role', 'button');
    fireEvent.click(unreadyRow);
    expect(onPlaySong).toHaveBeenCalledOnce();
    expect(
      screen.getByLabelText('Unready Song is not playable yet'),
    ).toHaveTextContent('Needs a playable drum chart');
  });

  it('keeps the favourite control available on a ready library row', () => {
    const onLikeChange = vi.fn();
    const song = makeListSong('favourite-song', { name: 'Favourite Song' });
    const entries = build_unified_library({
      songs: [song],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onLikeChange={onLikeChange}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    fireEvent.click(
      within(screen.getByTestId('song-item-favourite-song')).getByTestId(
        'like-toggle',
      ),
    );

    expect(onLikeChange).toHaveBeenCalledWith('favourite-song', true);
  });

  it('marks the focused row and starts/stops hover preview only for a ready row', async () => {
    vi.useFakeTimers();

    const ready = makeListSong('ready-song', { name: 'Ready Song' });
    const entries = build_unified_library({
      songs: [ready],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        focusedIndex={0}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    const row = screen.getByTestId('song-item-ready-song');

    expect(row).toHaveAttribute('data-focused', 'true');

    fireEvent.pointerEnter(row);
    await act(async () => {
      vi.advanceTimersByTime(HOVER_PREVIEW_INTENT_MS);
    });

    expect(ipc.sent).toContainEqual({
      channel: 'load-song',
      args: ['ready-song'],
    });

    fireEvent.pointerLeave(row);
  });

  it('does not expose local-audio import from a not-ready source-linked song row', () => {
    const linked = makeListSong('linked-song', {
      name: 'Linked Song',
      audio: [],
      drumDifficulties: undefined,
      sourceProvenance: {
        provider: 'yandex-music',
        collectionId: 'drums',
        collectionName: 'Drums',
        trackId: 'track-1',
        title: 'Linked Song',
        artists: ['Artist'],
        durationSeconds: 180,
      },
    });
    const entries = build_unified_library({
      songs: [linked],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        focusedIndex={0}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /local audio/i }),
    ).not.toBeInTheDocument();
  });

  it('offers no fix action for a not-ready song with no source provenance', () => {
    const notReady = makeListSong('plain-unready', {
      name: 'Plain Unready',
      audio: [],
      drumDifficulties: undefined,
    });
    const entries = build_unified_library({
      songs: [notReady],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        focusedIndex={0}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
        onUseLocalAudioForSong={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /use lawful local audio/i }),
    ).not.toBeInTheDocument();
  });

  it('never starts a hover preview for a not-ready row', async () => {
    vi.useFakeTimers();

    const notReady = makeListSong('unready-song', {
      name: 'Unready Song',
      audio: [],
      drumDifficulties: undefined,
    });
    const entries = build_unified_library({
      songs: [notReady],
      sources: sources([]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    fireEvent.pointerEnter(screen.getByTestId('song-item-unready-song'));
    await act(async () => {
      vi.advanceTimersByTime(HOVER_PREVIEW_INTENT_MS);
    });

    expect(ipc.sent).toEqual([]);
  });
});

describe('LibraryCandidateList — source rows', () => {
  it('uses neutral song art for an unresolved source row', () => {
    const entries = build_unified_library({
      songs: [],
      sources: sources([sourceTrack('source-artless', 'Artless Source')]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('library-candidate-Drums-1').querySelector('img'),
    ).toHaveAttribute('src', songArtPlaceholder);
  });

  it('renders an honest Drums row and wires only chart lookup to the exact track', () => {
    const onResolveSource = vi.fn();
    const track = sourceTrack('source-1', 'Natural Villain');
    const entries = build_unified_library({
      songs: [],
      sources: sources([track]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={onResolveSource}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('library-candidate-state-Drums-1'),
    ).toHaveTextContent('Not in your library yet');

    fireEvent.click(
      screen.getByRole('button', {
        name: /check reviewed public drum charts for natural villain/i,
      }),
    );
    expect(onResolveSource).toHaveBeenCalledWith(track);

    expect(
      screen.queryByRole('button', { name: /local audio/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the resolved chart label without exposing local-audio import', () => {
    const track = sourceTrack('source-2', 'Loyal');
    const entries = build_unified_library({
      songs: [],
      sources: sources([track]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio={false}
        resolutions={{
          'source-2': {
            trackId: 'source-2',
            status: 'exact-reviewed-chart',
            rejected: [],
            blockers: [],
          },
        }}
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('library-candidate-state-Drums-1'),
    ).toHaveTextContent('Chart found · search to add');
    expect(
      screen.queryByRole('button', { name: /local audio/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps chart lookup out of the resting row and reveals it only when the row is focused', () => {
    const track = sourceTrack('source-3', 'Wantchya');
    const entries = build_unified_library({
      songs: [],
      sources: sources([track]),
      now: '2026-08-12T00:00:00.000Z',
    });
    const { rerender } = render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );
    const actions = screen.getByTestId('library-candidate-actions-Drums-1');

    expect(actions).toHaveClass('opacity-0');
    expect(actions).not.toHaveClass('opacity-100');

    rerender(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        focusedIndex={0}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    expect(screen.getByTestId('library-candidate-actions-Drums-1')).toHaveClass(
      'opacity-100',
    );
  });

  it('never shows the raw pipeline label — only plain human copy', () => {
    const track = sourceTrack('source-4', 'Sanctuary');
    const entries = build_unified_library({
      songs: [],
      sources: sources([track]),
      now: '2026-08-12T00:00:00.000Z',
    });

    render(
      <LibraryCandidateList
        entries={entries}
        difficulty={DIFFICULTY}
        canUseLocalAudio
        onPlaySong={vi.fn()}
        onResolveSource={vi.fn()}
        onUseLocalAudioForSource={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('library-candidate-state-Drums-1'),
    ).toHaveTextContent('Not in your library yet');
    expect(screen.queryByText(/reviewed chart/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/local audio \+/i)).not.toBeInTheDocument();
  });
});
