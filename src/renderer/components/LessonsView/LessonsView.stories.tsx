import type { Meta, StoryObj } from '@storybook/react';
import { computeLessonProgress } from '../../hooks/useLessons';
import type { Song, SongLessonInfo, ScoreData } from '../../../types';
import { LessonsView } from './LessonsView';

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
    name: lessonExtra.title ?? `Lesson ${lessonExtra.id ?? '01.01'}`,
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

/** Mirrors LessonsView.test.tsx's makeMixedProgress: one cleared season, one
 * active season (mixed done/next-up/locked), and one fully locked season -
 * the same shape used to prove the header, rail, and path render together. */
const progress = computeLessonProgress([
  makeLessonSong(
    'a',
    { id: '01.01', starsToUnlock: 0, unit: 'Foundations', title: 'Singles' },
    { scoreData: { expert: scoreFor(0.99) } },
  ),
  makeLessonSong(
    'b',
    { id: '01.02', starsToUnlock: 0, unit: 'Foundations', title: 'Doubles' },
    { scoreData: { expert: scoreFor(0.99) } },
  ),
  makeLessonSong(
    'c',
    { id: '02.01', starsToUnlock: 2, unit: 'Reading', title: 'Whole Notes' },
    { scoreData: { expert: scoreFor(0.99) } },
  ),
  makeLessonSong(
    'd',
    {
      id: '02.02',
      starsToUnlock: 3,
      unit: 'Reading',
      title: 'Alternating Singles Warm-Up',
    },
    { scoreData: { expert: scoreFor(0.5) } },
  ),
  makeLessonSong('e', {
    id: '02.03',
    starsToUnlock: 4,
    unit: 'Reading',
    title: 'Rests',
  }),
  makeLessonSong('f', {
    id: '03.01',
    starsToUnlock: 5,
    unit: 'Grooves',
    title: 'First Beat',
  }),
  makeLessonSong('g', {
    id: '03.02',
    starsToUnlock: 6,
    unit: 'Grooves',
    title: 'Backbeat Feel',
  }),
]);
const meta: Meta<typeof LessonsView> = {
  title: 'Journey/Lessons view',
  component: LessonsView,
  args: {
    progress,
    onPlay: () => {},
    onRescan: () => {},
  },
  render: (args) => (
    <div className="h-screen overflow-hidden bg-canvas">
      <LessonsView {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof LessonsView>;

/** The current season, its rail, and the winding path over the rehearsal studio. */
export const RehearsalRoute: Story = {};
