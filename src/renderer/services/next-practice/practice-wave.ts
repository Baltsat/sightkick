import { PracticeHistoryEntry, RankedPracticeCandidate } from './types';

export type PracticeWaveRole = 'focus' | 'apply' | 'consolidate';

export interface PracticeWaveStop {
  role: PracticeWaveRole;
  recommendation: RankedPracticeCandidate;
  /** Session-specific explanation. This is intentionally separate from ranking.reason. */
  reason: string;
  /** Normalized authored tags which connect this stop to the focus task. */
  linkedSkills: readonly string[];
}

export interface PracticeWaveInput {
  ranking: readonly RankedPracticeCandidate[];
  history: readonly PracticeHistoryEntry[];
}

export interface PracticeWaveResult {
  strategy:
    | 'skill-linked'
    | 'evidence-ranked'
    | 'deterministic-fallback'
    | 'none-available';
  stops: readonly PracticeWaveStop[];
  /** Present when trustworthy history can identify the task just completed. */
  latestCandidateId?: string;
  /** The authored tags used to connect later stops to the focus task. */
  focusSkills: readonly string[];
}

interface WaveCandidate {
  recommendation: RankedPracticeCandidate;
  rank: number;
  taskKey: string;
  skills: readonly string[];
  weakSkillSignal: number;
}

function finiteScore(value: number): number {
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function normalizeToken(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, '-');
}

function candidateSkills(
  recommendation: RankedPracticeCandidate,
): readonly string[] {
  return [
    ...new Set(
      (recommendation.candidate.skills ?? [])
        .map(normalizeToken)
        .filter(Boolean),
    ),
  ].sort();
}

/**
 * Candidate IDs can vary by difficulty. Prefer an authored curriculum ID or
 * title so one song/lesson is never scheduled twice as two apparent tasks.
 */
function taskKey(recommendation: RankedPracticeCandidate): string {
  const { candidate } = recommendation;

  if (candidate.kind === 'lesson' && candidate.curriculumId?.trim()) {
    return `lesson:${normalizeToken(candidate.curriculumId)}`;
  }

  const title = normalizeToken(candidate.title);

  return title
    ? `${candidate.kind}:${title}`
    : `${candidate.kind}:id:${candidate.id}`;
}

function weakSkillSignal(recommendation: RankedPracticeCandidate): number {
  const factor = recommendation.factors.find(
    ({ key }) => key === 'weak-skill-match',
  );

  if (!factor) {
    return 0;
  }

  return Math.max(
    0,
    finiteScore(factor.contribution),
    finiteScore(factor.value),
  );
}

function byRankedEvidence(left: WaveCandidate, right: WaveCandidate): number {
  return (
    finiteScore(right.recommendation.score) -
      finiteScore(left.recommendation.score) ||
    left.rank - right.rank ||
    left.recommendation.candidate.id.localeCompare(
      right.recommendation.candidate.id,
    )
  );
}

function latestCandidateId(
  history: readonly PracticeHistoryEntry[],
): string | undefined {
  let latest:
    | { candidateId: string; timestamp: number; index: number }
    | undefined;

  history.forEach((entry, index) => {
    const timestamp = Date.parse(entry.summary.completedAt);

    if (!Number.isFinite(timestamp)) {
      return;
    }

    if (
      !latest ||
      timestamp > latest.timestamp ||
      (timestamp === latest.timestamp && index > latest.index)
    ) {
      latest = { candidateId: entry.candidateId, timestamp, index };
    }
  });

  // History is normally chronological. If every timestamp is malformed, using
  // its final entry is safer than pretending there is no repetition evidence.
  return latest?.candidateId ?? history.at(-1)?.candidateId;
}

function sharesSkill(
  candidate: WaveCandidate,
  focusSkills: readonly string[],
): boolean {
  return focusSkills.some((skill) => candidate.skills.includes(skill));
}

function linkedSkills(
  candidate: WaveCandidate,
  focusSkills: readonly string[],
): readonly string[] {
  return focusSkills.filter((skill) => candidate.skills.includes(skill));
}

function chooseFocus(
  candidates: readonly WaveCandidate[],
  latestTaskKey: string | undefined,
): WaveCandidate | undefined {
  const fresh = latestTaskKey
    ? candidates.filter((candidate) => candidate.taskKey !== latestTaskKey)
    : [...candidates];
  // Reuse the latest task only when it is literally the only playable choice.
  const pool = fresh.length > 0 ? fresh : [...candidates];

  return pool.sort((left, right) => {
    const leftTier =
      left.recommendation.candidate.kind === 'lesson'
        ? left.weakSkillSignal > 0
          ? 3
          : 1
        : left.weakSkillSignal > 0
        ? 2
        : 0;
    const rightTier =
      right.recommendation.candidate.kind === 'lesson'
        ? right.weakSkillSignal > 0
          ? 3
          : 1
        : right.weakSkillSignal > 0
        ? 2
        : 0;

    return (
      rightTier - leftTier ||
      right.weakSkillSignal - left.weakSkillSignal ||
      byRankedEvidence(left, right)
    );
  })[0];
}

function chooseApply(
  candidates: readonly WaveCandidate[],
  focusSkills: readonly string[],
): WaveCandidate | undefined {
  return [...candidates].sort((left, right) => {
    const tier = (candidate: WaveCandidate): number => {
      const isSong = candidate.recommendation.candidate.kind === 'song';
      const isLiked = candidate.recommendation.candidate.liked === true;
      const isLinked = sharesSkill(candidate, focusSkills);

      if (isSong && isLiked && isLinked) {
        return 4;
      }

      if (isSong && isLinked) {
        return 3;
      }

      if (isSong && isLiked) {
        return 2;
      }

      if (isSong) {
        return 1;
      }

      return 0;
    };

    return tier(right) - tier(left) || byRankedEvidence(left, right);
  })[0];
}

function chooseConsolidation(
  candidates: readonly WaveCandidate[],
  focusSkills: readonly string[],
  applyKind: 'song' | 'lesson' | undefined,
): WaveCandidate | undefined {
  return [...candidates].sort((left, right) => {
    const tier = (candidate: WaveCandidate): number =>
      (sharesSkill(candidate, focusSkills) ? 2 : 0) +
      (candidate.recommendation.candidate.kind !== applyKind ? 1 : 0);

    return (
      tier(right) - tier(left) ||
      right.weakSkillSignal - left.weakSkillSignal ||
      byRankedEvidence(left, right)
    );
  })[0];
}

function focusReason(candidate: WaveCandidate): string {
  if (candidate.weakSkillSignal > 0) {
    return candidate.recommendation.candidate.kind === 'lesson'
      ? 'Start with the highest-ranked lesson tied to current weak-skill evidence.'
      : 'Start with the highest-ranked playable task tied to current weak-skill evidence; no matching lesson is available.';
  }

  return candidate.recommendation.candidate.kind === 'lesson'
    ? 'Start with the highest-ranked available lesson; no specific weak-skill link is proven yet.'
    : 'Start with the highest-ranked distinct task; no playable lesson or specific weak-skill link is available.';
}

function applyReason(
  candidate: WaveCandidate,
  linked: readonly string[],
): string {
  if (candidate.recommendation.candidate.kind !== 'song') {
    return 'Apply the focus in the highest-ranked unused task; no playable song is available.';
  }

  if (candidate.recommendation.candidate.liked && linked.length > 0) {
    return 'Apply the focused skill in a liked song, linking targeted work to music you chose.';
  }

  if (linked.length > 0) {
    return 'Apply the focused skill in a different song with matching authored skill tags.';
  }

  if (candidate.recommendation.candidate.liked) {
    return 'Apply the session in a liked song; this choice is preference-based because no direct skill-tag link is available.';
  }

  return 'Apply the session in the highest-ranked unused song; no stronger preference or skill link is available.';
}

function consolidationReason(linked: readonly string[]): string {
  return linked.length > 0
    ? 'Consolidate the focused skill in one more distinct task to check transfer without repeating the same item.'
    : 'Finish with the highest-ranked unused task to add variety; no stronger skill-tag link is available.';
}

/**
 * Build one deterministic, finite practice session:
 * focus a weakness, apply it in music (preferably liked), then consolidate in a
 * different task. The function only schedules playable ranked candidates and
 * never invents a link that authored skill tags do not support.
 */
export function buildPracticeWave({
  ranking,
  history,
}: PracticeWaveInput): PracticeWaveResult {
  const latestId = latestCandidateId(history);
  const ranked = ranking
    .map<WaveCandidate>((recommendation, rank) => ({
      recommendation,
      rank,
      taskKey: taskKey(recommendation),
      skills: candidateSkills(recommendation),
      weakSkillSignal: weakSkillSignal(recommendation),
    }))
    .filter(
      ({ recommendation }) =>
        recommendation.candidate.available &&
        recommendation.candidate.unlocked !== false,
    )
    .sort(byRankedEvidence);
  const candidates = [
    ...new Map(
      ranked.map((candidate) => [candidate.taskKey, candidate]),
    ).values(),
  ];

  if (candidates.length === 0) {
    return {
      strategy: 'none-available',
      stops: [],
      latestCandidateId: latestId,
      focusSkills: [],
    };
  }

  const latestRecommendation = latestId
    ? ranking.find(({ candidate }) => candidate.id === latestId)
    : undefined;
  const latestTaskKey = latestRecommendation
    ? taskKey(latestRecommendation)
    : latestId
    ? `unknown:${latestId}`
    : undefined;
  const focus = chooseFocus(candidates, latestTaskKey);

  if (!focus) {
    return {
      strategy: 'none-available',
      stops: [],
      latestCandidateId: latestId,
      focusSkills: [],
    };
  }

  const focusSkills = focus.skills;
  const remainingAfterFocus = candidates.filter(
    ({ taskKey: key }) => key !== focus.taskKey,
  );
  const apply = chooseApply(remainingAfterFocus, focusSkills);
  const remainingAfterApply = remainingAfterFocus.filter(
    ({ taskKey: key }) => key !== apply?.taskKey,
  );
  const consolidation = chooseConsolidation(
    remainingAfterApply,
    focusSkills,
    apply?.recommendation.candidate.kind,
  );
  const focusStop: PracticeWaveStop = {
    role: 'focus',
    recommendation: focus.recommendation,
    reason: focusReason(focus),
    linkedSkills: focusSkills,
  };
  const stops: PracticeWaveStop[] = [focusStop];

  if (apply) {
    const linked = linkedSkills(apply, focusSkills);

    stops.push({
      role: 'apply',
      recommendation: apply.recommendation,
      reason: applyReason(apply, linked),
      linkedSkills: linked,
    });
  }

  if (consolidation) {
    const linked = linkedSkills(consolidation, focusSkills);

    stops.push({
      role: 'consolidate',
      recommendation: consolidation.recommendation,
      reason: consolidationReason(linked),
      linkedSkills: linked,
    });
  }

  const applyIsLinked = apply ? sharesSkill(apply, focusSkills) : false;
  const strategy =
    focus.weakSkillSignal > 0 && applyIsLinked
      ? 'skill-linked'
      : focus.weakSkillSignal > 0
      ? 'evidence-ranked'
      : 'deterministic-fallback';

  return {
    strategy,
    stops,
    latestCandidateId: latestId,
    focusSkills,
  };
}
