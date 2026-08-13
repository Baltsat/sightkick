import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Difficulty } from 'scan-chart';
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
  it('renders an honest Drums row and wires check-charts / use-local-audio to the exact track', () => {
    const onResolveSource = vi.fn();
    const onUseLocalAudioForSource = vi.fn();
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
        onUseLocalAudioForSource={onUseLocalAudioForSource}
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

    fireEvent.click(
      screen.getByRole('button', {
        name: /use lawful local audio for natural villain/i,
      }),
    );
    expect(onUseLocalAudioForSource).toHaveBeenCalledWith(track);
  });

  it('disables use-local-audio when no folder is selected and shows a resolved chart label', () => {
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
    ).toHaveTextContent('Chart found · needs your audio');
    expect(
      screen.getByRole('button', { name: /use lawful local audio for loyal/i }),
    ).toBeDisabled();
  });

  it('keeps the check-charts / use-local-audio pair out of the resting row and reveals them only when the row is focused', () => {
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
