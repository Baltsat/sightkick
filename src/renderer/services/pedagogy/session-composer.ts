import { skillNodeById } from './skill-graph';
import {
  SessionBlock,
  SessionPlan,
  SessionRequest,
  SkillReview,
  ZpdRankedCandidate,
} from './types';

export interface ComposeSessionInput {
  request: SessionRequest;
  ranking: readonly ZpdRankedCandidate[];
  due_reviews?: readonly SkillReview[];
}

/** The demand a ranked candidate leans on most — mirrors
 * `zpd-frontier.ts`'s `topSkillLabel`, kept local since it's a small,
 * single-use lookup on a different input shape (a full ranked candidate
 * rather than a bare manifest). */
function topSkillLabel(ranked: ZpdRankedCandidate): string | undefined {
  const skill_nodes = skillNodeById();
  const top = [...ranked.candidate.manifest.demands].sort(
    (left, right) => right.weight - left.weight,
  )[0];

  return top ? skill_nodes.get(top.skill_id)?.label : undefined;
}

/**
 * One human, candidate-aware reason for the orienting phrase — never the
 * bare "Get one counted phrase before any adjustment" template regardless
 * of which skill the session actually targets.
 */
function orientWhy(primary: ZpdRankedCandidate): string {
  const skillLabel = topSkillLabel(primary);

  return skillLabel
    ? `Get one counted phrase of ${skillLabel.toLowerCase()} before any adjustment.`
    : 'Get one counted phrase before any adjustment.';
}

/** One human, candidate-aware reason for the main work block. */
function acquireWhy(primary: ZpdRankedCandidate): string {
  const skillLabel = topSkillLabel(primary);

  return skillLabel
    ? `Build ${skillLabel.toLowerCase()} at the selected scaffold.`
    : 'Build the next layer at the selected scaffold.';
}

/** One human, candidate-aware reason for the musical payoff — names the
 * actual song and, when true, that it's a saved favourite. Never claims a
 * song is a favourite unless `liked` says so. */
function celebrateWhy(musical: ZpdRankedCandidate): string {
  if (musical.candidate.kind !== 'song') {
    return 'No playable song is available, so finish with the closest musical phrase.';
  }

  return musical.candidate.liked
    ? `Finish in "${musical.candidate.title}" — one of your saved favourites.`
    : `Finish in "${musical.candidate.title}".`;
}

function firstAvailable(
  ranking: readonly ZpdRankedCandidate[],
): ZpdRankedCandidate | undefined {
  return ranking.find(
    ({ candidate, decision }) =>
      candidate.available && decision.state !== 'goal_preview_only',
  );
}

function byItem(
  ranking: readonly ZpdRankedCandidate[],
  item_id: string | undefined,
): ZpdRankedCandidate | undefined {
  return item_id
    ? ranking.find(
        ({ candidate }) => candidate.item_id === item_id && candidate.available,
      )
    : undefined;
}

function applicationFor(
  ranking: readonly ZpdRankedCandidate[],
  excluding: string | undefined,
): ZpdRankedCandidate | undefined {
  return ranking
    .filter(
      ({ candidate, decision }) =>
        candidate.available &&
        candidate.kind === 'song' &&
        candidate.item_id !== excluding &&
        decision.state !== 'goal_preview_only',
    )
    .sort(
      (left, right) =>
        Number(right.candidate.liked === true) -
          Number(left.candidate.liked === true) ||
        right.decision.learning_value - left.decision.learning_value ||
        left.candidate.item_id.localeCompare(right.candidate.item_id),
    )[0];
}

function reviewFor(
  ranking: readonly ZpdRankedCandidate[],
  due_reviews: readonly SkillReview[],
): ZpdRankedCandidate | undefined {
  const due = new Set(
    due_reviews
      .filter((review) => review.overdue)
      .map((review) => review.skill_id),
  );

  return ranking.find(
    ({ candidate, decision }) =>
      candidate.available &&
      decision.state !== 'goal_preview_only' &&
      candidate.manifest.demands.some((demand) => due.has(demand.skill_id)),
  );
}

function block(
  role: SessionBlock['role'],
  ranked: ZpdRankedCandidate,
  why: string,
): SessionBlock {
  const adaptation = ranked.decision.adaptation ?? {
    starting_speed: ranked.decision.scaffold.speed,
    repeat_budget: 2,
    quality_passes_to_advance: 2,
    low_quality_passes_before_stop: 2,
  };
  const stop_rules: Record<SessionBlock['role'], string> = {
    orient: 'Stop after one counted phrase.',
    acquire: `Stop after ${adaptation.quality_passes_to_advance} quality pass${
      adaptation.quality_passes_to_advance === 1 ? '' : 'es'
    } or ${adaptation.low_quality_passes_before_stop} low-quality pass${
      adaptation.low_quality_passes_before_stop === 1 ? '' : 'es'
    }.`,
    apply: 'Stop after one musical phrase or section pass.',
    retain: 'Stop after one delayed retrieval probe.',
    transfer: 'Stop after one different-context phrase.',
    celebrate: 'Stop after the planned musical payoff.',
  };

  return {
    role,
    candidate_id: ranked.candidate.item_id,
    ...(ranked.candidate.manifest.section
      ? {
          bar_range: {
            start: ranked.candidate.manifest.section.start_bar,
            end: ranked.candidate.manifest.section.end_bar,
          },
        }
      : {}),
    speed: ranked.decision.scaffold.speed,
    scaffold: ranked.decision.scaffold.steps,
    adaptation,
    stop_rule: stop_rules[role],
    why,
  };
}

function primaryFor({
  request,
  ranking,
  due_reviews,
}: ComposeSessionInput): ZpdRankedCandidate | undefined {
  const explicit = byItem(ranking, request.explicit_song_id);

  if (explicit) {
    return explicit;
  }

  const goal_song = byItem(ranking, request.active_goal?.song_id);

  if (request.intent === 'song' || request.intent === 'free_play') {
    return (
      goal_song ?? applicationFor(ranking, undefined) ?? firstAvailable(ranking)
    );
  }

  if (request.intent === 'exercise') {
    return (
      ranking.find(
        ({ candidate, decision }) =>
          candidate.available &&
          candidate.kind === 'lesson' &&
          decision.state !== 'goal_preview_only',
      ) ?? firstAvailable(ranking)
    );
  }

  if (request.intent === 'review') {
    return reviewFor(ranking, due_reviews ?? []) ?? firstAvailable(ranking);
  }

  return (
    (request.active_goal
      ? ranking.find(
          ({ candidate, decision }) =>
            candidate.available &&
            candidate.kind === 'lesson' &&
            decision.state !== 'goal_preview_only' &&
            candidate.manifest.demands.some(
              (demand) =>
                goal_song?.candidate.manifest.demands.some(
                  (goal_demand) => goal_demand.skill_id === demand.skill_id,
                ),
            ),
        )
      : undefined) ??
    reviewFor(ranking, due_reviews ?? []) ??
    firstAvailable(ranking)
  );
}

function composeShort(
  primary: ZpdRankedCandidate,
  application: ZpdRankedCandidate | undefined,
): readonly SessionBlock[] {
  const musical = application ?? primary;

  return [
    block('orient', primary, orientWhy(primary)),
    block(
      primary.decision.state === 'too_easy' ? 'retain' : 'acquire',
      primary,
      acquireWhy(primary),
    ),
    block('celebrate', musical, celebrateWhy(musical)),
  ];
}

function composeStandard(
  primary: ZpdRankedCandidate,
  application: ZpdRankedCandidate | undefined,
): readonly SessionBlock[] {
  const musical = application ?? primary;

  return [
    block('orient', primary, orientWhy(primary)),
    block('acquire', primary, acquireWhy(primary)),
    block(
      'apply',
      musical,
      'Interleave the new layer with a musical application.',
    ),
    block(
      primary.decision.transfer_fit >= 0.7 ? 'transfer' : 'retain',
      primary,
      primary.decision.transfer_fit >= 0.7
        ? 'Probe the pattern in an alternate context.'
        : 'Use a delayed or alternate-context probe before calling the layer retained.',
    ),
    block('celebrate', musical, celebrateWhy(musical)),
  ];
}

function composeDeep(
  primary: ZpdRankedCandidate,
  application: ZpdRankedCandidate | undefined,
  ranking: readonly ZpdRankedCandidate[],
): readonly SessionBlock[] {
  const linked = ranking.find(
    ({ candidate, decision }) =>
      candidate.item_id !== primary.candidate.item_id &&
      candidate.kind === 'lesson' &&
      decision.state !== 'goal_preview_only' &&
      candidate.manifest.demands.some((demand) =>
        primary.candidate.manifest.demands.some(
          (primary_demand) => primary_demand.skill_id === demand.skill_id,
        ),
      ),
  );
  const musical = application ?? primary;

  return [
    block('orient', primary, orientWhy(primary)),
    block('acquire', primary, acquireWhy(primary)),
    ...(linked
      ? [
          block(
            'acquire',
            linked,
            `Add ${
              topSkillLabel(linked)?.toLowerCase() ??
              'one linked acquisition item'
            }, not a random drill.`,
          ),
        ]
      : []),
    block('apply', musical, 'Interleave the linked work in music.'),
    block(
      'transfer',
      musical,
      'Check whether the layer survives a changed musical context.',
    ),
    block('celebrate', musical, celebrateWhy(musical)),
  ];
}

export function composePracticeSession(
  input: ComposeSessionInput,
): SessionPlan | undefined {
  const primary = primaryFor(input);

  if (!primary) {
    return undefined;
  }

  const explicit = byItem(input.ranking, input.request.explicit_song_id);
  const goal_song = byItem(input.ranking, input.request.active_goal?.song_id);
  const application =
    explicit ??
    (goal_song?.candidate.kind === 'song' ? goal_song : undefined) ??
    applicationFor(input.ranking, primary.candidate.item_id);
  const energy =
    input.request.recent_early_exits >= 2 && input.request.energy !== 'short'
      ? 'short'
      : input.request.energy;
  const blocks =
    energy === 'short'
      ? composeShort(primary, application)
      : energy === 'deep'
      ? composeDeep(primary, application, input.ranking)
      : composeStandard(primary, application);

  return {
    request: input.request,
    launch: blocks[0],
    blocks,
    reason: input.request.explicit_song_id
      ? 'The chosen song starts first. Its receipt controls the scaffold.'
      : 'The launch is precomputed from intent, dose, and the current evidence receipt.',
  };
}
