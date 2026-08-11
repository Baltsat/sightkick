import type { Meta, StoryObj } from '@storybook/react';
import type { Song } from '../../../types';
import type { UseGamificationResult } from '../../hooks/useGamification';
import type { RunSummary } from '../../services/practice-stats';
import type { Goal } from '../Goals';
import { ProfileInsights, ProfileView } from './ProfileView';

const song: Song = {
  id: 'lesson:07.03',
  dir: '/library/lesson-07-03',
  name: 'Tom Handoff',
  artist: 'Drumroll Method',
  album: 'Kit Navigation',
  charter: 'Drumroll',
  genre: 'Practice',
  year: '2026',
  fiveLaneDrums: false,
  proDrums: true,
  delaySeconds: 0,
  drumDifficulty: 5,
  format: 'chart',
  audio: [],
};
const goals: Goal[] = [
  {
    id: 'goal:tom-handoff',
    songId: song.id,
    difficulty: 'expert',
    createdAt: '2026-08-01T09:00:00.000Z',
    targetDate: '2026-09-30',
    isPrimary: true,
  },
];
const gamification: UseGamificationResult = {
  isLoaded: true,
  days: {},
  streak: { current: 5, longest: 9 },
  todayXp: 32,
  goalXp: 50,
  goalOption: 'casual',
  setGoalOption: () => {},
  goalCrossedToday: false,
  weekActivity: [true, true, false, true, true, false, false],
  totalStars: 37,
  achievements: [],
  laneAccuracy: [],
  recentLaneSignals: [],
  latestRun: undefined,
  loadAchievements: () => {},
  recordRun: async () => ({
    xpEarned: 0,
    totalXp: 0,
    leveledUp: false,
    streakCurrent: 5,
    streakMilestone: undefined,
  }),
};
const latestRun: RunSummary = {
  completedAt: '2026-08-11T10:00:00.000Z',
  totalHits: 88,
  totalMisses: 12,
  totalWrong: 2,
  overallAccuracy: 0.88,
  laneAccuracy: [],
  laneBias: [],
  timingBias: {
    meanMs: 6,
    medianMs: 4,
    spreadMs: 22,
    earlyCount: 18,
    lateCount: 28,
    onTimeCount: 42,
    sampleCount: 88,
  },
  wrongHitCounts: [],
  timingWindowMs: 110,
  atomicSkillEvidence: [
    {
      run_id: 'run:tom-handoff',
      chart_revision: 'chart:lesson-07-03',
      manifest_revision: 'curriculum:1',
      skill_id: 'kit.tom_t2_t3',
      item_id: song.id,
      context_signature: 'meter=4/4;phrase=tom-handoff',
      evidence_kind: 'acquisition',
      quality: 0.82,
      weight: 0.5,
      playback_speed: 0.72,
      completed_at: '2026-08-11T10:00:00.000Z',
      judging_window_ms: 110,
      normalized_timing_stability: 0.74,
    },
    {
      run_id: 'run:tom-handoff',
      chart_revision: 'chart:lesson-07-03',
      manifest_revision: 'curriculum:1',
      skill_id: 'pulse.eighth',
      item_id: song.id,
      context_signature: 'meter=4/4;phrase=tom-handoff',
      evidence_kind: 'retention',
      quality: 0.76,
      weight: 0.4,
      playback_speed: 0.72,
      completed_at: '2026-08-11T10:00:00.000Z',
      judging_window_ms: 110,
      normalized_timing_stability: 0.7,
    },
  ],
  coachEvidence: [
    {
      id: 'coach:tom-handoff',
      kind: 'lane-transition',
      severity: 'medium',
      skillTag: 'kit.tom_t2_t3',
      sampleCount: 12,
      barStart: 9,
      barEnd: 12,
      remediationLessonId: '07.03',
    },
  ],
};
const insights: ProfileInsights = {
  recommendation: {
    candidate: {
      id: song.id,
      title: song.name,
      kind: 'lesson',
      difficulty: 'expert',
      available: true,
      curriculumId: '07.03',
    },
    score: 84,
    predictedSuccess: 0.74,
    suggestedSpeed: 0.72,
    mastery: 0.36,
    reason:
      'Mid-to-floor tom movement is the nearest supported bottleneck at a reachable tempo.',
    factors: [],
    confidence: {
      value: 0.71,
      level: 'medium',
      evidenceRuns: 3,
      detail: 'Three saved scored runs support this route.',
    },
    decisionReceipt: {
      policy_version: 'pedagogy-v2.0',
      item_id: song.id,
      source_revision: 'curriculum:1',
      predicted_success: 0.74,
      learning_value: 0.84,
      state: 'productive_acquisition',
      independent_eligible: true,
      skill_fit: 0.76,
      prereq_fit: 0.81,
      tempo_fit: 0.72,
      transfer_fit: 0.22,
      uncertainty: 0.29,
      hard_prerequisites: ['pulse.eighth'],
      scaffold: { speed: 0.72, steps: ['short_loop', 'Tutor'] },
      factors: [],
      explanation:
        'Mid-to-floor tom movement is the nearest supported bottleneck at a reachable tempo.',
    },
  },
  atomicStates: [
    {
      skill_id: 'kit.tom_t2_t3',
      alpha: 4.8,
      beta: 2.2,
      effective_trials: 5,
      last_acquisition_at: '2026-08-11T10:00:00.000Z',
      next_review_at: '2026-08-12T10:00:00.000Z',
      stage: 'provisional',
      evidence_boundary: 'midi',
    },
    {
      skill_id: 'pulse.eighth',
      alpha: 7.5,
      beta: 2.5,
      effective_trials: 8,
      last_retention_at: '2026-08-11T10:00:00.000Z',
      stage: 'retained',
      evidence_boundary: 'midi',
    },
    {
      skill_id: 'hand.singles',
      alpha: 3.5,
      beta: 3.5,
      effective_trials: 3,
      stage: 'assessed',
      evidence_boundary: 'partial_midi',
    },
  ],
  dueReviews: [
    {
      skill_id: 'kit.tom_t2_t3',
      due_at: '2026-08-12T10:00:00.000Z',
      overdue: false,
      stage: 'provisional',
    },
  ],
  deadlinePacing: {
    goalDate: '2026-09-30',
    weeksRemaining: 7,
    targets: [
      {
        axisId: 'fills-kit-navigation',
        label: 'Fills & Kit Navigation',
        prerequisiteAxisIds: ['hand-control'],
        currentScore: 42,
        deadlineTarget: 78,
        weeklyTargets: [],
        weeklyTarget: 48,
        behindBy: 6,
        pacingValue: 0.6,
        trend: 'improving',
        trendDelta: 7,
        evidenceRuns: 3,
        detail: 'One controlled tom handoff loop at 72% speed this week.',
      },
    ],
  },
  rejectedAtomicEvidenceCount: 1,
  latestRun,
  practiceCards: {
    cards: [
      {
        kind: 'review',
        label: 'Review',
        options: [
          {
            id: 'review:lesson:07.03',
            kind: 'review',
            candidate_id: song.id,
            title: 'Tom handoff recall',
            speed: 0.72,
            source_label: 'Saved review queue · Mid-to-floor tom movement',
            completion_label: 'One saved review run',
          },
        ],
      },
      {
        kind: 'build',
        label: 'Build',
        options: [
          {
            id: 'build:lesson:07.03',
            kind: 'build',
            candidate_id: song.id,
            title: 'Tom handoff loop',
            speed: 0.72,
            source_label: 'Current acquisition block · Build the handoff.',
            completion_label: 'One saved loop or lesson block',
          },
        ],
      },
      {
        kind: 'apply',
        label: 'Apply',
        options: [
          {
            id: 'apply:lesson:07.03',
            kind: 'apply',
            candidate_id: song.id,
            title: 'Tom handoff phrase',
            speed: 0.72,
            source_label: 'Current musical application route',
            completion_label: 'One saved musical application run',
          },
        ],
      },
    ],
    evidence_signature: 'profile-story-p1',
  },
  weeklySet: {
    rhythm: 'weekly',
    cards: [
      {
        kind: 'review',
        option: {
          id: 'review:lesson:07.03',
          kind: 'review',
          candidate_id: song.id,
          title: 'Tom handoff recall',
          speed: 0.72,
          source_label: 'Saved review queue · Mid-to-floor tom movement',
          completion_label: 'One saved review run',
        },
      },
      {
        kind: 'build',
        option: {
          id: 'build:lesson:07.03',
          kind: 'build',
          candidate_id: song.id,
          title: 'Tom handoff loop',
          speed: 0.72,
          source_label: 'Current acquisition block · Build the handoff.',
          completion_label: 'One saved loop or lesson block',
        },
      },
      {
        kind: 'apply',
        option: {
          id: 'apply:lesson:07.03',
          kind: 'apply',
          candidate_id: song.id,
          title: 'Tom handoff phrase',
          speed: 0.72,
          source_label: 'Current musical application route',
          completion_label: 'One saved musical application run',
        },
      },
    ],
    evidence_signature: 'profile-story-p1|weekly',
  },
  weeklyRhythm: {
    next_available: 'Thursday',
    days: [
      { key: '2026-08-05', label: 'Wed', state: 'rest' },
      { key: '2026-08-06', label: 'Thu', state: 'played' },
      { key: '2026-08-07', label: 'Fri', state: 'rest' },
      { key: '2026-08-08', label: 'Sat', state: 'played' },
      { key: '2026-08-09', label: 'Sun', state: 'rest' },
      { key: '2026-08-10', label: 'Mon', state: 'rest' },
      { key: '2026-08-11', label: 'Tue', state: 'planned' },
    ],
  },
  weeklyRecap: {
    week_start: '2026-08-05',
    week_end: '2026-08-11',
    sessions: 3,
    played_days: 2,
    evidence_state: 'measured',
    skill: {
      state: 'reliable',
      label: 'Eighth-note pulse',
      detail: 'A saved retained run strengthened this skill.',
    },
    section: {
      state: 'attempted',
      label: 'Bars 5–8',
      detail: '76% at 0.7×. This is a section result, not full-song readiness.',
    },
    next: 'Tom handoff at 0.7× from the current evidence route.',
  },
};
const meta: Meta<typeof ProfileView> = {
  title: 'Insights/Profile view',
  component: ProfileView,
  args: {
    songList: [song],
    goals,
    isGoalsLoaded: true,
    onSaveGoal: () => {},
    onSetPrimaryGoal: () => {},
    gamification,
    insights,
    onStartTargetedPractice: () => {},
  },
  render: (args) => (
    <div className="h-screen overflow-hidden bg-bg">
      <ProfileView {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof ProfileView>;

export const EvidenceBackedRoute: Story = {};
