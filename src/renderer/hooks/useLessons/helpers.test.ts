import { describe, expect, it } from 'vitest';
import { ScoreData, Song, SongLessonInfo } from '../../../types';
import {
  bestStarsForSong,
  computeLessonProgress,
  highestAvailableDifficulty,
  isLessonSong,
  lockedHint,
} from './helpers';

function makeSong(extra: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    dir: '/songs/song-1',
    name: 'Master of Puppets',
    artist: 'Metallica',
    album: 'Master of Puppets',
    charter: 'Charter',
    genre: 'Metal',
    year: '1986',
    fiveLaneDrums: false,
    proDrums: true,
    delaySeconds: 0,
    drumDifficulty: 5,
    format: 'chart',
    audio: [{ src: 'song.ogg', name: 'song' }],
    ...extra,
  };
}

function makeLesson(extra: Partial<SongLessonInfo> = {}): SongLessonInfo {
  return {
    id: '01.01',
    starsToUnlock: 0,
    unit: 'Unit 1 — Foundations',
    title: 'Alternating Singles Warm-Up',
    ...extra,
  };
}

function makeLessonSong(
  id: string,
  lessonExtra: Partial<SongLessonInfo> = {},
  songExtra: Partial<Song> = {},
): Song {
  return makeSong({
    id,
    dir: `/music/SightKick Method - Lesson ${lessonExtra.id ?? '01.01'}`,
    name: `Lesson ${lessonExtra.id ?? '01.01'}`,
    artist: 'SightKick Method',
    lesson: makeLesson({ id, ...lessonExtra }),
    ...songExtra,
  });
}

function scoreFor(accuracy: number): ScoreData {
  // getStarRating bands: [0.2, 0.4, 0.6, 0.8, 0.92] of hitNotes / totalNotes
  return {
    totalNotes: 100,
    falseHits: 0,
    hitNotes: Math.round(accuracy * 100),
  };
}

describe('isLessonSong', () => {
  it('is true when the song carries lesson info', () => {
    expect(isLessonSong(makeLessonSong('a'))).toBe(true);
  });

  it('is false for a regular song', () => {
    expect(isLessonSong(makeSong())).toBe(false);
  });

  it('falls back to the "SightKick Method - " name prefix', () => {
    expect(
      isLessonSong(makeSong({ name: 'SightKick Method - Lesson 01.01' })),
    ).toBe(true);
  });

  it('falls back to the folder basename prefix (Windows or POSIX separators)', () => {
    expect(
      isLessonSong(
        makeSong({ dir: '/music/SightKick Method - Lesson 01.01 - Warm-Up' }),
      ),
    ).toBe(true);
    expect(
      isLessonSong(
        makeSong({
          dir: 'C:\\Music\\SightKick Method - Lesson 01.01 - Warm-Up',
        }),
      ),
    ).toBe(true);
  });

  it('does not treat an unrelated song with a similar name as a lesson', () => {
    expect(isLessonSong(makeSong({ name: 'SightKick Anthem' }))).toBe(false);
  });
});

describe('highestAvailableDifficulty', () => {
  it('picks expert for a lesson chart that only has an expert track', () => {
    expect(
      highestAvailableDifficulty(
        makeLessonSong('a', {}, { drumDifficulties: ['expert'] }),
      ),
    ).toBe('expert');
  });

  it('picks the highest of several charted difficulties', () => {
    expect(
      highestAvailableDifficulty(
        makeSong({ drumDifficulties: ['easy', 'hard'] }),
      ),
    ).toBe('hard');
  });

  it('returns undefined when nothing is charted', () => {
    expect(
      highestAvailableDifficulty(makeSong({ drumDifficulties: [] })),
    ).toBeUndefined();
    expect(
      highestAvailableDifficulty(makeSong({ drumDifficulties: undefined })),
    ).toBeUndefined();
  });
});

describe('bestStarsForSong', () => {
  it('returns 0 when there is no score data', () => {
    expect(bestStarsForSong(makeSong())).toBe(0);
  });

  it('takes the best rating across difficulties', () => {
    const song = makeSong({
      scoreData: {
        easy: scoreFor(0.99), // 5 stars
        expert: scoreFor(0.3), // 1 star
      },
    });

    expect(bestStarsForSong(song)).toBe(5);
  });
});

describe('computeLessonProgress', () => {
  it('returns empty progress when there are no lesson songs', () => {
    const progress = computeLessonProgress([makeSong()]);

    expect(progress.totalLessons).toBe(0);
    expect(progress.entries).toEqual([]);
    expect(progress.groups).toEqual([]);
    expect(progress.continueEntry).toBeUndefined();
  });

  it('always unlocks the first lesson in the chain (stars 0)', () => {
    const progress = computeLessonProgress([
      makeLessonSong('a', { id: '01.01', starsToUnlock: 0 }),
    ]);

    expect(progress.entries[0].unlocked).toBe(true);
    expect(progress.unlockedCount).toBe(1);
  });

  it('unlocks a lesson only once the cumulative star total reaches its threshold', () => {
    const songs = [
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0 },
        { scoreData: { expert: scoreFor(0.99) } }, // 5 stars
      ),
      makeLessonSong('b', { id: '01.02', starsToUnlock: 5 }),
      makeLessonSong('c', { id: '01.03', starsToUnlock: 6 }),
    ];
    const progress = computeLessonProgress(songs);

    expect(progress.totalStars).toBe(5);
    expect(progress.unlockedCount).toBe(2);

    const byId = Object.fromEntries(
      progress.entries.map((entry) => [entry.lesson.id, entry]),
    );

    expect(byId['01.01'].unlocked).toBe(true);
    expect(byId['01.02'].unlocked).toBe(true);
    expect(byId['01.03'].unlocked).toBe(false);
    expect(byId['01.03'].starsNeeded).toBe(1);
  });

  it('sums the best stars per lesson song regardless of difficulty', () => {
    const songs = [
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0 },
        {
          scoreData: {
            easy: scoreFor(0.99), // 5 stars
            expert: scoreFor(0.25), // 1 star — best (5) should win, not sum both
          },
        },
      ),
      makeLessonSong(
        'b',
        { id: '01.02', starsToUnlock: 5 },
        { scoreData: { hard: scoreFor(0.65) } }, // 3 stars
      ),
    ];
    const progress = computeLessonProgress(songs);

    expect(progress.totalStars).toBe(8);
  });

  it('orders entries by sk_stars_to_unlock and groups them by sk_unit', () => {
    const songs = [
      makeLessonSong('c', { id: '02.01', starsToUnlock: 10, unit: 'Unit 2' }),
      makeLessonSong('a', { id: '01.01', starsToUnlock: 0, unit: 'Unit 1' }),
      makeLessonSong('b', { id: '01.02', starsToUnlock: 5, unit: 'Unit 1' }),
    ];
    const progress = computeLessonProgress(songs);

    expect(progress.entries.map((e) => e.lesson.id)).toEqual([
      '01.01',
      '01.02',
      '02.01',
    ]);
    expect(progress.groups.map((g) => g.unit)).toEqual(['Unit 1', 'Unit 2']);
    expect(progress.groups[0].entries.map((e) => e.lesson.id)).toEqual([
      '01.01',
      '01.02',
    ]);
  });

  it('points the continue card at the furthest unlocked-but-not-yet-mastered lesson', () => {
    const songs = [
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0 },
        { scoreData: { expert: scoreFor(0.99) } }, // mastered, 5 stars
      ),
      makeLessonSong(
        'b',
        { id: '01.02', starsToUnlock: 5 },
        { scoreData: { expert: scoreFor(0.5) } }, // unlocked, 2 stars — not mastered
      ),
      makeLessonSong('c', { id: '01.03', starsToUnlock: 20 }), // locked
    ];
    const progress = computeLessonProgress(songs);

    expect(progress.continueEntry?.lesson.id).toBe('01.02');
    expect(progress.nextLockedEntry?.lesson.id).toBe('01.03');
  });

  it('has no continue entry once every unlocked lesson is mastered', () => {
    const songs = [
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0 },
        { scoreData: { expert: scoreFor(0.99) } },
      ),
      makeLessonSong('b', { id: '01.02', starsToUnlock: 20 }),
    ];
    const progress = computeLessonProgress(songs);

    expect(progress.continueEntry).toBeUndefined();
    expect(progress.nextLockedEntry?.lesson.id).toBe('01.02');
  });
});

describe('lockedHint', () => {
  it('describes how many more stars are needed', () => {
    const entry = computeLessonProgress([
      makeLessonSong('a', { id: '01.01', starsToUnlock: 12 }),
    ]).entries[0];

    expect(lockedHint(entry)).toBe('Earn 12 more ⭐');
  });
});
