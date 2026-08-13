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
import { HOME_KIT_ZONE_MAP, type KitZoneMap } from './kit-zone-map';
import { computeKitTextSafeBands } from './kit-text-safe-bands';

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

  it('shows the selected input visibly on the kit home', () => {
    window.localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'keyboard',
        name: 'Keyboard',
        sourceId: 'keyboard',
      }),
    );

    render(
      <InputProvider>
        <HomeCockpit
          songList={[song]}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    const readiness = screen.getByTestId('home-input-readiness');

    expect(readiness).toHaveAttribute('data-state', 'connected');
    expect(readiness).toHaveTextContent('Connected · Keyboard');
    expect(readiness).not.toHaveClass('sr-only');
  });

  it('names a remembered kit while it reconnects instead of claiming it is ready', () => {
    window.localStorage.setItem(
      'settings.selectedDevice',
      JSON.stringify({
        id: 'midi:Yamaha DTX402',
        name: 'Yamaha DTX402',
        sourceId: 'midi',
        port: 0,
      }),
    );

    render(
      <InputProvider>
        <HomeCockpit
          songList={[song]}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    const readiness = screen.getByTestId('home-input-readiness');

    expect(readiness).toHaveAttribute('data-state', 'reconnecting');
    expect(readiness).toHaveTextContent('Reconnecting · Yamaha DTX402');
    expect(readiness).not.toHaveClass('sr-only');
  });

  it('shows that no kit is found when no input device is selected', () => {
    render(
      <InputProvider>
        <HomeCockpit
          songList={[song]}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    const readiness = screen.getByTestId('home-input-readiness');

    expect(readiness).toHaveAttribute('data-state', 'waiting');
    expect(readiness).toHaveTextContent('No MIDI kit found');
    expect(readiness).not.toHaveClass('sr-only');
  });

  it('requires the same confirm control as Songs before a physical kit starts the armed target', () => {
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

    fireEvent.keyDown(window, { code: 'KeyA' });

    expect(onStartRecommended).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { code: 'KeyB' });
    fireEvent.keyDown(window, { code: 'KeyH' });

    expect(onStartRecommended).toHaveBeenCalledTimes(1);
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

  it('never shows an XP or streak readout on home - progress is earned on the profile route, not here', () => {
    // 2026-08-13 critique, home item 4: an unearned counter shown before
    // anything is played must not just move to quieter type, it must not
    // render in the first viewport at all. Profile is already a primary
    // rail destination (AppShell), so home carries no duplicate affordance
    // for it either.
    const { container } = render(
      <InputProvider>
        <HomeCockpit
          songList={[song]}
          gamification={gamification}
          recommendation={recommendation}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    expect(
      screen.queryByTestId('home-profile-snapshot'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-open-profile')).not.toBeInTheDocument();
    expect(screen.queryByText(/no active streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bXP\b/)).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('View profile');
  });

  it('does not contradict an armed hero with idle "choose a song" shelf copy', () => {
    // The exact defect from the 2026-08-13 critique: the hero read a
    // specific armed lesson while the shelf beneath it still said "Choose a
    // song to begin" - two states on one screen. Root cause was
    // `resolveShelfCopy` losing its `hasPracticeTarget` argument at the
    // call site. Assert on the `<strong>` node directly, not the whole
    // `home-session-summary` text content - that node also contains a
    // closed `<details>` whose text is present in the DOM regardless of
    // open/closed state, so a substring match there can pass for the wrong
    // reason.
    render(
      <InputProvider>
        <HomeCockpit
          songList={[lessonSong, song]}
          gamification={gamification}
          recommendation={lessonRecommendation}
          practiceRanking={[lessonRecommendation, songRecommendation]}
          practiceWave={practiceWave}
          onStartRecommended={vi.fn()}
          onOpenSongs={vi.fn()}
          onOpenProfile={vi.fn()}
        />
      </InputProvider>,
    );

    expect(screen.getByTestId('home-start-practice')).toBeInTheDocument();

    const shelfHeadline = screen
      .getByTestId('home-session-summary')
      .querySelector('strong');

    expect(shelfHeadline).not.toHaveTextContent('Choose a song to begin');
  });
});

/**
 * Independent re-implementation of a zone's projected bounding box - a
 * fresh reading of the geometry, not a call into `computeKitTextSafeBands`
 * or `fitKitZone` - so these assertions cannot pass merely because the
 * production code and the test share one bug. Same cover/crop projection
 * `fitKitZone` uses, applied to each ellipse's true rotated bounding box.
 */
function projectZoneBox(
  zone: KitZoneMap['zones'][keyof KitZoneMap['zones']],
  image: KitZoneMap['image'],
  container: { width: number; height: number },
) {
  const scale = Math.max(
    container.width / image.width,
    container.height / image.height,
  );
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  const cropX = (renderedWidth - container.width) / 2;
  const cropY = (renderedHeight - container.height) / 2;
  const radians = (zone.rotation * Math.PI) / 180;
  const halfX = Math.sqrt(
    (zone.radii.x * Math.cos(radians)) ** 2 +
      (zone.radii.y * Math.sin(radians)) ** 2,
  );
  const halfY = Math.sqrt(
    (zone.radii.x * Math.sin(radians)) ** 2 +
      (zone.radii.y * Math.cos(radians)) ** 2,
  );

  return {
    left: (zone.center.x - halfX) * renderedWidth - cropX,
    right: (zone.center.x + halfX) * renderedWidth - cropX,
    top: (zone.center.y - halfY) * renderedHeight - cropY,
    bottom: (zone.center.y + halfY) * renderedHeight - cropY,
  };
}

function rectsOverlap(
  a: { top: number; left: number; width: number; height: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  const aRight = a.left + a.width;
  const aBottom = a.top + a.height;

  return (
    a.left < b.right && aRight > b.left && a.top < b.bottom && aBottom > b.top
  );
}

function readBandRect(testId: string) {
  const el = screen.getByTestId(testId);

  return {
    top: parseFloat(el.style.top || '0'),
    left: parseFloat(el.style.left || '0'),
    width: parseFloat(el.style.width || '0'),
    height: parseFloat(el.style.height || '0'),
  };
}

const geometryLesson = {
  id: 'lesson-geometry',
  name: 'Lesson 01.01 — Alternating Singles Warm-Up',
  artist: 'Drumroll Method',
  lesson: {
    id: '01.01',
    title: 'Alternating Singles Warm-Up',
    starsToUnlock: 0,
    unit: 'Foundations',
  },
} as unknown as Song;
const geometryRecommendation = {
  candidate: {
    id: geometryLesson.id,
    title: geometryLesson.name,
    kind: 'lesson',
    difficulty: 'easy',
    available: true,
  },
  suggestedSpeed: 0.7,
  predictedSuccess: 0.7,
} as never;

describe('text-safe geometry (2026-08-13 critique: text must never cover a strike zone)', () => {
  // The two window sizes Drumroll actually ships/captures QA against -
  // `windowConfig.ts`'s default (1366x768; the QA harness's own capture
  // script narrows the wide shot to 1225) and its enforced minimum
  // (1024x700) - minus the rail `AppShell.css` actually reserves (13rem
  // desktop, 4rem below the 1120px compact breakpoint; the content pane
  // itself carries no padding), which is the studio's real box.
  const VIEWPORTS = [
    {
      name: 'wide (1225x768 window, 208px rail)',
      width: 1225 - 208,
      height: 768,
    },
    {
      name: 'compact (1024x700 window, 64px rail)',
      width: 1024 - 64,
      height: 700,
    },
  ];

  VIEWPORTS.forEach(({ name, width, height }) => {
    it(`keeps the title band and the action band clear of every strike zone at the ${name} studio size, and matches computeKitTextSafeBands exactly`, () => {
      const gbcrSpy = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({
          width,
          height,
          top: 0,
          left: 0,
          right: width,
          bottom: height,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect);

      try {
        render(
          <InputProvider>
            <HomeCockpit
              songList={[geometryLesson]}
              gamification={gamification}
              recommendation={geometryRecommendation}
              onStartRecommended={vi.fn()}
              onOpenSongs={vi.fn()}
              onOpenProfile={vi.fn()}
            />
          </InputProvider>,
        );

        const titleBand = readBandRect('home-session-manifest');
        const actionBand = readBandRect('home-action-band');

        // Sanity: the component actually measured the mocked studio and
        // positioned real, non-degenerate bands - not the zero-size
        // fallback `computeKitTextSafeBands` returns for an unmeasured
        // container.
        expect(titleBand.height).toBeGreaterThan(0);
        expect(actionBand.height).toBeGreaterThan(0);

        // Proves the rendered bands are actually WIRED to the geometry
        // function at this exact studio size - not just coincidentally
        // safe - so this test keeps holding if `HOME_KIT_ZONE_MAP` or the
        // hero photo's aspect ratio ever changes: the safe-band unit tests
        // (kit-text-safe-bands.test.ts) prove the math; this proves the
        // component actually uses it.
        const expected = computeKitTextSafeBands(HOME_KIT_ZONE_MAP, {
          width,
          height,
        });

        (['top', 'left', 'width', 'height'] as const).forEach((key) => {
          expect(titleBand[key]).toBeCloseTo(expected.top[key], 1);
          expect(actionBand[key]).toBeCloseTo(expected.bottom[key], 1);
        });

        // The actual proof rule 1 asks for: neither band's rendered
        // bounding box intersects any strike zone's projected ellipse
        // bounding box, for every one of the eight zones.
        Object.values(HOME_KIT_ZONE_MAP.zones).forEach((zone) => {
          const box = projectZoneBox(zone, HOME_KIT_ZONE_MAP.image, {
            width,
            height,
          });

          expect(rectsOverlap(titleBand, box)).toBe(false);
          expect(rectsOverlap(actionBand, box)).toBe(false);
        });
      } finally {
        gbcrSpy.mockRestore();
      }
    });
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
  it('shows the choose-a-song state whenever no practice target is armed, regardless of session', () => {
    expect(resolveShelfCopy(undefined, false)).toEqual({
      title: 'Choose a song to begin',
      detail: 'Pick a song, then strike a highlighted drum to start.',
    });

    const payoff: HomeSessionReceipt = {
      title: 'Boulevard of Broken Dreams',
      detail: 'Apply the session in your goal song.',
      candidateId: 'song-1',
    };

    // Even a real payoff receipt must not out-rank an unarmed hero - the
    // hero above already reads "Choose a song" in that state, and showing
    // a song title in the shelf underneath it would be the same
    // self-contradiction this function exists to prevent, just inverted
    // (2026-08-13 critique, home item 1).
    expect(resolveShelfCopy(payoff, false)).toEqual({
      title: 'Choose a song to begin',
      detail: 'Pick a song, then strike a highlighted drum to start.',
    });
  });

  it('never surfaces next-practice/home-session.ts own dead-end placeholder verbatim once armed', () => {
    const deadEnd: HomeSessionReceipt = {
      title: 'No musical payoff yet',
      detail: 'No playable favourite-song section is currently ranked.',
    };

    // Armed (the hero reads a specific lesson/song), but nothing was ranked
    // as a payoff: the shelf must say so honestly, never fall back to the
    // idle "Choose a song to begin" copy - that was exactly the bug the
    // 2026-08-13 critique caught (hero armed, shelf still idle) because the
    // call site once dropped this second argument entirely. The copy
    // itself changed for the same critique's item 5 ("No song payoff yet
    // - No favourite-song section is ranked to play yet" only ever named
    // an absence): it must now point at the next real thing, not repeat
    // "no"/"ranked" back at the player.
    expect(resolveShelfCopy(deadEnd, true)).toEqual({
      title: 'Building toward your next song',
      detail: 'Clean reps here move a favourite-song section into range.',
    });

    expect(resolveShelfCopy(undefined, true)).toEqual({
      title: 'Building toward your next song',
      detail: 'Clean reps here move a favourite-song section into range.',
    });
  });

  it('passes a real payoff receipt through unchanged once armed', () => {
    const payoff: HomeSessionReceipt = {
      title: 'Boulevard of Broken Dreams',
      detail:
        'Apply the session in your goal song. A safe section probe will appear when chart evidence supports one.',
      candidateId: 'song-1',
    };

    expect(resolveShelfCopy(payoff, true)).toEqual({
      title: payoff.title,
      detail: payoff.detail,
    });
  });
});
