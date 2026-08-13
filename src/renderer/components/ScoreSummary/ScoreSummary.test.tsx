import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App as AntdApp } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { Song } from '../../../types';
import { multiLaneRunFixture } from '../PracticeStats/test-fixtures';
import {
  RecordRunResult,
  UseGamificationResult,
} from '../../hooks/useGamification';
import { installIpcMock } from '../../hooks/test-support';
import { ScoreSummary } from './ScoreSummary';

const songData = {
  name: 'Master of Puppets',
  artist: 'Metallica',
} as Song;

function renderSummary(
  props: Partial<Parameters<typeof ScoreSummary>[0]> = {},
) {
  render(
    <AntdApp>
      <ScoreSummary
        isOpen
        onRetry={vi.fn()}
        onNextSong={vi.fn()}
        songData={songData}
        difficulty="expert"
        {...props}
      />
    </AntdApp>,
  );

  const modalEl = screen.getByTestId('score-modal');

  return { modalEl, modal: within(modalEl) };
}

describe('ScoreSummary', () => {
  it('renders the star/accuracy chrome and the note-count grid for a Perform run', () => {
    // calculateAccuracy is hitNotes / (totalNotes + falseHits) - 70/105
    // rounds to 67%, not the naive hitNotes/totalNotes 70%.
    const { modal } = renderSummary({
      scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
    });

    expect(modal.getByText('67% accuracy')).toBeInTheDocument();
    expect(modal.getByText('70 notes hit')).toBeInTheDocument();
    expect(modal.getByText('30 notes missed')).toBeInTheDocument();
    expect(modal.getByText('5 false hits')).toBeInTheDocument();
  });

  it('labels a MIDI-silent miss-only run as missing musical input', () => {
    const { modal } = renderSummary({
      noMusicalInput: true,
      persistenceState: 'no-evidence',
      scoreData: { hitNotes: 0, totalNotes: 16, falseHits: 0 },
      practiceSummary: multiLaneRunFixture(),
    });

    expect(modal.getByTestId('score-no-musical-input')).toHaveTextContent(
      'Nothing from the kit reached the app',
    );
    expect(modal.getByTestId('score-persistence-status')).toHaveTextContent(
      'No musical input reached Drumroll',
    );
    expect(modal.queryByText('0% accuracy')).not.toBeInTheDocument();
    expect(modal.queryByTestId('practice-stats')).not.toBeInTheDocument();
  });

  it('celebrates a flawless Perform run with Perfect and five stars', () => {
    const { modal, modalEl } = renderSummary({
      scoreData: { hitNotes: 100, totalNotes: 100, falseHits: 0 },
    });

    expect(modal.getByText('Perfect')).toBeInTheDocument();
    expect(modalEl.querySelectorAll('[data-filled]')).toHaveLength(5);
  });

  it('does not claim Perfect / Every note landed on a near-100% run that actually missed a note', () => {
    // Regression: calculateAccuracy rounds to 2dp, so 249/250 (falseHits 0)
    // rounds to "1.00" and the pre-fix `=== 1` check called that Perfect,
    // contradicting the "1 missed" tile on the same screen.
    const { modal } = renderSummary({
      scoreData: { hitNotes: 249, totalNotes: 250, falseHits: 0 },
    });

    expect(modal.queryByText('Perfect')).not.toBeInTheDocument();
    expect(modal.queryByText('Every note landed.')).not.toBeInTheDocument();
    expect(modal.getByText('1 note missed')).toBeInTheDocument();
  });

  it('renders real practice stats for a Perform run that also carries a practice summary', () => {
    const summary = multiLaneRunFixture();
    const { modal } = renderSummary({
      scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
      practiceSummary: summary,
    });

    expect(modal.getByTestId('practice-stats')).toBeInTheDocument();
    expect(modal.getByTestId('lane-accuracy-bars')).toBeInTheDocument();
  });

  it('keeps the persisted learning receipt visible beside the run statistics', () => {
    const summary = {
      ...multiLaneRunFixture(),
      timingWindowMs: 120,
      atomicSkillEvidence: [
        {
          run_id: 'run:receipt',
          chart_revision: 'chart:receipt',
          manifest_revision: 'manifest:receipt',
          skill_id: 'kit.tom_t2_t3',
          item_id: '07.03',
          context_signature: 'rock',
          evidence_kind: 'acquisition' as const,
          quality: 0.84,
          weight: 0.5,
          playback_speed: 0.8,
          completed_at: '2026-08-11T10:00:00.000Z',
          judging_window_ms: 120,
          normalized_timing_stability: 0.7,
        },
      ],
    };
    const { modal } = renderSummary({ practiceSummary: summary });

    expect(modal.getByTestId('learning-evidence-receipt')).toHaveTextContent(
      'What this run recorded',
    );
    expect(modal.getByTestId('learning-evidence-receipt')).toHaveTextContent(
      '±120 ms',
    );
  });

  it('keeps a saved section audition scoped to the measured section', () => {
    const { modal } = renderSummary({
      practiceSummary: {
        ...multiLaneRunFixture(),
        overallAccuracy: 0.84,
        practiceCard: {
          kind: 'apply',
          candidate_id: 'song:favourite',
          source_label:
            'Eligible goal path · Eighth-note pulse in this section',
        },
        audition: {
          song_id: 'song:favourite',
          start_bar: 5,
          end_bar: 8,
          speed: 0.7,
          section_label: 'Bars 5–8',
          test_label: 'Eighth-note pulse in this section',
          required_skill_id: 'pulse.eighth',
        },
      },
    });

    expect(modal.getByTestId('practice-card-run-receipt')).toHaveTextContent(
      'apply saved',
    );
    expect(
      modal.getByTestId('song-section-audition-receipt'),
    ).toHaveTextContent('Bars 5–8 · 84% at 0.7×');
    expect(
      modal.getByTestId('song-section-audition-receipt'),
    ).toHaveTextContent('It measures this section, not the full song.');
  });

  it('opens the coach from a completed run', () => {
    const onCoach = vi.fn();
    const { modal } = renderSummary({
      practiceSummary: multiLaneRunFixture(),
      onCoach,
    });

    fireEvent.click(modal.getByTestId('score-coach'));

    expect(onCoach).toHaveBeenCalledOnce();
  });

  it('exports a private postcard only after this run has reached disk', async () => {
    const ipc = installIpcMock();
    const summary = {
      ...multiLaneRunFixture(),
      completedAt: '2026-08-12T08:30:00.000Z',
      overallAccuracy: 0.84,
    };
    const { modal } = renderSummary({
      persistenceState: 'saved',
      practiceSummary: summary,
    });

    fireEvent.click(modal.getByTestId('score-performance-postcard'));

    const postcard = within(screen.getByTestId('performance-postcard-dialog'));

    expect(postcard.getByTestId('performance-postcard-export')).toBeDisabled();
    fireEvent.click(postcard.getByTestId('performance-postcard-milestone'));
    fireEvent.click(postcard.getByTestId('performance-postcard-export'));

    expect(ipc.sent).toContainEqual({
      channel: 'export-pdf',
      args: [
        expect.objectContaining({
          fileName: 'master-of-puppets-performance-2026-08-12.pdf',
        }),
      ],
    });

    await act(async () => {
      ipc.emit('export-pdf', { ok: true });
    });

    expect(modal.getByTestId('performance-postcard-status')).toHaveTextContent(
      'Private postcard saved locally.',
    );
  });

  it('blocks explicit continuation only while the run save is unresolved', () => {
    const onNextSong = vi.fn();
    const { modal } = renderSummary({
      onNextSong,
      persistenceState: 'saving',
      handsFreeControlsEnabled: true,
      autoContinueEnabled: true,
    });

    expect(modal.getByTestId('score-next')).toBeDisabled();
    expect(modal.getByTestId('score-retry')).toBeDisabled();
    expect(modal.queryByTestId('score-kit-controls')).not.toBeInTheDocument();
    expect(modal.queryByTestId('score-auto-continue')).not.toBeInTheDocument();
    fireEvent.click(modal.getByTestId('score-next'));
    expect(onNextSong).not.toHaveBeenCalled();
  });

  it('draws all result commands when kit control is enabled', () => {
    const { modal } = renderSummary({
      handsFreeControlsEnabled: true,
      persistenceState: 'saved',
      nextLabel: 'Next practice',
    });

    expect(modal.getByTestId('score-kit-controls')).toBeInTheDocument();
    expect(
      modal.getByLabelText(/Next practice: Kick, then Crash/i),
    ).toBeInTheDocument();
    expect(
      modal.getByLabelText(/Play again: Snare, then Kick/i),
    ).toBeInTheDocument();
    expect(
      modal.getByLabelText(/Leave session: Ride, then Kick/i),
    ).toBeInTheDocument();
  });

  it.each(['saved', 'failed', 'no-evidence'] as const)(
    'allows an explicit player choice after the run reaches the %s state',
    (persistenceState) => {
      const onNextSong = vi.fn();
      const { modal } = renderSummary({
        onNextSong,
        persistenceState,
      });

      expect(modal.getByTestId('score-next')).toBeEnabled();
      fireEvent.click(modal.getByTestId('score-next'));
      expect(onNextSong).toHaveBeenCalledOnce();
    },
  );

  it('shows a visible countdown and automatically starts the next Practice task', async () => {
    vi.useFakeTimers();

    try {
      const onNextSong = vi.fn();
      const { modal } = renderSummary({
        onNextSong,
        nextLabel: 'Next practice',
        autoContinueEnabled: true,
        autoContinueSeconds: 3,
        practiceSummary: multiLaneRunFixture(),
      });

      expect(modal.getByTestId('score-auto-continue')).toHaveTextContent(
        'Next practice starts in 3s',
      );

      for (let second = 0; second < 3; second += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }

      await act(async () => Promise.resolve());

      expect(onNextSong).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the player cancel auto-continue without leaving the result', async () => {
    vi.useFakeTimers();

    try {
      const onNextSong = vi.fn();
      const { modal } = renderSummary({
        onNextSong,
        nextLabel: 'Next practice',
        autoContinueEnabled: true,
        autoContinueSeconds: 3,
        practiceSummary: multiLaneRunFixture(),
      });

      fireEvent.click(modal.getByTestId('score-auto-continue-cancel'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(onNextSong).not.toHaveBeenCalled();
      expect(
        modal.queryByTestId('score-auto-continue'),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the star/accuracy chrome for a Practice run (no scoreData) and shows the practice stats instead', () => {
    const summary: ReturnType<typeof multiLaneRunFixture> = {
      ...multiLaneRunFixture(),
      mode: 'practice',
      playbackSpeed: 0.7,
    };
    const { modal } = renderSummary({
      scoreData: undefined,
      practiceSummary: summary,
    });

    expect(screen.queryByText(/accuracy$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Perfect')).not.toBeInTheDocument();
    expect(modal.getByText('Nice reps')).toBeInTheDocument();
    expect(modal.getByTestId('practice-stats')).toBeInTheDocument();
    expect(modal.getByTestId('practice-run-mode')).toHaveTextContent(
      'Practice run at 0.7x',
    );
  });

  it('omits the run-mode label for a Practice run at the default 1x speed', () => {
    const summary: ReturnType<typeof multiLaneRunFixture> = {
      ...multiLaneRunFixture(),
      mode: 'practice',
      playbackSpeed: 1,
    };
    const { modal } = renderSummary({
      scoreData: undefined,
      practiceSummary: summary,
    });

    expect(modal.getByTestId('practice-run-mode')).toHaveTextContent(
      'Practice run',
    );
    expect(modal.getByTestId('practice-run-mode')).not.toHaveTextContent('x');
  });

  it('shows the honest empty practice-stats state when the run had no attempts', () => {
    const { modal } = renderSummary({
      scoreData: { hitNotes: 0, totalNotes: 8, falseHits: 0 },
    });

    expect(modal.getByTestId('practice-stats-empty')).toBeInTheDocument();
  });

  it('places comparable musical change ahead of statistics and chooses one next action', () => {
    const previous = {
      ...multiLaneRunFixture(),
      laneAccuracy: [
        { element: 'kick' as const, hits: 6, misses: 4, accuracy: 0.6 },
      ],
    };
    const summary = {
      ...previous,
      laneAccuracy: [
        { element: 'kick' as const, hits: 8, misses: 2, accuracy: 0.8 },
      ],
    };
    const { modal } = renderSummary({
      practiceSummary: summary,
      previousPracticeSummary: previous,
    });

    expect(modal.getByTestId('musical-receipt')).toHaveTextContent(
      'Kick rose 20 points',
    );
    expect(modal.getByTestId('musical-receipt-action')).toHaveTextContent(
      'Continue current plan',
    );
    expect(modal.getByTestId('score-next')).toHaveTextContent(
      'Continue current plan',
    );
  });

  it('keeps explicit My Wave continuation visible over a generic receipt', () => {
    const previous = {
      ...multiLaneRunFixture(),
      laneAccuracy: [
        { element: 'kick' as const, hits: 6, misses: 4, accuracy: 0.6 },
      ],
    };
    const summary = {
      ...previous,
      laneAccuracy: [
        { element: 'kick' as const, hits: 8, misses: 2, accuracy: 0.8 },
      ],
    };
    const { modal } = renderSummary({
      practiceSummary: summary,
      previousPracticeSummary: previous,
      nextLabel: 'Continue My Wave',
      continuationLabelLocked: true,
    });

    expect(modal.getByTestId('score-next')).toHaveTextContent(
      'Continue My Wave',
    );
  });

  it('makes a saved loop target the primary action without claiming improvement', () => {
    const summary = {
      ...multiLaneRunFixture(),
      coachEvidence: [
        {
          id: 'bar-4',
          kind: 'timing',
          severity: 'medium' as const,
          skillTag: 'timing',
          sampleCount: 12,
          barStart: 4,
          barEnd: 4,
        },
      ],
    };
    const { modal } = renderSummary({ practiceSummary: summary });

    expect(modal.getByTestId('musical-receipt')).toHaveAttribute(
      'data-changed',
      'false',
    );
    expect(modal.getByTestId('score-retry').className).toContain(
      'ant-btn-primary',
    );
    expect(modal.getByTestId('score-retry')).toHaveTextContent(
      'Replay this loop',
    );
  });

  describe('gamification', () => {
    function gamificationFixture(
      overrides: Partial<UseGamificationResult> = {},
    ): UseGamificationResult {
      return {
        isLoaded: true,
        days: {},
        streak: { current: 3, longest: 5 },
        todayXp: 40,
        goalXp: 50,
        goalOption: 'regular',
        setGoalOption: vi.fn(),
        goalCrossedToday: false,
        weekActivity: [],
        totalStars: 0,
        achievements: undefined,
        laneAccuracy: undefined,
        recentLaneSignals: undefined,
        latestRun: undefined,
        loadAchievements: vi.fn(),
        recordRun: vi.fn(),
        ...overrides,
      };
    }

    function runResultFixture(
      overrides: Partial<RecordRunResult> = {},
    ): RecordRunResult {
      return {
        xpEarned: 42,
        goalCrossed: false,
        streakCurrent: 3,
        newlyUnlocked: [],
        ...overrides,
      };
    }

    it('renders nothing gamification-related without a runResult', () => {
      renderSummary({
        scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
        gamification: gamificationFixture(),
      });

      expect(
        screen.queryByTestId('gamification-summary'),
      ).not.toBeInTheDocument();
    });

    it('shows XP earned, streak status, and XP remaining to goal', () => {
      const { modal } = renderSummary({
        scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
        gamification: gamificationFixture({
          todayXp: 40,
          goalXp: 50,
          streak: { current: 3, longest: 3 },
        }),
        runResult: runResultFixture({ xpEarned: 42 }),
      });

      expect(modal.getByTestId('run-xp-earned')).toHaveTextContent('+42 XP');
      expect(modal.getByTestId('run-streak-status')).toHaveTextContent(
        '3-day practice streak',
      );
      expect(modal.getByTestId('run-goal-status')).toHaveTextContent(
        "10 XP left in today's set",
      );
    });

    it("says the goal is reached once today's XP is at or past it", () => {
      const { modal } = renderSummary({
        scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
        gamification: gamificationFixture({ todayXp: 60, goalXp: 50 }),
        runResult: runResultFixture({ goalCrossed: true }),
      });

      expect(modal.getByTestId('run-goal-status')).toHaveTextContent(
        "Today's set reached",
      );
      expect(modal.getByTestId('gamification-summary').className).not.toContain(
        'sk-goal-celebrate',
      );
    });

    it('animates a completed daily set only when saved musical evidence changed', () => {
      const previous = {
        ...multiLaneRunFixture(),
        laneAccuracy: [
          { element: 'kick' as const, hits: 6, misses: 4, accuracy: 0.6 },
        ],
      };
      const summary = {
        ...previous,
        laneAccuracy: [
          { element: 'kick' as const, hits: 8, misses: 2, accuracy: 0.8 },
        ],
      };
      const { modal } = renderSummary({
        gamification: gamificationFixture({ todayXp: 60, goalXp: 50 }),
        runResult: runResultFixture({ goalCrossed: true }),
        practiceSummary: summary,
        previousPracticeSummary: previous,
      });

      expect(modal.getByTestId('gamification-summary').className).toContain(
        'sk-goal-celebrate',
      );
    });

    it('keeps a lapsed practice streak separate from the new daily set', () => {
      const { modal } = renderSummary({
        scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
        gamification: gamificationFixture({
          streak: { current: 0, longest: 3 },
        }),
        runResult: runResultFixture({ streakCurrent: 0 }),
      });

      expect(modal.getByTestId('run-streak-status')).toHaveTextContent(
        'New set, same progress',
      );
    });

    it('shows the single next-best-action nudge when one is present', () => {
      const { modal } = renderSummary({
        scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
        gamification: gamificationFixture(),
        runResult: runResultFixture({
          nudge: {
            achievementId: 'week-one',
            message:
              '1 qualifying practice day in a row unlocks Practice rhythm',
          },
        }),
      });

      expect(modal.getByTestId('run-nudge')).toHaveTextContent(
        '1 qualifying practice day in a row unlocks Practice rhythm',
      );
    });

    it('omits the nudge line entirely when there is none to show', () => {
      const { modal } = renderSummary({
        scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
        gamification: gamificationFixture(),
        runResult: runResultFixture({ nudge: undefined }),
      });

      expect(modal.queryByTestId('run-nudge')).not.toBeInTheDocument();
    });

    it('surfaces newly-unlocked achievements as a toast', () => {
      const { modal } = renderSummary({
        scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
        gamification: gamificationFixture(),
        runResult: runResultFixture({
          newlyUnlocked: [
            {
              id: 'first-blood',
              title: 'First Blood',
              description: 'Completed your first practice run.',
              hint: 'Finish any run to unlock.',
              evidenceEvent: 'saved test evidence',
              proofRank: 1,
            },
          ],
        }),
      });

      expect(modal.getByTestId('achievement-toast')).toHaveTextContent(
        'First Blood',
      );
    });
  });
});
