import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installIpcMock, IpcMock } from '../../hooks/test-support';
import { Song } from '../../../types';
import { UseGamificationResult } from '../../hooks/useGamification';
import { Goal } from '../Goals';
import { ProfileView } from './ProfileView';

let ipc: IpcMock;

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

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    songId: 'song-1',
    difficulty: 'expert',
    createdAt: '2026-01-01T00:00:00.000Z',
    isPrimary: true,
    ...overrides,
  };
}

function gamification(
  overrides: Partial<UseGamificationResult> = {},
): UseGamificationResult {
  return {
    isLoaded: true,
    days: {},
    streak: { current: 3, longest: 7 },
    todayXp: 20,
    goalXp: 50,
    goalOption: 'casual',
    setGoalOption: vi.fn(),
    goalCrossedToday: false,
    weekActivity: [false, false, false, false, false, false, false],
    totalStars: 12,
    achievements: [],
    laneAccuracy: [],
    recentLaneSignals: [],
    latestRun: undefined,
    loadAchievements: vi.fn(),
    recordRun: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  ipc = installIpcMock();
});

describe('ProfileView', () => {
  it('shows a loading state before goals load', () => {
    render(
      <ProfileView
        songList={[song()]}
        goals={[]}
        isGoalsLoaded={false}
        onSaveGoal={() => {}}
        onSetPrimaryGoal={() => {}}
        gamification={gamification()}
      />,
    );

    expect(screen.getByTestId('profile-view-loading')).toBeInTheDocument();
  });

  it('shows the empty state and a call to action when there are no goals', () => {
    render(
      <ProfileView
        songList={[song()]}
        goals={[]}
        isGoalsLoaded
        onSaveGoal={() => {}}
        onSetPrimaryGoal={() => {}}
        gamification={gamification()}
      />,
    );

    expect(screen.getByTestId('no-goals-empty-state')).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-lane-accuracy-definition'),
    ).toHaveTextContent(
      'Unweighted hit / (hit + miss) across scored lane notes in the last 30 days.',
    );
    expect(
      screen.getByRole('button', { name: /set your first goal/i }),
    ).toBeInTheDocument();
  });

  it('renders the all-history archive model supplied by the shared gamification hook', () => {
    render(
      <ProfileView
        songList={[song()]}
        goals={[]}
        isGoalsLoaded
        onSaveGoal={() => {}}
        onSetPrimaryGoal={() => {}}
        gamification={gamification({
          longitudinalProgress: {
            allTime: {
              runCount: 3,
              scoredNoteCount: 240,
              wrongHitCount: 4,
              accuracy: 0.9,
              meanTimingMs: 3,
              timingSampleCount: 180,
            },
            months: [],
            archivedRunCount: 2,
            recentRunCount: 1,
            aggregateOnlyArchivedRunCount: 2,
            unknownDateRunCount: 0,
            omittedActiveMonthCount: 0,
          },
        })}
      />,
    );

    expect(screen.getByTestId('profile-practice-history')).toHaveTextContent(
      '2 archived + 1 recent',
    );
    expect(screen.getByTestId('profile-practice-history')).toHaveTextContent(
      'Historical detail unavailable',
    );
  });

  it('renders the goal card and stat chips once a primary goal exists, resolving run history via the existing IPC channels', async () => {
    render(
      <ProfileView
        songList={[song()]}
        goals={[goal()]}
        isGoalsLoaded
        onSaveGoal={() => {}}
        onSetPrimaryGoal={() => {}}
        gamification={gamification()}
      />,
    );

    expect(ipc.sent).toContainEqual({
      channel: 'load-practice-runs',
      args: ['song-1'],
    });
    expect(ipc.sent).toContainEqual({
      channel: 'load-all-practice-runs',
      args: [],
    });

    await act(async () => {
      ipc.emit('load-practice-runs', { songId: 'song-1', runs: [] });
      ipc.emit('load-all-practice-runs', { runs: [] });
    });

    expect(screen.getByTestId('goal-card')).toBeInTheDocument();
    expect(screen.getAllByTestId('profile-stat-chip')).toHaveLength(3);
    expect(screen.getByTestId('xp-skill-line')).toBeInTheDocument();
  });

  it('shows a goal switcher when more than one goal exists', () => {
    render(
      <ProfileView
        songList={[song(), song({ id: 'song-2', name: 'Second Song' })]}
        goals={[goal(), goal({ id: 'g2', songId: 'song-2', isPrimary: false })]}
        isGoalsLoaded
        onSaveGoal={() => {}}
        onSetPrimaryGoal={() => {}}
        gamification={gamification()}
      />,
    );

    expect(screen.getByTestId('goal-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('goal-tab-g1')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps a retired lesson goal and its saved evidence readable', async () => {
    render(
      <ProfileView
        songList={[]}
        goals={[goal({ songId: 'legacy-song-id' })]}
        isGoalsLoaded
        onSaveGoal={() => {}}
        onSetPrimaryGoal={() => {}}
        gamification={gamification()}
      />,
    );

    expect(ipc.sent).toContainEqual({
      channel: 'load-retired-lessons',
      args: [],
    });

    await act(async () => {
      ipc.emit('load-retired-lessons', {
        lessons: [
          {
            legacySongIds: ['legacy-song-id'],
            lessonId: '05.06',
            name: 'Lesson 05.06 — Roadhouse Cat',
            bestStars: 4,
            recentRunCount: 2,
            fullRunCount: 1,
            archivedRunCount: 3,
            goalCount: 1,
          },
        ],
      });
      ipc.emit('load-practice-runs', {
        songId: 'legacy-song-id',
        runs: [],
      });
      ipc.emit('load-all-practice-runs', { runs: [] });
    });

    expect(screen.getByTestId('retired-goal-notice')).toHaveTextContent(
      'does not unlock the new Journey',
    );
    expect(screen.getByTestId('retired-lessons-history')).toHaveTextContent(
      'Lesson 05.06 — Roadhouse Cat',
    );
    expect(screen.getByTestId('retired-lessons-history')).toHaveTextContent(
      '4 stars · 5 runs · 1 saved goal',
    );
    expect(screen.getAllByText('Lesson 05.06 — Roadhouse Cat')).toHaveLength(2);
  });
});
