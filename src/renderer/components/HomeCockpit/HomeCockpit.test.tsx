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
const recommendation = {
  candidate: {
    id: song.id,
    title: song.name,
    difficulty: 'easy',
  },
  suggestedSpeed: 0.8,
  predictedSuccess: 0.78,
} as never;

describe('HomeCockpit kit home', () => {
  beforeEach(() => {
    installLocalStorage();
    installIpcMock();
  });

  it('starts the same selected practice target from every visible pad', () => {
    const onStartRecommended = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          surface="home"
          songList={[song]}
          difficulty="easy"
          lessonProgress={lessonProgress}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={onStartRecommended}
          onOpenSongs={vi.fn()}
          onOpenJourney={vi.fn()}
          onOpenCoach={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'tom3', 'ride', 'crash'].forEach(
      (element) => {
        fireEvent.click(screen.getByTestId(`kit-hotspot-${element}`));
      },
    );

    expect(onStartRecommended).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId('home-session-manifest')).toHaveAttribute(
      'data-state',
      'count-in',
    );
    expect(screen.getByTestId('home-session-manifest')).toHaveTextContent(
      'Count-in',
    );
  });

  it('starts the same selected practice target from every mapped physical pad', () => {
    window.localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'keyboard',
        name: 'Keyboard',
        sourceId: 'keyboard',
      }),
    );
    window.localStorage.setItem(
      'settings.inputMappings',
      JSON.stringify({
        keyboard: {
          kick: ['keyboard:KeyA'],
          snare: ['keyboard:KeyB'],
          hihat: ['keyboard:KeyC'],
          tom1: ['keyboard:KeyD'],
          tom2: ['keyboard:KeyE'],
          tom3: ['keyboard:KeyF'],
          ride: ['keyboard:KeyG'],
          crash: ['keyboard:KeyH'],
        },
      }),
    );

    const onStartRecommended = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          surface="home"
          songList={[song]}
          difficulty="easy"
          lessonProgress={lessonProgress}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={onStartRecommended}
          onOpenSongs={vi.fn()}
          onOpenJourney={vi.fn()}
          onOpenCoach={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    ['KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH'].forEach(
      (code) => fireEvent.keyDown(window, { code }),
    );

    expect(onStartRecommended).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId('home-session-status')).toHaveTextContent(
      'Count-in for Practice song',
    );
  });

  it('keeps pads on the armed home when no target is selected', () => {
    const onOpenSongs = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          surface="home"
          songList={[song]}
          difficulty="easy"
          lessonProgress={lessonProgress}
          gamification={gamification}
          onStartRecommended={vi.fn()}
          onOpenSongs={onOpenSongs}
          onOpenJourney={vi.fn()}
          onOpenCoach={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    fireEvent.click(screen.getByTestId('kit-hotspot-snare'));

    expect(onOpenSongs).not.toHaveBeenCalled();
    expect(screen.queryByText('Songs')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('home-choose-song'));

    expect(onOpenSongs).toHaveBeenCalledTimes(1);
  });
});
