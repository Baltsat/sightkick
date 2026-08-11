import type { Meta, StoryObj } from '@storybook/react';
import type { Song } from '../../../types';
import type { UseGamificationResult } from '../../hooks/useGamification';
import type { LessonProgress } from '../../hooks/useLessons';
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
  id: 'song:favourite',
  dir: '/library/song-favourite',
  name: 'Night Ride',
  artist: 'The Practice Set',
  album: 'Warm Studio',
  charter: 'Drumroll',
  genre: 'Rock',
  year: '2026',
  fiveLaneDrums: false,
  proDrums: true,
  delaySeconds: 0,
  drumDifficulty: 5,
  format: 'chart',
  audio: [],
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
  todayXp: 32,
  goalXp: 50,
  totalStars: 18,
  runsBySong: {},
  recentLaneSignals: [],
} as unknown as UseGamificationResult;
const lessonProgress = {
  entries: [],
  groups: [],
  totalLessons: 0,
  unlockedCount: 0,
  totalStars: 0,
  clearedCount: 0,
} as LessonProgress;
const meta: Meta<typeof HomeCockpit> = {
  title: 'Home cockpit/Evidence cards',
  component: HomeCockpit,
  args: {
    surface: 'home',
    songList: [song],
    difficulty: 'expert',
    lessonProgress,
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
    onOpenJourney: () => {},
    onOpenCoach: () => {},
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
