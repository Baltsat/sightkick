import { ReactNode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonsView } from './LessonsView';
import { computeLessonProgress, LessonProgress } from '../../hooks/useLessons';
import {
  MidiMessageType,
  ScoreData,
  Song,
  SongLessonInfo,
} from '../../../types';
import { InputProvider } from '../../context/InputContext';
import {
  installIpcMock,
  installLocalStorage,
  IpcMock,
} from '../../hooks/test-support';

const { playKitPreviewMock } = vi.hoisted(() => ({
  playKitPreviewMock: vi.fn(),
}));

vi.mock('../../services/kit-preview-audio', () => ({
  playKitPreview: playKitPreviewMock,
}));

const EMPTY_PROGRESS: LessonProgress = {
  entries: [],
  groups: [],
  totalLessons: 0,
  unlockedCount: 0,
  totalStars: 0,
  clearedCount: 0,
  continueEntry: undefined,
  nextLockedEntry: undefined,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AntdApp>
      <InputProvider>{children}</InputProvider>
    </AntdApp>
  );
}

let ipc: IpcMock;

beforeEach(() => {
  installLocalStorage();
  ipc = installIpcMock();
  playKitPreviewMock.mockClear();
});

function seedFreshMidiJourneyProfile() {
  const deviceId = 'midi:DTX402 Touch';

  window.localStorage.setItem(
    'settings.selectedDevice',
    JSON.stringify({
      id: deviceId,
      name: 'DTX402 Touch',
      sourceId: 'midi',
      port: 2,
    }),
  );
  window.localStorage.setItem(
    'settings.inputMappings',
    JSON.stringify({
      [deviceId]: {
        tom1: ['midi:71'],
        tom2: ['midi:72'],
        snare: ['midi:73'],
        crash: ['midi:74'],
        hihat: ['midi:75'],
        ride: ['midi:76'],
        tom3: ['midi:77'],
      },
    }),
  );
  window.localStorage.setItem(
    'settings.controlMappings',
    JSON.stringify({ [deviceId]: {} }),
  );
}

function hitMidiNote(note: number) {
  act(() => {
    ipc.emit('listen-midi', {
      type: MidiMessageType.NoteOn,
      note,
      velocity: 100,
    });
  });
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

/** One cleared season, one active season (mixed done/next-up/locked), one fully locked season. */
function makeMixedProgress(): LessonProgress {
  return computeLessonProgress([
    // Season "Foundations" — fully cleared.
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
    // Season "Reading" — active: one cleared, one next-up, one locked.
    makeLessonSong(
      'c',
      { id: '02.01', starsToUnlock: 2, unit: 'Reading', title: 'Whole Notes' },
      { scoreData: { expert: scoreFor(0.99) } }, // cleared
    ),
    makeLessonSong(
      'd',
      { id: '02.02', starsToUnlock: 3, unit: 'Reading', title: 'Half Notes' },
      { scoreData: { expert: scoreFor(0.5) } }, // unlocked but not cleared
    ),
    makeLessonSong('e', {
      id: '02.03',
      starsToUnlock: 4,
      unit: 'Reading',
      title: 'Rests',
    }), // locked
    // Season "Grooves" — fully locked.
    makeLessonSong('f', {
      id: '03.01',
      starsToUnlock: 5,
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
  it('shows every lesson as open while retaining the earned-star total', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lesson-progress-summary')).toHaveTextContent(
      `${progress.totalLessons} of ${progress.totalLessons} unlocked · ${progress.totalStars} earned`,
    );
    expect(
      within(screen.getByTestId('lesson-progress-summary')).getByLabelText(
        'stars',
      ),
    ).toBeInTheDocument();
  });

  it('uses a fixed, no-scroll Journey viewport so the kit player never has to scroll the page', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lessons-scroll-root')).toHaveClass(
      'overflow-hidden',
    );
    expect(screen.getByTestId('lesson-season-stage')).toHaveClass('grow');
  });

  it('says nothing about unmapped navigation, instead of the raw config string, when no control is mapped', () => {
    // Regression for docs/design-qa/2026-08-13-finish/critique.md, Songs
    // finding 3, which is the same defect class on this route: "Set Journey
    // controls in Configure input" is a debug string about missing
    // settings, not something he would ever say, and it must never reach
    // the primary Journey view. The real fact belongs in Settings, one
    // intentional action away — the hint panel says nothing at all instead.
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(
      screen.getAllByTestId('journey-kit-controls')[0],
    ).not.toHaveTextContent('Set Journey controls in Configure input');
    expect(screen.queryByText(/Configure input/i)).not.toBeInTheDocument();
  });

  it('keeps the authored next lesson after opening the rest of the path', () => {
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

  it('honors a completed lesson return in its original season instead of resetting to Foundations', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView
        progress={progress}
        onPlay={vi.fn()}
        onRescan={vi.fn()}
        initialUnit="Reading"
        initialFocusedLessonId="d"
      />,
      { wrapper },
    );

    expect(screen.getByTestId('journey-world-title')).toHaveTextContent(
      'Reading',
    );
    expect(screen.getByTestId('lesson-item-02.02')).toHaveAttribute(
      'data-kit-focused',
      'true',
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
      within(card).getByRole('button', { name: 'Start Half Notes' }),
    );

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0][0].lesson.id).toBe('02.02');
  });

  it('keeps one readable next-lesson manifest instead of a curriculum admin card', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const manifest = screen.getByTestId('lesson-continue-card');

    expect(within(manifest).getByText('Half Notes')).toBeInTheDocument();
    expect(
      within(manifest).getByRole('button', { name: 'Start Half Notes' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('lesson-continue-plan'),
    ).not.toBeInTheDocument();
  });
});

describe('LessonsView — seasons', () => {
  it('uses the authored dominant lane to choose a physical instrument node and canonical notation colour', () => {
    const progress = computeLessonProgress([
      makeLessonSong('01.01', {
        targetLanes: [
          { element: 'snare', weight: 0.25 },
          { element: 'kick', weight: 0.75 },
        ],
      }),
    ]);

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const node = screen.getByTestId('lesson-item-01.01');

    expect(node).toHaveAttribute('data-node-instrument', 'kick-pad');
    expect(node).toHaveAttribute('data-color-lane', 'orange');
    expect(within(node).getByText('Kick')).toBeInTheDocument();
    expect(node.querySelector('img')).toHaveAttribute('draggable', 'false');
  });

  it('renders every unit as an active or completed season', () => {
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
      'active',
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

  it('uses the accessible season rail to move the spatial studio to any mounted season', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const rail = screen.getByTestId('lesson-season-rail');

    expect(
      within(rail).getByRole('button', { name: 'Season 3: Grooves' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('lesson-season-stage')).toHaveAttribute(
      'data-selected-season-state',
      'active',
    );
    expect(screen.getByTestId('journey-world-marker')).toHaveTextContent(
      'Season 02ReadingCurrent stage',
    );
    expect(screen.getByTestId('journey-world-title')).toHaveTextContent(
      'Reading',
    );
    expect(screen.getByTestId('journey-world-title')).not.toHaveTextContent(
      '…',
    );
    expect(
      screen.getByTestId('season-rail-state-Foundations'),
    ).toHaveTextContent('Cleared');
    expect(screen.getByTestId('season-rail-state-Grooves')).toHaveTextContent(
      'Live',
    );

    fireEvent.click(screen.getByTestId('season-rail-Grooves'));

    expect(screen.getByTestId('season-card-Grooves')).toHaveAttribute(
      'data-featured',
      'true',
    );
    expect(screen.getByTestId('season-card-Grooves')).toHaveAttribute(
      'data-expanded',
      'true',
    );
    expect(screen.getByTestId('season-card-Reading')).toHaveAttribute(
      'data-featured',
      'false',
    );
    expect(screen.getByTestId('lesson-season-stage')).toHaveAttribute(
      'data-selected-season-state',
      'active',
    );
    expect(screen.getByTestId('journey-world-marker')).toHaveTextContent(
      'Season 03GroovesCurrent stage',
    );
    expect(screen.getByTestId('journey-world-title')).toHaveTextContent(
      'Grooves',
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
      '10 / 10 ·',
    );
  });
});

describe('LessonsView — path nodes', () => {
  it('marks completed, next-up, and explorable nodes distinctly', () => {
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
      'available',
    );
    expect(screen.getByTestId('lesson-item-03.01')).toHaveAttribute(
      'data-node-state',
      'available',
    );
  });

  it('marks only the next-up node for reduced-motion-safe CSS emphasis', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lesson-item-02.02')).toHaveAttribute(
      'data-node-state',
      'next-up',
    );
    expect(screen.getByTestId('lesson-item-01.01')).not.toHaveAttribute(
      'data-node-state',
      'next-up',
    );
    expect(screen.getByTestId('lesson-item-02.02')).not.toHaveClass(
      'motion-safe:animate-pulse',
    );
  });

  it('turns prerequisite gates into skill invitations', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const invitation = screen.getByTestId('lesson-item-02.03');

    expect(invitation).not.toHaveAttribute('data-locked');
    expect(invitation).not.toHaveClass('daybreak-lesson-node--locked');
    expect(within(invitation).getByText('Snare')).toBeInTheDocument();
    expect(
      within(invitation).queryByText(/Clear \d+ more lesson/),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('lesson-open-path-styles')).toHaveTextContent(
      'builds',
    );
  });

  it('launches a later lesson even when no prerequisite is met', async () => {
    const progress = makeMixedProgress();
    const onPlay = vi.fn();

    render(
      <LessonsView progress={progress} onPlay={onPlay} onRescan={vi.fn()} />,
      { wrapper },
    );

    fireEvent.click(screen.getByTestId('lesson-item-02.03'));

    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
    expect(onPlay.mock.calls[0][0].lesson.id).toBe('02.03');
  });

  it('shows earned stars on a played node and none on an unplayed node', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const played = screen.getByTestId('lesson-item-02.02');
    const unplayed = screen.getByTestId('lesson-item-02.03');

    expect(played.querySelectorAll('[data-filled="true"]')).toHaveLength(2);
    expect(unplayed.querySelectorAll('[data-filled="true"]')).toHaveLength(0);
    expect(screen.getByTestId('lesson-open-path-styles')).toHaveTextContent(
      ".daybreak-lesson-node__stars:has([data-filled='true'])",
    );
  });

  it('strikes and sounds an unlocked drum node before opening it', async () => {
    const progress = makeMixedProgress();
    const onPlay = vi.fn();

    render(
      <LessonsView progress={progress} onPlay={onPlay} onRescan={vi.fn()} />,
      { wrapper },
    );

    fireEvent.click(screen.getByTestId('lesson-item-01.02'));

    expect(playKitPreviewMock).toHaveBeenCalledOnce();
    expect(
      screen
        .getByTestId('lesson-item-01.02')
        .querySelector('.daybreak-lesson-node__strike-stick'),
    ).toHaveAttribute('data-active', 'true');
    expect(onPlay).not.toHaveBeenCalled();

    await waitFor(() => expect(onPlay).toHaveBeenCalledTimes(1));
    expect(onPlay.mock.calls[0][0].lesson.id).toBe('01.02');
  });

  it('marks the current unlocked lesson as the deterministic kit target', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    expect(screen.getByTestId('lesson-item-02.02')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );
    expect(screen.getByTestId('lesson-item-02.01')).not.toHaveAttribute(
      'data-kit-focused',
    );
  });

  it('uses fresh-profile MIDI lanes to move focus, start a lesson, and back out without control mappings', () => {
    seedFreshMidiJourneyProfile();

    const progress = makeMixedProgress();
    const onPlay = vi.fn();
    const onBack = vi.fn();

    render(
      <LessonsView
        progress={progress}
        onPlay={onPlay}
        onRescan={vi.fn()}
        onBack={onBack}
      />,
      { wrapper },
    );

    const legend = within(
      screen.getByTestId('season-card-Reading'),
    ).getByTestId('journey-kit-controls');

    expect(legend).toHaveAttribute('data-control-source', 'kit-lanes');
    expect(legend).toHaveTextContent(
      'Tom 1 / Tom 2 select · Crash starts · Snare / Tom 3 change season · Ride backs',
    );
    expect(legend).toHaveTextContent('Season');
    expect(screen.getByTestId('lesson-item-02.02')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );

    hitMidiNote(73);
    expect(screen.getByTestId('season-card-Foundations')).toHaveAttribute(
      'data-featured',
      'true',
    );
    hitMidiNote(77);
    expect(screen.getByTestId('season-card-Reading')).toHaveAttribute(
      'data-featured',
      'true',
    );

    hitMidiNote(71);
    expect(screen.getByTestId('lesson-item-02.01')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );

    hitMidiNote(72);
    expect(screen.getByTestId('lesson-item-02.02')).toHaveAttribute(
      'data-kit-focused',
      'true',
    );

    hitMidiNote(71);
    hitMidiNote(74);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.calls[0][0].lesson.id).toBe('02.01');
    expect(playKitPreviewMock).not.toHaveBeenCalled();
    expect(
      screen
        .getByTestId('lesson-item-02.01')
        .querySelector('.daybreak-lesson-node__strike-stick'),
    ).toHaveAttribute('data-active', 'false');

    hitMidiNote(76);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('prints crash start and ride leave chips when the kit route is active', () => {
    render(
      <LessonsView
        progress={makeMixedProgress()}
        onPlay={vi.fn()}
        onRescan={vi.fn()}
        onBack={vi.fn()}
        kitConnected
      />,
      { wrapper },
    );

    expect(screen.getByTestId('kit-action-chip-continue')).toHaveAttribute(
      'data-pad',
      'crash',
    );
    expect(screen.getByTestId('kit-action-chip-end')).toHaveAttribute(
      'data-pad',
      'ride',
    );
  });

  it('keeps journey controls quiet until the player asks for them', () => {
    const progress = makeMixedProgress();

    render(
      <LessonsView progress={progress} onPlay={vi.fn()} onRescan={vi.fn()} />,
      { wrapper },
    );

    const controls = screen.getAllByTestId('journey-kit-controls')[0];

    expect(controls).toHaveAttribute('data-visible', 'false');

    fireEvent.click(screen.getAllByTestId('journey-controls-toggle')[0]);

    expect(controls).toHaveAttribute('data-visible', 'true');
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
