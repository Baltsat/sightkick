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

/** A ScoreData that lands exactly on the requested star rating (0-5),
 * given the app's fixed STAR_RATING_BANDS thresholds. */
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
    localHour: 14,
    mode: 'perform',
    ...overrides,
  };
}

describe('ACHIEVEMENTS', () => {
  it('defines a title/description/hint for every badge id computeAchievements can return', () => {
    const ids = computeAchievements({
      runs: [],
      songList: [],
      longestStreak: 0,
    }).map((result) => result.id);

    for (const id of ids) {
      const def = ACHIEVEMENTS.find((a) => a.id === id);

      expect(def, `missing AchievementDef for ${id}`).toBeDefined();
      expect(def!.title.length).toBeGreaterThan(0);
      expect(def!.hint.length).toBeGreaterThan(0);
    }
  });
});

function unlockedIds(
  runs: AchievementRun[],
  songList: Song[],
  longestStreak = 0,
) {
  return new Set(
    computeAchievements({ runs, songList, longestStreak })
      .filter((r) => r.unlocked)
      .map((r) => r.id),
  );
}

describe('first-blood', () => {
  it('unlocks on any recorded run', () => {
    expect(unlockedIds([run()], []).has('first-blood')).toBe(true);
  });

  it('stays locked with no runs at all', () => {
    expect(unlockedIds([], []).has('first-blood')).toBe(false);
  });
});

describe('perfect-10', () => {
  it('unlocks at exactly 10 runs >=95% accuracy', () => {
    const runs = Array.from({ length: 10 }, () =>
      run({ overallAccuracy: 0.97 }),
    );

    expect(unlockedIds(runs, []).has('perfect-10')).toBe(true);
  });

  it('stays locked at 9 qualifying runs', () => {
    const runs = Array.from({ length: 9 }, () =>
      run({ overallAccuracy: 0.97 }),
    );

    expect(unlockedIds(runs, []).has('perfect-10')).toBe(false);
  });

  it('does not count runs below the accuracy bar', () => {
    const runs = Array.from({ length: 10 }, () =>
      run({ overallAccuracy: 0.94 }),
    );

    expect(unlockedIds(runs, []).has('perfect-10')).toBe(false);
  });
});

describe('week-one', () => {
  it('unlocks once the longest streak reaches 7', () => {
    expect(unlockedIds([], [], 7).has('week-one')).toBe(true);
  });

  it('stays locked at a 6-day streak', () => {
    expect(unlockedIds([], [], 6).has('week-one')).toBe(false);
  });
});

describe('century', () => {
  it('unlocks once total stars across the library reach 100', () => {
    const songList = Array.from({ length: 20 }, (_, i) =>
      songWithStars(`song-${i}`, 'expert', 5),
    );

    expect(totalStarsAcrossLibrary(songList)).toBe(100);
    expect(unlockedIds([], songList).has('century')).toBe(true);
  });

  it('stays locked just short of 100', () => {
    const songList = [
      ...Array.from({ length: 19 }, (_, i) =>
        songWithStars(`song-${i}`, 'expert', 5),
      ),
      songWithStars('song-last', 'expert', 4),
    ];

    expect(totalStarsAcrossLibrary(songList)).toBe(99);
    expect(unlockedIds([], songList).has('century')).toBe(false);
  });

  it("bestStarsForSong takes a song's best difficulty, not its first", () => {
    const s = song({
      scoreData: { easy: scoreForStars(1), expert: scoreForStars(5) },
    });

    expect(bestStarsForSong(s)).toBe(5);
  });
});

describe('full-kit', () => {
  it('unlocks when one run has every lane at 80%+ accuracy', () => {
    const runs = [run({ laneAccuracy: fullKitLaneAccuracy(0.8) })];

    expect(unlockedIds(runs, []).has('full-kit')).toBe(true);
  });

  it('stays locked when one lane misses the bar', () => {
    const lanes = fullKitLaneAccuracy(0.9);

    lanes[0] = { ...lanes[0], accuracy: 0.5 };

    const runs = [run({ laneAccuracy: lanes })];

    expect(unlockedIds(runs, []).has('full-kit')).toBe(false);
  });

  it('stays locked when a run only struck some lanes', () => {
    const runs = [run({ laneAccuracy: fullKitLaneAccuracy(1).slice(0, 5) })];

    expect(unlockedIds(runs, []).has('full-kit')).toBe(false);
  });
});

describe('season-finale', () => {
  it('unlocks once every song in a lesson unit is mastered (3+ stars)', () => {
    const songList = [
      song({
        id: 'l1',
        lesson: { id: '01.01', starsToUnlock: 0, unit: 'Unit 1', title: 'A' },
        scoreData: { expert: scoreForStars(3) },
      }),
      song({
        id: 'l2',
        lesson: { id: '01.02', starsToUnlock: 3, unit: 'Unit 1', title: 'B' },
        scoreData: { expert: scoreForStars(4) },
      }),
    ];

    expect(unlockedIds([], songList).has('season-finale')).toBe(true);
  });

  it('stays locked while one lesson in the unit is unmastered', () => {
    const songList = [
      song({
        id: 'l1',
        lesson: { id: '01.01', starsToUnlock: 0, unit: 'Unit 1', title: 'A' },
        scoreData: { expert: scoreForStars(3) },
      }),
      song({
        id: 'l2',
        lesson: { id: '01.02', starsToUnlock: 3, unit: 'Unit 1', title: 'B' },
        scoreData: { expert: scoreForStars(2) },
      }),
    ];

    expect(unlockedIds([], songList).has('season-finale')).toBe(false);
  });

  it('ignores non-lesson songs entirely', () => {
    expect(unlockedIds([], [song()]).has('season-finale')).toBe(false);
  });
});

describe('night-owl / early-bird', () => {
  it('night-owl unlocks on a run at or after 11pm', () => {
    expect(unlockedIds([run({ localHour: 23 })], []).has('night-owl')).toBe(
      true,
    );
    expect(unlockedIds([run({ localHour: 22 })], []).has('night-owl')).toBe(
      false,
    );
  });

  it('early-bird unlocks on a run before 8am', () => {
    expect(unlockedIds([run({ localHour: 7 })], []).has('early-bird')).toBe(
      true,
    );
    expect(unlockedIds([run({ localHour: 8 })], []).has('early-bird')).toBe(
      false,
    );
  });

  it('a single very-late-night run does not also count as early-bird', () => {
    const ids = unlockedIds([run({ localHour: 23 })], []);

    expect(ids.has('night-owl')).toBe(true);
    expect(ids.has('early-bird')).toBe(false);
  });
});

describe('speed-demon', () => {
  it('unlocks with 3+ stars on Expert (Perform is always 1x)', () => {
    const songList = [songWithStars('song-1', 'expert', 3)];

    expect(unlockedIds([], songList).has('speed-demon')).toBe(true);
  });

  it('stays locked below 3 stars on Expert', () => {
    const songList = [songWithStars('song-1', 'expert', 2)];

    expect(unlockedIds([], songList).has('speed-demon')).toBe(false);
  });

  it('stays locked when only a non-Expert difficulty is scored', () => {
    const songList = [songWithStars('song-1', 'hard', 5)];

    expect(unlockedIds([], songList).has('speed-demon')).toBe(false);
  });
});
