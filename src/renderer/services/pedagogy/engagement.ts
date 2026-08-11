import type { RunSummary } from '../practice-stats';
import type { PracticeDays } from '../streaks';
import { skillNodeById } from './skill-graph';
import {
  AtomicSkillState,
  PracticeCard,
  PracticeCardKind,
  PracticeCardOption,
  PracticeCardSet,
  PracticeRhythm,
  SessionPlan,
  SkillReview,
  UnlockPath,
  WeeklyPracticeSet,
  ZpdRankedCandidate,
} from './types';
import type { RankedPracticeCandidate } from '../next-practice';

export interface ComposePracticeCardsInput {
  plan?: SessionPlan;
  ranking: readonly ZpdRankedCandidate[];
  due_reviews: readonly SkillReview[];
  goal_path?: UnlockPath;
}

export interface WeeklyMusicalRecap {
  week_start: string;
  week_end: string;
  sessions: number;
  played_days: number;
  evidence_state: 'measured' | 'not_enough_saved_evidence';
  skill: {
    state: 'reliable' | 'uncertain' | 'not_enough_saved_evidence';
    label: string;
    detail: string;
  };
  section?: {
    state: 'reached' | 'attempted';
    label: string;
    detail: string;
  };
  next: string;
}

export interface SavedSongSectionAudition {
  song_id: string;
  start_bar: number;
  end_bar: number;
  speed: number;
  section_label: string;
  test_label: string;
  required_skill_id: string;
  completed_at: string;
  overall_accuracy: number;
}

export interface WeeklyRhythmDay {
  key: string;
  label: string;
  state: 'played' | 'planned' | 'rest';
}

export interface WeeklyRhythm {
  days: readonly WeeklyRhythmDay[];
  next_available: string;
}

const CARD_LABELS: Record<PracticeCardKind, string> = {
  review: 'Review',
  build: 'Build',
  apply: 'Apply',
};

function available(
  ranking: readonly ZpdRankedCandidate[],
  candidate_id: string,
): ZpdRankedCandidate | undefined {
  return ranking.find(
    ({ candidate, decision }) =>
      candidate.item_id === candidate_id &&
      candidate.available &&
      decision.state !== 'goal_preview_only',
  );
}

function optionFor({
  kind,
  ranked,
  source_label,
  completion_label,
  bar_range,
  audition,
}: {
  kind: PracticeCardKind;
  ranked: ZpdRankedCandidate;
  source_label: string;
  completion_label: string;
  bar_range?: { start: number; end: number };
  audition?: NonNullable<UnlockPath['next_song_probe']>;
}): PracticeCardOption {
  const range =
    bar_range ??
    (ranked.candidate.manifest.section
      ? {
          start: ranked.candidate.manifest.section.start_bar,
          end: ranked.candidate.manifest.section.end_bar,
        }
      : undefined);

  return {
    id: [
      kind,
      ranked.candidate.item_id,
      range?.start ?? '',
      range?.end ?? '',
    ].join(':'),
    kind,
    candidate_id: ranked.candidate.item_id,
    title: ranked.candidate.title,
    speed: audition?.speed ?? ranked.decision.scaffold.speed,
    source_label,
    completion_label,
    ...(range ? { bar_range: range } : {}),
    ...(audition ? { audition } : {}),
  };
}

function distinct(
  options: readonly PracticeCardOption[],
): PracticeCardOption[] {
  const seen = new Set<string>();

  return options.filter((option) => {
    if (seen.has(option.id)) {
      return false;
    }

    seen.add(option.id);

    return true;
  });
}

function byLearningValue(
  candidates: readonly ZpdRankedCandidate[],
): ZpdRankedCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      right.decision.learning_value - left.decision.learning_value ||
      left.candidate.item_id.localeCompare(right.candidate.item_id),
  );
}

function reviewOptions({
  ranking,
  due_reviews,
}: Pick<
  ComposePracticeCardsInput,
  'ranking' | 'due_reviews'
>): PracticeCardOption[] {
  const nodes = skillNodeById();

  return distinct(
    [...due_reviews]
      .sort(
        (left, right) =>
          Number(right.overdue) - Number(left.overdue) ||
          left.due_at.localeCompare(right.due_at) ||
          left.skill_id.localeCompare(right.skill_id),
      )
      .flatMap((review) =>
        byLearningValue(
          ranking.filter(
            ({ candidate, decision }) =>
              candidate.available &&
              decision.state !== 'goal_preview_only' &&
              candidate.manifest.demands.some(
                (demand) => demand.skill_id === review.skill_id,
              ),
          ),
        ).map((ranked) =>
          optionFor({
            kind: 'review',
            ranked,
            source_label: `Saved review queue · ${
              nodes.get(review.skill_id)?.label ?? review.skill_id
            }`,
            completion_label: 'One saved review run',
          }),
        ),
      ),
  );
}

function buildOptions({
  plan,
  ranking,
}: Pick<ComposePracticeCardsInput, 'plan' | 'ranking'>): PracticeCardOption[] {
  const planned = (plan?.blocks ?? [])
    .filter(({ role }) => ['acquire', 'retain', 'transfer'].includes(role))
    .flatMap((block) => {
      const ranked = available(ranking, block.candidate_id);

      return ranked
        ? [
            optionFor({
              kind: 'build',
              ranked,
              source_label: `Current ${block.role} block · ${block.why}`,
              completion_label: 'One saved loop or lesson block',
              ...(block.bar_range ? { bar_range: block.bar_range } : {}),
            }),
          ]
        : [];
    });

  if (planned.length > 0) {
    return distinct(planned);
  }

  return byLearningValue(
    ranking.filter(
      ({ candidate, decision }) =>
        candidate.available &&
        candidate.kind === 'lesson' &&
        decision.state !== 'goal_preview_only',
    ),
  ).map((ranked) =>
    optionFor({
      kind: 'build',
      ranked,
      source_label: 'Current evidence-backed learning route',
      completion_label: 'One saved loop or lesson block',
    }),
  );
}

function applyOptions({
  plan,
  ranking,
  goal_path,
}: Pick<
  ComposePracticeCardsInput,
  'plan' | 'ranking' | 'goal_path'
>): PracticeCardOption[] {
  const probe = goal_path?.next_song_probe;
  const audition = probe ? available(ranking, probe.song_id) : undefined;
  const offered =
    probe && audition
      ? [
          optionFor({
            kind: 'apply',
            ranked: audition,
            source_label: `Eligible goal path · ${probe.test_label}`,
            completion_label: 'One saved section audition',
            bar_range: { start: probe.start_bar, end: probe.end_bar },
            audition: probe,
          }),
        ]
      : [];
  const planned = (plan?.blocks ?? [])
    .filter(({ role }) => ['apply', 'transfer', 'celebrate'].includes(role))
    .flatMap((block) => {
      const ranked = available(ranking, block.candidate_id);

      return ranked && ranked.candidate.kind === 'song'
        ? [
            optionFor({
              kind: 'apply',
              ranked,
              source_label: `Current musical ${block.role} · ${block.why}`,
              completion_label: 'One saved musical application run',
              ...(block.bar_range ? { bar_range: block.bar_range } : {}),
            }),
          ]
        : [];
    });

  return distinct([
    ...offered,
    ...planned,
    ...byLearningValue(
      ranking.filter(
        ({ candidate, decision }) =>
          candidate.available &&
          candidate.kind === 'song' &&
          decision.state !== 'goal_preview_only',
      ),
    ).map((ranked) =>
      optionFor({
        kind: 'apply',
        ranked,
        source_label: 'Current musical application route',
        completion_label: 'One saved musical application run',
      }),
    ),
  ]);
}

export function composePracticeCards(
  input: ComposePracticeCardsInput,
): PracticeCardSet {
  const card_options: Array<[PracticeCardKind, PracticeCardOption[]]> = [
    ['review', reviewOptions(input)],
    ['build', buildOptions(input)],
    ['apply', applyOptions(input)],
  ];
  const cards: PracticeCard[] = card_options.flatMap(([kind, options]) =>
    options.length > 0
      ? [
          {
            kind,
            label: CARD_LABELS[kind],
            options,
          },
        ]
      : [],
  );

  return {
    cards,
    evidence_signature: cards
      .flatMap((card) =>
        card.options.map(
          (option) => `${card.kind}:${option.id}:${option.source_label}`,
        ),
      )
      .join('|'),
  };
}

export function selectWeeklyPracticeSet({
  cards,
  rhythm,
  rotation = {},
}: {
  cards: PracticeCardSet;
  rhythm: PracticeRhythm;
  rotation?: Partial<Record<PracticeCardKind, number>>;
}): WeeklyPracticeSet {
  const selected = cards.cards.map((card) => {
    const rotation_index = Math.max(0, rotation[card.kind] ?? 0);
    const option = card.options[rotation_index % card.options.length];

    return { kind: card.kind, option };
  });

  return {
    rhythm,
    cards: selected,
    evidence_signature: [
      cards.evidence_signature,
      rhythm,
      ...selected.map(({ kind, option }) => `${kind}:${option.id}`),
    ].join('|'),
  };
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function weekBounds(now: Date): { start: Date; end: Date } {
  const end = new Date(now);

  end.setHours(23, 59, 59, 999);

  const start = new Date(now);

  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  return { start, end };
}

export function bestSongSectionAudition(
  runs: readonly RunSummary[],
  song_id: string | undefined,
): SavedSongSectionAudition | undefined {
  if (!song_id) {
    return undefined;
  }

  return runs
    .flatMap((run) =>
      run.audition?.song_id === song_id
        ? [
            {
              ...run.audition,
              completed_at: run.completedAt,
              overall_accuracy: run.overallAccuracy,
            },
          ]
        : [],
    )
    .sort(
      (left, right) =>
        right.overall_accuracy - left.overall_accuracy ||
        right.speed - left.speed ||
        right.completed_at.localeCompare(left.completed_at),
    )[0];
}

function recentState(
  states: readonly AtomicSkillState[],
  start: Date,
): AtomicSkillState | undefined {
  return [...states]
    .filter(
      (state) =>
        (state.stage === 'retained' || state.stage === 'transferable') &&
        [state.last_transfer_at, state.last_retention_at].some(
          (value) => value && Date.parse(value) >= start.getTime(),
        ),
    )
    .sort(
      (left, right) =>
        Math.max(
          Date.parse(left.last_transfer_at ?? ''),
          Date.parse(left.last_retention_at ?? ''),
        ) -
          Math.max(
            Date.parse(right.last_transfer_at ?? ''),
            Date.parse(right.last_retention_at ?? ''),
          ) || left.skill_id.localeCompare(right.skill_id),
    )
    .at(-1);
}

function uncertainState(
  states: readonly AtomicSkillState[],
): AtomicSkillState | undefined {
  return [...states]
    .filter(
      (state) =>
        state.effective_trials > 0 &&
        ['assessed', 'provisional'].includes(state.stage),
    )
    .sort(
      (left, right) =>
        right.effective_trials - left.effective_trials ||
        left.skill_id.localeCompare(right.skill_id),
    )[0];
}

export function buildWeeklyMusicalRecap({
  runs,
  states,
  recommendation,
  now = new Date(),
}: {
  runs: readonly RunSummary[];
  states: readonly AtomicSkillState[];
  recommendation?: RankedPracticeCandidate;
  now?: Date;
}): WeeklyMusicalRecap {
  const { start, end } = weekBounds(now);
  const this_week = runs.filter((run) => {
    const completed = Date.parse(run.completedAt);

    return completed >= start.getTime() && completed <= end.getTime();
  });
  const played_days = new Set(
    this_week.map((run) => dateKey(new Date(run.completedAt))),
  ).size;
  const reliable = recentState(states, start);
  const uncertain = reliable ? undefined : uncertainState(states);
  const nodes = skillNodeById();
  const audition = this_week
    .flatMap((run) =>
      run.audition
        ? [
            {
              ...run.audition,
              completed_at: run.completedAt,
              overall_accuracy: run.overallAccuracy,
            },
          ]
        : [],
    )
    .sort(
      (left, right) =>
        right.overall_accuracy - left.overall_accuracy ||
        right.completed_at.localeCompare(left.completed_at),
    )[0];
  const skill = reliable
    ? {
        state: 'reliable' as const,
        label: nodes.get(reliable.skill_id)?.label ?? reliable.skill_id,
        detail: 'A saved retained or transfer run strengthened this skill.',
      }
    : uncertain
    ? {
        state: 'uncertain' as const,
        label: nodes.get(uncertain.skill_id)?.label ?? uncertain.skill_id,
        detail: 'Saved evidence is still building; it is not retained yet.',
      }
    : {
        state: 'not_enough_saved_evidence' as const,
        label: 'Not enough saved evidence',
        detail: 'Finish a scored route before Drumroll makes a skill claim.',
      };

  return {
    week_start: dateKey(start),
    week_end: dateKey(end),
    sessions: this_week.length,
    played_days,
    evidence_state:
      this_week.length > 0 || reliable || uncertain
        ? 'measured'
        : 'not_enough_saved_evidence',
    skill,
    ...(audition
      ? {
          section: {
            state: audition.overall_accuracy >= 0.8 ? 'reached' : 'attempted',
            label: audition.section_label,
            detail: `${Math.round(
              audition.overall_accuracy * 100,
            )}% at ${audition.speed.toFixed(
              1,
            )}×. This is a section result, not full-song readiness.`,
          },
        }
      : {}),
    next: recommendation
      ? `${
          recommendation.candidate.title
        } at ${recommendation.suggestedSpeed.toFixed(
          1,
        )}× from the current evidence route.`
      : 'No next route yet; one saved scored run will make the next recommendation concrete.',
  };
}

function plannedFor(rhythm: PracticeRhythm, date: Date): boolean {
  if (rhythm === 'daily') {
    return true;
  }

  return [2, 4, 6].includes(date.getDay());
}

export function buildWeeklyRhythm({
  days,
  rhythm,
  now = new Date(),
}: {
  days: PracticeDays;
  rhythm: PracticeRhythm;
  now?: Date;
}): WeeklyRhythm {
  const { start } = weekBounds(now);
  const calendar = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);

    date.setDate(start.getDate() + index);

    const key = dateKey(date);
    const played = (days[key]?.runs ?? 0) > 0;

    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      state: played
        ? ('played' as const)
        : plannedFor(rhythm, date)
        ? ('planned' as const)
        : ('rest' as const),
    };
  });
  const next = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(now);

    date.setDate(now.getDate() + index);

    return date;
  }).find((date) => plannedFor(rhythm, date));

  return {
    days: calendar,
    next_available:
      next?.toLocaleDateString('en-US', { weekday: 'long' }) ?? 'next set',
  };
}
