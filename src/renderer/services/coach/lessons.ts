import { CoachFinding, CoachRemediation, CoachSkillTag } from './types';

export interface CoachLessonLink {
  id: string;
  title: string;
}

export const COACH_LESSONS: Record<CoachSkillTag, CoachLessonLink> = {
  fills: { id: '18.03', title: 'One-Bar 16th Fill A' },
  'sixteenth-hihat': { id: '16.03', title: '16th Hi-Hat, Right Hand Only' },
  dynamics: { id: '07.01', title: 'Loud-to-Soft Control' },
  triplets: { id: '19.01', title: 'Triplet Feel Introduction' },
  shuffle: { id: '21.02', title: 'Rock Shuffle One' },
  'kick-independence': {
    id: '06.03',
    title: 'Right Hand Steady, Kick Answers',
  },
  timing: { id: '01.01', title: 'Hand Blocks Warm-Up' },
  'pad-accuracy': { id: '07.02', title: 'High and Mid Tom Signals' },
};

export const PATTERN_SKILL_LESSONS: Readonly<Record<string, CoachLessonLink>> =
  {
    'reading.rests': { id: '02.03', title: 'Rests in the Groove' },
    'coord.linear': { id: '15.03', title: 'Hand-to-Foot Linear Groove' },
  };

const PAD_TRANSITION_LESSONS: Record<string, CoachLessonLink> = {
  'tom1:tom2': COACH_LESSONS['pad-accuracy'],
  'tom2:tom3': { id: '07.03', title: 'Mid and Floor Tom Signals' },
  'tom1:tom3': { id: '07.04', title: 'Three-Tom Paths: Down and Back' },
};

export function lessonForSkill(skill: CoachSkillTag): CoachLessonLink {
  return COACH_LESSONS[skill];
}

function lessonTagsForAtomicSkill(skillId: string): readonly CoachSkillTag[] {
  if (PATTERN_SKILL_LESSONS[skillId]) {
    return [];
  }

  if (skillId === 'pulse.sixteenth' || skillId === 'music.groove_16th') {
    return ['sixteenth-hihat'];
  }

  if (skillId === 'pulse.triplet' || skillId === 'feel.jazz_ride') {
    return ['triplets'];
  }

  if (skillId === 'pulse.shuffle' || skillId === 'feel.shuffle') {
    return ['shuffle'];
  }

  if (skillId.startsWith('kit.fill') || skillId.startsWith('music.fill')) {
    return ['fills'];
  }

  if (skillId.startsWith('kit.tom')) {
    return ['pad-accuracy', 'fills'];
  }

  if (
    skillId.startsWith('dynamics.') ||
    skillId === 'hand.accent_control' ||
    skillId === 'hand.ghost_note'
  ) {
    return ['dynamics'];
  }

  if (skillId.startsWith('foot.') || skillId === 'coord.syncopated_kick') {
    return ['kick-independence'];
  }

  if (
    skillId === 'coord.two_way' ||
    skillId === 'coord.rock_three_way' ||
    skillId === 'music.groove_8th'
  ) {
    return ['kick-independence'];
  }

  return ['timing'];
}

export function lessonsForAtomicSkills(
  skillIds: readonly string[],
): readonly CoachLessonLink[] {
  const ids = new Set<string>();

  return [
    ...skillIds.flatMap((skillId) => PATTERN_SKILL_LESSONS[skillId] ?? []),
    ...skillIds.flatMap(lessonTagsForAtomicSkill).map(lessonForSkill),
  ]
    .filter((lesson) => {
      if (ids.has(lesson.id)) {
        return false;
      }

      ids.add(lesson.id);

      return true;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function transitionKey(first: string, second: string): string {
  return [first, second].sort().join(':');
}

/**
 * A pad-confusion finding has a more precise route than its broad
 * `pad-accuracy` skill tag. Never substitute a generic tom exercise when the
 * observed pair is unsupported: doing so would imply a diagnosis we do not
 * have evidence to remediate.
 */
export function remediationForFinding(finding: CoachFinding): CoachRemediation {
  if (finding.kind !== 'pad-confusion') {
    const lesson = lessonForSkill(finding.skillTag);

    return {
      status: 'available',
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    };
  }

  const { actualElement, expectedElement } = finding.evidence;
  const lesson =
    actualElement && expectedElement
      ? PAD_TRANSITION_LESSONS[transitionKey(actualElement, expectedElement)]
      : undefined;

  if (lesson) {
    return {
      status: 'available',
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    };
  }

  return {
    status: 'unsupported',
    detail: `No supported targeted route exists for ${
      actualElement ?? 'the recorded pad'
    } → ${
      expectedElement ?? 'the expected pad'
    }. Keep the evidence visible instead of assigning a generic tom drill.`,
  };
}
