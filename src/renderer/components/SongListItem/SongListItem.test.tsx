import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlayabilityEvidence, Song } from '../../../types';
import { OnlineSong } from '../../types';
import { SongListItem } from './SongListItem';

const baseSong = {
  id: 'song-1',
  dir: '/songs/master-of-puppets',
  name: 'Master of Puppets',
  artist: 'Metallica',
  charter: 'DrumCharter',
  drumDifficulty: 5,
  liked: false,
  audio: [{ src: 'song.ogg', name: 'song' }],
  drumDifficulties: ['expert'],
} as unknown as Song;
const passingEvidence: PlayabilityEvidence = {
  identity: {
    title: 'Master of Puppets',
    artists: ['Metallica'],
    durationSeconds: 515,
  },
  audio: { source: 'local-user-attested', sha256: 'a'.repeat(64) },
  chart: {
    source: 'chorus-encore',
    id: 'chart-1',
    sha256: 'b'.repeat(64),
    reviewed: true,
  },
  scan: { passed: true, format: 'chart', drumDifficulties: ['expert'] },
  launch: {
    passed: true,
    mode: 'headless-load',
    verifiedAt: '2026-08-01T00:00:00.000Z',
  },
};

function renderItem(
  songData: Song | OnlineSong,
  overrides: Partial<Parameters<typeof SongListItem>[0]> = {},
) {
  const onClick = vi.fn();

  render(
    <SongListItem
      songData={songData}
      difficulty="expert"
      splitting={false}
      downloadingDisabled={false}
      onLikeChange={() => {}}
      onDownload={() => {}}
      onSplit={() => {}}
      onClick={onClick}
      {...overrides}
    />,
  );

  return { onClick };
}

describe('SongListItem playability', () => {
  it('is playable and clickable for an ordinary local song with audio and a chart', () => {
    const { onClick } = renderItem(baseSong);
    const row = screen.getByTestId('song-item-song-1');

    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('aria-label', 'Play Master of Puppets');
    expect(screen.queryByText('No audio')).not.toBeInTheDocument();
    expect(screen.queryByText('No chart')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs proof')).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('blocks play and explains why when a local song has no audio', () => {
    const { onClick } = renderItem({ ...baseSong, audio: [] });
    const row = screen.getByTestId('song-item-song-1');

    expect(row).not.toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('No audio')).toBeInTheDocument();

    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('blocks play and explains why when a local song has no drum chart', () => {
    const { onClick } = renderItem({ ...baseSong, drumDifficulties: [] });
    const row = screen.getByTestId('song-item-song-1');

    expect(row).not.toHaveAttribute('role', 'button');
    expect(screen.getByText('No chart')).toBeInTheDocument();

    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the existing source-linked "Needs proof" gate for a song missing playability evidence', () => {
    renderItem({ ...baseSong, sourceLinked: true, playability: undefined });

    expect(screen.getByText('Needs proof')).toBeInTheDocument();
    expect(screen.queryByText('No audio')).not.toBeInTheDocument();
    expect(screen.queryByText('No chart')).not.toBeInTheDocument();
  });

  it('is playable once a source-linked song clears full playability evidence', () => {
    renderItem({
      ...baseSong,
      sourceLinked: true,
      playability: passingEvidence,
    });

    const row = screen.getByTestId('song-item-song-1');

    expect(row).toHaveAttribute('role', 'button');
    expect(screen.queryByText('Needs proof')).not.toBeInTheDocument();
  });

  it('leaves an online (not-yet-downloaded) row untouched by the local playability gate', () => {
    const onlineSong: OnlineSong = {
      source: 'online',
      id: 'song-1',
      downloadUrl: 'https://files.enchor.us/song-1.sng',
      name: 'Master of Puppets',
      artist: 'Metallica',
      charter: 'DrumCharter',
      drumDifficulty: 5,
    };
    const { onClick } = renderItem(onlineSong);
    const row = screen.getByTestId('song-item-song-1');

    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
