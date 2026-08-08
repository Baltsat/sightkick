import { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { LessonsView } from './LessonsView';
import { computeLessonProgress, LessonProgress } from '../../hooks/useLessons';
import { ScoreData, Song, SongLessonInfo } from '../../../types';

const EMPTY_PROGRESS: LessonProgress = {
  entries: [],
  groups: [],
  totalLessons: 0,
  unlockedCount: 0,
  totalStars: 0,
  continueEntry: undefined,
  nextLockedEntry: undefined,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AntdApp>{children}</AntdApp>;
}

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

/** One mastered season, one active season (mixed done/next-up/locked), one fully locked season. */
function makeMixedProgress(): LessonProgress {
  return computeLessonProgress([
    // Season "Foundations" — fully mastered.
    makeLessonSong(
      'a',
      { id: '01.01', starsToUnlock: 0, unit: 'Foundations', title: 'Singles' },
      { scoreData: { expert: scoreFor(0.99) } }, // 5 stars
    ),
    makeLessonSong(
      'b',
      { id: '01.02', starsToUnlock: 0, unit: 'Foundations', title: 'Doubles' },
      { scoreData: { expert: scoreFor(0.99) } }, // 5 stars
    ),
    // Season "Reading" — active: one mastered, one next-up, one locked.
    makeLessonSong(
      'c',
      { id: '02.01', starsToUnlock: 5, unit: 'Reading', title: 'Whole Notes' },
      { scoreData: { expert: scoreFor(0.65) } }, // 3 stars, mastered
    ),
    makeLessonSong(
      'd',
      { id: '02.02', starsToUnlock: 8, unit: 'Reading', title: 'Half Notes' },
      { scoreData: { expert: scoreFor(0.5) } }, // 2 stars, unlocked but not mastered
    ),
    makeLessonSong('e', {
      id: '02.03',
      starsToUnlock: 40,
      unit: 'Reading',
      title: 'Rests',
    }), // locked
    // Season "Grooves" — fully locked.
    makeLessonSong('f', {
      id: '03.01',
      starsToUnlock: 99,
      unit: 'Grooves',
      title: 'First Beat',
    }),
  ]);
}

describe('LessonsView — empty state', () => {
  it('never dead-ends: shows a primary Rescan library button instead of text-only instructions', () => {
    const onRescan = vi.fn();

    render(
      <LessonsView
        progress={EMPTY_PROGRESS}
        onPlay={vi.fn()}
        onRescan={onRescan}
      />,
      { wrapper },
    );

    expect(screen.getByText('No lessons found')).toBeInTheDocument();

    const button = screen.getByTestId('lessons-rescan');

    expect(button).toBeInTheDocument();
    fireEvent.click(button);

    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it('shows scan progress instead of the dead-end message while a rescan is running', () => {
    render(
      <LessonsView
        progress={EMPTY_PROGRESS}
        onPlay={vi.fn()}
        onRescan={vi.fn()}
        scanPercent={42}
      />,
      { wrapper },
    );

    expect(screen.getByTestId('lessons-scan-progress')).toBeInTheDocument();
    expect(screen.queryByText('No lessons found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lessons-rescan')).not.toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});

describe('LessonsView — chain progress header', () => {
  it('keeps the exact "N of M unlocked · K⭐ earned" summary text', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lesson-progress-summary')).toHaveTextContent(
      `${progress.unlockedCount} of ${progress.totalLessons} unlocked · ${progress.totalStars}⭐ earned`,
    );
  });

  it('exposes a stable scroll-root testid (distinct from the Songs list, which also scrolls)', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lessons-scroll-root')).toHaveClass(
      'overflow-y-auto',
    );
  });

  it('shows a continue card for the furthest unmastered unlocked lesson', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const card = screen.getByTestId('lesson-continue-card');

    expect(within(card).getByText('Half Notes')).toBeInTheDocument();
  });

  it('points the header at the current season and the node position within it', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(
      screen.getByTestId('lesson-header-current-season'),
    ).toHaveTextContent('Reading');
    expect(screen.getByTestId('lesson-header-node-position')).toHaveTextContent(
      'Node 2 of 3',
    );
  });

  it('calls onPlay with the continue entry when Play is clicked', () => {
    const progress = makeMixedProgress();
    const onPlay = vi.fn();

    render(
      <LessonsView progress={progress} onPlay={onPlay} onRescan={vi.fn()} />,
      { wrapper },
    );

    const card = screen.getByTestId('lesson-continue-card');

    fireEvent.click(
      within(card).getByRole('button', { name: 'Play Half Notes' }),
    );

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0][0].lesson.id).toBe('02.02');
  });
});

describe('LessonsView — seasons', () => {
  it('renders every unit as a season card with a locked/active/completed state', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('season-card-Foundations')).toHaveAttribute(
      'data-season-state',
      'completed',
    );
    expect(screen.getByTestId('season-card-Reading')).toHaveAttribute(
      'data-season-state',
      'active',
    );
    expect(screen.getByTestId('season-card-Grooves')).toHaveAttribute(
      'data-season-state',
      'locked',
    );
  });

  it('keeps every group heading and every lesson node in the DOM at once, even in collapsed seasons', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lesson-group-Foundations')).toHaveTextContent(
      'Foundations',
    );
    expect(screen.getByTestId('lesson-group-Reading')).toHaveTextContent(
      'Reading',
    );
    expect(screen.getByTestId('lesson-group-Grooves')).toHaveTextContent(
      'Grooves',
    );
    // Foundations and Grooves are collapsed by default (see below) — their
    // nodes must still be present and clickable in the DOM, since
    // SongListView's integration tests click lesson nodes by testid without
    // opening a season first.
    expect(screen.getByTestId('lesson-item-01.01')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-item-02.02')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-item-03.01')).toBeInTheDocument();
  });

  it('opens the current season by default and collapses the rest, like a level-select map', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    // Reading holds the next-up pointer (02.02) — it's "where I am".
    expect(screen.getByTestId('season-card-Reading')).toHaveAttribute(
      'data-expanded',
      'true',
    );
    expect(screen.getByTestId('season-card-Foundations')).toHaveAttribute(
      'data-expanded',
      'false',
    );
    expect(screen.getByTestId('season-card-Grooves')).toHaveAttribute(
      'data-expanded',
      'false',
    );
  });

  it('opens and closes a season when its header is clicked', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const toggle = screen.getByTestId('season-toggle-Grooves');

    expect(screen.getByTestId('season-card-Grooves')).toHaveAttribute(
      'data-expanded',
      'false',
    );

    fireEvent.click(toggle);

    expect(screen.getByTestId('season-card-Grooves')).toHaveAttribute(
      'data-expanded',
      'true',
    );

    fireEvent.click(toggle);

    expect(screen.getByTestId('season-card-Grooves')).toHaveAttribute(
      'data-expanded',
      'false',
    );
  });

  it('reports stars earned over possible for each season', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    // Foundations: two exercises at 5 stars each = 10 / 10.
    expect(screen.getByTestId('season-stars-Foundations')).toHaveTextContent(
      '10 / 10⭐',
    );
  });
});

describe('LessonsView — path nodes', () => {
  it('marks locked, next-up and done nodes distinctly', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lesson-item-01.01')).toHaveAttribute(
      'data-node-state',
      'done',
    );
    expect(screen.getByTestId('lesson-item-02.01')).toHaveAttribute(
      'data-node-state',
      'done',
    );
    expect(screen.getByTestId('lesson-item-02.02')).toHaveAttribute(
      'data-node-state',
      'next-up',
    );
    expect(screen.getByTestId('lesson-item-02.03')).toHaveAttribute(
      'data-node-state',
      'locked',
    );
    expect(screen.getByTestId('lesson-item-03.01')).toHaveAttribute(
      'data-node-state',
      'locked',
    );
  });

  it('applies a reduced-motion-safe pulse class only to the next-up node', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lesson-item-02.02')).toHaveClass(
      'motion-safe:animate-pulse',
    );
    expect(screen.getByTestId('lesson-item-01.01')).not.toHaveClass(
      'motion-safe:animate-pulse',
    );
  });

  it('greys out a locked node with data-locked and an "Earn N more" hint', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const locked = screen.getByTestId('lesson-item-02.03');

    expect(locked).toHaveAttribute('data-locked', 'true');
    expect(within(locked).getByText('Earn 25 more ⭐')).toBeInTheDocument();
  });

  it('shows an honest "locked" notification instead of a dead click, and never calls onPlay', () => {
    const progress = makeMixedProgress();
    const onPlay = vi.fn();

    render(
      <LessonsView progress={progress} onPlay={onPlay} onRescan={vi.fn()} />,
      { wrapper },
    );

    fireEvent.click(screen.getByTestId('lesson-item-02.03'));

    expect(screen.getByText('This lesson is locked')).toBeInTheDocument();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('calls onPlay when an unlocked node is clicked', () => {
    const progress = makeMixedProgress();
    const onPlay = vi.fn();

    render(
      <LessonsView progress={progress} onPlay={onPlay} onRescan={vi.fn()} />,
      { wrapper },
    );

    fireEvent.click(screen.getByTestId('lesson-item-01.02'));

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0][0].lesson.id).toBe('01.02');
  });

  it('activates an unlocked node on Enter and Space, same as a click', () => {
    const progress = makeMixedProgress();
    const onPlay = vi.fn();

    render(
      <LessonsView progress={progress} onPlay={onPlay} onRescan={vi.fn()} />,
      { wrapper },
    );

    const node = screen.getByTestId('lesson-item-01.02');

    fireEvent.keyDown(node, { key: 'Enter' });
    fireEvent.keyDown(node, { key: ' ' });

    expect(onPlay).toHaveBeenCalledTimes(2);
  });
});
