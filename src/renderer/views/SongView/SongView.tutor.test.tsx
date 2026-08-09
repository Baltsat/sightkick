import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupSongView } from '../test-support';

function savedRuns(view: ReturnType<typeof setupSongView>) {
  return view.ipc.sent
    .filter((entry) => entry.channel === 'save-practice-run')
    .map((entry) => entry.args[0]);
}

function installCommandClock(startMs = 1000) {
  let now = startMs;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);

  return {
    advance(milliseconds: number) {
      now += milliseconds;
    },
    restore() {
      spy.mockRestore();
    },
  };
}

async function strikeCommand(
  view: ReturnType<typeof setupSongView>,
  clock: ReturnType<typeof installCommandClock>,
  codes: string[],
) {
  for (const [index, code] of codes.entries()) {
    if (index > 0) {
      clock.advance(180);
    }

    await view.pressKey(code);
  }
}

describe('adaptive tutor surfaces', () => {
  it('shows the listening tutor, hands-free ready command, and controls only in Practice', async () => {
    const practice = setupSongView({
      route: '/song-1?gameMode=practice',
      keyboard: {
        kit: {
          kick: ['keyboard:KeyK'],
          crash: ['keyboard:KeyC'],
        },
      },
    });

    await practice.loadSong();

    const hud = screen.getByTestId('tutor-hud');

    expect(within(hud).getByText('Ready when you are')).toBeInTheDocument();
    expect(hud).toHaveAccessibleName(/kick, crash, kick, crash/i);

    practice.openSettings();
    expect(screen.getByTestId('setting-adaptive-tutor')).toBeChecked();
    expect(screen.getByTestId('setting-tutor-auto-rewind')).toBeChecked();
    expect(screen.getByTestId('setting-tutor-lives')).toBeChecked();
    expect(screen.getByTestId('setting-auto-continue')).toBeChecked();
    expect(screen.getByTestId('setting-hands-free-controls')).toBeChecked();

    practice.unmount();

    const perform = setupSongView();

    await perform.loadSong();

    expect(screen.queryByTestId('tutor-hud')).not.toBeInTheDocument();
    perform.openSettings();
    expect(
      screen.queryByTestId('setting-adaptive-tutor'),
    ).not.toBeInTheDocument();
  });
});

describe('safe hands-free run intent', () => {
  it('auto-starts a recommended Practice run at the requested tutor speed', async () => {
    const view = setupSongView({
      route: '/song-1?gameMode=practice&autoStart=1&practiceSpeed=0.7',
      settings: { countIn: false },
    });

    await view.loadSong();

    await waitFor(() =>
      expect(screen.getByTestId('play-toggle')).toHaveAttribute(
        'aria-label',
        'Pause',
      ),
    );
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe(
      '0.7',
    );
    expect(
      within(screen.getByTestId('tutor-hud')).getByText('70%'),
    ).toBeInTheDocument();
  });

  it('stamps the run start at first playback rather than component mount', async () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date('2026-08-09T10:00:00.000Z'));

      const view = setupSongView({
        settings: { countIn: false },
        keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
      });

      await view.loadSong();
      vi.setSystemTime(new Date('2026-08-09T10:05:00.000Z'));
      view.clickPlay();
      await view.pressKey('KeyJ');
      await view.finishSong();

      expect(savedRuns(view)).toEqual([
        expect.objectContaining({
          summary: expect.objectContaining({
            context: expect.objectContaining({
              startedAt: '2026-08-09T10:05:00.000Z',
            }),
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts from the deliberate four-strike command while Judge is inactive, then stores the guided attempt without inventing a hit', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        kit: {
          kick: ['keyboard:KeyK'],
          crash: ['keyboard:KeyC'],
        },
      },
    });

    await view.loadSong();

    const clock = installCommandClock();

    try {
      await strikeCommand(view, clock, ['KeyK', 'KeyC', 'KeyK', 'KeyC']);
    } finally {
      clock.restore();
    }

    expect(view.startedSources().length).toBeGreaterThan(0);

    await view.finishSong();

    expect(savedRuns(view)).toEqual([
      expect.objectContaining({
        songId: 'song-1',
        records: expect.not.arrayContaining([
          expect.objectContaining({ verdict: 'hit' }),
        ]),
        summary: expect.objectContaining({
          context: expect.objectContaining({
            schemaVersion: 2,
            scoringPolicyVersion: 'judge-resolved-v2',
            deviceId: 'keyboard',
          }),
        }),
      }),
    ]);
    expect(view.sentChannels()).not.toContain('update-song');
  });

  it('stores an all-wrong attempt as coaching evidence without a high score', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        kit: {
          crash: ['keyboard:KeyC'],
        },
      },
    });

    await view.loadSong();
    view.clickPlay();
    await view.pressKey('KeyC');
    await view.finishSong();

    expect(savedRuns(view)).toEqual([
      expect.objectContaining({
        records: expect.arrayContaining([
          expect.objectContaining({ verdict: 'wrong', element: 'crash' }),
        ]),
        summary: expect.objectContaining({ totalHits: 0, totalWrong: 1 }),
      }),
    ]);
    expect(view.sentChannels()).not.toContain('update-song');
  });

  it('pauses and resumes from the exact playing command after silence', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        kit: {
          kick: ['keyboard:KeyK'],
          crash: ['keyboard:KeyC'],
        },
      },
    });

    await view.loadSong();
    view.clickPlay();

    const clock = installCommandClock();

    try {
      await strikeCommand(view, clock, ['KeyK', 'KeyC', 'KeyK', 'KeyC']);

      expect(view.audio.state).toBe('suspended');

      clock.advance(1200);
      await strikeCommand(view, clock, ['KeyK', 'KeyC', 'KeyK', 'KeyC']);
    } finally {
      clock.restore();
    }

    expect(view.audio.state).toBe('running');
    expect(screen.queryByTestId('song-list-stub')).not.toBeInTheDocument();
  });

  it('gives kit gestures sole ownership when a pad also has a transport mapping', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: {
        kit: {
          kick: ['keyboard:KeyK'],
          crash: ['keyboard:KeyC'],
        },
        controls: {
          confirm: ['keyboard:KeyC'],
          pause: ['keyboard:KeyK'],
        },
      },
    });

    await view.loadSong();

    const clock = installCommandClock();

    try {
      await view.pressKey('KeyC');
      expect(view.startedSources()).toHaveLength(0);

      clock.advance(1000);
      await strikeCommand(view, clock, ['KeyK', 'KeyC', 'KeyK', 'KeyC']);
    } finally {
      clock.restore();
    }

    // Practice uses the streaming speed player, which can legitimately have
    // more than one look-ahead chunk active on a busy machine. What matters
    // here is that the overlapping transport mapping did not start and then
    // restart playback: a restart would stop the first source.
    expect(view.startedSources().length).toBeGreaterThan(0);
    expect(
      view.audio.bufferSources.filter((source) => source.stopped),
    ).toHaveLength(0);
    expect(screen.getByTestId('play-toggle')).toHaveAttribute(
      'aria-label',
      'Pause',
    );
  });

  it('surfaces a durable error when practice history cannot be stored', async () => {
    const view = setupSongView({
      settings: { countIn: false },
      keyboard: { kit: { snare: ['keyboard:KeyJ'] } },
    });

    await view.loadSong();
    view.clickPlay();
    await view.pressKey('KeyJ');
    await view.finishSong();

    await act(async () => {
      view.ipc.emit('save-practice-run', { error: 'Storage quota exceeded' });
    });

    expect(
      screen.getByText('Practice history was not saved'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/existing history is unchanged/i),
    ).toBeInTheDocument();
  });
});
