import type { Meta, StoryObj } from '@storybook/react';
import type { Song } from '../../../types';
import type { UseGamificationResult } from '../../hooks/useGamification';
import type {
  AtomicSkillState,
  SongGoal,
  ZpdRankedCandidate,
} from '../../services/pedagogy';
import type {
  PracticeCandidate,
  RankedPracticeCandidate,
} from '../../services/next-practice';
import { HomeCockpit } from './HomeCockpit';

const song: Song = {
  id: 'yandex:kygo-raging',
  dir: '/library/kygo-raging',
  name: 'Raging',
  artist: 'Kygo feat. Kodaline',
  album: 'Cloud Nine',
  charter: 'Drumroll',
  genre: 'Rock',
  year: '2026',
  fiveLaneDrums: false,
  proDrums: true,
  delaySeconds: 0,
  drumDifficulty: 5,
  format: 'chart',
  audio: [],
  liked: true,
  sourceProvenance: {
    provider: 'yandex-music',
    collectionId: 'liked',
    collectionName: 'Мне нравится',
    trackId: 'kygo-raging',
    title: 'Raging',
    artists: ['Kygo', 'Kodaline'],
  },
};

function ranked(
  id: string,
  title: string,
  kind: 'lesson' | 'song',
): ZpdRankedCandidate {
  return {
    candidate: {
      item_id: id,
      kind,
      title,
      available: true,
      liked: kind === 'song',
      manifest: {
        item_id: id,
        source: kind === 'song' ? 'chart_analysis' : 'curriculum',
        source_revision: `${id}:v1`,
        demands: [
          {
            skill_id: 'pulse.eighth',
            weight: 1,
            context: 'meter=4/4;phrase=groove',
          },
        ],
        context_signature: 'meter=4/4;phrase=groove',
        assessment_confidence: 0.9,
        ...(kind === 'song' ? { section: { start_bar: 5, end_bar: 8 } } : {}),
      },
    },
    decision: {
      policy_version: 'pedagogy-v2.0',
      item_id: id,
      source_revision: `${id}:v1`,
      predicted_success: 0.74,
      learning_value: kind === 'lesson' ? 0.9 : 0.7,
      state: 'productive_acquisition',
      independent_eligible: true,
      skill_fit: 0.8,
      prereq_fit: 0.8,
      tempo_fit: 0.8,
      transfer_fit: 0.7,
      uncertainty: 0.2,
      hard_prerequisites: [],
      scaffold: { speed: 0.7, steps: ['short_loop'] },
      adaptation: {
        starting_speed: 0.7,
        repeat_budget: 3,
        quality_passes_to_advance: 2,
        low_quality_passes_before_stop: 2,
      },
      factors: [],
      explanation: 'Saved evidence supports this route.',
    },
  };
}

const pedagogyRanking = [
  ranked('lesson:pulse', 'Eighth-note pulse', 'lesson'),
  ranked(song.id, song.name, 'song'),
];
const practiceRanking: RankedPracticeCandidate[] = [
  {
    candidate: {
      id: 'lesson:pulse',
      title: 'Eighth-note pulse',
      kind: 'lesson',
      difficulty: 'expert',
      available: true,
    },
    score: 84,
    predictedSuccess: 0.74,
    suggestedSpeed: 0.7,
    mastery: 0.3,
    reason: 'Saved review evidence keeps the pulse route current.',
    factors: [],
    confidence: {
      value: 0.8,
      level: 'high',
      evidenceRuns: 3,
      detail: 'Three saved practice runs support this route.',
    },
  },
  {
    candidate: {
      id: song.id,
      title: song.name,
      kind: 'song',
      difficulty: 'expert',
      available: true,
      liked: true,
    },
    score: 78,
    predictedSuccess: 0.72,
    suggestedSpeed: 0.7,
    mastery: 0.3,
    reason: 'The favourite-song section is eligible for a scaffolded probe.',
    factors: [],
    confidence: {
      value: 0.8,
      level: 'high',
      evidenceRuns: 3,
      detail: 'Three saved practice runs support this route.',
    },
  },
];
const activeGoal: SongGoal = {
  song_id: song.id,
  preferred: true,
  target_section: { start_bar: 5, end_bar: 8 },
  goal_kind: 'full_song',
};
const atomicStates: AtomicSkillState[] = [
  {
    skill_id: 'pulse.eighth',
    alpha: 8,
    beta: 2,
    effective_trials: 8,
    stage: 'retained',
    evidence_boundary: 'midi',
    last_retention_at: '2026-08-11T10:00:00.000Z',
  },
];
const goalPayoffCandidate: PracticeCandidate = {
  id: song.id,
  title: song.name,
  kind: 'song',
  difficulty: 'expert',
  available: true,
};
const gamification = {
  streak: { current: 4, longest: 9 },
  todayXp: 411,
  goalXp: 500,
  totalStars: 18,
  runsBySong: {},
  recentLaneSignals: [],
} as unknown as UseGamificationResult;
const launcherLesson = {
  ...song,
  id: 'lesson:pulse',
  name: 'Whole and Half Note Reading',
  artist: 'Drumroll Method',
  lesson: {
    id: '02.01',
    starsToUnlock: 3,
    unit: 'Foundations',
    title: 'Whole and Half Note Reading',
    skills: ['reading'],
  },
} as Song;
const foundationEpisodes = [
  {
    id: '01.01',
    title: 'Hand Blocks Warm-Up',
    skills: ['sixteenth-notes', 'timing'],
  },
  {
    id: '01.02',
    title: 'Paired Doubles Warm-Up',
    skills: ['sixteenth-notes', 'timing'],
  },
  {
    id: '01.03',
    title: 'Kick Drum Pulse',
    skills: ['sixteenth-notes', 'timing'],
  },
].map(
  ({ id, title, skills }, index) =>
    ({
      ...launcherLesson,
      id: `lesson:${id}`,
      name: title,
      lesson: {
        id,
        starsToUnlock: index,
        unit: 'Foundations',
        title,
        skills,
      },
    }) as Song,
);
const launcherSongTwo = {
  ...song,
  id: 'song:night-drive',
  name: 'Night Drive',
} as Song;
const launcherSongThree = {
  ...song,
  id: 'song:paper-lanterns',
  name: 'Paper Lanterns',
} as Song;
const launcherRun = (completedAt: string) =>
  ({
    completedAt,
    totalHits: 100,
    totalMisses: 0,
    totalWrong: 0,
    overallAccuracy: 1,
    laneAccuracy: [],
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
    playbackSpeed: 0.8,
    bestStreak: 16,
  }) as never;
const launcherGamification = {
  ...gamification,
  runsBySong: {
    [song.id]: Array.from({ length: 9 }, (_, index) =>
      launcherRun(
        `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      ),
    ),
    [launcherSongTwo.id]: Array.from({ length: 6 }, (_, index) =>
      launcherRun(
        `2026-07-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      ),
    ),
    [launcherSongThree.id]: Array.from({ length: 3 }, (_, index) =>
      launcherRun(
        `2026-06-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      ),
    ),
  },
} as unknown as UseGamificationResult;
const meta: Meta<typeof HomeCockpit> = {
  title: 'Home cockpit/Evidence cards',
  component: HomeCockpit,
  args: {
    songList: [song],
    gamification,
    recommendation: practiceRanking[0],
    practiceRanking,
    pedagogyRanking,
    activeGoal,
    goalPayoffCandidate,
    goalTargetDate: '2026-09-10',
    atomicStates,
    dueReviews: [
      {
        skill_id: 'pulse.eighth',
        due_at: '2026-08-11T08:00:00.000Z',
        overdue: true,
        stage: 'retained',
      },
    ],
    onStartRecommended: () => {},
    onStartSession: () => {},
    onStartPracticeCard: () => {},
    onOpenSongs: () => {},
    onOpenProfile: () => {},
  },
  render: (args) => (
    <div className="h-screen overflow-hidden bg-bg">
      <HomeCockpit {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof HomeCockpit>;

export const P1EvidenceCards: Story = {};

export const TodaysStory: Story = {
  args: {
    songList: [...foundationEpisodes, launcherLesson, song],
  },
};

export const HonestMissingData: Story = {
  args: {
    songList: [],
    recommendation: undefined,
    practiceRanking: [],
    pedagogyRanking: [],
    activeGoal: undefined,
    goalPayoffCandidate: undefined,
    atomicStates: [],
  },
};

export const KitLauncherArmed: Story = {
  render: (args) => (
    <div className="h-screen overflow-hidden bg-bg">
      <HomeCockpit
        {...args}
        songList={[
          ...foundationEpisodes,
          launcherLesson,
          song,
          launcherSongTwo,
          launcherSongThree,
        ]}
        gamification={launcherGamification}
        onOpenJourney={() => {}}
        onFindNewMusic={() => {}}
        onStartSong={() => {}}
      />
    </div>
  ),
};
