import { CoachSkillTag } from './types';

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
  'pad-accuracy': { id: '07.02', title: 'Snare to High Tom' },
};

export function lessonForSkill(skill: CoachSkillTag): CoachLessonLink {
  return COACH_LESSONS[skill];
}
