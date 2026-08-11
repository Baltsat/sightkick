import { hardPrerequisitesForManifest } from './item-manifest';
import { skillProbability } from './skill-state';
import { shortestUnmetHardPrerequisitePath } from './unlock-path';
import {
  AtomicSkillState,
  ItemSkillManifest,
  SongGoal,
  SongGoalBlocker,
  UnlockPath,
  ZpdCandidate,
  ZpdRankedCandidate,
} from './types';

export interface SongGoalPathInput {
  goal: SongGoal;
  song: ZpdCandidate;
  ranking: readonly ZpdRankedCandidate[];
  states: readonly AtomicSkillState[];
}

function targetFor(goal: SongGoal): number {
  if (goal.goal_kind === 'performance_ready') {
    return 0.82;
  }

  if (goal.goal_kind === 'full_song') {
    return 0.76;
  }

  return 0.68;
}

function blockerSkillIds(manifest: ItemSkillManifest): readonly string[] {
  return [
    ...new Set([
      ...manifest.demands.map((demand) => demand.skill_id),
      ...hardPrerequisitesForManifest(manifest),
    ]),
  ];
}

function stateMap(
  states: readonly AtomicSkillState[],
): ReadonlyMap<string, AtomicSkillState> {
  return new Map(states.map((state) => [state.skill_id, state]));
}

export function songGoalBlockers(
  goal: SongGoal,
  manifest: ItemSkillManifest,
  states: readonly AtomicSkillState[],
): readonly SongGoalBlocker[] {
  const target = targetFor(goal);
  const by_id = stateMap(states);

  return blockerSkillIds(manifest)
    .map((skill_id) => ({
      skill_id,
      current: skillProbability(by_id.get(skill_id)),
      target,
    }))
    .filter((blocker) => blocker.current < blocker.target)
    .sort(
      (left, right) =>
        right.target - right.current - (left.target - left.current) ||
        left.skill_id.localeCompare(right.skill_id),
    )
    .slice(0, 3);
}

function bestNextItems(
  blockers: readonly SongGoalBlocker[],
  ranking: readonly ZpdRankedCandidate[],
  hard_path: readonly string[],
): readonly { item_id: string; reason: string }[] {
  const blocker_ids = new Set(blockers.map((blocker) => blocker.skill_id));
  const hard_path_ids = new Set(
    hard_path.filter((skill_id) => blocker_ids.has(skill_id)),
  );
  const path_has_item = ranking.some(
    ({ candidate, decision }) =>
      candidate.kind === 'lesson' &&
      decision.state !== 'goal_preview_only' &&
      candidate.manifest.demands.some((demand) =>
        hard_path_ids.has(demand.skill_id),
      ),
  );
  const target_ids = path_has_item ? hard_path_ids : blocker_ids;

  return ranking
    .filter(
      ({ candidate, decision }) =>
        candidate.kind === 'lesson' &&
        decision.state !== 'goal_preview_only' &&
        candidate.manifest.demands.some((demand) =>
          target_ids.has(demand.skill_id),
        ),
    )
    .map(({ candidate, decision }) => {
      const matched = candidate.manifest.demands
        .filter((demand) => target_ids.has(demand.skill_id))
        .map((demand) => demand.skill_id)
        .sort();

      return {
        item_id: candidate.item_id,
        score:
          decision.learning_value *
          candidate.manifest.demands.reduce(
            (total, demand) =>
              total + (target_ids.has(demand.skill_id) ? demand.weight : 0),
            0,
          ),
        reason: `Targets ${matched.join(', ')} at a ${Math.round(
          decision.predicted_success * 100,
        )}% predicted success band.`,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.item_id.localeCompare(right.item_id),
    )
    .slice(0, 2)
    .map(({ item_id, reason }) => ({ item_id, reason }));
}

function safeProbe(
  goal: SongGoal,
  song: ZpdCandidate,
  ranking: readonly ZpdRankedCandidate[],
): UnlockPath['next_song_probe'] {
  if (song.manifest.assessment_confidence < 0.6) {
    return undefined;
  }

  const section = goal.target_section ?? song.manifest.section;

  if (
    !section ||
    section.start_bar <= 0 ||
    section.end_bar < section.start_bar
  ) {
    return undefined;
  }

  const decision = ranking.find(
    ({ candidate }) => candidate.item_id === song.item_id,
  )?.decision;

  return {
    song_id: goal.song_id,
    start_bar: section.start_bar,
    end_bar: section.end_bar,
    speed: decision?.scaffold.speed ?? 0.7,
  };
}

export function buildSongUnlockPath({
  goal,
  song,
  ranking,
  states,
}: SongGoalPathInput): UnlockPath {
  const blockers = songGoalBlockers(goal, song.manifest, states);
  const hard_path = shortestUnmetHardPrerequisitePath(
    song.manifest,
    states,
    targetFor(goal),
  );
  const next_song_probe = safeProbe(goal, song, ranking);
  const confidence_note =
    song.manifest.assessment_confidence < 0.6
      ? 'Chart assessment confidence is too low for a trustworthy section probe.'
      : next_song_probe
      ? undefined
      : 'A chart section is needed before this goal can receive a safe probe.';

  return {
    goal,
    blockers,
    next_items: bestNextItems(blockers, ranking, hard_path),
    ...(next_song_probe ? { next_song_probe } : {}),
    free_play_available: true,
    ...(confidence_note ? { confidence_note } : {}),
  };
}
