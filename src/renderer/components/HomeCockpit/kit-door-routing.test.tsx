import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../../../types';
import { InputProvider } from '../../context/InputContext';
import type { UseGamificationResult } from '../../hooks/useGamification';
import { installIpcMock, installLocalStorage } from '../../hooks/test-support';
import type { RankedPracticeCandidate } from '../../services/next-practice';
import { HomeCockpit, rankHomeTopSongs } from './HomeCockpit';
import { HOME_KIT_DOORS } from './kit-zone-map';

const lesson = {
  id: 'lesson:next',
  name: 'Pulse Through the Bar',
  artist: 'Drumroll Method',
  lesson: { id: '02.03', title: 'Pulse Through the Bar' },
} as Song;
const topOne = {
  id: 'song:one',
  name: 'Slow Parade',
  artist: 'The Practice Set',
} as Song;
const topTwo = {
  id: 'song:two',
  name: 'Night Drive',
  artist: 'The Practice Set',
} as Song;
const topThree = {
  id: 'song:three',
  name: 'Paper Lanterns',
  artist: 'The Practice Set',
} as Song;

function ranked(song: Song, kind: 'lesson' | 'song'): RankedPracticeCandidate {
  return {
    candidate: {
      id: song.id,
      title: song.name,
      kind,
      difficulty: 'easy',
      available: true,
    },
    score: 80,
    predictedSuccess: 0.76,
    suggestedSpeed: 0.8,
    mastery: 24,
    reason: 'Saved practice evidence keeps this route current.',
    factors: [],
    confidence: {
      value: 0.8,
      level: 'high',
      evidenceRuns: 3,
      detail: 'Three saved runs support this route.',
    },
  };
}

function runs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    completedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
  })) as never;
}

const runsBySong = {
  [topOne.id]: runs(9),
  [topTwo.id]: runs(6),
  [topThree.id]: runs(3),
} as UseGamificationResult['runsBySong'];
const gamification = {
  streak: { current: 0 },
  todayXp: 0,
  goalXp: 100,
  totalStars: 0,
  runsBySong,
} as unknown as UseGamificationResult;
const ranking = [
  ranked(lesson, 'lesson'),
  ranked(topOne, 'song'),
  ranked(topTwo, 'song'),
  ranked(topThree, 'song'),
];

describe('kit launcher doors', () => {
  beforeEach(() => {
    installLocalStorage();
    installIpcMock();
  });

  it('keeps the door map complete and the top-song order deterministic', () => {
    expect(HOME_KIT_DOORS).toEqual({
      kick: 'continue',
      snare: 'my-wave',
      hihat: 'next-lesson',
      ride: 'songs',
      crash: 'discover',
      tom1: 'top-song-1',
      tom2: 'top-song-2',
      tom3: 'top-song-3',
    });
    expect(
      rankHomeTopSongs([topThree, topOne, topTwo], runsBySong).map(
        ({ id }) => id,
      ),
    ).toEqual([topOne.id, topTwo.id, topThree.id]);
  });

  it('routes every labelled drum to its actual destination', () => {
    const onStartSession = vi.fn();
    const onOpenSongs = vi.fn();
    const onOpenJourney = vi.fn();
    const onFindNewMusic = vi.fn();
    const onStartSong = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          songList={[lesson, topOne, topTwo, topThree]}
          gamification={gamification}
          recommendation={ranking[0]}
          practiceRanking={ranking}
          onStartRecommended={vi.fn()}
          onStartSession={onStartSession}
          onOpenSongs={onOpenSongs}
          onOpenJourney={onOpenJourney}
          onFindNewMusic={onFindNewMusic}
          onStartSong={onStartSong}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    expect(screen.getByTestId('kit-hotspot-kick')).toHaveTextContent(
      'Continue',
    );
    expect(screen.getByTestId('kit-hotspot-snare')).toHaveTextContent(
      'My Wave',
    );
    expect(screen.getByTestId('kit-hotspot-hihat')).toHaveTextContent(
      'Next lesson',
    );
    expect(screen.getByTestId('kit-hotspot-ride')).toHaveTextContent(
      'Your songs',
    );
    expect(screen.getByTestId('kit-hotspot-crash')).toHaveTextContent(
      'Find new',
    );
    expect(screen.getByTestId('kit-hotspot-tom1')).toHaveTextContent(
      topOne.name,
    );
    expect(screen.getByTestId('kit-hotspot-tom2')).toHaveTextContent(
      topTwo.name,
    );
    expect(screen.getByTestId('kit-hotspot-tom3')).toHaveTextContent(
      topThree.name,
    );

    fireEvent.click(screen.getByTestId('kit-hotspot-kick'));
    fireEvent.click(screen.getByTestId('kit-hotspot-snare'));
    fireEvent.click(screen.getByTestId('kit-hotspot-hihat'));
    fireEvent.click(screen.getByTestId('kit-hotspot-ride'));
    fireEvent.click(screen.getByTestId('kit-hotspot-crash'));
    fireEvent.click(screen.getByTestId('kit-hotspot-tom1'));
    fireEvent.click(screen.getByTestId('kit-hotspot-tom2'));
    fireEvent.click(screen.getByTestId('kit-hotspot-tom3'));

    expect(onStartSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        intent: 'learning',
        launch: expect.objectContaining({
          candidate: expect.objectContaining({ id: lesson.id }),
        }),
      }),
    );
    expect(onStartSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        intent: 'songs',
        launch: expect.objectContaining({
          candidate: expect.objectContaining({ id: topOne.id }),
        }),
      }),
    );
    expect(onOpenJourney).toHaveBeenCalledOnce();
    expect(onOpenSongs).toHaveBeenCalledOnce();
    expect(onFindNewMusic).toHaveBeenCalledOnce();
    expect(onStartSong).toHaveBeenNthCalledWith(1, topOne);
    expect(onStartSong).toHaveBeenNthCalledWith(2, topTwo);
    expect(onStartSong).toHaveBeenNthCalledWith(3, topThree);
  });

  it('keeps an empty top-song tom honest and useful', () => {
    const onOpenSongs = vi.fn();

    render(
      <InputProvider>
        <HomeCockpit
          songList={[topOne]}
          gamification={{ ...gamification, runsBySong: {} }}
          recommendation={ranked(topOne, 'song')}
          practiceRanking={[ranked(topOne, 'song')]}
          onStartRecommended={vi.fn()}
          onOpenSongs={onOpenSongs}
          onStartSong={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    const tom = screen.getByTestId('kit-hotspot-tom1');

    expect(tom).toHaveTextContent('Top 1');
    expect(tom).toHaveTextContent('Play to set this tom');

    fireEvent.click(tom);

    expect(onOpenSongs).toHaveBeenCalledOnce();
  });
});
