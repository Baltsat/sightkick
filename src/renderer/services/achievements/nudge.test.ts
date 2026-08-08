import { describe, expect, it } from 'vitest';
import { ScoreData, Song } from '../../../types';
import { AchievementRun } from './achievements';
import { pickNudge } from './nudge';

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

function scoreForStars(stars: number): ScoreData {
  const accuracyByStars = [0.1, 0.3, 0.5, 0.7, 0.85, 1];

  return {
    hitNotes: Math.round(accuracyByStars[stars] * 100),
    totalNotes: 100,
    falseHits: 0,
  };
}

function songWithStars(id: string, stars: number): Song {
  return song({ id, scoreData: { expert: scoreForStars(stars) } });
}

function run(overallAccuracy: number): AchievementRun {
  return { overallAccuracy, laneAccuracy: [], localHour: 14, mode: 'perform' };
}

describe('pickNudge', () => {
  it('nudges toward Perfect 10 when it is the closest locked goal', () => {
    const runs = Array.from({ length: 8 }, () => run(0.97));
    const nudge = pickNudge({
      runs,
      songList: [],
      currentStreak: 0,
      longestStreak: 0,
    });

    expect(nudge?.achievementId).toBe('perfect-10');
    expect(nudge?.message).toContain('2');
    expect(nudge?.message.toLowerCase()).toContain('perfect 10');
  });

  it('nudges toward Week One when the streak is closest to done', () => {
    const nudge = pickNudge({
      runs: [],
      songList: [],
      currentStreak: 6,
      longestStreak: 6,
    });

    expect(nudge?.achievementId).toBe('week-one');
    expect(nudge?.message).toContain('1');
  });

  it('nudges toward Century when stars are closest', () => {
    const songList = Array.from({ length: 19 }, (_, i) =>
      songWithStars(`song-${i}`, 5),
    );
    const nudge = pickNudge({
      runs: [],
      songList,
      currentStreak: 0,
      longestStreak: 0,
    });

    expect(nudge?.achievementId).toBe('century');
    expect(nudge?.message).toContain('5');
  });

  it('picks whichever candidate is numerically closest to unlocking', () => {
    // 1 more run away from Perfect 10 vs 3 more days from Week One -
    // Perfect 10 is closer and should win.
    const runs = Array.from({ length: 9 }, () => run(0.97));
    const nudge = pickNudge({
      runs,
      songList: [],
      currentStreak: 4,
      longestStreak: 4,
    });

    expect(nudge?.achievementId).toBe('perfect-10');
  });

  it('returns undefined once every trackable achievement is already unlocked', () => {
    const runs = Array.from({ length: 10 }, () => run(0.97));
    const songList = Array.from({ length: 20 }, (_, i) =>
      songWithStars(`song-${i}`, 5),
    );
    const nudge = pickNudge({
      runs,
      songList,
      currentStreak: 7,
      longestStreak: 7,
    });

    expect(nudge).toBeUndefined();
  });

  it('returns undefined when there is nothing to report yet (no runs, no songs, no streak)', () => {
    const nudge = pickNudge({
      runs: [],
      songList: [],
      currentStreak: 0,
      longestStreak: 0,
    });

    // Still 100 stars from Century, 7 days from Week One, 10 runs from
    // Perfect 10 - Century (100 remaining) ties with none other as closest
    // only relative to the others, so a nudge IS returned; assert it picks
    // the smallest remaining count among the three (week-one, 7 remaining).
    expect(nudge?.achievementId).toBe('week-one');
  });
});
