import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Song } from '../../../types';
import { Goal } from './useGoals';
import { SetGoalModal } from './SetGoalModal';

function song(overrides: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    dir: '/songs/song-1',
    name: 'Some Song',
    artist: 'Some Artist',
    album: 'Some Album',
    charter: 'Charter',
    genre: 'Metal',
    year: '2020',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 5,
    format: 'chart',
    audio: [],
    ...overrides,
  };
}

const songList = [
  song(),
  song({ id: 'song-2', name: 'Another Song', artist: 'Another Artist' }),
];

describe('SetGoalModal', () => {
  it('is hidden when closed', () => {
    render(
      <SetGoalModal
        open={false}
        onClose={() => {}}
        songList={songList}
        onSave={() => {}}
      />,
    );

    expect(screen.queryByTestId('set-goal-modal')).not.toBeInTheDocument();
  });

  it('renders with a preselected song and defaults difficulty to expert', () => {
    render(
      <SetGoalModal
        open
        onClose={() => {}}
        songList={songList}
        initialSongId="song-1"
        onSave={() => {}}
      />,
    );

    expect(screen.getByText('Set a goal')).toBeInTheDocument();
    expect(screen.getByText('Some Song — Some Artist')).toBeInTheDocument();
  });

  it('calls onSave with the form values, defaulting isPrimary to isFirstGoal', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SetGoalModal
        open
        onClose={onClose}
        songList={songList}
        initialSongId="song-1"
        isFirstGoal
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId('save-goal-button'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        songId: 'song-1',
        difficulty: 'expert',
        isPrimary: true,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('disables saving until a song is picked', () => {
    render(
      <SetGoalModal
        open
        onClose={() => {}}
        songList={songList}
        onSave={() => {}}
      />,
    );

    expect(screen.getByTestId('save-goal-button')).toBeDisabled();
  });

  it('pre-fills the form from an existing goal when editing', () => {
    const editingGoal: Goal = {
      id: 'g1',
      songId: 'song-2',
      difficulty: 'hard',
      targetDate: '2026-12-25',
      createdAt: '2026-01-01T00:00:00.000Z',
      isPrimary: true,
    };

    render(
      <SetGoalModal
        open
        onClose={() => {}}
        songList={songList}
        editingGoal={editingGoal}
        onSave={() => {}}
      />,
    );

    expect(screen.getByText('Edit goal')).toBeInTheDocument();
    expect(
      screen.getByText('Another Song — Another Artist'),
    ).toBeInTheDocument();
  });
});
