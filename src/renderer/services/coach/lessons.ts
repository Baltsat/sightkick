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
  timing: { id: '01.01', title: 'Alternating Singles Warm-Up' },
  'pad-accuracy': { id: '07.02', title: 'High and Mid Tom Signals' },
};

const PAD_TRANSITION_LESSONS: Record<string, CoachLessonLink> = {
  'tom1:tom2': COACH_LESSONS['pad-accuracy'],
  'tom2:tom3': { id: '07.03', title: 'Mid and Floor Tom Signals' },
  'tom1:tom3': { id: '07.04', title: 'Three-Tom Paths: Down and Back' },
};

export function lessonForSkill(skill: CoachSkillTag): CoachLessonLink {
  return COACH_LESSONS[skill];
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
