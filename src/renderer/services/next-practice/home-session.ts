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
import type {
  DeadlinePacingSummary,
  PracticeCandidate,
  RankedPracticeCandidate,
} from './types';

export type HomeSessionIntent = 'learning' | 'songs';

export type HomeSessionSize = 'short' | 'full';

export interface HomeSessionReceipt {
  title: string;
  detail: string;
  candidateId?: string;
  unavailable?: true;
}

export interface ComposeHomeSessionInput {
  intent: HomeSessionIntent;
  size?: HomeSessionSize;
  ranking: readonly RankedPracticeCandidate[];
  pedagogyRanking?: readonly ZpdRankedCandidate[];
  practiceWave?: PracticeWaveResult;
  activeGoal?: SongGoal;
  goalPayoffCandidate?: PracticeCandidate;
  goalTargetDate?: string;
  deadlinePacing?: DeadlinePacingSummary;
  atomicStates?: readonly AtomicSkillState[];
  energy?: SessionEnergy;
  recentEarlyExits?: number;
  now?: string;
}

export interface OneKickHomeSession {
  intent: HomeSessionIntent;
  size: HomeSessionSize;
  launch: RankedPracticeCandidate;
  launchSpeed: number;
  reason: string;
  source: 'pedagogy-v2' | 'practice-wave' | 'ranking';
  focus: HomeSessionReceipt;
  build: HomeSessionReceipt;
  payoff: HomeSessionReceipt;
  runway?: HomeSessionReceipt;
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

function receiptForBlock({
  block,
  ranking,
  fallback,
  empty,
}: {
  block: SessionPlan['blocks'][number] | undefined;
  ranking: readonly RankedPracticeCandidate[];
  fallback?: RankedPracticeCandidate;
  empty: HomeSessionReceipt;
}): HomeSessionReceipt {
  const candidate = byCandidateId(ranking, block?.candidate_id) ?? fallback;

  if (!candidate) {
    return empty;
  }

  return {
    title: candidate.candidate.title,
    detail: block?.why ?? candidate.reason,
    candidateId: candidate.candidate.id,
  };
}

function focusReceipt({
  plan,
  ranking,
  launch,
}: {
  plan: SessionPlan | undefined;
  ranking: readonly RankedPracticeCandidate[];
  launch: RankedPracticeCandidate;
}): HomeSessionReceipt {
  return receiptForBlock({
    block: plan?.blocks[0],
    ranking,
    fallback: launch,
    empty: {
      title: 'Choose a target',
      detail:
        'A counted first phrase appears after a playable target is selected.',
    },
  });
}

function buildReceipt({
  plan,
  ranking,
  practiceWave,
  launch,
}: {
  plan: SessionPlan | undefined;
  ranking: readonly RankedPracticeCandidate[];
  practiceWave: PracticeWaveResult | undefined;
  launch: RankedPracticeCandidate;
}): HomeSessionReceipt {
  const buildBlock = plan?.blocks.find(({ role }) =>
    ['acquire', 'retain', 'transfer'].includes(role),
  );
  const waveBuild = practiceWave?.stops.find(
    ({ recommendation }) => recommendation.candidate.id !== launch.candidate.id,
  );

  return receiptForBlock({
    block: buildBlock,
    ranking,
    fallback: waveBuild?.recommendation ?? launch,
    empty: {
      title: 'Build the first clean pass',
      detail: 'Two clean passes make the next musical payoff useful.',
    },
  });
}

function detailWithSection(
  detail: string,
  section: { start: number; end: number } | undefined,
  speed: number,
): string {
  return section
    ? `${detail} Play bars ${section.start}–${section.end} at ${speed.toFixed(
        1,
      )}×.`
    : detail;
}

function favouriteWavePayoff(
  practiceWave: PracticeWaveResult | undefined,
): HomeSessionReceipt | undefined {
  const stop = practiceWave?.stops.find(
    ({ role, recommendation }) =>
      role === 'apply' &&
      recommendation.candidate.kind === 'song' &&
      recommendation.candidate.liked === true,
  );

  if (!stop) {
    return undefined;
  }

  const { candidate } = stop.recommendation;
  const section = candidate.itemManifest?.section;

  return {
    title: candidate.title,
    detail: detailWithSection(
      stop.reason,
      section ? { start: section.start_bar, end: section.end_bar } : undefined,
      stop.recommendation.suggestedSpeed,
    ),
    candidateId: candidate.id,
  };
}

function payoffReceipt({
  plan,
  ranking,
  practiceWave,
  goalPath,
  goalPayoffCandidate,
  launch,
}: {
  plan: SessionPlan | undefined;
  ranking: readonly RankedPracticeCandidate[];
  practiceWave: PracticeWaveResult | undefined;
  goalPath: UnlockPath | undefined;
  goalPayoffCandidate: PracticeCandidate | undefined;
  launch: RankedPracticeCandidate;
}): HomeSessionReceipt {
  const probe = goalPath?.next_song_probe;
  const goalSong = byCandidateId(ranking, probe?.song_id);

  if (probe && goalSong) {
    return {
      title: goalSong.candidate.title,
      detail: `Play bars ${probe.start_bar}–${
        probe.end_bar
      } at ${probe.speed.toFixed(1)}×.`,
      candidateId: goalSong.candidate.id,
    };
  }

  if (goalPayoffCandidate?.kind === 'song' && goalPayoffCandidate.available) {
    return {
      title: goalPayoffCandidate.title,
      detail:
        'Apply the session in your goal song. A safe section probe will appear when chart evidence supports one.',
      candidateId: goalPayoffCandidate.id,
    };
  }

  const payoffBlock =
    plan?.blocks.find(({ role }) => role === 'celebrate') ??
    plan?.blocks.at(-1);
  const planned = byCandidateId(ranking, payoffBlock?.candidate_id);
  const wavePayoff = favouriteWavePayoff(practiceWave);

  if (wavePayoff) {
    return wavePayoff;
  }

  if (
    planned?.candidate.kind === 'song' &&
    planned.candidate.liked === true &&
    payoffBlock
  ) {
    return {
      title: planned.candidate.title,
      detail: detailWithSection(
        payoffBlock.why,
        payoffBlock.bar_range,
        payoffBlock.speed,
      ),
      candidateId: planned.candidate.id,
    };
  }

  return {
    unavailable: true,
    title: 'No favourite-song payoff is ready',
    detail: `Today’s work is ${launch.candidate.title}. My Wave has no playable saved favourite linked to this session.`,
  };
}

function distinctBuild(
  build: HomeSessionReceipt,
  payoff: HomeSessionReceipt,
): HomeSessionReceipt {
  if (
    (build.candidateId && build.candidateId === payoff.candidateId) ||
    build.title === payoff.title
  ) {
    return {
      candidateId: build.candidateId,
      title: 'Build the phrase',
      detail: 'Keep the work to two clean passes before the song payoff.',
    };
  }

  return build;
}

function formatGoalDate(goalTargetDate: string): string {
  const date = new Date(`${goalTargetDate}T12:00:00`);

  if (!Number.isFinite(date.getTime())) {
    return goalTargetDate;
  }

  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function runwayReceipt({
  goalTargetDate,
  deadlinePacing,
  goalPath,
  ranking,
}: {
  goalTargetDate: string | undefined;
  deadlinePacing: DeadlinePacingSummary | undefined;
  goalPath: UnlockPath | undefined;
  ranking: readonly RankedPracticeCandidate[];
}): HomeSessionReceipt | undefined {
  if (!goalTargetDate) {
    return undefined;
  }

  const probe = goalPath?.next_song_probe;
  const goalSong = byCandidateId(
    ranking,
    probe?.song_id ?? goalPath?.goal.song_id,
  );
  const nextTarget = deadlinePacing?.targets[0];
  const pace = nextTarget
    ? ` ${nextTarget.label} ${Math.round(
        nextTarget.weeklyTarget,
      )}/100 this week.`
    : '';

  return {
    title: `${formatGoalDate(goalTargetDate)} runway`,
    detail:
      probe && goalSong
        ? `Toward ${goalSong.candidate.title} · next proof: bars ${
            probe.start_bar
          }–${probe.end_bar} at ${probe.speed.toFixed(1)}×.${pace}`
        : 'Building evidence for a weekly pace.',
    ...(goalSong ? { candidateId: goalSong.candidate.id } : {}),
  };
}

function sizeFor(input: ComposeHomeSessionInput): HomeSessionSize {
  return input.size ?? (input.energy === 'short' ? 'short' : 'full');
}

function energyFor(input: ComposeHomeSessionInput): SessionEnergy {
  const size = sizeFor(input);

  if (size === 'short') {
    return 'short';
  }

  return input.energy === 'deep' ? 'deep' : 'standard';
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
            energy: energyFor(input),
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
  const payoff = payoffReceipt({
    plan,
    ranking: input.ranking,
    practiceWave: input.practiceWave,
    goalPath,
    goalPayoffCandidate: input.goalPayoffCandidate,
    launch,
  });

  return {
    intent: input.intent,
    size: sizeFor(input),
    launch,
    launchSpeed: plan?.launch.speed ?? launch.suggestedSpeed,
    reason: launchDecision?.explanation ?? waveStop?.reason ?? launch.reason,
    source: intentLaunch
      ? 'pedagogy-v2'
      : waveStop
      ? 'practice-wave'
      : 'ranking',
    focus: focusReceipt({ plan, ranking: input.ranking, launch }),
    build: distinctBuild(
      buildReceipt({
        plan,
        ranking: input.ranking,
        practiceWave: input.practiceWave,
        launch,
      }),
      payoff,
    ),
    payoff,
    ...(input.goalTargetDate
      ? {
          runway: runwayReceipt({
            goalTargetDate: input.goalTargetDate,
            deadlinePacing: input.deadlinePacing,
            goalPath,
            ranking: input.ranking,
          }),
        }
      : {}),
    ...(plan ? { plan } : {}),
    ...(goalPath ? { goalPath } : {}),
  };
}
