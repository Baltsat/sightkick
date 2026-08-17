import { Difficulty } from 'scan-chart';
import {
  CLEAN_RUN_ACCURACY_THRESHOLD,
  computeConsistencyValue,
  computeLaneWeights,
  computeMastery,
  scopeRunsToDifficulty,
} from '../mastery';
import { CoachFinding, CoachSeverity, CoachSkillTag } from '../coach';
import {
  KitElement,
  LaneAccuracy,
  PersistedCoachFindingEvidence,
  RunSummary,
} from '../practice-stats';
import {
  curriculumItemManifest,
  dueReviews,
  rankZpdFrontier,
  score_my_wave_affection,
} from '../pedagogy';
import type { ItemSkillManifest, PracticeDecision } from '../pedagogy/types';
import {
  CandidateLaneDemand,
  DeadlinePacingSummary,
  NextPracticeInput,
  NextPracticeResult,
  PracticeCandidate,
  PracticeHistoryEntry,
  RankedPracticeCandidate,
  RecommendationConfidence,
  RecommendationFactor,
  RecommendationFactorKey,
} from './types';
import {
  deadlinePacingForSkills,
  deriveDeadlinePacing,
} from './deadline-pacing';

const DAY_MS = 24 * 60 * 60 * 1000;
const LANE_HALF_LIFE_DAYS = 14;
const DIFFICULTY_VALUE: Record<Difficulty, number> = {
  easy: 0,
  medium: 1 / 3,
  hard: 2 / 3,
  expert: 1,
};
const SEVERITY_VALUE: Record<CoachSeverity, number> = {
  low: 0.35,
  medium: 0.68,
  high: 1,
};
const SKILL_ALIASES: Record<CoachSkillTag, readonly string[]> = {
  fills: ['fills', 'toms', 'rudiment-application'],
  'sixteenth-hihat': [
    'sixteenth-hihat',
    'sixteenth-notes',
    'hihat-timekeeping',
  ],
  dynamics: ['dynamics', 'accents', 'ghost-notes'],
  triplets: ['triplets', 'triplet-feel', 'triples'],
  shuffle: ['shuffle', 'shuffle-feel', 'compound-meter'],
  'kick-independence': ['kick-independence', 'hand-to-foot', 'linear-drumming'],
  timing: ['timing', 'reading', 'tempo-building', 'hihat-timekeeping'],
  'pad-accuracy': ['pad-accuracy', 'toms', 'reading'],
};

interface RawFactor {
  key: RecommendationFactorKey;
  label: string;
  value: number;
  weight: number;
  detail: string;
}

interface LaneEvidence {
  accuracy: number;
  weakness: number;
  weightedSamples: number;
}

interface SkillEvidence {
  finding: CoachSkillEvidence;
  strength: number;
}

interface CoachSkillEvidence {
  id: string;
  severity: CoachSeverity;
  skillTag: CoachSkillTag;
  evidence: Pick<CoachFinding['evidence'], 'sampleCount'>;
  remediationLessonId?: string;
}

interface DirectRemediationEvidence {
  findingIds: readonly string[];
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;

  return Math.round(value * scale) / scale;
}

function roundSpeed(value: number): number {
  return Math.round(value * 10) / 10;
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizedTargetSpeed(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0.5, value)
    : 1;
}

function stableSequence(candidate: PracticeCandidate): number {
  return candidate.sequence !== undefined && Number.isFinite(candidate.sequence)
    ? candidate.sequence
    : Number.MAX_SAFE_INTEGER;
}

function prerequisitesSatisfied(
  candidate: PracticeCandidate,
  candidates: readonly PracticeCandidate[],
): boolean {
  if (!candidate.prerequisiteIds || candidate.prerequisiteIds.length === 0) {
    return true;
  }

  const masteryByCurriculumId = new Map(
    candidates
      .filter((item) => item.curriculumId !== undefined)
      .map((item) => [item.curriculumId!, item.mastered === true]),
  );

  // A missing prerequisite is a data-integrity problem, not permission to
  // skip ahead. Keep the route safe until a rescan supplies its metadata.
  return candidate.prerequisiteIds.every(
    (prerequisiteId) => masteryByCurriculumId.get(prerequisiteId) === true,
  );
}

function lessonPlanFor(candidate: PracticeCandidate) {
  if (candidate.kind !== 'lesson' || !candidate.cue) {
    return undefined;
  }

  return {
    cue: candidate.cue,
    bpmStart: candidate.bpmStart,
    bpmTarget: candidate.bpmTarget,
    doseRule: candidate.doseRule,
    masteryRule: candidate.masteryRule,
    prerequisiteIds: candidate.prerequisiteIds ?? [],
    assessmentBoundary:
      candidate.assessmentBoundary ??
      'MIDI assesses timing and pad choice. It does not assess sticking or form.',
  };
}

function sanitizeRunSummary(summary: RunSummary): RunSummary {
  const playbackSpeed =
    summary.playbackSpeed !== undefined &&
    Number.isFinite(summary.playbackSpeed) &&
    summary.playbackSpeed > 0
      ? summary.playbackSpeed
      : undefined;

  return {
    ...summary,
    totalHits: nonNegativeFinite(summary.totalHits),
    totalMisses: nonNegativeFinite(summary.totalMisses),
    totalWrong: nonNegativeFinite(summary.totalWrong),
    overallAccuracy: clamp01(summary.overallAccuracy),
    playbackSpeed,
    laneAccuracy: summary.laneAccuracy.map((lane) => {
      const hits = nonNegativeFinite(lane.hits);
      const misses = nonNegativeFinite(lane.misses);
      const samples = hits + misses;

      return {
        ...lane,
        hits,
        misses,
        accuracy: samples === 0 ? 0 : hits / samples,
      };
    }),
  };
}

function timestamp(summary: RunSummary): number {
  const value = Date.parse(summary.completedAt);

  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function byHistoryTime(
  left: PracticeHistoryEntry,
  right: PracticeHistoryEntry,
): number {
  return (
    timestamp(left.summary) - timestamp(right.summary) ||
    left.candidateId.localeCompare(right.candidateId) ||
    historyEvidenceKey(left).localeCompare(historyEvidenceKey(right))
  );
}

function historyEvidenceKey(entry: PracticeHistoryEntry): string {
  const { summary } = entry;
  const laneEvidence = [...summary.laneAccuracy]
    .sort((left, right) => left.element.localeCompare(right.element))
    .map(({ element, hits, misses }) => `${element}:${hits}:${misses}`)
    .join(',');
  const recoveryEvidence = (summary.tutor?.recoveryAttempts ?? [])
    .map(({ result }) => result)
    .sort()
    .join(',');

  return [
    summary.context?.sessionId ?? '',
    summary.difficulty ?? '',
    summary.mode ?? '',
    summary.playbackSpeed ?? '',
    summary.overallAccuracy,
    summary.totalHits,
    summary.totalMisses,
    summary.totalWrong,
    laneEvidence,
    recoveryEvidence,
  ].join('|');
}

function normalizedNowMs(
  configuredNowMs: number,
  history: readonly PracticeHistoryEntry[],
): number {
  if (Number.isFinite(configuredNowMs)) {
    return configuredNowMs;
  }

  const latestEvidenceMs = Math.max(
    0,
    ...history.map(({ summary }) => timestamp(summary)).filter(Number.isFinite),
  );

  return latestEvidenceMs;
}

function weightedRecentAccuracy(runs: readonly RunSummary[]): number {
  if (runs.length === 0) {
    return 0;
  }

  const recent = [...runs]
    .sort((left, right) => timestamp(left) - timestamp(right))
    .slice(-5);
  let weighted = 0;
  let weights = 0;

  recent.forEach((run, index) => {
    const weight = index + 1;

    weighted += clamp01(run.overallAccuracy) * weight;
    weights += weight;
  });

  return weights === 0 ? 0 : weighted / weights;
}

function speedForRun(run: RunSummary): number | undefined {
  if (run.playbackSpeed !== undefined) {
    return run.playbackSpeed;
  }

  return run.mode === 'practice' ? undefined : 1;
}

function bestCleanSpeed(runs: readonly RunSummary[]): number {
  const speeds = runs
    .filter((run) => run.overallAccuracy >= CLEAN_RUN_ACCURACY_THRESHOLD)
    .map(speedForRun)
    .filter((speed): speed is number => speed !== undefined);

  return speeds.length === 0 ? 0 : Math.max(...speeds);
}

function estimatePlayerCapability(history: readonly PracticeHistoryEntry[]) {
  const recent = [...history].sort(byHistoryTime).slice(-20);

  if (recent.length === 0) {
    return 0;
  }

  let weighted = 0;
  let weights = 0;

  recent.forEach(({ summary }, index) => {
    const difficulty = DIFFICULTY_VALUE[summary.difficulty ?? 'easy'] ?? 0;
    const speed = clamp01(speedForRun(summary) ?? 0.6);
    const execution = clamp01((summary.overallAccuracy - 0.35) / 0.55);
    const chartLevel = 0.25 + difficulty * 0.75;
    // Selecting a hard chart is not evidence of hard-level ability by itself:
    // the attempted level only counts when accuracy and speed demonstrate it.
    const demonstrated = chartLevel * execution * speed;
    const weight = index + 1;

    weighted += demonstrated * weight;
    weights += weight;
  });

  return weights === 0 ? 0 : weighted / weights;
}

function recentLaneEvidence(
  history: readonly PracticeHistoryEntry[],
  nowMs: number,
  weakLanes: readonly LaneAccuracy[] = [],
): Map<KitElement, LaneEvidence> {
  const totals = new Map<KitElement, { hits: number; misses: number }>();

  history.forEach(({ summary }) => {
    const completedAt = timestamp(summary);
    const ageDays = Number.isFinite(completedAt)
      ? Math.max(0, nowMs - completedAt) / DAY_MS
      : 365;
    const decay = 2 ** (-ageDays / LANE_HALF_LIFE_DAYS);

    summary.laneAccuracy.forEach((lane) => {
      const existing = totals.get(lane.element) ?? { hits: 0, misses: 0 };

      existing.hits += lane.hits * decay;
      existing.misses += lane.misses * decay;
      totals.set(lane.element, existing);
    });
  });

  const fromHistory = new Map(
    [...totals.entries()].map(([element, totalsForLane]) => {
      const samples = totalsForLane.hits + totalsForLane.misses;
      const accuracy = samples === 0 ? 0 : totalsForLane.hits / samples;

      return [
        element,
        {
          accuracy,
          weakness: 1 - accuracy,
          weightedSamples: samples,
        },
      ];
    }),
  );

  // Home has a live aggregate of scored lane evidence even when detailed
  // Coach records are not loaded. It is additive: temporal run evidence
  // wins whenever present; the aggregate fills only missing lanes.
  weakLanes.forEach((lane) => {
    if (fromHistory.has(lane.element)) {
      return;
    }

    const samples = Math.max(0, lane.hits + lane.misses);
    const accuracy = samples === 0 ? 0 : clamp01(lane.hits / samples);

    fromHistory.set(lane.element, {
      accuracy,
      weakness: 1 - accuracy,
      weightedSamples: samples,
    });
  });

  return fromHistory;
}

function isCoachSkillTag(value: string): value is CoachSkillTag {
  return Object.hasOwn(SKILL_ALIASES, value);
}

function persistedSkillEvidence(
  findings: readonly PersistedCoachFindingEvidence[],
): CoachSkillEvidence[] {
  return findings.flatMap((finding) =>
    isCoachSkillTag(finding.skillTag) && Number.isFinite(finding.sampleCount)
      ? [
          {
            id: finding.id,
            severity: finding.severity,
            skillTag: finding.skillTag,
            evidence: { sampleCount: finding.sampleCount },
            remediationLessonId: finding.remediationLessonId,
          },
        ]
      : [],
  );
}

function directRemediationEvidence(
  findings: readonly PersistedCoachFindingEvidence[],
): Map<string, DirectRemediationEvidence> {
  const findingIdsByLessonId = new Map<string, Set<string>>();

  findings.forEach((finding) => {
    const lessonId = finding.remediationLessonId?.trim();

    if (
      !lessonId ||
      finding.resolved === true ||
      !Number.isFinite(finding.sampleCount) ||
      finding.sampleCount <= 0
    ) {
      return;
    }

    const findingIds = findingIdsByLessonId.get(lessonId) ?? new Set<string>();

    findingIds.add(finding.id);
    findingIdsByLessonId.set(lessonId, findingIds);
  });

  return new Map(
    [...findingIdsByLessonId.entries()].map(([lessonId, findingIds]) => [
      lessonId,
      { findingIds: [...findingIds].sort() },
    ]),
  );
}

function currentDirectRemediation(
  candidate: PracticeCandidate,
  isMastered: boolean,
  evidence: Map<string, DirectRemediationEvidence>,
) {
  if (candidate.kind !== 'lesson' || !candidate.curriculumId || isMastered) {
    return undefined;
  }

  const route = evidence.get(candidate.curriculumId);

  return route ? { findingCount: route.findingIds.length } : undefined;
}

function skillEvidence(
  findings: readonly CoachSkillEvidence[],
): Map<CoachSkillTag, SkillEvidence> {
  const result = new Map<CoachSkillTag, SkillEvidence>();

  findings.forEach((finding) => {
    const sampleConfidence = clamp01(finding.evidence.sampleCount / 8);
    const strength =
      SEVERITY_VALUE[finding.severity] * (0.35 + sampleConfidence * 0.65);
    const existing = result.get(finding.skillTag);

    if (!existing || strength > existing.strength) {
      result.set(finding.skillTag, { finding, strength });
    }
  });

  return result;
}

function normalizedLaneDemand(
  candidate: PracticeCandidate,
  scopedRuns: readonly RunSummary[],
): CandidateLaneDemand[] {
  const demand = candidate.targetLanes?.length
    ? [...candidate.targetLanes]
    : computeLaneWeights([...scopedRuns]);
  const positive = demand.filter(
    ({ weight }) => Number.isFinite(weight) && weight > 0,
  );
  const total = positive.reduce((sum, lane) => sum + lane.weight, 0);

  return total === 0
    ? []
    : positive.map((lane) => ({ ...lane, weight: lane.weight / total }));
}

function matchingSkillEvidence(
  candidate: PracticeCandidate,
  evidence: Map<CoachSkillTag, SkillEvidence>,
): SkillEvidence | undefined {
  const candidateSkills = new Set(
    (candidate.skills ?? []).map((skill) => skill.trim().toLowerCase()),
  );
  const matches = [...evidence.entries()]
    .filter(([skill]) =>
      SKILL_ALIASES[skill].some((alias) => candidateSkills.has(alias)),
    )
    .map(([, value]) => value)
    .sort(
      (left, right) =>
        right.strength - left.strength ||
        left.finding.id.localeCompare(right.finding.id),
    );

  return matches[0];
}

function laneMatch(
  demand: readonly CandidateLaneDemand[],
  evidence: Map<KitElement, LaneEvidence>,
): { match: number; readiness: number; detail?: string } {
  if (demand.length === 0 || evidence.size === 0) {
    return { match: 0, readiness: 0.65 };
  }

  let match = 0;
  let readiness = 0;
  let strongest:
    | { element: KitElement; weightedWeakness: number; accuracy: number }
    | undefined;

  demand.forEach(({ element, weight }) => {
    const lane = evidence.get(element);
    const accuracy = lane?.accuracy ?? 0;
    const weightedWeakness = weight * (lane?.weakness ?? 1);

    match += weightedWeakness;
    readiness += weight * accuracy;

    if (!strongest || weightedWeakness > strongest.weightedWeakness) {
      strongest = { element, weightedWeakness, accuracy };
    }
  });

  return {
    match: clamp01(match),
    readiness: clamp01(readiness),
    detail: strongest
      ? `Builds ${strongest.element} control, currently ${Math.round(
          strongest.accuracy * 100,
        )}% in recent evidence.`
      : undefined,
  };
}

function zpdFit(predictedSuccess: number): number {
  if (predictedSuccess < 0.45) {
    return 0;
  }

  if (predictedSuccess < 0.7) {
    return (predictedSuccess - 0.45) / 0.25;
  }

  if (predictedSuccess <= 0.9) {
    return 1;
  }

  return Math.max(0.35, 1 - ((predictedSuccess - 0.9) / 0.1) * 0.65);
}

function max_replay_count(history: readonly PracticeHistoryEntry[]): number {
  const counts = new Map<string, number>();

  history.forEach(({ candidateId }) => {
    counts.set(candidateId, (counts.get(candidateId) ?? 0) + 1);
  });

  return Math.max(0, ...counts.values());
}

function music_preference_detail({
  favourite,
  replay_count,
  within_zone,
}: {
  favourite: boolean;
  replay_count: number;
  within_zone: number;
}): string {
  if (favourite && replay_count > 0) {
    return within_zone > 0
      ? `A saved favourite with ${replay_count} prior replay${
          replay_count === 1 ? '' : 's'
        } is still inside the current practice zone.`
      : 'A saved favourite is outside the current practice zone, so it gets no selection boost.';
  }

  if (favourite) {
    return within_zone > 0
      ? 'A saved favourite is still inside the current practice zone.'
      : 'A saved favourite is outside the current practice zone, so it gets no selection boost.';
  }

  if (replay_count > 0) {
    return within_zone > 0
      ? `${replay_count} prior replay${
          replay_count === 1 ? '' : 's'
        } show that you return to this song.`
      : 'Past replays do not override a song outside the current practice zone.';
  }

  return 'No favourite or replay signal is available.';
}

function familiarity(runCount: number): number {
  if (runCount === 0) {
    return 0.35;
  }

  if (runCount === 1) {
    return 0.65;
  }

  return runCount <= 5 ? 1 : 0.8;
}

function freshness(lastRunMs: number | undefined, nowMs: number): number {
  if (lastRunMs === undefined || !Number.isFinite(lastRunMs)) {
    return 0.7;
  }

  return clamp01(Math.max(0, nowMs - lastRunMs) / DAY_MS / 7);
}

function confidenceFor(
  candidateRuns: number,
  totalRuns: number,
  hasLaneEvidence: boolean,
  hasSkillEvidence: boolean,
): RecommendationConfidence {
  const value = clamp01(
    0.2 +
      Math.min(candidateRuns, 5) * 0.09 +
      Math.min(totalRuns, 20) * 0.01 +
      (hasLaneEvidence ? 0.08 : 0) +
      (hasSkillEvidence ? 0.07 : 0),
  );
  const level = value < 0.4 ? 'low' : value < 0.7 ? 'medium' : 'high';

  return {
    value: round(value, 3),
    level,
    evidenceRuns: candidateRuns,
    detail: `${candidateRuns} item-specific run${
      candidateRuns === 1 ? '' : 's'
    } plus ${totalRuns} library run${totalRuns === 1 ? '' : 's'}.`,
  };
}

function scoreFactors(
  positives: readonly RawFactor[],
  penalties: readonly RawFactor[],
): { score: number; factors: RecommendationFactor[] } {
  const activeWeight = positives.reduce(
    (sum, factor) => sum + factor.weight,
    0,
  );
  const scoredPositives = positives.map((factor) => ({
    ...factor,
    value: round(clamp01(factor.value), 4),
    contribution: round(
      activeWeight === 0
        ? 0
        : (clamp01(factor.value) * factor.weight * 100) / activeWeight,
    ),
  }));
  const scoredPenalties = penalties
    .filter((factor) => factor.value < 0)
    .map((factor) => ({
      ...factor,
      value: round(Math.max(-1, factor.value), 4),
      contribution: round(Math.max(-1, factor.value) * factor.weight),
    }));
  const factors = [...scoredPositives, ...scoredPenalties];
  const score = clamp01(
    factors.reduce((sum, factor) => sum + factor.contribution, 0) / 100,
  );

  return { score: round(score * 100), factors };
}

function reasonFromFactors(factors: readonly RecommendationFactor[]): string {
  const strongest = factors
    .filter((factor) => factor.contribution > 0)
    .sort(
      (left, right) =>
        right.contribution - left.contribution ||
        left.key.localeCompare(right.key),
    )
    .slice(0, 2)
    .map((factor) => factor.detail);

  return (
    strongest.join(' ') ||
    'This is the highest-scoring available option from the current evidence.'
  );
}

function suggestedSpeed(
  targetSpeed: number,
  candidateRuns: readonly RunSummary[],
  difficultyFit: number,
  recentAccuracy: number,
): number {
  const target = Math.max(0.5, targetSpeed);
  const proven = bestCleanSpeed(candidateRuns);

  if (proven >= target && recentAccuracy >= 0.85) {
    return roundSpeed(target);
  }

  if (proven > 0) {
    return roundSpeed(Math.min(target, Math.max(0.5, proven + 0.1)));
  }

  if (candidateRuns.length > 0) {
    return roundSpeed(Math.max(0.5, target - 0.2));
  }

  return roundSpeed(Math.max(0.5, target * (0.65 + difficultyFit * 0.2)));
}

function rankCandidate({
  candidate,
  history,
  sortedHistory,
  allRuns,
  nowMs,
  playerCapability,
  globalRecentAccuracy,
  lanes,
  skills,
  directRemediations,
  deadlinePacing,
}: {
  candidate: PracticeCandidate;
  history: readonly PracticeHistoryEntry[];
  sortedHistory: readonly PracticeHistoryEntry[];
  allRuns: RunSummary[];
  nowMs: number;
  playerCapability: number;
  globalRecentAccuracy: number;
  lanes: Map<KitElement, LaneEvidence>;
  skills: Map<CoachSkillTag, SkillEvidence>;
  directRemediations: Map<string, DirectRemediationEvidence>;
  deadlinePacing: DeadlinePacingSummary | undefined;
}): RankedPracticeCandidate {
  const candidateHistory = history.filter(
    (entry) => entry.candidateId === candidate.id,
  );
  const candidateRuns = candidateHistory.map((entry) => entry.summary);
  const scopedRuns = scopeRunsToDifficulty(
    candidateRuns,
    candidate.difficulty,
    candidate.availableDifficulties
      ? [...candidate.availableDifficulties]
      : undefined,
  );
  const targetSpeed = normalizedTargetSpeed(candidate.targetSpeed);
  const recentAccuracy = weightedRecentAccuracy(scopedRuns);
  const consistency = computeConsistencyValue(scopedRuns);
  const cleanSpeed = bestCleanSpeed(scopedRuns);
  const usesGeneralSpeedEvidence = candidateRuns.length === 0;
  const speedEvidence = usesGeneralSpeedEvidence
    ? bestCleanSpeed(allRuns)
    : cleanSpeed;
  const speedReadiness = clamp01(speedEvidence / targetSpeed);
  const challenge = clamp01(
    candidate.challengeLevel ?? DIFFICULTY_VALUE[candidate.difficulty] ?? 0,
  );
  const difficultyFit = clamp01(
    1 - Math.abs(challenge - (playerCapability + 0.08)) / 0.55,
  );
  const masteryBreakdown = computeMastery({
    goal: { songId: candidate.id, difficulty: candidate.difficulty },
    songRuns: candidateRuns,
    allRuns,
    songDifficulties: candidate.availableDifficulties
      ? [...candidate.availableDifficulties]
      : undefined,
    chartTotalNotes: candidate.chartTotalNotes,
    nowMs,
  });
  const isMastered = candidate.mastered ?? masteryBreakdown.mastery >= 90;
  const directRemediation = currentDirectRemediation(
    candidate,
    isMastered,
    directRemediations,
  );
  const pacing = deadlinePacingForSkills(
    candidate.skills ?? [],
    deadlinePacing,
  );
  const demand = normalizedLaneDemand(candidate, scopedRuns);
  const lane = laneMatch(demand, lanes);
  const matchedSkill = matchingSkillEvidence(candidate, skills);
  const skillWeakness = matchedSkill?.strength ?? 0;
  const skillReadiness = matchedSkill ? 1 - matchedSkill.strength : 0.7;
  const recentRuns = [...scopedRuns]
    .sort((left, right) => timestamp(left) - timestamp(right))
    .slice(-3);
  const failureRate =
    recentRuns.length === 0
      ? 0
      : recentRuns.filter(
          (run) =>
            run.overallAccuracy < 0.65 ||
            run.tutor?.recoveryAttempts.some(
              (attempt) => attempt.result === 'deferred',
            ),
        ).length / recentRuns.length;
  const predictedSuccess = clamp01(
    scopedRuns.length > 0
      ? (recentAccuracy * 0.5 +
          consistency * 0.2 +
          speedReadiness * 0.15 +
          lane.readiness * 0.1 +
          skillReadiness * 0.05) *
          (1 - failureRate * 0.15)
      : difficultyFit * 0.45 +
          globalRecentAccuracy * 0.25 +
          lane.readiness * 0.15 +
          skillReadiness * 0.15,
  );
  const lastRunMs = candidateHistory
    .map(({ summary }) => timestamp(summary))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  const ageDays =
    lastRunMs === undefined
      ? Number.POSITIVE_INFINITY
      : (nowMs - lastRunMs) / DAY_MS;
  const lastThreeIds = sortedHistory
    .slice(-3)
    .map(({ candidateId }) => candidateId);
  const sameRecentCount = lastThreeIds.filter(
    (id) => id === candidate.id,
  ).length;
  const fatigue = clamp01(
    (sameRecentCount / 3) * 0.7 +
      (lastThreeIds.at(-1) === candidate.id ? 0.3 : 0),
  );
  const affection = score_my_wave_affection({
    liked: candidate.liked,
    replay_count: candidateHistory.length,
    max_replay_count: max_replay_count(history),
  });
  const preference_fit = round(affection.value * zpdFit(predictedSuccess), 3);
  const positives: RawFactor[] = [
    {
      key: 'zone-fit',
      label: 'Productive challenge zone',
      value: zpdFit(predictedSuccess),
      weight: 30,
      detail: `Predicted success: ${Math.round(predictedSuccess * 100)}%. ${
        predictedSuccess < 0.7
          ? 'Use the suggested slower start.'
          : predictedSuccess <= 0.9
          ? 'This is inside the productive challenge zone.'
          : 'Use this for consolidation.'
      }`,
    },
    {
      key: 'speed-readiness',
      label: 'Target-speed readiness',
      value: speedReadiness,
      weight: 10,
      detail: `${
        usesGeneralSpeedEvidence ? 'General' : 'Item-specific'
      } clean-speed evidence supports ${Math.round(
        speedReadiness * 100,
      )}% of this item's ${roundSpeed(targetSpeed)}x target.`,
    },
    {
      key: 'freshness',
      label: 'Spaced freshness',
      value: freshness(lastRunMs, nowMs),
      weight: 8,
      detail:
        lastRunMs === undefined
          ? 'This item is new, adding useful variety.'
          : `${Math.max(0, Math.floor(ageDays))} day${
              Math.floor(ageDays) === 1 ? '' : 's'
            } since the last attempt.`,
    },
    {
      key: 'familiarity',
      label: 'Useful familiarity',
      value: familiarity(scopedRuns.length),
      weight: 7,
      detail:
        scopedRuns.length === 0
          ? 'No item-specific baseline exists yet.'
          : `${scopedRuns.length} prior run${
              scopedRuns.length === 1 ? '' : 's'
            } make the next result interpretable.`,
    },
    {
      key: 'difficulty-fit',
      label: 'Difficulty fit',
      value: difficultyFit,
      weight: 8,
      detail: `${candidate.difficulty} difficulty is ${Math.round(
        difficultyFit * 100,
      )}% aligned with demonstrated readiness.`,
    },
    {
      key: 'preference',
      label: 'Music preference',
      value: preference_fit,
      weight: 16,
      detail: music_preference_detail({
        favourite: affection.favourite,
        replay_count: affection.replay_count,
        within_zone: zpdFit(predictedSuccess),
      }),
    },
  ];

  if (matchedSkill) {
    positives.push({
      key: 'weak-skill-match',
      label: 'Weak-skill match',
      value: skillWeakness,
      weight: 16,
      detail: `Targets ${matchedSkill.finding.skillTag}, the strongest matching Coach weakness.`,
    });
  }

  if (demand.length > 0 && lanes.size > 0) {
    positives.push({
      key: 'weak-lane-match',
      label: 'Weak-lane match',
      value: lane.match,
      weight: 12,
      detail: lane.detail ?? 'Targets a recently weak kit lane.',
    });
  }

  if (candidate.kind === 'lesson') {
    positives.push({
      key: 'curriculum-progress',
      label: 'Curriculum progression',
      value: isMastered
        ? 0
        : scopedRuns.length === 0
        ? 1
        : 1 - masteryBreakdown.mastery / 100,
      weight: 5,
      detail: isMastered
        ? 'This lesson is already cleared.'
        : 'This available lesson advances the structured learning path.',
    });
  }

  if (pacing) {
    positives.push({
      key: 'deadline-pacing',
      label: 'Deadline pacing',
      value: pacing.value,
      weight: 14,
      detail: pacing.detail,
    });
  }

  const penalties: RawFactor[] = [
    {
      key: 'same-song-fatigue',
      label: 'Same-item fatigue',
      value: -fatigue,
      weight: 22,
      detail: `${sameRecentCount} of the last 3 sessions used this item.`,
    },
    {
      key: 'recent-mastery',
      label: 'Recent mastery',
      value: isMastered
        ? lastRunMs !== undefined && ageDays >= 14
          ? -0.25
          : -1
        : 0,
      weight: 25,
      detail:
        isMastered && ageDays >= 14
          ? 'Cleared, but old enough for spaced review.'
          : 'Recent mastery makes another immediate repetition low-value.',
    },
  ];
  const { score, factors } = scoreFactors(positives, penalties);

  return {
    candidate,
    score,
    predictedSuccess: round(predictedSuccess, 3),
    suggestedSpeed: suggestedSpeed(
      targetSpeed,
      scopedRuns,
      difficultyFit,
      recentAccuracy,
    ),
    mastery: candidate.mastered === true ? 100 : masteryBreakdown.mastery,
    ...(directRemediation ? { directRemediation } : {}),
    ...(pacing ? { deadlinePacing: pacing } : {}),
    lessonPlan: lessonPlanFor(candidate),
    reason: directRemediation
      ? `${directRemediation.findingCount} saved Coach finding${
          directRemediation.findingCount === 1 ? '' : 's'
        } match this lesson.`
      : pacing
      ? `${pacing.detail} ${reasonFromFactors(
          factors.filter((factor) => factor.key !== 'deadline-pacing'),
        )}`
      : reasonFromFactors(factors),
    factors,
    confidence: confidenceFor(
      scopedRuns.length,
      history.length,
      demand.length > 0 && lanes.size > 0,
      matchedSkill !== undefined,
    ),
  };
}

function fallbackRank(
  candidates: readonly PracticeCandidate[],
): RankedPracticeCandidate[] {
  const ordered = [...candidates].sort((left, right) => {
    const leftClass = left.mastered
      ? 3
      : left.kind === 'lesson'
      ? 0
      : left.liked
      ? 1
      : 2;
    const rightClass = right.mastered
      ? 3
      : right.kind === 'lesson'
      ? 0
      : right.liked
      ? 1
      : 2;

    return (
      leftClass - rightClass ||
      stableSequence(left) - stableSequence(right) ||
      left.id.localeCompare(right.id)
    );
  });

  return ordered.map((candidate, index) => {
    const isLesson = candidate.kind === 'lesson';
    const liked = candidate.liked === true;
    const detail = isLesson
      ? 'Start with the earliest available lesson to establish a trustworthy baseline.'
      : liked
      ? 'Start with a liked playable song to establish a trustworthy baseline.'
      : 'Start with a playable item to establish a trustworthy baseline.';

    return {
      candidate,
      score: Math.max(1, 100 - index),
      predictedSuccess: 0.65,
      suggestedSpeed: roundSpeed(
        normalizedTargetSpeed(candidate.targetSpeed) * 0.7,
      ),
      mastery: candidate.mastered ? 100 : 0,
      lessonPlan: lessonPlanFor(candidate),
      reason: detail,
      factors: [
        {
          key: isLesson
            ? 'curriculum-progress'
            : liked
            ? 'preference'
            : 'difficulty-fit',
          label: 'Deterministic starting point',
          value: 1,
          weight: 100,
          contribution: 100,
          detail,
        },
      ],
      confidence: {
        value: 0.15,
        level: 'low',
        evidenceRuns: 0,
        detail: '0 saved runs. This is the baseline choice.',
      },
    };
  });
}

function manifestForCandidate(
  candidate: PracticeCandidate,
  manifests: readonly ItemSkillManifest[],
): ItemSkillManifest | undefined {
  return (
    candidate.itemManifest ??
    manifests.find(
      (manifest) =>
        manifest.item_id === candidate.id ||
        manifest.item_id === candidate.curriculumId,
    ) ??
    (candidate.curriculumId
      ? curriculumItemManifest(candidate.curriculumId)
      : undefined)
  );
}

function atomicFactors(decision: PracticeDecision): RecommendationFactor[] {
  return [
    {
      key: 'atomic-zpd',
      label: 'Atomic ZPD fit',
      value: round(decision.predicted_success, 4),
      weight: 35,
      contribution: round(decision.learning_value * 35),
      detail: decision.explanation,
    },
    {
      key: 'atomic-prerequisite',
      label: 'Hard prerequisite confidence',
      value: round(decision.prereq_fit, 4),
      weight: 20,
      contribution: round(decision.prereq_fit * 20),
      detail: decision.independent_eligible
        ? 'Retained evidence covers every hard prerequisite.'
        : `Scaffolded because ${
            decision.hard_prerequisites.join(', ') || 'the active prerequisite'
          } is not yet retained.`,
    },
    {
      key: 'atomic-retention',
      label: 'Delayed retention value',
      value: round(
        decision.factors.find(({ key }) => key === 'due_retention')?.value ?? 0,
        4,
      ),
      weight: 15,
      contribution: round(
        (decision.factors.find(({ key }) => key === 'due_retention')
          ?.contribution ?? 0) * 100,
      ),
      detail: 'Only a due skill-specific delayed review receives this value.',
    },
    {
      key: 'atomic-transfer',
      label: 'Transfer value',
      value: round(decision.transfer_fit, 4),
      weight: 10,
      contribution: round(decision.transfer_fit * 10),
      detail:
        'Context-specific retention stays distinct from transfer evidence.',
    },
    {
      key: 'atomic-evidence',
      label: 'Evidence confidence',
      value: round(1 - decision.uncertainty, 4),
      weight: 10,
      contribution: round((1 - decision.uncertainty) * 10),
      detail: `This suggestion is based on ${Math.round(
        (1 - decision.uncertainty) * 100,
      )}% of the practice data available.`,
    },
  ];
}

function atomicRecommendation(
  baseline: RankedPracticeCandidate,
  decision: PracticeDecision,
): RankedPracticeCandidate {
  const confidence = 1 - decision.uncertainty;
  const preference = baseline.factors.find(({ key }) => key === 'preference');
  const preference_contribution = preference?.contribution ?? 0;
  const preference_reason =
    preference_contribution > 0 ? preference?.detail : undefined;
  const practice_zone_fit =
    baseline.factors.find(({ key }) => key === 'zone-fit')?.value ?? 0;

  return {
    ...baseline,
    score: round(
      decision.learning_value * 100 * practice_zone_fit +
        preference_contribution,
    ),
    predictedSuccess: round(decision.predicted_success, 3),
    suggestedSpeed: decision.scaffold.speed,
    adaptation: decision.adaptation,
    reason:
      baseline.directRemediation || baseline.deadlinePacing
        ? baseline.reason
        : preference_reason ?? decision.explanation,
    factors: [...baseline.factors, ...atomicFactors(decision)],
    confidence: {
      value: round(confidence, 3),
      level: confidence < 0.4 ? 'low' : confidence < 0.7 ? 'medium' : 'high',
      evidenceRuns: Math.round(
        decision.uncertainty === 1 ? 0 : (1 - decision.uncertainty) * 8,
      ),
      detail: `Atomic state, demand manifest ${decision.source_revision}, and scaffold receipt are available.`,
    },
    decisionReceipt: decision,
  };
}

function recommendAtomicPractice(
  input: NextPracticeInput,
  eligible: readonly PracticeCandidate[],
  limit: number,
): NextPracticeResult | undefined {
  const pedagogy = input.pedagogy;

  if (!pedagogy) {
    return undefined;
  }

  const manifests = pedagogy.itemManifests ?? [];
  const atomic_candidates = eligible.flatMap((candidate) => {
    const manifest = manifestForCandidate(candidate, manifests);

    return manifest
      ? [
          {
            item_id: candidate.id,
            kind: candidate.kind,
            title: candidate.title,
            available: candidate.available,
            liked: candidate.liked,
            sequence: candidate.sequence,
            manifest,
            recent_attempts: input.history.filter(
              (entry) => entry.candidateId === candidate.id,
            ).length,
          },
        ]
      : [];
  });

  if (atomic_candidates.length === 0) {
    return undefined;
  }

  const normalizedHistory = input.history.map(({ candidateId, summary }) => ({
    candidateId,
    summary: sanitizeRunSummary(summary),
  }));
  const sortedHistory = normalizedHistory.sort(byHistoryTime);
  const nowMs = normalizedNowMs(input.nowMs, sortedHistory);
  const allRuns = sortedHistory.map(({ summary }) => summary);
  const lanes = recentLaneEvidence(sortedHistory, nowMs, input.weakLanes);
  const directRemediations = directRemediationEvidence(
    input.coachEvidence ?? [],
  );
  const deadlinePacing = deriveDeadlinePacing({
    goalDate: input.goalDate,
    learningProfile: input.learningProfile,
    nowMs,
  });
  const skills = skillEvidence([
    ...(input.coachFindings ?? []),
    ...persistedSkillEvidence(input.coachEvidence ?? []),
  ]);
  const playerCapability = estimatePlayerCapability(sortedHistory);
  const globalRecentAccuracy = weightedRecentAccuracy(allRuns);
  const baseline = eligible.map((candidate) =>
    rankCandidate({
      candidate,
      history: sortedHistory,
      sortedHistory,
      allRuns,
      nowMs,
      playerCapability,
      globalRecentAccuracy,
      lanes,
      skills,
      directRemediations,
      deadlinePacing,
    }),
  );
  const goal_candidate = pedagogy.activeGoal
    ? eligible.find(
        (candidate) => candidate.id === pedagogy.activeGoal!.song_id,
      )
    : undefined;
  const active_goal_manifest = goal_candidate
    ? manifestForCandidate(goal_candidate, manifests)
    : undefined;
  const zpd = rankZpdFrontier({
    candidates: atomic_candidates,
    states: pedagogy.atomicStates,
    now: new Date(nowMs).toISOString(),
    ...(pedagogy.activeGoal ? { active_goal: pedagogy.activeGoal } : {}),
    ...(active_goal_manifest ? { active_goal_manifest } : {}),
    due_reviews:
      pedagogy.dueReviews ??
      dueReviews(pedagogy.atomicStates, new Date(nowMs).toISOString()),
  });
  const decision_by_candidate_id = new Map(
    zpd.map(({ candidate, decision }) => [candidate.item_id, decision]),
  );
  const ranked = baseline.map((candidate) => {
    const decision = decision_by_candidate_id.get(candidate.candidate.id);

    return decision ? atomicRecommendation(candidate, decision) : candidate;
  });
  const ranking = [
    ...ranked
      .filter(({ directRemediation }) => directRemediation !== undefined)
      .sort(directRemediationTieBreak),
    ...ranked
      .filter(
        ({ directRemediation, deadlinePacing: candidatePacing }) =>
          directRemediation === undefined && candidatePacing !== undefined,
      )
      .sort(deadlinePacingTieBreak),
    ...ranked
      .filter(
        ({ directRemediation, deadlinePacing: candidatePacing }) =>
          directRemediation === undefined && candidatePacing === undefined,
      )
      .sort(evidenceTieBreak),
  ].slice(0, limit);

  return {
    strategy: 'atomic-evidence-ranked',
    recommendation: ranking[0],
    ranking,
    pedagogyRanking: zpd,
    ...(deadlinePacing ? { deadlinePacing } : {}),
  };
}

function evidenceTieBreak(
  left: RankedPracticeCandidate,
  right: RankedPracticeCandidate,
): number {
  return (
    right.score - left.score ||
    stableSequence(left.candidate) - stableSequence(right.candidate) ||
    left.candidate.id.localeCompare(right.candidate.id)
  );
}

function directRemediationTieBreak(
  left: RankedPracticeCandidate,
  right: RankedPracticeCandidate,
): number {
  return (
    (right.directRemediation?.findingCount ?? 0) -
      (left.directRemediation?.findingCount ?? 0) ||
    evidenceTieBreak(left, right)
  );
}

function deadlinePacingTieBreak(
  left: RankedPracticeCandidate,
  right: RankedPracticeCandidate,
): number {
  return (
    (right.deadlinePacing?.value ?? 0) - (left.deadlinePacing?.value ?? 0) ||
    (right.deadlinePacing?.behindBy ?? 0) -
      (left.deadlinePacing?.behindBy ?? 0) ||
    evidenceTieBreak(left, right)
  );
}

/**
 * Pure, explainable next-practice ranking. Availability and lesson locks are
 * hard gates; all softer decisions remain visible as signed factors.
 */
export function recommendNextPractice(
  input: NextPracticeInput,
): NextPracticeResult {
  const eligible = input.candidates.filter(
    (candidate) =>
      candidate.available &&
      candidate.unlocked !== false &&
      prerequisitesSatisfied(candidate, input.candidates),
  );

  if (eligible.length === 0) {
    return { strategy: 'none-available', ranking: [] };
  }

  const configuredLimit = input.limit ?? eligible.length;
  const limit = Number.isFinite(configuredLimit)
    ? Math.max(1, Math.trunc(configuredLimit))
    : eligible.length;
  const atomic = recommendAtomicPractice(input, eligible, limit);

  if (atomic) {
    return atomic;
  }

  if (input.history.length === 0) {
    const ranking = fallbackRank(eligible).slice(0, limit);

    return {
      strategy: 'deterministic-fallback',
      recommendation: ranking[0],
      ranking,
    };
  }

  const normalizedHistory = input.history.map(({ candidateId, summary }) => ({
    candidateId,
    summary: sanitizeRunSummary(summary),
  }));
  const sortedHistory = normalizedHistory.sort(byHistoryTime);
  const nowMs = normalizedNowMs(input.nowMs, sortedHistory);
  const allRuns = sortedHistory.map(({ summary }) => summary);
  const lanes = recentLaneEvidence(sortedHistory, nowMs, input.weakLanes);
  const directRemediations = directRemediationEvidence(
    input.coachEvidence ?? [],
  );
  const deadlinePacing = deriveDeadlinePacing({
    goalDate: input.goalDate,
    learningProfile: input.learningProfile,
    nowMs,
  });
  const skills = skillEvidence([
    ...(input.coachFindings ?? []),
    ...persistedSkillEvidence(input.coachEvidence ?? []),
  ]);
  const playerCapability = estimatePlayerCapability(sortedHistory);
  const globalRecentAccuracy = weightedRecentAccuracy(allRuns);
  const ranked = eligible.map((candidate) =>
    rankCandidate({
      candidate,
      history: sortedHistory,
      sortedHistory,
      allRuns,
      nowMs,
      playerCapability,
      globalRecentAccuracy,
      lanes,
      skills,
      directRemediations,
      deadlinePacing,
    }),
  );
  const ranking = [
    ...ranked
      .filter(({ directRemediation }) => directRemediation !== undefined)
      .sort(directRemediationTieBreak),
    ...ranked
      .filter(
        ({ directRemediation, deadlinePacing: candidatePacing }) =>
          directRemediation === undefined && candidatePacing !== undefined,
      )
      .sort(deadlinePacingTieBreak),
    ...ranked
      .filter(
        ({ directRemediation, deadlinePacing: candidatePacing }) =>
          directRemediation === undefined && candidatePacing === undefined,
      )
      .sort(evidenceTieBreak),
  ].slice(0, limit);

  return {
    strategy: 'evidence-ranked',
    recommendation: ranking[0],
    ranking,
    ...(deadlinePacing ? { deadlinePacing } : {}),
  };
}
