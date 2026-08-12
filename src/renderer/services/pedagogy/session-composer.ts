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
  const stop_rules: Record<SessionBlock['role'], string> = {
    orient: 'Stop after one counted phrase.',
    acquire: 'Stop after two quality passes or two low-quality passes.',
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
    block('orient', primary, 'Get one counted phrase before any adjustment.'),
    block(
      primary.decision.state === 'too_easy' ? 'retain' : 'acquire',
      primary,
      'Keep this part short and focused.',
    ),
    block(
      'celebrate',
      musical,
      musical.candidate.kind === 'song'
        ? 'Finish with the selected song section, even in a short session.'
        : 'No playable song is available, so finish with the closest musical phrase.',
    ),
  ];
}

function composeStandard(
  primary: ZpdRankedCandidate,
  application: ZpdRankedCandidate | undefined,
): readonly SessionBlock[] {
  const musical = application ?? primary;

  return [
    block(
      'orient',
      primary,
      'Establish the phrase and pace before the work block.',
    ),
    block('acquire', primary, 'Build the next layer at the selected scaffold.'),
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
    block('celebrate', musical, 'End on the nearest favourite-song payoff.'),
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
    block('orient', primary, 'Set the pulse and selected scaffold.'),
    block('acquire', primary, 'Build the first linked prerequisite layer.'),
    ...(linked
      ? [
          block(
            'acquire',
            linked,
            'Add one linked acquisition item, not a random drill.',
          ),
        ]
      : []),
    block('apply', musical, 'Interleave the linked work in music.'),
    block(
      'transfer',
      musical,
      'Check whether the layer survives a changed musical context.',
    ),
    block(
      'celebrate',
      musical,
      'Close on the selected song section or nearest musical payoff.',
    ),
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
      ? 'The explicitly chosen song wins the launch; its receipt controls the scaffold.'
      : 'The launch is precomputed from intent, dose, and the current evidence receipt.',
  };
}
