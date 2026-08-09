import { describe, expect, it } from 'vitest';
import { CoachFinding } from './types';
import { summarizeCoachFindings } from './persisted';

const tom2ToTom3: CoachFinding = {
  id: 'pad-tom2-tom3',
  kind: 'pad-confusion',
  severity: 'high',
  title: 'Tom 2 is replacing floor tom',
  summary: 'Repeated matched wrong-pad pairs.',
  skillTag: 'pad-accuracy',
  evidence: {
    barStart: 4,
    barEnd: 4,
    sampleCount: 3,
    slowSpeed: 0.7,
    actualElement: 'tom2',
    expectedElement: 'tom3',
  },
};

describe('summarizeCoachFindings', () => {
  it('persists the deterministic finding identity, exact bar, and supported remediation only', () => {
    expect(summarizeCoachFindings([tom2ToTom3])).toEqual([
      {
        id: 'pad-tom2-tom3',
        kind: 'pad-confusion',
        severity: 'high',
        skillTag: 'pad-accuracy',
        sampleCount: 3,
        barStart: 4,
        barEnd: 4,
        slowSpeed: 0.7,
        actualElement: 'tom2',
        expectedElement: 'tom3',
        remediationLessonId: '07.03',
      },
    ]);
  });
});
