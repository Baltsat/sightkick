import type { Meta, StoryObj } from '@storybook/react';
import { Song } from '../../../types';
import { UseGamificationResult } from '../../hooks/useGamification';
import { RunSummary, summarizeRun } from '../../services/practice-stats';
import homeKitStudio from '../../assets/daybreak/home-kit-studio.png';
import { ScoreSummary } from './ScoreSummary';

const songData = {
  name: 'Master of Puppets',
  artist: 'Metallica',
} as Song;
const songWithCover = {
  ...songData,
  albumCover: homeKitStudio,
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

function songRun(
  hits: number,
  misses: number,
  completedAt: string,
  playbackSpeed: number,
): RunSummary {
  return {
    ...kickRun(hits, misses, completedAt),
    mode: 'practice',
    playbackSpeed,
  };
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
    onEndSession: () => {},
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

export const SeventyEightPercentWithCover: Story = {
  args: {
    songData: songWithCover,
    scoreData: { hitNotes: 78, totalNotes: 100, falseHits: 0 },
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

const catastrophicRun = songRun(24, 1054, '2026-08-15T10:00:00.000Z', 0.7);

export const CatastrophicMiss: Story = {
  args: {
    songData: songWithCover,
    scoreData: undefined,
    practiceSummary: catastrophicRun,
    practiceHistory: [
      songRun(122, 956, '2026-08-12T10:00:00.000Z', 0.8),
      songRun(61, 1017, '2026-08-14T10:00:00.000Z', 0.7),
      catastrophicRun,
    ],
    onAdaptiveRetry: () => {},
    handsFreeControlsEnabled: true,
    focusSection: {
      label: 'Bars 17–20',
      barStart: 17,
      barEnd: 20,
      tempoMultiplier: 0.6,
      passCriteria: 'Land 3 clean passes at 82%+.',
      novel: true,
    },
    lessonRecommendations: [
      {
        lessonId: '04.02',
        title: 'Rock three-way builder',
        family: 'coordination',
      },
    ],
  },
};

const strongRun: RunSummary = {
  ...songRun(1002, 76, '2026-08-15T11:00:00.000Z', 1),
  atomicSkillEvidence: [
    {
      run_id: 'run:strong',
      chart_revision: 'chart:master-of-puppets',
      manifest_revision: 'manifest:master-of-puppets',
      skill_id: 'pulse.eighth',
      item_id: 'song:master-of-puppets',
      context_signature: 'metal',
      evidence_kind: 'retention',
      quality: 0.93,
      weight: 0.5,
      playback_speed: 1,
      completed_at: '2026-08-15T11:00:00.000Z',
    },
    {
      run_id: 'run:strong',
      chart_revision: 'chart:master-of-puppets',
      manifest_revision: 'manifest:master-of-puppets',
      skill_id: 'coord.rock_three_way',
      item_id: 'song:master-of-puppets',
      context_signature: 'metal',
      evidence_kind: 'transfer',
      quality: 0.91,
      weight: 0.45,
      playback_speed: 1,
      completed_at: '2026-08-15T11:00:00.000Z',
    },
  ],
};

export const StrongPass: Story = {
  args: {
    songData: songWithCover,
    scoreData: { hitNotes: 1002, totalNotes: 1078, falseHits: 0 },
    practiceSummary: strongRun,
    practiceHistory: [
      songRun(701, 377, '2026-08-10T11:00:00.000Z', 0.7),
      songRun(816, 262, '2026-08-12T11:00:00.000Z', 0.8),
      songRun(938, 140, '2026-08-14T11:00:00.000Z', 0.9),
      strongRun,
    ],
    persistenceState: 'saved',
    gamification: {
      ...gamification,
      streak: { current: 7, longest: 9 },
      todayXp: 62,
    },
    runResult: {
      xpEarned: 24,
      goalCrossed: true,
      streakCurrent: 7,
      newlyUnlocked: [
        {
          id: 'speed-demon',
          title: 'Song personal best',
          description: 'A later comparable song pass exceeded your saved best.',
          hint: 'Beat a saved result on the same song, pace, and difficulty.',
          evidenceEvent: 'comparable saved song personal best',
          proofRank: 5,
        },
      ],
    },
  },
};

export const LessonPass: Story = {
  args: {
    songData: {
      ...songData,
      albumCover: undefined,
      name: 'Alternating Singles Warm-Up',
      artist: 'Drumroll Method',
      lesson: {
        id: '01.01',
        starsToUnlock: 0,
        unit: 'Foundations',
        title: 'Alternating Singles Warm-Up',
      },
    } as Song,
    scoreData: { hitNotes: 92, totalNotes: 100, falseHits: 0 },
    lessonProgression: {
      qualifies: true,
      fullCoverage: true,
      meetsLearningTempo: true,
      atTargetSpeed: true,
      meetsAccuracyTarget: true,
      accuracy: 0.92,
      starsEarned: 5,
    },
    persistenceState: 'saved',
  },
};

const firstSongRun = songRun(840, 238, '2026-08-15T12:00:00.000Z', 0.8);

export const FirstTimeSong: Story = {
  args: {
    songData: songWithCover,
    scoreData: undefined,
    practiceSummary: firstSongRun,
    practiceHistory: [],
    persistenceState: 'saved',
  },
};

const superheroesDeltas = [
  ...Array.from({ length: 393 }, () => 1),
  60,
  59,
  55,
  55,
  55,
  38,
  54,
  32,
  55,
  55,
  55,
  31,
  60,
  55,
  43,
  55,
  55,
  55,
  55,
  55,
  38,
  55,
  50,
  55,
  59,
  60,
  55,
  43,
  55,
  55,
  57,
  55,
  55,
  57,
  60,
  55,
  55,
  52,
  55,
  59,
  55,
  55,
  -31,
  -55,
  -54,
  -55,
  -44,
  -41,
  -53,
  -56,
  -55,
  -36,
  -57,
  -43,
  -55,
  -41,
  -55,
  -55,
  52,
  -55,
  -50,
  -57,
  -55,
  -33,
  -45,
  -55,
  -55,
  -46,
  -59,
  -37,
  -55,
  -34,
  -42,
  -55,
  38,
  -55,
  -56,
  -55,
  -55,
  -59,
  -60,
  -55,
  51,
  192,
  186,
  150,
  150,
  150,
  150,
  170,
  150,
  150,
  150,
  150,
  165,
  175,
  150,
  150,
  172,
  150,
  150,
  114,
  -184,
  -173,
  -187,
  -151,
  -199,
  -178,
  -161,
  -188,
  -153,
  -150,
  -187,
  -199,
  -194,
  -179,
  -179,
  -200,
];
const superheroesRecords = [
  ...superheroesDeltas.map((deltaMs) => ({
    tick: 0,
    deltaMs,
    element: 'snare' as const,
    verdict: 'hit' as const,
  })),
  ...Array.from({ length: 43 }, () => ({
    tick: 0,
    deltaMs: 0,
    element: 'snare' as const,
    verdict: 'miss' as const,
  })),
];

export const SuperheroesMeasured: Story = {
  args: {
    songData: {
      name: 'Superheroes',
      artist: 'The Script',
      albumCover: homeKitStudio,
    } as Song,
    scoreData: undefined,
    practiceSummary: {
      ...songRun(511, 43, '2026-08-17T12:00:00.000Z', 0.5),
      totalWrong: 84,
      timingWindowMs: 200,
      timingGapMs: 180,
    },
    practiceRecords: superheroesRecords,
    practiceHistory: [],
    persistenceState: 'saved',
    lessonRecommendations: [
      {
        lessonId: '16.01',
        title: 'Sixteenth-note steadiness',
        family: 'sixteenth-note pulse',
      },
    ],
    onOpenLesson: () => {},
  },
};

/** Stress case for "keeps its continuation action visible without
 * scrolling at 1024x700" (docs/design-acceptance-notes.md item 4): every
 * optional footer row on at once - a saving-state banner, all three
 * hands-free kit prompts, and the postcard export
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
