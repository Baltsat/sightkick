import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../../../types';
import type { LessonProgress } from '../../hooks/useLessons';
import type { UseGamificationResult } from '../../hooks/useGamification';
import { InputProvider } from '../../context/InputContext';
import type { RunSummary } from '../../services/practice-stats';
import { installIpcMock, installLocalStorage } from '../../hooks/test-support';
import { HomeCockpit } from './HomeCockpit';

vi.mock('../../services/kit-preview-audio', () => ({
  playKitPreview: vi.fn(),
}));

function run(index: number): RunSummary {
  return {
    completedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    totalHits: 100,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 1,
    laneAccuracy: [
      { element: 'kick', hits: 50, misses: 0, accuracy: 1 },
      { element: 'snare', hits: 50, misses: 0, accuracy: 1 },
    ],
    laneBias: [],
    timingBias: {
      meanMs: 0,
      medianMs: 0,
      spreadMs: 0,
      earlyCount: 0,
      lateCount: 0,
      onTimeCount: 100,
      sampleCount: 100,
    },
    wrongHitCounts: [],
    playbackSpeed: 1,
    bestStreak: 32,
  };
}

const song = {
  id: 'song-1',
  name: 'Practice song',
  artist: 'Drumroll',
} as Song;
const lessonProgress = {
  entries: [],
  groups: [],
  totalLessons: 0,
  unlockedCount: 0,
  totalStars: 0,
  clearedCount: 0,
} as LessonProgress;
const gamification = {
  streak: { current: 0 },
  todayXp: 0,
  goalXp: 100,
  totalStars: 0,
  runsBySong: {
    'song-1': Array.from({ length: 12 }, (_, index) => run(index)),
  },
} as unknown as UseGamificationResult;

describe('HomeCockpit kit color maturity', () => {
  beforeEach(() => {
    installLocalStorage();
    installIpcMock();
  });

  it('renders shared lane color variables and lets the player restore full colour', () => {
    render(
      <InputProvider>
        <HomeCockpit
          surface="home"
          songList={[song]}
          difficulty="easy"
          lessonProgress={lessonProgress}
          gamification={gamification}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenJourney={vi.fn()}
          onOpenCoach={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    const cockpit = screen.getByTestId('home-cockpit');

    expect(cockpit.style.getPropertyValue('--kit-color-vividness')).not.toBe(
      '100.0%',
    );

    fireEvent.change(screen.getByTestId('home-kit-color-override'), {
      target: { value: 'full-color' },
    });

    expect(cockpit).toHaveAttribute('data-kit-color-mode', 'full-color');
    expect(cockpit.style.getPropertyValue('--kit-color-vividness')).toBe(
      '100.0%',
    );
  });
});
