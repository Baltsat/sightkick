import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../../../types';
import type { UseGamificationResult } from '../../hooks/useGamification';
import { InputProvider } from '../../context/InputContext';
import type { RunSummary } from '../../services/practice-stats';
import type {
  PracticeWaveResult,
  RankedPracticeCandidate,
} from '../../services/next-practice';
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
const lessonSong = {
  id: 'lesson-1',
  name: 'Kick independence',
  artist: 'Drumroll Method',
  lesson: true,
} as unknown as Song;
const lessonRecommendation = {
  candidate: {
    id: lessonSong.id,
    title: lessonSong.name,
    kind: 'lesson',
    difficulty: 'easy',
    available: true,
  },
  score: 88,
  predictedSuccess: 0.76,
  suggestedSpeed: 0.8,
  mastery: 20,
  reason: '2 saved Coach findings route directly to this lesson.',
  factors: [],
  confidence: {
    value: 0.7,
    level: 'medium',
    evidenceRuns: 2,
    detail: 'Saved Coach evidence is available.',
  },
} satisfies RankedPracticeCandidate;
const songRecommendation = {
  candidate: {
    id: song.id,
    title: song.name,
    kind: 'song',
    difficulty: 'easy',
    available: true,
    liked: true,
  },
  score: 80,
  predictedSuccess: 0.78,
  suggestedSpeed: 0.9,
  mastery: 28,
  reason: 'A liked song is available for musical application.',
  factors: [],
  confidence: {
    value: 0.7,
    level: 'medium',
    evidenceRuns: 2,
    detail: 'Saved Coach evidence is available.',
  },
} satisfies RankedPracticeCandidate;
const practiceWave: PracticeWaveResult = {
  strategy: 'skill-linked',
  stops: [
    {
      role: 'focus',
      recommendation: lessonRecommendation,
      reason: '2 saved Coach findings route directly to this lesson.',
      linkedSkills: ['kick-independence'],
    },
    {
      role: 'apply',
      recommendation: songRecommendation,
      reason: 'Apply the focused skill in a liked song.',
      linkedSkills: ['kick-independence'],
    },
  ],
  focusSkills: ['kick-independence'],
};

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
          songList={[song]}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={onStartRecommended}
          onOpenSongs={vi.fn()}
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
    expect(screen.getByTestId('home-session-status')).toHaveTextContent(
      'Count-in for Practice song',
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
          songList={[song]}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={onStartRecommended}
          onOpenSongs={vi.fn()}
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

  it('takes every kit surface to the single song chooser when no target is selected', () => {
    const onOpenSongs = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          songList={[song]}
          gamification={gamification}
          onStartRecommended={vi.fn()}
          onOpenSongs={onOpenSongs}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'tom3', 'ride', 'crash'].forEach(
      (element) =>
        fireEvent.click(screen.getByTestId(`kit-hotspot-${element}`)),
    );

    expect(onOpenSongs).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId('home-choose-song')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('home-choose-song'));

    expect(onOpenSongs).toHaveBeenCalledTimes(9);
  });

  it('keeps one composed session behind the compact disclosure', () => {
    const onStartSession = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          songList={[lessonSong, song]}
          gamification={gamification}
          recommendation={lessonRecommendation}
          practiceRanking={[lessonRecommendation, songRecommendation]}
          practiceWave={practiceWave}
          onStartRecommended={vi.fn()}
          onStartSession={onStartSession}
          onOpenSongs={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    expect(screen.getByTestId('home-session-summary')).toHaveTextContent(
      'Practice song',
    );
    expect(screen.getByTestId('home-session-summary')).not.toHaveTextContent(
      'Californication',
    );

    fireEvent.click(screen.getByTestId('kit-hotspot-kick'));

    expect(onStartSession).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'learning',
        size: 'full',
        launch: expect.objectContaining({
          candidate: expect.objectContaining({ id: lessonSong.id }),
        }),
      }),
    );
  });

  it('keeps the player state, streak, goal, and profile route on Home', () => {
    const onOpenProfile = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          songList={[song]}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenProfile={onOpenProfile}
        />
      </InputProvider>,
    );

    expect(screen.getByTestId('home-profile-snapshot')).toHaveTextContent(
      'No active streak',
    );
    expect(screen.getByTestId('home-profile-snapshot')).toHaveTextContent(
      'Today · 0 / 100 XP',
    );

    fireEvent.click(screen.getByTestId('home-open-profile'));

    expect(onOpenProfile).toHaveBeenCalledOnce();
  });
});
