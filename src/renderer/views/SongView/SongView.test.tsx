import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BEAT_SECONDS,
  COUNT_IN_BEATS,
  GUITAR_ONLY_CHART,
  SINGLE_NOTE_CHART,
  makeSong,
  setupSongView,
} from '../test-support';
import { multiLaneRunFixture } from '../../components/PracticeStats/test-fixtures';

const MULTI_STEM = {
  audio: [
    { src: 'drums.ogg', name: 'drums' },
    { src: 'guitar.ogg', name: 'guitar' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opening a song', () => {
  it('shows the song header and real rendered sheet music', async () => {
    const view = setupSongView();

    await view.loadSong();

    expect(screen.getAllByText('Master of Puppets').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Metallica').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.querySelectorAll('svg').length).toBeGreaterThan(0);
    });
  });

  it('prevents display sleep while open and releases it on leave', () => {
    const view = setupSongView();

    expect(view.sentChannels()).toContain('prevent-sleep');

    view.unmount();

    expect(view.sentChannels()).toContain('resume-sleep');
  });

  it('reports a load failure and returns to the library', async () => {
    const view = setupSongView();

    await act(async () => {
      view.ipc.emit('load-song', { error: 'missing' });
    });

    expect(screen.getByText("Couldn't open this song")).toBeInTheDocument();
    expect(screen.getByTestId('song-list-stub')).toBeInTheDocument();
  });

  it('reports a chart that has no parsable drum track', async () => {
    const view = setupSongView();

    await view.loadSong(makeSong(), GUITAR_ONLY_CHART);

    expect(screen.getByText('Chart parse failed')).toBeInTheDocument();
  });

  it('shows the difficulty selected in app settings', async () => {
    const view = setupSongView({ settings: { difficulty: 'hard' } });

    await view.loadSong();

    expect(screen.getByText('hard')).toBeInTheDocument();
  });

  it('switches the same chart between continuous Flow and Classic notation', async () => {
    const view = setupSongView({
      settings: { practiceNotationLayout: 'flow' },
    });

    await view.loadSong();

    const flowNotation = screen.getByTestId('flow-notation');
    const flowHud = screen.getByTestId('flow-viewport-hud');

    expect(flowNotation).toBeInTheDocument();
    expect(flowNotation).toHaveAttribute('data-presentation-zoom', '1.50');
    expect(flowNotation).toHaveStyle({ zoom: '1.5' });
    expect(flowHud).toHaveAttribute('data-mode', 'perform');
    expect(within(flowHud).getByText('Master of Puppets')).toBeInTheDocument();
    expect(within(flowHud).getByText('Metallica')).toBeInTheDocument();
    expect(within(flowHud).getByText('Perform flow')).toBeInTheDocument();
    expect(
      within(flowNotation).queryByRole('heading', {
        name: 'Master of Puppets',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('notation-flow-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByTestId('notation-classic-toggle'));

    await waitFor(() => {
      expect(screen.queryByTestId('flow-notation')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('flow-viewport-hud')).not.toBeInTheDocument();
    expect(screen.getByTestId('notation-classic-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      JSON.parse(
        window.localStorage.getItem('settings.practiceNotationLayout') ?? '""',
      ),
    ).toBe('classic');
  });

  it('opens Coach from a Home deep link without consuming any loop params', async () => {
    const view = setupSongView({ route: '/song-1?coachOpen=1' });

    await view.loadSong();

    await waitFor(() => {
      expect(view.ipc.sent).toContainEqual({
        channel: 'load-practice-runs',
        args: ['song-1'],
      });
    });
    expect(screen.getByText('AI practice coach')).toBeInTheDocument();
  });
});

describe('playing with count-in', () => {
  it('counts a full measure in, schedules the music at the count-in end, then plays', async () => {
    vi.useFakeTimers();

    try {
      const view = setupSongView();

      await view.loadSong();
      view.clickPlay();

      expect(screen.getByText('1')).toBeInTheDocument();

      const songStart = COUNT_IN_BEATS * BEAT_SECONDS;
      const scheduled = view.audio.bufferSources.flatMap((s) => s.starts);

      expect(scheduled.some((start) => start.at === songStart)).toBe(true);

      await view.completeCountIn();

      expect(screen.queryByText('1')).not.toBeInTheDocument();
      expect(view.startedSources().length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the count-in when the play button is pressed again', async () => {
    vi.useFakeTimers();

    try {
      const view = setupSongView();

      await view.loadSong();
      view.clickPlay();

      expect(screen.getByText('1')).toBeInTheDocument();

      view.clickPlay();
      await view.completeCountIn();

      expect(screen.queryByText('1')).not.toBeInTheDocument();
      expect(view.startedSources()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('disabling the count-in from settings', () => {
  it('starts playback immediately after the count-in switch is turned off', async () => {
    const view = setupSongView();

    await view.loadSong();

    view.openSettings();
    view.openMoreSettings();
    view.toggleSetting('count-in');
    view.clickPlay();

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(view.startedSources().length).toBeGreaterThan(0);
  });

  it('pauses and resumes from the play button', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    view.clickPlay();
    expect(view.startedSources().length).toBeGreaterThan(0);

    view.clickPlay();
    expect(view.audio.state).toBe('suspended');
  });
});

describe('metronome', () => {
  it('unmuting the click track in settings makes the clicks audible on the beat grid', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    view.openSettings();
    view.clickTrackMuteToggle();
    view.clickPlay();

    const clickGainRaised = view.audio.gainNodes.some((node) =>
      node.gain.calls.some((call) => call.value === 0.8),
    );

    expect(clickGainRaised).toBe(true);
  });
});

describe('playhead', () => {
  it('shows a cursor over the sheet by default', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    expect(view.playheadCursor().style.display).not.toBe('none');

    view.clickPlay();

    expect(view.playheadCursor().style.display).not.toBe('none');
  });

  it('highlights the current measure instead when Measure style is chosen', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    view.openSettings();
    view.clickTestId('playhead-Measure');
    view.clickPlay();

    const [firstMeasure] = view.measureHighlights();

    expect(firstMeasure).toHaveAttribute('data-current');
    expect(view.playheadCursor().style.display).toBe('none');
  });
});

describe('sheet appearance', () => {
  it('renders drum-colored noteheads until colors are switched off in settings', async () => {
    const view = setupSongView();

    await view.loadSong();

    expect(document.querySelectorAll('.vf-note-snare').length).toBeGreaterThan(
      0,
    );
    expect(document.querySelectorAll('.vf-note-uncolored')).toHaveLength(0);

    view.openSettings();
    view.openMoreSettings();
    view.toggleSetting('colors');

    await waitFor(() => {
      expect(
        document.querySelectorAll('.vf-note-uncolored').length,
      ).toBeGreaterThan(0);
      expect(document.querySelectorAll('.vf-note-snare')).toHaveLength(0);
    });
  });
});

describe('drumming and scoring', () => {
  it('persists a high score after a hit lands on a charted note', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong();

    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    expect(screen.getByTestId('score-modal')).toBeInTheDocument();
    expect(view.updateSongPayloads()).toEqual([
      {
        id: 'song-1',
        scoreData: { expert: { hitNotes: 1, totalNotes: 8, falseHits: 0 } },
      },
    ]);
  });

  it('counts a hit on the wrong drum against the score', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        kit: { snare: ['keyboard:KeyJ'], kick: ['keyboard:KeyK'] },
      },
    });

    await view.loadSong();

    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.pressKey('KeyK');
    await view.finishSong();

    expect(view.updateSongPayloads()).toEqual([
      {
        id: 'song-1',
        scoreData: { expert: { hitNotes: 1, totalNotes: 8, falseHits: 1 } },
      },
    ]);
  });

  it('shows the score modal but persists nothing for a run with no hits', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    view.clickPlay();
    await view.finishSong();

    expect(screen.getByTestId('score-modal')).toBeInTheDocument();
    expect(view.sentChannels()).not.toContain('update-song');
  });

  it('does not persist a run that fails to beat the previous high score', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong(
      makeSong({
        scoreData: { expert: { hitNotes: 8, totalNotes: 8, falseHits: 0 } },
      }),
    );

    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    expect(screen.getByTestId('score-modal')).toBeInTheDocument();
    expect(view.sentChannels()).not.toContain('update-song');
  });

  it('treats a kit key that doubles as the pause control as a drum while playing', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        kit: { snare: ['keyboard:KeyJ'] },
        controls: { pause: ['keyboard:KeyJ'] },
      },
    });

    await view.loadSong();

    view.clickPlay();
    await view.pressKey('KeyJ');

    expect(view.audio.state).toBe('running');

    await view.finishSong();

    expect(view.updateSongPayloads()).toEqual([
      {
        id: 'song-1',
        scoreData: { expert: { hitNotes: 1, totalNotes: 8, falseHits: 0 } },
      },
    ]);
  });

  it('restarts the song from the top on retry', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    view.clickPlay();
    await view.finishSong();

    view.clickTestId('score-retry');

    expect(view.startedSources().length).toBeGreaterThan(0);
  });

  it('returns to the library on next song', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    view.clickPlay();
    await view.finishSong();

    view.clickTestId('score-next');

    expect(screen.getByTestId('song-list-stub')).toBeInTheDocument();
  });

  it('advances from the score modal to the library with the confirm control', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { controls: { confirm: ['keyboard:Enter'] } },
    });

    await view.loadSong();

    view.clickPlay();
    await view.finishSong();
    await view.pressKey('Enter');

    expect(screen.getByTestId('song-list-stub')).toBeInTheDocument();
  });
});

describe('transport controls', () => {
  it('starts and pauses playback from mapped keys', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        controls: { confirm: ['keyboard:Enter'], pause: ['keyboard:Space'] },
      },
    });

    await view.loadSong();

    await view.pressKey('Enter');
    expect(view.startedSources().length).toBeGreaterThan(0);

    await view.pressKey('Space');
    expect(view.audio.state).toBe('suspended');
  });

  it('returns to the library from the back control while stopped', async () => {
    const view = setupSongView({
      keyboard: { controls: { back: ['keyboard:Escape'] } },
    });

    await view.loadSong();
    await view.pressKey('Escape');

    expect(screen.getByTestId('song-list-stub')).toBeInTheDocument();
  });

  it('navigates back to the library from the back button', async () => {
    const view = setupSongView();

    await view.loadSong();
    view.clickTestId('back-button');

    expect(screen.getByTestId('song-list-stub')).toBeInTheDocument();
  });
});

describe('keyboard transport shortcuts', () => {
  it('toggles pause and resume with Space, with zero configuration', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    await view.pressKey('Space');
    expect(view.startedSources().length).toBeGreaterThan(0);

    await view.pressKey('Space');
    expect(view.audio.state).toBe('suspended');

    await view.pressKey('Space');
    expect(view.audio.state).toBe('running');
  });

  it('lets an explicit ControlMapping binding own Space entirely, instead of layering the default on top', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        controls: { confirm: ['keyboard:Enter'], pause: ['keyboard:Space'] },
      },
    });

    await view.loadSong();

    await view.pressKey('Enter');
    await view.pressKey('Space');
    expect(view.audio.state).toBe('suspended');

    // The mapped 'pause' control only pauses - it never toggles back to
    // play. If the new keyboard default were also layered on this key it
    // would resume here; it must not, since the user explicitly claimed
    // Space via ControlMapping.
    await view.pressKey('Space');
    expect(view.audio.state).toBe('suspended');
  });

  it('seeks forward and backward by 15 seconds and shows a transient indicator', async () => {
    // Fake timers keep this deterministic under system load: the
    // indicator auto-hides itself after ~900ms of real time, which a slow
    // test run could otherwise blow through before the assertion runs.
    vi.useFakeTimers();

    try {
      const view = setupSongView();

      await view.loadSong();

      await view.pressKey('ArrowRight');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+15s',
      );

      await view.pressKey('ArrowLeft');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '-15s',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('accelerates repeated same-direction presses within the idle window, capping at 60s', async () => {
    vi.useFakeTimers();

    try {
      const view = setupSongView();

      await view.loadSong();

      await view.pressKey('ArrowRight');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+15s',
      );

      await view.pressKey('ArrowRight');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+30s',
      );

      await view.pressKey('ArrowRight');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+60s',
      );

      await view.pressKey('ArrowRight');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+60s',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the seek interval once the idle window elapses', async () => {
    vi.useFakeTimers();

    try {
      const view = setupSongView();

      await view.loadSong();

      await view.pressKey('ArrowRight');
      await view.pressKey('ArrowRight');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+30s',
      );

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      await view.pressKey('ArrowRight');

      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+15s',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets the seek interval when the direction changes', async () => {
    vi.useFakeTimers();

    try {
      const view = setupSongView();

      await view.loadSong();

      await view.pressKey('ArrowRight');
      await view.pressKey('ArrowRight');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '+30s',
      );

      await view.pressKey('ArrowLeft');
      expect(screen.getByTestId('transport-indicator')).toHaveTextContent(
        '-15s',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps a backward seek at the start of the song', async () => {
    const view = setupSongView();

    await view.loadSong();

    await view.pressKey('ArrowLeft');

    await waitFor(() => {
      expect(view.currentTimeText()).toBe('00:00');
    });
  });

  it('steps the practice speed with the arrow keys, within the existing bounds', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();

    const speed = () =>
      (screen.getByRole('spinbutton') as HTMLInputElement).value;

    expect(speed()).toBe('1.0');

    await view.pressKey('ArrowUp');
    expect(speed()).toBe('1.1');

    await view.pressKey('ArrowDown');
    await view.pressKey('ArrowDown');
    expect(speed()).toBe('0.9');
  });

  it('shows a locked hint instead of changing speed in Perform mode', async () => {
    const view = setupSongView();

    await view.loadSong();

    await view.pressKey('ArrowUp');

    expect(screen.getByText('Speed locked in Perform')).toBeInTheDocument();
  });

  it('recreates the default 1x player when the same song switches from slowed Practice to Perform', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong();
    await view.pressKey('ArrowDown');
    await view.pressKey('ArrowDown');
    await view.pressKey('ArrowDown');
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe(
      '0.7',
    );

    view.navigate('/song-1?gameMode=perform');

    await waitFor(() =>
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('play-toggle')).not.toBeDisabled(),
    );

    view.clickPlay();
    await view.pressKey('KeyJ');
    expect(view.startedSources().length).toBeGreaterThan(0);
    await view.finishSong();

    await waitFor(() =>
      expect(
        view.ipc.sent.some((entry) => entry.channel === 'save-practice-run'),
      ).toBe(true),
    );

    const payload = view.ipc.sent.find(
      (entry) => entry.channel === 'save-practice-run',
    )?.args[0];

    expect(payload).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          mode: 'perform',
          playbackSpeed: 1,
        }),
      }),
    );
  });

  it('ignores the shortcuts while a text input has focus', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();

    const spinbutton = screen.getByRole('spinbutton');

    await act(async () => {
      fireEvent.keyDown(spinbutton, { code: 'Space' });
    });

    expect(view.startedSources()).toHaveLength(0);
  });

  it('ignores the shortcuts while the score modal has focus', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong();

    view.clickPlay();
    await view.finishSong();

    const modal = screen.getByTestId('score-modal');
    const accuracyText = within(modal).getByText(/accuracy|Perfect/);

    await act(async () => {
      fireEvent.keyDown(accuracyText, { code: 'ArrowRight' });
    });

    expect(screen.queryByTestId('transport-indicator')).toBeNull();
  });
});

describe('exporting a PDF', () => {
  it('sends the rendered sheet to main and reports success', async () => {
    const view = setupSongView();

    await view.loadSong();

    view.openSettings();
    view.clickTestId('export-pdf');

    const request = view.ipc.sent.find((s) => s.channel === 'export-pdf');

    expect(request?.args[0]).toMatchObject({
      fileName: 'Master of Puppets - Metallica.pdf',
    });

    await act(async () => {
      view.ipc.emit('export-pdf', { ok: true, filePath: '/tmp/out.pdf' });
    });

    expect(screen.getByText('PDF exported')).toBeInTheDocument();
  });
});

describe('practice mode', () => {
  it('offers speed and loop controls instead of scoring', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();

    expect(screen.getByText('Speed:')).toBeInTheDocument();
    expect(screen.getByText('Loop:')).toBeInTheDocument();
  });

  it('shows no speed or loop controls when performing', async () => {
    const view = setupSongView();

    await view.loadSong();

    expect(screen.queryByText('Speed:')).toBeNull();
    expect(screen.queryByText('Loop:')).toBeNull();
  });

  it('moves the measure focus with the mapped navigation keys', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      keyboard: {
        controls: { right: ['keyboard:ArrowRight'] },
      },
    });

    await view.loadSong();

    expect(
      view.measureHighlights().some((el) => el.hasAttribute('data-focused')),
    ).toBe(false);

    await view.pressKey('ArrowRight');

    expect(
      view.measureHighlights().some((el) => el.hasAttribute('data-focused')),
    ).toBe(true);
  });

  it('advances the measure focus with repeated navigation', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      keyboard: { controls: { right: ['keyboard:ArrowRight'] } },
    });

    await view.loadSong();

    await view.pressKey('ArrowRight');
    await view.pressKey('ArrowRight');

    const focused = view
      .measureHighlights()
      .find((el) => el.hasAttribute('data-focused'));

    expect(focused).toHaveAttribute('data-measure-index', '1');
  });

  it('locks a loop from the focused measure, extends it, and clears it', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      keyboard: {
        controls: {
          right: ['keyboard:ArrowRight'],
          confirm: ['keyboard:Enter'],
          back: ['keyboard:Escape'],
        },
      },
    });

    await view.loadSong();
    // Loop-locking a section only applies while looping is on - looping now
    // defaults off, so opt in explicitly for this test.
    view.clickTestId('loop-toggle');

    await view.pressKey('ArrowRight');
    await view.pressKey('Enter');

    expect(screen.getByText('Looping Section')).toBeInTheDocument();
    expect(screen.getByText('Measure 1')).toBeInTheDocument();

    await view.pressKey('ArrowRight');

    expect(screen.getByText('Measure 1 - 2')).toBeInTheDocument();

    await view.pressKey('Escape');

    expect(screen.queryByText('Looping Section')).not.toBeInTheDocument();
  });

  it('adjusts and clamps the practice speed', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      keyboard: {
        controls: {
          faster: ['keyboard:Equal'],
          slower: ['keyboard:Minus'],
        },
      },
    });

    await view.loadSong();

    const speed = () =>
      (screen.getByRole('spinbutton') as HTMLInputElement).value;

    expect(speed()).toBe('1.0');

    await view.pressKey('Equal');
    expect(speed()).toBe('1.1');

    for (let i = 0; i < 20; i += 1) {
      await view.pressKey('Equal');
    }

    expect(speed()).toBe('2.0');

    for (let i = 0; i < 30; i += 1) {
      await view.pressKey('Minus');
    }

    expect(speed()).toBe('0.3');
  });

  it('starts playback on confirm when no measure is selected', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      settings: { countIn: false },
      keyboard: { controls: { confirm: ['keyboard:Enter'] } },
    });

    await view.loadSong();

    await view.pressKey('Enter');

    expect(view.startedSources().length).toBeGreaterThan(0);
  });
});

// jsdom applies no real CSS (see vitest.config.ts's css module mock), so
// the `<main class="... overflow-auto ...">` scroll container SheetMusic's
// getScrollParent walks up to never actually resolves as scrollable unless
// its scroll geometry is stubbed directly, the same way
// services/engine/helpers.test.ts stubs it for getScrollParent's own tests.
function makeScrollable(
  el: HTMLElement,
  {
    scrollHeight,
    clientHeight,
  }: { scrollHeight: number; clientHeight: number },
) {
  el.style.overflowY = 'auto';
  Object.defineProperty(el, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', {
    value: clientHeight,
    configurable: true,
  });
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: clientHeight,
      left: 0,
      right: 800,
      width: 800,
      height: clientHeight,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect;
}

describe('practice loop selection', () => {
  it('selects a loop range by dragging across measures', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    view.clickTestId('loop-toggle');

    const [a, b] = view.measureHighlights();

    fireEvent.mouseDown(a);
    fireEvent.mouseEnter(b);

    expect(screen.getByText('Measure 1 - 2')).toBeInTheDocument();
    expect(a).toHaveAttribute('data-selected', 'true');
    expect(b).toHaveAttribute('data-selected', 'true');
  });

  it('normalizes a backward drag', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    view.clickTestId('loop-toggle');

    const [a, b] = view.measureHighlights();

    fireEvent.mouseDown(b);
    fireEvent.mouseEnter(a);

    expect(screen.getByText('Measure 1 - 2')).toBeInTheDocument();
  });

  it('stops extending the range once the drag ends', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    view.clickTestId('loop-toggle');

    const [a, b] = view.measureHighlights();

    fireEvent.mouseDown(a);
    fireEvent.mouseUp(document.body);
    fireEvent.mouseEnter(b);

    expect(screen.getByText('Measure 1')).toBeInTheDocument();
  });

  it('does not select while looping is off', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    // Looping defaults off - nothing to toggle.
    await view.loadSong();

    fireEvent.mouseDown(view.measureHighlights()[0]);

    expect(screen.queryByText('Looping Section')).not.toBeInTheDocument();
  });

  it('clears the selected range from the loop control', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    view.clickTestId('loop-toggle');

    fireEvent.mouseDown(view.measureHighlights()[0]);
    expect(screen.getByText('Looping Section')).toBeInTheDocument();

    view.clickTestId('clear-loop');

    expect(screen.queryByText('Looping Section')).not.toBeInTheDocument();
  });

  it('plays from a clicked measure once looping is off', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      settings: { countIn: false },
    });

    // Looping defaults off - nothing to toggle.
    await view.loadSong();

    fireEvent.click(view.measureHighlights()[1]);

    await waitFor(() => {
      expect(view.startedSources().length).toBeGreaterThan(0);
    });
  });

  it('scrolls the sheet by wheel while a selection drag is in progress', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    view.clickTestId('loop-toggle');

    const [a] = view.measureHighlights();
    const container = a.closest('main') as HTMLElement;

    makeScrollable(container, { scrollHeight: 2000, clientHeight: 500 });
    container.scrollTop = 100;

    fireEvent.mouseDown(a);

    await act(async () => {
      fireEvent.wheel(window, { deltaY: 120, deltaX: 0 });
    });

    expect(container.scrollTop).toBe(220);
  });

  it('leaves plain (non-drag) wheel scrolling untouched', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();

    const [a] = view.measureHighlights();
    const container = a.closest('main') as HTMLElement;

    makeScrollable(container, { scrollHeight: 2000, clientHeight: 500 });
    container.scrollTop = 100;

    // No mousedown/drag in progress - the wheel listener must back off and
    // leave the browser's own native scroll handling alone.
    await act(async () => {
      fireEvent.wheel(window, { deltaY: 120, deltaX: 0 });
    });

    expect(container.scrollTop).toBe(100);
  });

  it('auto-scrolls the sheet when a selection drag nears the top edge of the viewport', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    view.clickTestId('loop-toggle');

    const [a] = view.measureHighlights();
    const container = a.closest('main') as HTMLElement;

    makeScrollable(container, { scrollHeight: 2000, clientHeight: 500 });
    container.scrollTop = 300;

    fireEvent.mouseDown(a);

    await act(async () => {
      // Right at the container's own top edge - the fastest auto-scroll
      // speed, scrolling up (revealing earlier measures).
      fireEvent.mouseMove(window, { clientY: 0 });
    });

    await waitFor(
      () => {
        expect(container.scrollTop).toBeLessThan(300);
      },
      { timeout: 5000 },
    );

    fireEvent.mouseUp(document.body);
  });

  it('stops auto-scrolling once the drag ends', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    view.clickTestId('loop-toggle');

    const [a] = view.measureHighlights();
    const container = a.closest('main') as HTMLElement;

    makeScrollable(container, { scrollHeight: 2000, clientHeight: 500 });
    container.scrollTop = 300;

    fireEvent.mouseDown(a);

    await act(async () => {
      fireEvent.mouseMove(window, { clientY: 0 });
    });

    await waitFor(
      () => {
        expect(container.scrollTop).toBeLessThan(300);
      },
      { timeout: 5000 },
    );

    fireEvent.mouseUp(document.body);

    const afterDragEnds = container.scrollTop;

    // Give any still-running auto-scroll loop a real chance to keep
    // ticking; the position must not keep moving once the drag has ended.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.scrollTop).toBe(afterDragEnds);
  });
});

describe('the stem mixer', () => {
  it('shows a volume control for each stem in the mix', async () => {
    const view = setupSongView();

    await view.loadSong(makeSong(MULTI_STEM));
    view.openSettings();

    await waitFor(() => {
      expect(screen.getByText('drums')).toBeInTheDocument();
    });
    expect(screen.getByText('guitar')).toBeInTheDocument();
  });

  it('soloing a stem silences the others at the audio boundary', async () => {
    const view = setupSongView();

    await view.loadSong(makeSong(MULTI_STEM));
    view.openSettings();

    await waitFor(() => {
      expect(screen.getByText('drums')).toBeInTheDocument();
    });

    const silentBefore = view.mutedGainCount();

    fireEvent.click(view.mixerControls('drums').solo);

    expect(view.mutedGainCount()).toBeGreaterThan(silentBefore);
    expect(view.mixerControls('guitar').mute).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('muting then unmuting a stem restores its previous level', async () => {
    const view = setupSongView();

    await view.loadSong(makeSong(MULTI_STEM));
    view.openSettings();

    await waitFor(() => {
      expect(screen.getByText('drums')).toBeInTheDocument();
    });

    const silentBefore = view.mutedGainCount();

    fireEvent.click(view.mixerControls('drums').mute);
    expect(view.mixerControls('drums').mute).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(view.mutedGainCount()).toBeGreaterThan(silentBefore);

    fireEvent.click(view.mixerControls('drums').mute);
    expect(view.mixerControls('drums').mute).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(view.mutedGainCount()).toBe(silentBefore);
  });

  it('mutes and unmutes the master output', async () => {
    const view = setupSongView();

    await view.loadSong(makeSong(MULTI_STEM));
    view.openSettings();

    await waitFor(() => {
      expect(screen.getByText('Master')).toBeInTheDocument();
    });

    const silentBefore = view.mutedGainCount();

    fireEvent.click(view.masterMuteButton());
    expect(view.masterMuteButton()).toHaveAttribute('aria-pressed', 'true');
    expect(view.mutedGainCount()).toBeGreaterThan(silentBefore);

    fireEvent.click(view.masterMuteButton());
    expect(view.masterMuteButton()).toHaveAttribute('aria-pressed', 'false');
    expect(view.mutedGainCount()).toBe(silentBefore);
  });
});

describe('the score summary', () => {
  it('reports the accuracy and note counts of a run', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong();

    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    const modal = screen.getByTestId('score-modal');

    expect(within(modal).getByText('13% accuracy')).toBeInTheDocument();
    expect(within(modal).getByText('1 note hit')).toBeInTheDocument();
    expect(within(modal).getByText('7 notes missed')).toBeInTheDocument();
    expect(within(modal).getByText('0 false hits')).toBeInTheDocument();
  });

  it('celebrates a flawless run with Perfect and five stars', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong(makeSong(), SINGLE_NOTE_CHART);

    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    const modal = screen.getByTestId('score-modal');

    expect(within(modal).getByText('Perfect')).toBeInTheDocument();
    expect(modal.querySelectorAll('[data-filled]')).toHaveLength(5);
  });

  it('also saves a practice-run analytics record, stamped Perform at 1x, alongside the score', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong();

    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    const practiceRunPayloads = view.ipc.sent
      .filter((s) => s.channel === 'save-practice-run')
      .map((s) => s.args[0]);

    expect(practiceRunPayloads).toEqual([
      {
        songId: 'song-1',
        records: expect.arrayContaining([
          expect.objectContaining({ verdict: 'hit', element: 'snare' }),
          expect.objectContaining({ verdict: 'miss', element: 'snare' }),
        ]),
        summary: expect.objectContaining({
          mode: 'perform',
          playbackSpeed: 1,
          totalHits: 1,
        }),
      },
    ]);

    const modal = screen.getByTestId('score-modal');

    expect(within(modal).getByTestId('practice-stats')).toBeInTheDocument();
  });

  it('opens the coach with stored findings and presets a targeted practice loop', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();
    fireEvent.click(screen.getByTestId('ai-coach-button'));

    expect(view.ipc.sent).toContainEqual({
      channel: 'load-practice-runs',
      args: ['song-1'],
    });

    const summary = {
      ...multiLaneRunFixture(),
      mode: 'practice' as const,
      playbackSpeed: 0.7,
    };

    act(() => {
      view.ipc.emit('load-practice-runs', {
        songId: 'song-1',
        runs: [summary],
        fullRuns: [
          {
            summary,
            records: [
              { tick: 0, deltaMs: 4, element: 'snare', verdict: 'hit' },
              { tick: 192, deltaMs: 0, element: 'snare', verdict: 'miss' },
              { tick: 384, deltaMs: 0, element: 'snare', verdict: 'miss' },
              { tick: 576, deltaMs: 0, element: 'snare', verdict: 'miss' },
            ],
          },
        ],
      });
    });

    expect(
      await screen.findByTestId('coach-finding-trouble-bars'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('coach-notation')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('coach-practice-bars'));

    expect(screen.getByTestId('loop-toggle')).toBeChecked();
    expect(screen.getByRole('spinbutton')).toHaveValue('0.7');
    expect(view.measureHighlights()[0]).toHaveAttribute(
      'data-selected',
      'true',
    );
  });
});

describe('the playback time display', () => {
  it('reflects a seek in the elapsed-time readout', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong();

    expect(view.currentTimeText()).toBe('00:00');

    view.seekToEnd();

    await waitFor(() => {
      expect(view.currentTimeText()).toBe('00:04');
    });
  });
});

describe('the reference legend', () => {
  it('shows the drum reference and hides it when switched off', async () => {
    const view = setupSongView();

    await view.loadSong();

    expect(screen.getByText('Snare')).toBeInTheDocument();
    expect(screen.getByText('Kick')).toBeInTheDocument();

    view.openSettings();
    view.openMoreSettings();
    view.toggleSetting('reference');

    await waitFor(() => {
      expect(screen.queryByText('Snare')).not.toBeInTheDocument();
    });
  });
});

// Carries a real note track for two difficulties, with Medium truncated to
// far fewer measures than Expert - lets tests prove a switch actually
// re-parses the chart (different note/measure counts per difficulty)
// rather than just relabeling the same data.
const MULTI_DIFFICULTY_CHART = `[Song]
{
  Name = "Fixture"
  Resolution = 192
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
}
[Events]
{
}
[ExpertDrums]
{
  0 = N 1 0
  192 = N 1 0
  384 = N 1 0
  576 = N 1 0
  768 = N 1 0
  960 = N 1 0
  1152 = N 1 0
  1344 = N 1 0
}
[MediumDrums]
{
  0 = N 1 0
  384 = N 1 0
}
`;

function openDifficultySelect() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Difficulty' }));
}

function pickDifficulty(value: string) {
  openDifficultySelect();
  fireEvent.click(screen.getByRole('option', { name: value }));
}

describe('in-practice difficulty switching', () => {
  it('lists only the difficulties this chart actually has', async () => {
    const view = setupSongView();

    await view.loadSong(
      makeSong({ drumDifficulties: ['medium', 'hard', 'expert'] }),
    );

    openDifficultySelect();

    expect(screen.getByRole('option', { name: 'medium' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'hard' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'expert' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'easy' }),
    ).not.toBeInTheDocument();
  });

  it('disables the selector when the chart only has one difficulty', async () => {
    const view = setupSongView();

    await view.loadSong(makeSong({ drumDifficulties: ['expert'] }));

    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toBeDisabled();
  });

  it('reloads the parsed chart at the new difficulty', async () => {
    const view = setupSongView({ settings: { countIn: false } });

    await view.loadSong(
      makeSong({ drumDifficulties: ['medium', 'expert'] }),
      MULTI_DIFFICULTY_CHART,
    );

    pickDifficulty('medium');

    view.clickPlay();
    await view.finishSong();

    const modal = screen.getByTestId('score-modal');

    // Medium only carries 2 notes in the fixture (vs Expert's 8) - a
    // run with zero hits missing exactly 2 proves the medium track, not
    // the expert one, was actually parsed and scored against.
    expect(within(modal).getByText('2 notes missed')).toBeInTheDocument();
  });

  it('preserves the playback position across a switch', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong(
      makeSong({ drumDifficulties: ['medium', 'expert'] }),
      MULTI_DIFFICULTY_CHART,
    );

    view.seekToEnd();
    await waitFor(() => expect(view.currentTimeText()).toBe('00:04'));

    pickDifficulty('medium');

    await waitFor(() => expect(view.currentTimeText()).toBe('00:04'));
  });

  it('pauses playback on switch', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice',
      settings: { countIn: false },
    });

    await view.loadSong(makeSong({ drumDifficulties: ['medium', 'expert'] }));

    view.clickPlay();
    // Practice mode's playback goes through the speed-controllable player
    // (a chunked, async-scheduled implementation - see
    // services/audio-player/speed/player.ts), so the buffer-source-level
    // startedSources() harness (built around the default player's
    // synchronous createBufferSource().start()) doesn't apply here.
    // Transport's own play/pause state is player-agnostic and flips
    // synchronously, so assert on that via the header toggle instead.
    expect(screen.getByTestId('play-toggle')).toHaveAttribute(
      'aria-label',
      'Pause',
    );

    pickDifficulty('medium');

    expect(screen.getByTestId('play-toggle')).toHaveAttribute(
      'aria-label',
      'Play',
    );
  });

  it("resets the run's judge/score state on a mid-run switch", async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong(
      makeSong({ drumDifficulties: ['medium', 'expert'] }),
      MULTI_DIFFICULTY_CHART,
    );

    view.clickPlay();
    await view.pressKey('KeyJ'); // pre-switch hit

    pickDifficulty('medium'); // pauses the run - see the switch's requirement (a)

    // Real usage: a switch only pauses, it never auto-resumes - the
    // player has to press Play again to keep going (and to let it reach
    // a natural end for finishSong() to simulate below). Pausing suspends
    // the (fake) AudioContext, so resuming genuinely awaits
    // ctx.resume() inside Transport/beginPlayback - wait for that to
    // actually land rather than asserting immediately after the click.
    view.clickPlay();
    await waitFor(() => {
      expect(screen.getByTestId('play-toggle')).toHaveAttribute(
        'aria-label',
        'Pause',
      );
    });

    await view.finishSong();

    const modal = screen.getByTestId('score-modal');

    expect(within(modal).getByText('0 notes hit')).toBeInTheDocument();
    // Medium only carries 2 notes in the fixture - confirms the reset
    // reparsed at the new difficulty rather than just clearing hits
    // against the stale Expert note count.
    expect(within(modal).getByText('2 notes missed')).toBeInTheDocument();
  });

  it('persists the switch as the app-global difficulty setting', async () => {
    const view = setupSongView();

    await view.loadSong(makeSong({ drumDifficulties: ['medium', 'expert'] }));

    pickDifficulty('medium');

    expect(
      JSON.parse(window.localStorage.getItem('settings.difficulty') ?? '""'),
    ).toBe('medium');
  });

  it('keys the score under the new difficulty after a mid-run switch, with only the post-switch hit counted', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong(
      makeSong({ drumDifficulties: ['medium', 'expert'] }),
      MULTI_DIFFICULTY_CHART,
    );

    view.clickPlay();
    await view.pressKey('KeyJ'); // would-be Expert hit, discarded by the switch

    pickDifficulty('medium'); // pauses the run

    // Real usage: resume after the switch (the engine only judges hits
    // while actively playing) before landing the one hit that should
    // survive. Pausing suspends the (fake) AudioContext, so wait for the
    // resume's genuine ctx.resume() await to actually land.
    view.clickPlay();
    await waitFor(() => {
      expect(screen.getByTestId('play-toggle')).toHaveAttribute(
        'aria-label',
        'Pause',
      );
    });

    await view.pressKey('KeyJ'); // the only hit that should count

    await view.finishSong();

    expect(view.updateSongPayloads()).toEqual([
      {
        id: 'song-1',
        // Medium's 2-note track (not Expert's 8) proves the score was
        // computed against the newly-parsed chart, and hitNotes: 1 (not
        // 2) proves the pre-switch Expert hit was actually discarded.
        scoreData: { medium: { hitNotes: 1, totalNotes: 2, falseHits: 0 } },
      },
    ]);
  });

  it('clears a practice section selection whose measures no longer exist at the new difficulty', async () => {
    const view = setupSongView({ route: '/song-1?gameMode=practice' });

    await view.loadSong(
      makeSong({ drumDifficulties: ['medium', 'expert'] }),
      MULTI_DIFFICULTY_CHART,
    );
    view.clickTestId('loop-toggle');

    // Expert has 2 measures here; Medium's last note (tick 384) truncates
    // it to just 1. Select the second (Expert-only) measure.
    const highlights = view.measureHighlights();

    fireEvent.mouseDown(highlights[1]);
    fireEvent.mouseUp(document.body);

    expect(screen.getByText('Looping Section')).toBeInTheDocument();

    pickDifficulty('medium');

    await waitFor(() => {
      expect(screen.queryByText('Looping Section')).not.toBeInTheDocument();
    });
  });
});
