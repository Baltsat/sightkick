import type { Meta, StoryObj } from '@storybook/react';
import { Song } from '../../../types';
import { UseGamificationResult } from '../../hooks/useGamification';
import { summarizeRun } from '../../services/practice-stats';
import { ScoreSummary } from './ScoreSummary';

const songData = {
  name: 'Master of Puppets',
  artist: 'Metallica',
} as Song;

function kickRun(hits: number, misses: number, completedAt: string) {
  return summarizeRun(
    [
      ...Array.from({ length: hits }, () => ({
        tick: 0,
        timeSeconds: 0,
        deltaMs: -12,
        element: 'kick' as const,
        verdict: 'hit' as const,
      })),
      ...Array.from({ length: misses }, () => ({
        tick: 0,
        timeSeconds: 0,
        deltaMs: 0,
        element: 'kick' as const,
        verdict: 'miss' as const,
      })),
    ],
    completedAt,
  );
}

const previousRun = kickRun(6, 4, '2026-08-10T12:00:00.000Z');
const receiptRun = kickRun(8, 2, '2026-08-11T12:00:00.000Z');
const gamification: UseGamificationResult = {
  isLoaded: true,
  days: {},
  streak: { current: 5, longest: 9 },
  todayXp: 42,
  goalXp: 50,
  goalOption: 'regular',
  setGoalOption: () => {},
  goalCrossedToday: false,
  weekActivity: [true, true, false, true, true, false, false],
  totalStars: 37,
  achievements: [],
  laneAccuracy: [],
  recentLaneSignals: [],
  latestRun: undefined,
  loadAchievements: () => {},
  recordRun: () => {},
};
const meta: Meta<typeof ScoreSummary> = {
  title: 'Song View/Score Summary',
  component: ScoreSummary,
  args: {
    isOpen: true,
    songData,
    difficulty: 'expert',
    scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 },
    onRetry: () => {},
    onNextSong: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ScoreSummary>;

export const ThreeStars: Story = {
  args: { scoreData: { hitNotes: 70, totalNotes: 100, falseHits: 5 } },
};

export const Perfect: Story = {
  args: { scoreData: { hitNotes: 100, totalNotes: 100, falseHits: 0 } },
};

export const NoStars: Story = {
  args: { scoreData: { hitNotes: 5, totalNotes: 100, falseHits: 40 } },
};

export const FullStars: Story = {
  args: { scoreData: { hitNotes: 96, totalNotes: 100, falseHits: 2 } },
};

export const MusicalReceipt: Story = {
  args: {
    scoreData: { hitNotes: 8, totalNotes: 10, falseHits: 0 },
    practiceSummary: receiptRun,
    previousPracticeSummary: previousRun,
    gamification,
    runResult: {
      xpEarned: 12,
      goalCrossed: false,
      streakCurrent: 5,
      newlyUnlocked: [
        {
          id: 'first-blood',
          title: 'Retained skill',
          description: 'A delayed skill check held after the first pass.',
          hint: 'Save a retained skill check after its first acquisition.',
          evidenceEvent: 'saved retention evidence',
          proofRank: 1,
        },
      ],
    },
  },
};

export const ContinueMyWave: Story = {
  args: {
    scoreData: { hitNotes: 8, totalNotes: 10, falseHits: 0 },
    nextLabel: 'Continue My Wave',
    continuationLabelLocked: true,
  },
};

export const NoMusicalInput: Story = {
  args: {
    scoreData: { hitNotes: 0, totalNotes: 10, falseHits: 0 },
    noMusicalInput: true,
    persistenceState: 'no-evidence',
    nextLabel: 'Continue My Wave',
    continuationLabelLocked: true,
  },
};

export const AllMissDoesNotCongratulate: Story = {
  args: {
    scoreData: undefined,
    practiceSummary: {
      ...kickRun(0, 0, '2026-08-12T12:00:00.000Z'),
      totalHits: 0,
      totalMisses: 132,
      totalWrong: 0,
      overallAccuracy: 0,
      laneAccuracy: [
        { element: 'hihat', hits: 0, misses: 4, accuracy: 0 },
        { element: 'snare', hits: 0, misses: 128, accuracy: 0 },
      ],
      coachEvidence: [
        {
          id: 'bars-1-17',
          kind: 'timing',
          severity: 'medium',
          skillTag: 'timing',
          sampleCount: 12,
          barStart: 1,
          barEnd: 17,
        },
      ],
    },
  },
};

export const NoAttemptsThisRun: Story = {
  args: {
    scoreData: undefined,
    practiceSummary: kickRun(0, 0, '2026-08-12T12:00:00.000Z'),
  },
};

/** Stress case for "keeps its continuation action visible without
 * scrolling at 1024x700" (docs/design-acceptance-notes.md item 4): every
 * optional footer row on at once - a saving-state banner, the auto-continue
 * countdown, all three hands-free kit prompts, and the postcard export
 * button - stacked above the primary action. The body's internal scroll
 * (`.drumroll-score-summary__body { overflow-y: auto }`) is what keeps the
 * footer itself pinned and fully visible regardless of body content. */
export const WorstCaseFooter: Story = {
  args: {
    scoreData: undefined,
    practiceSummary: receiptRun,
    previousPracticeSummary: previousRun,
    gamification,
    persistenceState: 'saved',
    autoContinueEnabled: true,
    autoContinueSeconds: 8,
    handsFreeControlsEnabled: true,
    nextLabel: 'Continue My Wave',
    lessonProgression: {
      qualifies: false,
      fullCoverage: true,
      meetsLearningTempo: true,
      atTargetSpeed: false,
      meetsAccuracyTarget: false,
      accuracy: 0.68,
      starsEarned: 2,
    },
    runResult: {
      xpEarned: 12,
      goalCrossed: true,
      streakCurrent: 5,
      nudge: {
        achievementId: 'week-one',
        message: 'One more session keeps this week alive.',
      },
      newlyUnlocked: [
        {
          id: 'first-blood',
          title: 'Retained skill',
          description: 'A delayed skill check held after the first pass.',
          hint: 'Save a retained skill check after its first acquisition.',
          evidenceEvent: 'saved retention evidence',
          proofRank: 1,
        },
      ],
    },
  },
};

export const SectionAudition: Story = {
  args: {
    scoreData: undefined,
    practiceSummary: {
      ...receiptRun,
      mode: 'practice',
      playbackSpeed: 0.7,
      practiceCard: {
        kind: 'apply',
        candidate_id: 'song:favourite',
        source_label: 'Eligible goal path · Eighth-note pulse in this section',
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
  },
};
