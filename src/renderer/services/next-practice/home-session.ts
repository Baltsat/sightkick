import { buildSongUnlockPath, composePracticeSession } from '../pedagogy';
import type {
  AtomicSkillState,
  SessionEnergy,
  SessionPlan,
  SongGoal,
  UnlockPath,
  ZpdRankedCandidate,
} from '../pedagogy/types';
import type { PracticeWaveResult } from './practice-wave';
import type { RankedPracticeCandidate } from './types';

export type HomeSessionIntent = 'learning' | 'songs';

export interface HomeSessionReceipt {
  title: string;
  detail: string;
}

export interface ComposeHomeSessionInput {
  intent: HomeSessionIntent;
  ranking: readonly RankedPracticeCandidate[];
  pedagogyRanking?: readonly ZpdRankedCandidate[];
  practiceWave?: PracticeWaveResult;
  activeGoal?: SongGoal;
  atomicStates?: readonly AtomicSkillState[];
  energy?: SessionEnergy;
  recentEarlyExits?: number;
  now?: string;
}

export interface OneKickHomeSession {
  intent: HomeSessionIntent;
  launch: RankedPracticeCandidate;
  launchSpeed: number;
  reason: string;
  source: 'pedagogy-v2' | 'practice-wave' | 'ranking';
  next: HomeSessionReceipt;
  payoff: HomeSessionReceipt;
  plan?: SessionPlan;
  goalPath?: UnlockPath;
}

function byCandidateId(
  ranking: readonly RankedPracticeCandidate[],
  candidateId: string | undefined,
): RankedPracticeCandidate | undefined {
  return candidateId
    ? ranking.find(({ candidate }) => candidate.id === candidateId)
    : undefined;
}

function waveStopFor(
  wave: PracticeWaveResult | undefined,
  candidateId: string,
) {
  return wave?.stops.find(
    ({ recommendation }) => recommendation.candidate.id === candidateId,
  );
}

function fallbackLaunch({
  intent,
  ranking,
  practiceWave,
}: ComposeHomeSessionInput): RankedPracticeCandidate | undefined {
  const waveStops = practiceWave?.stops ?? [];
  const fromWave =
    intent === 'songs'
      ? waveStops.find(
          ({ recommendation }) => recommendation.candidate.kind === 'song',
        )?.recommendation
      : waveStops.find(({ role }) => role === 'focus')?.recommendation;

  if (fromWave) {
    return fromWave;
  }

  const fromRanking = ranking.find(
    ({ candidate }) =>
      candidate.available &&
      candidate.unlocked !== false &&
      (intent === 'songs'
        ? candidate.kind === 'song'
        : candidate.kind === 'lesson'),
  );

  return (
    fromRanking ??
    ranking.find(
      ({ candidate }) => candidate.available && candidate.unlocked !== false,
    )
  );
}

function nextReceipt({
  plan,
  ranking,
  goalPath,
  practiceWave,
  launchId,
}: {
  plan: SessionPlan | undefined;
  ranking: readonly RankedPracticeCandidate[];
  goalPath: UnlockPath | undefined;
  practiceWave: PracticeWaveResult | undefined;
  launchId: string;
}): HomeSessionReceipt {
  const goalNext = goalPath?.next_items[0];

  if (goalNext) {
    const candidate = byCandidateId(ranking, goalNext.item_id);

    return {
      title: candidate?.candidate.title ?? 'Next unlock',
      detail: goalNext.reason,
    };
  }

  const nextBlock = plan?.blocks.find(
    ({ candidate_id }) => candidate_id !== plan.launch.candidate_id,
  );
  const candidate = byCandidateId(ranking, nextBlock?.candidate_id);

  if (nextBlock && candidate) {
    return {
      title: candidate.candidate.title,
      detail: nextBlock.why,
    };
  }

  const launchIndex = practiceWave?.stops.findIndex(
    ({ recommendation }) => recommendation.candidate.id === launchId,
  );
  const waveNext =
    launchIndex !== undefined && launchIndex >= 0
      ? practiceWave?.stops[launchIndex + 1]
      : practiceWave?.stops.find(
          ({ recommendation }) => recommendation.candidate.id !== launchId,
        );

  if (waveNext) {
    return {
      title: waveNext.recommendation.candidate.title,
      detail: waveNext.reason,
    };
  }

  return {
    title: 'No next move yet',
    detail:
      'A playable plan appears when the library has another eligible item.',
  };
}

function payoffReceipt({
  plan,
  ranking,
  practiceWave,
}: {
  plan: SessionPlan | undefined;
  ranking: readonly RankedPracticeCandidate[];
  practiceWave: PracticeWaveResult | undefined;
}): HomeSessionReceipt {
  const payoffBlock =
    plan?.blocks.find(({ role }) => role === 'celebrate') ??
    plan?.blocks.at(-1);
  const planned = byCandidateId(ranking, payoffBlock?.candidate_id);

  if (planned?.candidate.kind === 'song' && payoffBlock) {
    return {
      title: planned.candidate.title,
      detail: payoffBlock.why,
    };
  }

  const waveSong = practiceWave?.stops.find(
    ({ recommendation }) => recommendation.candidate.kind === 'song',
  );

  if (waveSong) {
    return {
      title: waveSong.recommendation.candidate.title,
      detail: waveSong.reason,
    };
  }

  return {
    title: 'No musical payoff yet',
    detail: 'No playable song is currently ranked for this session.',
  };
}

export function composeHomeSession(
  input: ComposeHomeSessionInput,
): OneKickHomeSession | undefined {
  const pedagogyRanking = input.pedagogyRanking ?? [];
  const plan =
    pedagogyRanking.length > 0
      ? composePracticeSession({
          request: {
            intent: input.intent === 'songs' ? 'song' : 'exercise',
            energy: input.energy ?? 'standard',
            ...(input.activeGoal ? { active_goal: input.activeGoal } : {}),
            recent_early_exits: input.recentEarlyExits ?? 0,
            now: input.now ?? new Date().toISOString(),
          },
          ranking: pedagogyRanking,
        })
      : undefined;
  const plannedLaunch = byCandidateId(input.ranking, plan?.launch.candidate_id);
  const intentLaunch =
    input.intent === 'songs' && plannedLaunch?.candidate.kind !== 'song'
      ? undefined
      : plannedLaunch;
  const launch = intentLaunch ?? fallbackLaunch(input);

  if (!launch) {
    return undefined;
  }

  const launchDecision = pedagogyRanking.find(
    ({ candidate }) => candidate.item_id === launch.candidate.id,
  )?.decision;
  const waveStop = waveStopFor(input.practiceWave, launch.candidate.id);
  const goalCandidate = input.activeGoal
    ? pedagogyRanking.find(
        ({ candidate }) => candidate.item_id === input.activeGoal?.song_id,
      )
    : undefined;
  const goalPath =
    input.activeGoal && input.atomicStates && goalCandidate
      ? buildSongUnlockPath({
          goal: input.activeGoal,
          song: goalCandidate.candidate,
          ranking: pedagogyRanking,
          states: input.atomicStates,
        })
      : undefined;

  return {
    intent: input.intent,
    launch,
    launchSpeed: plan?.launch.speed ?? launch.suggestedSpeed,
    reason: launchDecision?.explanation ?? waveStop?.reason ?? launch.reason,
    source: intentLaunch
      ? 'pedagogy-v2'
      : waveStop
      ? 'practice-wave'
      : 'ranking',
    next: nextReceipt({
      plan,
      ranking: input.ranking,
      goalPath,
      practiceWave: input.practiceWave,
      launchId: launch.candidate.id,
    }),
    payoff: payoffReceipt({
      plan,
      ranking: input.ranking,
      practiceWave: input.practiceWave,
    }),
    ...(plan ? { plan } : {}),
    ...(goalPath ? { goalPath } : {}),
  };
}
