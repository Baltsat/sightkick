import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../../../types';
import type { UseGamificationResult } from '../../hooks/useGamification';
import { InputProvider } from '../../context/InputContext';
import type { RunSummary } from '../../services/practice-stats';
import type {
  HomeSessionReceipt,
  PracticeWaveResult,
  RankedPracticeCandidate,
} from '../../services/next-practice';
import { localDateKey, type PracticeDays } from '../../services/streaks';
import { installIpcMock, installLocalStorage } from '../../hooks/test-support';
import {
  describeGoalProgress,
  describeStreak,
  HomeCockpit,
  liveDailyProgress,
  resolveShelfCopy,
} from './HomeCockpit';

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

  it('renders a real stored day that far exceeds the goal as complete, never as a raw fraction', () => {
    // This is the exact shape of the reported defect: a stored day of
    // xp: 411 against a 50 XP goal, shown next to a genuine 1-day streak.
    const exceededGamification = {
      ...gamification,
      streak: { current: 1 },
      todayXp: 411,
      goalXp: 50,
    } as unknown as UseGamificationResult;

    render(
      <InputProvider>
        <HomeCockpit
          songList={[song]}
          gamification={exceededGamification}
          recommendation={recommendation}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    const snapshot = screen.getByTestId('home-profile-snapshot');

    expect(snapshot).toHaveTextContent('1-day streak');
    expect(snapshot).toHaveTextContent('Set complete · 411 XP');
    expect(snapshot).not.toHaveTextContent('411 / 50');
  });
});

describe('describeStreak', () => {
  it('names zero as no active streak, not "0-day streak"', () => {
    expect(describeStreak(0)).toBe('No active streak');
  });

  it('keeps a single day singular', () => {
    expect(describeStreak(1)).toBe('1-day streak');
  });

  it('pluralises many days', () => {
    expect(describeStreak(2)).toBe('2-day streak');
    expect(describeStreak(30)).toBe('30-day streak');
  });
});

describe('describeGoalProgress', () => {
  it('reads zero as a plain fraction, not "complete"', () => {
    expect(describeGoalProgress(0, 50)).toBe('Today · 0 / 50 XP');
  });

  it('reads partway progress as a fraction', () => {
    expect(describeGoalProgress(25, 50)).toBe('Today · 25 / 50 XP');
  });

  it('reads exactly meeting the goal as complete', () => {
    expect(describeGoalProgress(50, 50)).toBe('Set complete · 50 XP');
  });

  it('reads far exceeding the goal as complete with the real total, never a fraction past 100%', () => {
    expect(describeGoalProgress(411, 50)).toBe('Set complete · 411 XP');
  });
});

describe('liveDailyProgress', () => {
  it('falls back to the hook-provided numbers when no days map is available', () => {
    const fixture = {
      days: undefined,
      todayXp: 42,
      streak: { current: 3 },
    } as unknown as UseGamificationResult;

    expect(liveDailyProgress(fixture)).toEqual({
      todayXp: 42,
      streakCurrent: 3,
    });
  });

  it('prefers the live days map over a stale hook-provided number for today', () => {
    const now = new Date(2026, 7, 13, 10, 0, 0);
    const days: PracticeDays = {
      [localDateKey(now)]: { runs: 1, stars: 1, minutes: 12, xp: 65 },
    };
    const fixture = {
      days,
      // Deliberately wrong, to prove the live days map wins.
      todayXp: 999,
      streak: { current: 0 },
    } as unknown as UseGamificationResult;

    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      expect(liveDailyProgress(fixture)).toEqual({
        todayXp: 65,
        streakCurrent: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls over honestly at local midnight: yesterday still counts, today starts at zero', () => {
    const yesterday = new Date(2026, 7, 12, 21, 0, 0);
    const now = new Date(2026, 7, 13, 0, 30, 0);
    const days: PracticeDays = {
      [localDateKey(yesterday)]: { runs: 1, stars: 1, minutes: 20, xp: 80 },
    };
    // Stale numbers a hook instance computed before midnight, if nothing
    // re-rendered its owner since - the exact staleness liveDailyProgress
    // exists to correct.
    const fixture = {
      days,
      todayXp: 80,
      streak: { current: 1 },
    } as unknown as UseGamificationResult;

    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      // "Yesterday continues" (streaks.ts): the streak still reads 1 even
      // though today has no run yet. Today's own XP, though, is honestly 0
      // - it must not still show yesterday's total.
      expect(liveDailyProgress(fixture)).toEqual({
        todayXp: 0,
        streakCurrent: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveShelfCopy', () => {
  it('shows the choose-a-song state when there is no session at all', () => {
    expect(resolveShelfCopy(undefined)).toEqual({
      title: 'Choose a song to begin',
      detail: 'Pick a song, then strike a highlighted drum to start.',
    });
  });

  it('never surfaces next-practice/home-session.ts own dead-end placeholder verbatim', () => {
    const deadEnd: HomeSessionReceipt = {
      title: 'No musical payoff yet',
      detail: 'No playable favourite-song section is currently ranked.',
    };

    expect(resolveShelfCopy(deadEnd)).toEqual({
      title: 'Choose a song to begin',
      detail: 'Pick a song, then strike a highlighted drum to start.',
    });
  });

  it('passes a real payoff receipt through unchanged', () => {
    const payoff: HomeSessionReceipt = {
      title: 'Boulevard of Broken Dreams',
      detail:
        'Apply the session in your goal song. A safe section probe will appear when chart evidence supports one.',
      candidateId: 'song-1',
    };

    expect(resolveShelfCopy(payoff)).toEqual({
      title: payoff.title,
      detail: payoff.detail,
    });
  });
});
