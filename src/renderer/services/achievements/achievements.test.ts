import { describe, expect, it } from 'vitest';
import { Difficulty } from 'scan-chart';
import { ScoreData, Song } from '../../../types';
import { KIT_ELEMENTS } from '../../constants';
import { LaneAccuracy } from '../practice-stats';
import {
  ACHIEVEMENTS,
  AchievementRun,
  bestStarsForSong,
  computeAchievements,
  totalStarsAcrossLibrary,
} from './achievements';

function song(extra: Partial<Song> = {}): Song {
  return {
    id: extra.id ?? 'song-1',
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
    ...extra,
  };
}

function scoreForStars(stars: 0 | 1 | 2 | 3 | 4 | 5): ScoreData {
  const accuracyByStars = [0.1, 0.3, 0.5, 0.7, 0.85, 1];

  return {
    hitNotes: Math.round(accuracyByStars[stars] * 100),
    totalNotes: 100,
    falseHits: 0,
  };
}

function songWithStars(
  id: string,
  difficulty: Difficulty,
  stars: 0 | 1 | 2 | 3 | 4 | 5,
): Song {
  return song({ id, scoreData: { [difficulty]: scoreForStars(stars) } });
}

function fullKitLaneAccuracy(accuracy = 0.85): LaneAccuracy[] {
  return [...KIT_ELEMENTS.keys()].map((element) => ({
    element: element as LaneAccuracy['element'],
    hits: 80,
    misses: 20,
    accuracy,
  }));
}

function run(overrides: Partial<AchievementRun> = {}): AchievementRun {
  return {
    overallAccuracy: 0.9,
    laneAccuracy: [],
    mode: 'practice',
    songId: 'song-1',
    completedAt: '2026-08-01T10:00:00.000Z',
    difficulty: 'expert',
    playbackSpeed: 0.8,
    timingMeanMs: 28,
    timingSampleCount: 24,
    scoredAttempts: 40,
    ...overrides,
  };
}

function unlockedIds(
  runs: AchievementRun[],
  songList: Song[],
  longestStreak = 0,
  activeGoalSongId?: string,
) {
  return new Set(
    computeAchievements({
      runs,
      songList,
      longestStreak,
      activeGoalSongId,
    })
      .filter((result) => result.unlocked)
      .map((result) => result.id),
  );
}

describe('ACHIEVEMENTS', () => {
  it('orders active achievements by musical proof and puts volume in the archive', () => {
    expect(ACHIEVEMENTS.map(({ proofRank }) => proofRank)).toEqual(
      [...ACHIEVEMENTS.map(({ proofRank }) => proofRank)].sort((a, b) => a - b),
    );
    expect(
      ACHIEVEMENTS.every(({ evidenceEvent }) => evidenceEvent.length > 0),
    ).toBe(true);
    expect(ACHIEVEMENTS.find(({ id }) => id === 'century')?.quietArchive).toBe(
      true,
    );
  });

  it('does not unlock a reward merely because a run exists', () => {
    expect(unlockedIds([run()], []).has('first-blood')).toBe(false);
    expect(unlockedIds([run()], []).has('night-owl')).toBe(false);
    expect(unlockedIds([run()], []).has('early-bird')).toBe(false);
  });
});

describe('musical-proof achievements', () => {
  it('unlocks retained skill from saved retention evidence', () => {
    expect(
      unlockedIds([run({ retainedSkillCount: 1 })], []).has('first-blood'),
    ).toBe(true);
  });

  it('unlocks timing settled only after a comparable timing improvement', () => {
    const runs = [
      run({ timingMeanMs: 32 }),
      run({
        completedAt: '2026-08-02T10:00:00.000Z',
        timingMeanMs: 18,
      }),
    ];

    expect(unlockedIds(runs, []).has('perfect-10')).toBe(true);
    expect(unlockedIds([runs[0]], []).has('perfect-10')).toBe(false);
  });

  it('unlocks clean recovery from a saved recovery event', () => {
    expect(
      unlockedIds([run({ cleanRecoveryCount: 1 })], []).has('early-bird'),
    ).toBe(true);
  });

  it('unlocks a goal-song safety pass only for the active goal song', () => {
    const runs = [run({ songId: 'goal-song', overallAccuracy: 0.84 })];

    expect(unlockedIds(runs, [], 0, 'goal-song').has('night-owl')).toBe(true);
    expect(unlockedIds(runs, [], 0, 'other-song').has('night-owl')).toBe(false);
  });

  it('unlocks a song personal best from a later comparable saved pass', () => {
    const runs = [
      run({ overallAccuracy: 0.72 }),
      run({
        completedAt: '2026-08-02T10:00:00.000Z',
        overallAccuracy: 0.79,
      }),
    ];

    expect(unlockedIds(runs, []).has('speed-demon')).toBe(true);
  });

  it('unlocks full-kit balance only when every lane holds the evidence gate', () => {
    expect(
      unlockedIds([run({ laneAccuracy: fullKitLaneAccuracy(0.8) })], []).has(
        'full-kit',
      ),
    ).toBe(true);
  });
});

describe('practice and archive records', () => {
  it('unlocks practice rhythm after seven qualifying practice days', () => {
    expect(unlockedIds([], [], 7).has('week-one')).toBe(true);
    expect(unlockedIds([], [], 6).has('week-one')).toBe(false);
  });

  it('keeps 100 stars as an archive record', () => {
    const songList = Array.from({ length: 20 }, (_, index) =>
      songWithStars(`song-${index}`, 'expert', 5),
    );

    expect(totalStarsAcrossLibrary(songList)).toBe(100);
    expect(unlockedIds([], songList).has('century')).toBe(true);
  });

  it('unlocks method-unit completion from lesson evidence', () => {
    const songList = [
      song({
        id: 'lesson-a',
        lesson: { id: '01.01', starsToUnlock: 0, unit: 'Unit 1', title: 'A' },
        scoreData: { expert: scoreForStars(5) },
      }),
      song({
        id: 'lesson-b',
        lesson: { id: '01.02', starsToUnlock: 3, unit: 'Unit 1', title: 'B' },
        scoreData: { expert: scoreForStars(5) },
      }),
    ];

    expect(unlockedIds([], songList).has('season-finale')).toBe(true);
  });

  it('uses each song’s strongest verified score for the archive total', () => {
    const entry = song({
      scoreData: { easy: scoreForStars(1), expert: scoreForStars(5) },
    });

    expect(bestStarsForSong(entry)).toBe(5);
  });
});
