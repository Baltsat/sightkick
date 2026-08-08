import { describe, expect, it } from 'vitest';
import { ScoreData, Song, SongLessonInfo } from '../../../types';
import { computeLessonProgress } from '../../hooks/useLessons';
import {
  buildSnakePath,
  currentSeasonInfo,
  nodeState,
  seasonState,
  seasonStars,
  snakeX,
} from './journey';

function makeSong(extra: Partial<Song> = {}): Song {
  return {
    id: 'song-1',
    dir: '/songs/song-1',
    name: 'Lesson',
    artist: 'SightKick Method',
    album: 'Foundations',
    charter: 'Charter',
    genre: 'Lesson',
    year: '2026',
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
    unit: 'Foundations',
    title: 'Warm-Up',
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
    lesson: makeLesson({ id, ...lessonExtra }),
    ...songExtra,
  });
}

function scoreFor(accuracy: number): ScoreData {
  return {
    totalNotes: 100,
    falseHits: 0,
    hitNotes: Math.round(accuracy * 100),
  };
}

describe('seasonState', () => {
  it('is locked when no entry in the season has unlocked', () => {
    const progress = computeLessonProgress([
      makeLessonSong('a', { id: '01.01', starsToUnlock: 0, unit: 'A' }),
      makeLessonSong('b', { id: '02.01', starsToUnlock: 50, unit: 'B' }),
    ]);

    expect(seasonState(progress.groups[1])).toBe('locked');
  });

  it('is active once some but not all entries are mastered', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.99) } }, // mastered
      ),
      makeLessonSong('b', { id: '01.02', starsToUnlock: 5, unit: 'A' }), // unlocked, 0 stars
    ]);

    expect(seasonState(progress.groups[0])).toBe('active');
  });

  it('is completed once every entry is mastered', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.99) } },
      ),
      makeLessonSong(
        'b',
        { id: '01.02', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.99) } },
      ),
    ]);

    expect(seasonState(progress.groups[0])).toBe('completed');
  });
});

describe('seasonStars', () => {
  it('sums earned stars and caps possible at 5 per exercise', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.99) } }, // 5 stars
      ),
      makeLessonSong(
        'b',
        { id: '01.02', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.65) } }, // 3 stars
      ),
    ]);

    expect(seasonStars(progress.groups[0])).toEqual({
      earned: 8,
      possible: 10,
      masteredCount: 2,
    });
  });
});

describe('nodeState', () => {
  it('is locked for an unlocked-false entry', () => {
    const progress = computeLessonProgress([
      makeLessonSong('a', { id: '01.01', starsToUnlock: 0 }),
      makeLessonSong('b', { id: '01.02', starsToUnlock: 99 }),
    ]);
    const locked = progress.entries.find((e) => e.lesson.id === '01.02');

    expect(locked).toBeDefined();
    expect(nodeState(locked!, progress)).toBe('locked');
  });

  it('is next-up exactly for the continueEntry pointer', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0 },
        { scoreData: { expert: scoreFor(0.5) } }, // unlocked, unmastered
      ),
    ]);

    expect(progress.continueEntry?.lesson.id).toBe('01.01');
    expect(nodeState(progress.entries[0], progress)).toBe('next-up');
  });

  it('is done once mastered, available once unlocked but neither pointer nor mastered', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0 },
        { scoreData: { expert: scoreFor(0.99) } }, // mastered
      ),
      makeLessonSong(
        'b',
        { id: '01.02', starsToUnlock: 0 },
        { scoreData: { expert: scoreFor(0.5) } }, // unlocked, unmastered -> continueEntry
      ),
    ]);
    const byId = Object.fromEntries(
      progress.entries.map((e) => [e.lesson.id, e]),
    );

    expect(nodeState(byId['01.01'], progress)).toBe('done');
    expect(nodeState(byId['01.02'], progress)).toBe('next-up');
  });
});

describe('currentSeasonInfo', () => {
  it('points at the continueEntry season and its 1-based position', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.99) } },
      ),
      makeLessonSong(
        'b',
        { id: '01.02', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.5) } },
      ),
    ]);
    const info = currentSeasonInfo(progress);

    expect(info?.group.unit).toBe('A');
    expect(info?.positionInSeason).toBe(2);
    expect(info?.seasonSize).toBe(2);
  });

  it('falls back to the furthest locked lesson once everything unlocked is mastered', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0, unit: 'A' },
        { scoreData: { expert: scoreFor(0.99) } },
      ),
      makeLessonSong('b', { id: '02.01', starsToUnlock: 20, unit: 'B' }),
    ]);
    const info = currentSeasonInfo(progress);

    expect(info?.group.unit).toBe('B');
    expect(info?.positionInSeason).toBe(1);
  });

  it('is undefined once the whole curriculum is complete', () => {
    const progress = computeLessonProgress([
      makeLessonSong(
        'a',
        { id: '01.01', starsToUnlock: 0 },
        { scoreData: { expert: scoreFor(0.99) } },
      ),
    ]);

    expect(currentSeasonInfo(progress)).toBeUndefined();
  });
});

describe('snakeX / buildSnakePath', () => {
  it('is deterministic and stays within the [22, 62] band', () => {
    for (let i = 0; i < 40; i += 1) {
      const x = snakeX(i);

      expect(x).toBe(snakeX(i));
      expect(x).toBeGreaterThanOrEqual(22);
      expect(x).toBeLessThanOrEqual(62);
    }
  });

  it('builds one x per node and an empty path for zero nodes', () => {
    expect(buildSnakePath(0)).toEqual({ xs: [], d: '' });

    const { xs, d } = buildSnakePath(5);

    expect(xs).toHaveLength(5);
    expect(d.startsWith(`M ${xs[0]} 0.5`)).toBe(true);
    // 4 cubic-bezier segments connect 5 points.
    expect(d.match(/C /g)).toHaveLength(4);
  });
});
